/**
 * Months and years, and the rule that they have to be over.
 *
 * A report over an arbitrary range is always available, including today and a
 * half-finished month — "who came in yesterday" must never wait for anything.
 * What is NOT available is a MONTH or a YEAR that has not ended.
 *
 * The reason is not that a partial period is incomplete. It is that a partial
 * period invites a comparison the reader cannot see is invalid:
 *
 *     July     71 late
 *     August   42 late      ← looks like a big improvement
 *
 * when August is half over and on course for 84. Nothing in those two rows
 * tells you that. A closed month is a document you can file and compare; an
 * open month is a live query, and conflating them produces confident wrong
 * conclusions about people's behaviour — which in this product ends in
 * somebody's wages.
 *
 * So the period functions refuse. `monthReportable` and `yearReportable` are
 * the gate, and they return a reason rather than a bare false, because "not
 * yet" needs to be sayable to the person who asked.
 */
import { DateTime } from "luxon";
import { TZ } from "../time";

export type PeriodKind = "month" | "year";

export interface Period {
  kind: PeriodKind;
  /** "2026-08" or "2026". */
  key: string;
  label: string;
  from: string;
  to: string;
}

export interface PeriodAvailability {
  available: boolean;
  /** Present when unavailable — shown to the owner verbatim. */
  reason?: string;
  /** When it will become available. */
  readyOn?: string;
}

/* ── Parsing ──────────────────────────────────────────────────────────── */

export function parseMonth(key: string): Period | null {
  if (!/^\d{4}-\d{2}$/.test(key)) return null;
  const start = DateTime.fromISO(`${key}-01`, { zone: TZ });
  if (!start.isValid) return null;
  return {
    kind: "month",
    key,
    label: start.toFormat("LLLL yyyy"),
    from: start.toISODate()!,
    to: start.endOf("month").toISODate()!,
  };
}

export function parseYear(key: string): Period | null {
  if (!/^\d{4}$/.test(key)) return null;
  const start = DateTime.fromISO(`${key}-01-01`, { zone: TZ });
  if (!start.isValid) return null;
  return {
    kind: "year",
    key,
    label: key,
    from: start.toISODate()!,
    to: start.endOf("year").toISODate()!,
  };
}

/* ── The gate ─────────────────────────────────────────────────────────── */

/**
 * Is this period over?
 *
 * "Over" means the last day has fully passed in Nairobi. A month is reportable
 * from the first minute of the next month, not from the last day of its own —
 * the 31st is a working day like any other and its scans are still arriving.
 */
export function periodAvailable(period: Period, now: Date = new Date()): PeriodAvailability {
  const today = DateTime.fromJSDate(now).setZone(TZ).toISODate()!;
  if (period.to < today) return { available: true };

  const readyOn = DateTime.fromISO(period.to, { zone: TZ }).plus({ days: 1 }).toISODate()!;
  const noun = period.kind === "month" ? "month" : "year";

  return {
    available: false,
    reason:
      period.to === today
        ? `${period.label} is not over yet — today is its last day. The report is ready tomorrow.`
        : `${period.label} has not finished. A part-${noun} report invites comparison with whole ones, ` +
          `which is how a half-${noun} gets read as an improvement. Use a custom range for the days so far.`,
    readyOn,
  };
}

/* ── Listing what CAN be reported ─────────────────────────────────────── */

/**
 * The closed months, most recent first. Never includes the current one.
 *
 * `limit` bounds it because a business three years in has 36, and a list that
 * long is a scrollbar rather than a choice.
 */
export function closedMonths(now: Date = new Date(), limit = 13): Period[] {
  const cursor = DateTime.fromJSDate(now).setZone(TZ).startOf("month");
  const out: Period[] = [];
  for (let i = 1; i <= limit; i++) {
    const m = cursor.minus({ months: i });
    const p = parseMonth(m.toFormat("yyyy-MM"));
    if (p) out.push(p);
  }
  return out;
}

/** The closed years, most recent first. Empty for a business in its first year. */
export function closedYears(now: Date = new Date(), limit = 5): Period[] {
  const thisYear = DateTime.fromJSDate(now).setZone(TZ).year;
  const out: Period[] = [];
  for (let i = 1; i <= limit; i++) {
    const p = parseYear(String(thisYear - i));
    if (p) out.push(p);
  }
  return out;
}

/**
 * The twelve closed months of a year, for a year report.
 *
 * A year report is not a twelve-times-bigger month report — nobody reads that.
 * It is a comparison across the months, which is the only thing at that scale
 * anybody acts on: which site drifted, which quarter went wrong, who improved.
 */
export function monthsOfYear(year: string): Period[] {
  return Array.from({ length: 12 }, (_, i) =>
    parseMonth(`${year}-${String(i + 1).padStart(2, "0")}`)
  ).filter((p): p is Period => p !== null);
}
