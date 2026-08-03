/**
 * Date/time — all attendance & payroll date logic, timezone-correct for
 * Africa/Nairobi (UTC+3, no DST). Built on Luxon so no date math is hand-rolled.
 *
 * Weekday convention across the app is **0=Sun .. 6=Sat** (matches
 * `shift.days_of_week` and JS `Date.getDay()`), NOT Luxon's 1=Mon..7=Sun — the
 * helpers here convert, so callers keep using 0=Sun..6=Sat.
 */
import { DateTime } from "luxon";

export const TZ = "Africa/Nairobi";

/** Nairobi calendar date (YYYY-MM-DD) for an instant (ISO string or Date). */
export function nairobiDate(iso: string | Date): string {
  const dt = typeof iso === "string" ? DateTime.fromISO(iso) : DateTime.fromJSDate(iso);
  return dt.setZone(TZ).toISODate()!;
}

/** Weekday (0=Sun..6=Sat) of a plain YYYY-MM-DD date. */
export function weekdayOf(ymd: string): number {
  return DateTime.fromISO(ymd, { zone: "utc" }).weekday % 7; // Luxon Sun=7 → 0
}

/** Every YYYY-MM-DD from start to end inclusive. */
export function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  let d = DateTime.fromISO(start, { zone: "utc" });
  const last = DateTime.fromISO(end, { zone: "utc" });
  while (d <= last) {
    out.push(d.toISODate()!);
    d = d.plus({ days: 1 });
  }
  return out;
}

/** Last calendar day (28–31) of a 1-based (year, month). */
export function lastDayOfMonth(y: number, m: number): number {
  return DateTime.utc(y, m, 1).daysInMonth!;
}

/** YYYY-MM-DD `days` before `ymd`. */
export function ymdMinus(ymd: string, days: number): string {
  return DateTime.fromISO(ymd, { zone: "utc" }).minus({ days }).toISODate()!;
}

/**
 * UTC instant bounds for a Nairobi calendar month "YYYY-MM":
 * [start of that month, start of the next month), as ISO strings — for
 * `.gte(startISO).lt(endISO)` range queries on `timestamptz` columns.
 */
export function monthWindowUtc(month: string): { startISO: string; endISO: string } {
  const start = DateTime.fromISO(`${month}-01T00:00:00`, { zone: TZ });
  return {
    startISO: start.toUTC().toISO()!,
    endISO: start.plus({ months: 1 }).toUTC().toISO()!,
  };
}

/** UTC instant bounds for a Nairobi date range [start 00:00, end+1 00:00). */
export function dayWindowUtc(startYmd: string, endYmd: string): { startISO: string; endISO: string } {
  const start = DateTime.fromISO(`${startYmd}T00:00:00`, { zone: TZ });
  const endExclusive = DateTime.fromISO(`${endYmd}T00:00:00`, { zone: TZ }).plus({ days: 1 });
  return { startISO: start.toUTC().toISO()!, endISO: endExclusive.toUTC().toISO()! };
}

/** Today's Nairobi date parts, for cadence scheduling (weekday 0=Sun..6=Sat). */
export function nairobiTodayParts(now: Date = new Date()): {
  ymd: string;
  y: number;
  m: number;
  d: number;
  weekday: number;
  lastDay: number;
  daysSinceEpoch: number;
} {
  const dt = DateTime.fromJSDate(now).setZone(TZ);
  const ymd = dt.toISODate()!;
  return {
    ymd,
    y: dt.year,
    m: dt.month,
    d: dt.day,
    weekday: dt.weekday % 7, // Sun=7 → 0
    lastDay: dt.daysInMonth!,
    daysSinceEpoch: Math.floor(DateTime.fromISO(ymd, { zone: "utc" }).toMillis() / 86_400_000),
  };
}
