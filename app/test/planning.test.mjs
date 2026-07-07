/**
 * M2 unit test — the PURE planning brain (no DB, no server).
 *
 * This is a faithful JS MIRROR of src/lib/planning.ts (+ the zmanim helpers it
 * builds on), because Node can't resolve the app's "@/" TS alias without a
 * loader. @hebcal/core is the real dependency and is exercised directly, so the
 * candle-lighting assertion is a genuine end-to-end zmanim check. If you change
 * planning.ts, mirror the change here.
 *
 * Asserts:
 *   1. Vienna candle-lighting for a known Friday is a sane Friday-evening time.
 *   2. urgencyScore ORDERS a documents-stage case needing pre-Shabbos action
 *      ABOVE a freshly-notified one (real-urgency, not creation order).
 *   3. nextActionFor returns the expected action key per pipeline stage.
 *   4. Shabbos-block + time-critical + fallsOnShabbos flags behave.
 *
 * Usage (from app/):  node test/planning.test.mjs
 */

import {
  HebrewCalendar,
  Location,
  HDate,
  CandleLightingEvent,
} from "@hebcal/core";

/* ── mirror of src/lib/zmanim.ts ────────────────────────────────────────── */

const VIENNA = new Location(48.2082, 16.3738, false, "Europe/Vienna", "Vienna", "AT");
const DAY_MS = 24 * 60 * 60 * 1000;
const H = 3_600_000;

function candleEvents(now, daysAhead = 21) {
  const events = HebrewCalendar.calendar({
    start: new HDate(now),
    end: new HDate(new Date(now.getTime() + daysAhead * DAY_MS)),
    location: VIENNA,
    candlelighting: true,
  });
  return events.filter((ev) => ev instanceof CandleLightingEvent);
}

function nextCandleLighting(now) {
  for (const ev of candleEvents(now)) {
    if (ev.eventTime.getTime() > now.getTime()) return ev.eventTime;
  }
  return null;
}

function hoursUntilShabbos(now) {
  const c = nextCandleLighting(now);
  return c ? (c.getTime() - now.getTime()) / H : null;
}

function sameViennaDay(a, b) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(a) === fmt.format(b);
}

function isErevShabbosOrChag(now) {
  const c = nextCandleLighting(now);
  return c ? sameViennaDay(c, now) : false;
}

/* ── mirror of src/lib/planning.ts ──────────────────────────────────────── */

const PIPELINE_STAGES = [
  "notified",
  "collected",
  "prepared",
  "documents",
  "transport",
  "arrived",
  "buried",
];
const stageIndex = (s) => PIPELINE_STAGES.indexOf(s);

const STAGE_DUE_HOURS = {
  notified: 4,
  collected: 12,
  prepared: 24,
  documents: 8,
  transport: 6,
  arrived: 24,
  buried: undefined,
};

function nextActionFor(c, now = new Date()) {
  const dueHours = STAGE_DUE_HOURS[c.status];
  return {
    key: c.status,
    due:
      dueHours === undefined
        ? undefined
        : new Date(now.getTime() + dueHours * H).toISOString(),
  };
}

const SHABBOS_BLOCKED_STAGES = new Set([
  "notified",
  "documents",
  "transport",
  "arrived",
]);

const CRITICAL_HOURS = 12;

function isTimeCritical(c, now = new Date()) {
  if (c.status === "buried") return false;
  if (c.urgent) return true;
  const h = hoursUntilShabbos(now);
  if (h === null || h < 0 || h > CRITICAL_HOURS) return false;
  return SHABBOS_BLOCKED_STAGES.has(c.status);
}

const OFFICE_DEPENDENT_STAGES = new Set(["documents", "transport", "arrived"]);

function urgencyScore(c, now = new Date()) {
  let score = 0;
  if (c.urgent) score += 10_000;
  const h = hoursUntilShabbos(now);
  const inWindow =
    h !== null && h >= 0 && h <= 48 && SHABBOS_BLOCKED_STAGES.has(c.status);
  if (inWindow) {
    score += Math.round((48 - h) * 50);
    if (OFFICE_DEPENDENT_STAGES.has(c.status)) score += 200;
  } else {
    if (c.status === "transport") score += 400;
    if (c.status === "notified") score += 350;
  }
  score += (PIPELINE_STAGES.length - stageIndex(c.status)) * 10;
  if (c.status === "buried") score -= 2000;
  return score;
}

function fallsOnShabbosOrChag(due, now = new Date()) {
  if (!due) return false;
  const d = typeof due === "string" ? new Date(due) : due;
  if (Number.isNaN(d.getTime())) return false;
  const candle = nextCandleLighting(new Date(d.getTime() - 25 * H));
  if (!candle) return false;
  if (sameViennaDay(candle, d) && d.getTime() >= candle.getTime()) return true;
  const nextDay = new Date(candle.getTime() + 20 * H);
  if (sameViennaDay(nextDay, d)) return true;
  return false;
}

/* ── test harness ───────────────────────────────────────────────────────── */

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

const mkCase = (over) => ({ id: "x", status: "notified", urgent: false, ...over });

/* 1. Candle-lighting sanity — known Vienna Friday. */
// Use a Wednesday so the next candle-lighting is that week's Friday, well before
// any chag ambiguity. 2026-07-08 is a Wednesday; candle-lighting → Fri 2026-07-10.
{
  const wed = new Date("2026-07-08T09:00:00+02:00");
  const candle = nextCandleLighting(wed);
  ok(candle !== null, "candle-lighting resolves");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Vienna",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(candle);
  const wd = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  ok(wd === "Fri", `  candle-lighting is a Friday (got ${wd})`);
  ok(hour >= 19 && hour <= 22, `  candle-lighting is a summer evening hour (got ${hour}:00)`);
  const iso = candle.toISOString();
  ok(iso.startsWith("2026-07-10"), `  candle-lighting date is Fri 2026-07-10 (got ${iso})`);
}

/* 2. urgencyScore ORDERS documents-before-Shabbos ABOVE a fresh notification. */
{
  // ~6h before candle-lighting on erev Shabbos (Fri afternoon).
  const erev = new Date("2026-07-10T14:30:00+02:00");
  const hUntil = hoursUntilShabbos(erev);
  ok(hUntil !== null && hUntil > 0 && hUntil < 12, `  erev is <12h before candle-lighting (got ${hUntil?.toFixed(1)}h)`);

  const docsCase = mkCase({ id: "docs", status: "documents" });
  const freshCase = mkCase({ id: "fresh", status: "notified" });

  const docsScore = urgencyScore(docsCase, erev);
  const freshScore = urgencyScore(freshCase, erev);
  ok(
    docsScore > freshScore,
    `  documents-stage case pre-Shabbos (${docsScore}) OUTRANKS fresh notification (${freshScore})`,
  );

  // And it's genuinely time-critical (drives the red accent), while a case with
  // no Shabbos pressure (a week out) is not.
  ok(isTimeCritical(docsCase, erev), "  documents case pre-candle-lighting is time-critical");
  const monday = new Date("2026-07-06T10:00:00+02:00"); // ~4.5 days out
  ok(!isTimeCritical(mkCase({ status: "documents" }), monday), "  same case mid-week is NOT time-critical");

  // Sort check: erev documents case sits at the very top of a mixed list.
  const list = [
    freshCase,
    mkCase({ id: "prepared", status: "prepared" }),
    docsCase,
    mkCase({ id: "buried", status: "buried" }),
  ];
  const sorted = [...list].sort((a, b) => urgencyScore(b, erev) - urgencyScore(a, erev));
  ok(sorted[0].id === "docs", `  sorted list puts the pre-Shabbos documents case first (got ${sorted[0].id})`);
  ok(sorted[sorted.length - 1].id === "buried", "  buried case sinks to the bottom");
}

/* 3. nextActionFor returns the expected key per stage. */
{
  const now = new Date("2026-07-06T10:00:00+02:00");
  for (const stage of PIPELINE_STAGES) {
    const na = nextActionFor(mkCase({ status: stage }), now);
    ok(na.key === stage, `  nextActionFor(${stage}).key === "${stage}"`);
  }
  const buried = nextActionFor(mkCase({ status: "buried" }), now);
  ok(buried.due === undefined, "  buried case has no due date");
  const docs = nextActionFor(mkCase({ status: "documents" }), now);
  ok(typeof docs.due === "string", "  documents case has a computed due date");
}

/* 4. fallsOnShabbosOrChag flags a Shabbos due date, clears a weekday one. */
{
  // Friday 21:00 (after candle-lighting) → on Shabbos.
  ok(fallsOnShabbosOrChag("2026-07-10T21:00:00+02:00"), "  Fri 21:00 (post-candle) flagged as Shabbos");
  // Saturday afternoon → on Shabbos.
  ok(fallsOnShabbosOrChag("2026-07-11T14:00:00+02:00"), "  Sat 14:00 flagged as Shabbos");
  // Tuesday midday → NOT Shabbos.
  ok(!fallsOnShabbosOrChag("2026-07-07T12:00:00+02:00"), "  Tue 12:00 NOT flagged");
  ok(!fallsOnShabbosOrChag(undefined), "  undefined due date NOT flagged");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
