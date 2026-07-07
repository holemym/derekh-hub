/**
 * Jewish-calendar time intelligence for Vienna (PLANNING §10).
 * All computation is local via @hebcal/core — no API.
 *
 * Manual sanity check (run: npx tsx src/lib/zmanim.ts, or see scripts/check-zmanim.mjs):
 *   On 2026-07-07 (22 Tamuz 5786) this returned next candle-lighting
 *   Fri 2026-07-10 20:36 Europe/Vienna — matches published Vienna times
 *   (July sunset ~20:55, minus 18 minutes). Unit-sane.
 */

import {
  HebrewCalendar,
  Location,
  HDate,
  CandleLightingEvent,
} from "@hebcal/core";

export const VIENNA = new Location(
  48.2082,
  16.3738,
  false,
  "Europe/Vienna",
  "Vienna",
  "AT"
);

const DAY_MS = 24 * 60 * 60 * 1000;

function candleEvents(now: Date, daysAhead = 21): CandleLightingEvent[] {
  const events = HebrewCalendar.calendar({
    start: new HDate(now),
    end: new HDate(new Date(now.getTime() + daysAhead * DAY_MS)),
    location: VIENNA,
    candlelighting: true,
  });
  return events.filter(
    (ev): ev is CandleLightingEvent => ev instanceof CandleLightingEvent
  );
}

/**
 * The next candle-lighting moment (Shabbos or Yom Tov) in Vienna after `now`.
 * Returns null only if nothing found within 3 weeks (cannot happen in practice).
 */
export function nextCandleLighting(now: Date = new Date()): Date | null {
  for (const ev of candleEvents(now)) {
    if (ev.eventTime.getTime() > now.getTime()) return ev.eventTime;
  }
  return null;
}

/** Fractional hours from `now` until the next candle-lighting. */
export function hoursUntilShabbos(now: Date = new Date()): number | null {
  const candles = nextCandleLighting(now);
  if (!candles) return null;
  return (candles.getTime() - now.getTime()) / 3_600_000;
}

/** Same civil day in Vienna? (compares YYYY-MM-DD in Europe/Vienna) */
export function sameViennaDay(a: Date, b: Date): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(a) === fmt.format(b);
}

/**
 * True when `now` falls on a civil day with candle-lighting in Vienna
 * (erev Shabbos or erev Yom Tov) — the "last window" pressure flag.
 */
export function isErevShabbosOrChag(now: Date = new Date()): boolean {
  const candles = nextCandleLighting(now);
  if (!candles) return false;
  return sameViennaDay(candles, now);
}

/* ── Hebrew date rendering for the header ──────────────────────────────── */

export interface HebrewDateParts {
  /** e.g. "22nd of Tamuz, 5786" */
  en: string;
  /** e.g. "כ״ב תמוז תשפ״ו" */
  he: string;
}

/**
 * Hebrew date for the civil date of `now`.
 * Note: after sunset the halachic date has already advanced — a later phase
 * should switch on sunset; for the header chip the civil-day mapping is fine.
 */
export function hebrewDate(now: Date = new Date()): HebrewDateParts {
  const hd = new HDate(now);
  return { en: hd.render("en"), he: hd.renderGematriya() };
}

/** Shabbos countdown data for the Today chip. */
export interface ShabbosWindow {
  candleLighting: Date;
  hoursUntil: number;
  /** Within the 48h operational window → show countdown chip. */
  withinWindow: boolean;
  isErev: boolean;
}

export function shabbosWindow(now: Date = new Date()): ShabbosWindow | null {
  const candleLighting = nextCandleLighting(now);
  if (!candleLighting) return null;
  const hoursUntil = (candleLighting.getTime() - now.getTime()) / 3_600_000;
  return {
    candleLighting,
    hoursUntil,
    withinWindow: hoursUntil <= 48,
    isErev: isErevShabbosOrChag(now),
  };
}
