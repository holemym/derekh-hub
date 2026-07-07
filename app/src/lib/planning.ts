/**
 * Planning brain — pure, unit-testable domain logic (ROADMAP M2, PLANNING §2 +
 * §10). This is the single home for:
 *
 *   • nextActionFor(case)          — "do the next thing" per pipeline stage
 *   • urgencyScore(case, now)      — real urgency = stage + time pressure +
 *                                    Shabbos/chag proximity (kevod hames)
 *   • isBeforeShabbosWindow / countdown — zmanim-derived pre-candle-lighting flags
 *   • isTimeCritical(case, now)    — the SINGLE red accent trigger
 *   • task scheduling helpers      — overdue / due-today / falls-on-Shabbos
 *
 * Everything here operates on already-mapped `Case` / `Task` objects (never DB
 * rows) and takes an explicit `now` so it is deterministic and testable with no
 * DB and no clock dependency. The zmanim layer (@/lib/zmanim, @hebcal/core) is
 * the only side of this that reaches for the Jewish calendar — also pure/local.
 */

import {
  Case,
  Task,
  NextAction,
  PipelineStage,
  stageIndex,
  PIPELINE_STAGES,
} from "./types";
import {
  hoursUntilShabbos,
  nextCandleLighting,
  isErevShabbosOrChag,
  sameViennaDay,
} from "./zmanim";

const H = 3_600_000;

/* ── "Do the next thing" — one action per pipeline stage (PLANNING §2.3) ─── */

/**
 * Rough due-pressure per stage, in hours from now. Encodes halachic priority:
 * a fresh notification (kevod hames — collect fast) and an active transport are
 * the tightest; the documents stage is bounded by office/consulate hours.
 * `undefined` = no intrinsic clock (a buried case has nothing left to chase).
 */
export const STAGE_DUE_HOURS: Record<PipelineStage, number | undefined> = {
  notified: 4, // kevod hames — collect fast
  collected: 12,
  prepared: 24,
  documents: 8, // offices/consulate hours are the constraint
  transport: 6,
  arrived: 24,
  buried: undefined,
};

/**
 * The computed next action for a case: the i18n key is the stage itself (one
 * `actions.<stage>` string per stage) plus a soft due target derived from the
 * stage's intrinsic pressure. Pure — `now` is injectable for tests.
 */
export function nextActionFor(c: Case, now: Date = new Date()): NextAction {
  const dueHours = STAGE_DUE_HOURS[c.status];
  return {
    key: c.status,
    due:
      dueHours === undefined
        ? undefined
        : new Date(now.getTime() + dueHours * H).toISOString(),
  };
}

/* ── Shabbos / chag window helpers (built on zmanim.ts) ─────────────────── */

/** How many hours from `now` until the next candle-lighting (or null). */
export function hoursUntilCandleLighting(now: Date = new Date()): number | null {
  return hoursUntilShabbos(now);
}

/**
 * True when we are inside the operational pre-Shabbos/chag window — i.e. the
 * next candle-lighting is within `withinHours` (default 48h). This is the flag
 * that pulls time-sensitive work to the top of the day.
 */
export function isBeforeShabbosWindow(
  now: Date = new Date(),
  withinHours = 48,
): boolean {
  const h = hoursUntilShabbos(now);
  return h !== null && h <= withinHours && h >= 0;
}

/** A ready-to-render countdown to the next candle-lighting. */
export interface Countdown {
  candleLighting: Date;
  hoursUntil: number;
  hoursWhole: number;
  minutes: number;
  /** Within the 48h operational window → worth surfacing a chip. */
  withinWindow: boolean;
  /** Same civil day as candle-lighting → erev Shabbos/chag (the last window). */
  isErev: boolean;
}

export function shabbosCountdown(now: Date = new Date()): Countdown | null {
  const candleLighting = nextCandleLighting(now);
  if (!candleLighting) return null;
  const hoursUntil = (candleLighting.getTime() - now.getTime()) / H;
  const hoursWhole = Math.floor(hoursUntil);
  return {
    candleLighting,
    hoursUntil,
    hoursWhole,
    minutes: Math.floor((hoursUntil - hoursWhole) * 60),
    withinWindow: hoursUntil <= 48,
    isErev: isErevShabbosOrChag(now),
  };
}

/* ── Time-critical (the single red accent) ──────────────────────────────── */

/**
 * A case is TRULY time-critical — the only condition that earns the red accent
 * on Today — when it has open pre-candle-lighting work that must land before
 * Shabbos/chag begins. Concretely: candle-lighting is close (≤ CRITICAL_HOURS),
 * the case is still open (not buried), and it is in a stage whose work is
 * blocked once Shabbos/chag starts (documents/permits, transport, or an arrived
 * case awaiting burial). A manual `urgent` flag also forces it.
 */
export const CRITICAL_HOURS = 12;

/** Stages whose work is blocked once Shabbos/Yom-Tov begins. */
const SHABBOS_BLOCKED_STAGES: ReadonlySet<PipelineStage> = new Set([
  "notified", // must collect the meis before yom tov
  "documents", // consulate / offices close
  "transport", // no flights / handling
  "arrived", // burial before/after the chag
]);

export function isTimeCritical(c: Case, now: Date = new Date()): boolean {
  if (c.status === "buried") return false;
  if (c.urgent) return true;
  const h = hoursUntilShabbos(now);
  if (h === null || h < 0 || h > CRITICAL_HOURS) return false;
  return SHABBOS_BLOCKED_STAGES.has(c.status);
}

/* ── Urgency scoring — real urgency, not creation date (PLANNING §2.2/§6) ── */

/**
 * Combine three forces into one comparable score (higher = act sooner):
 *
 *   1. Stage priority   — kevod hames: fresh notifications and active transport
 *                         sit near the top; buried cases sink out of view.
 *   2. Time pressure    — earlier, more-open pipeline stages carry more work.
 *   3. Shabbos/chag     — as candle-lighting approaches, any case with work
 *                         that Shabbos will block heats up sharply; a case that
 *                         must act *before* candle-lighting outranks a freshly
 *                         notified one that has all week.
 *
 * The manual `urgent` flag is a large hard override. Pure + deterministic.
 */
/**
 * Cases whose pre-Shabbos work depends on an EXTERNAL party with hard closing
 * hours (consulate/offices for documents, carriers for transport, cemetery for
 * an arrived case). These outrank a fresh notification under Shabbos pressure:
 * collection can happen any hour of erev, but a consulate that closes is gone.
 */
const OFFICE_DEPENDENT_STAGES: ReadonlySet<PipelineStage> = new Set([
  "documents",
  "transport",
  "arrived",
]);

export function urgencyScore(c: Case, now: Date = new Date()): number {
  let score = 0;

  // Manual override — Motty flagged it. Dominates everything.
  if (c.urgent) score += 10_000;

  const h = hoursUntilShabbos(now);
  const inWindow =
    h !== null && h >= 0 && h <= 48 && SHABBOS_BLOCKED_STAGES.has(c.status);

  if (inWindow) {
    // Under Shabbos pressure the TIME-TO-CANDLE dominates ordering — the closer
    // candle-lighting, the hotter (up to ~+2400 in the final hour). We do NOT
    // also add the flat stage bonuses here: they'd double-count and let a fresh
    // notification (any-hour work) leapfrog a documents case bound by a closing
    // consulate. Instead office-dependent stages get a small tie-breaking edge.
    score += Math.round((48 - h) * 50);
    if (OFFICE_DEPENDENT_STAGES.has(c.status)) score += 200;
  } else {
    // Normal ordering (kevod hames): fresh notifications and active transport
    // sit near the top.
    if (c.status === "transport") score += 400;
    if (c.status === "notified") score += 350;
  }

  // Earlier pipeline = generally more open work (small, always applied).
  score += (PIPELINE_STAGES.length - stageIndex(c.status)) * 10;

  // Buried cases sink.
  if (c.status === "buried") score -= 2000;

  return score;
}

/** Cases sorted by real urgency (hottest first). Stable, pure. */
export function sortByUrgency(cases: Case[], now: Date = new Date()): Case[] {
  return [...cases].sort((a, b) => urgencyScore(b, now) - urgencyScore(a, now));
}

/* ── Task scheduling awareness (zmanim-aware, non-blocking) ─────────────── */

/** Is this task open and past its due time? */
export function isOverdue(task: Task, now: Date = new Date()): boolean {
  if (task.status !== "open" || !task.due) return false;
  return new Date(task.due).getTime() < now.getTime();
}

/** Is this open task due on the same civil (Vienna) day as `now`? */
export function isDueToday(task: Task, now: Date = new Date()): boolean {
  if (task.status !== "open" || !task.due) return false;
  return sameViennaDay(new Date(task.due), now);
}

/**
 * "Due soon" for the Today list = open + (overdue OR due today OR due before the
 * next candle-lighting when that's within the window). Sorted earliest-first;
 * tasks without a due date sink to the end.
 */
export function dueSoonTasks(tasks: Task[], now: Date = new Date()): Task[] {
  const candle = nextCandleLighting(now);
  const beforeCandle = (t: Task) =>
    !!t.due &&
    !!candle &&
    isBeforeShabbosWindow(now) &&
    new Date(t.due).getTime() <= candle.getTime();

  return tasks
    .filter(
      (t) =>
        t.status === "open" &&
        (isOverdue(t, now) || isDueToday(t, now) || beforeCandle(t)),
    )
    .sort((a, b) => {
      if (!a.due) return 1;
      if (!b.due) return -1;
      return new Date(a.due).getTime() - new Date(b.due).getTime();
    });
}

/**
 * Scheduling flag: does this task's due date fall on Shabbos / Yom Tov in
 * Vienna? We do NOT hard-block — halacha may require the deadline to be *before*
 * candle-lighting, but the app only flags it so the operator decides. A due
 * moment counts as "on Shabbos/chag" when its civil day is an erev (candle-
 * lighting day) and the moment is at/after candle-lighting, or when it is the
 * civil day after an erev with no intervening havdala boundary computed here
 * (approximation — the flag is advisory, not authoritative).
 */
export function fallsOnShabbosOrChag(
  due: string | Date | undefined,
  now: Date = new Date(),
): boolean {
  if (!due) return false;
  const d = typeof due === "string" ? new Date(due) : due;
  if (Number.isNaN(d.getTime())) return false;
  // Reference the candle-lighting on/around the due date itself.
  const candle = nextCandleLighting(new Date(d.getTime() - 25 * H));
  if (!candle) return false;
  // On the erev day, after candle-lighting → into Shabbos/chag.
  if (sameViennaDay(candle, d) && d.getTime() >= candle.getTime()) return true;
  // The day after the erev is (approximately) still Shabbos/chag daytime.
  const nextDay = new Date(candle.getTime() + 20 * H);
  if (sameViennaDay(nextDay, d)) return true;
  return false;
}

/** All open tasks for a case, due-sorted (undated last). */
export function sortTasksByDue(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return new Date(a.due).getTime() - new Date(b.due).getTime();
  });
}
