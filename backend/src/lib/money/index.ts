/**
 * Money math — exact, never floating-point. The app handles wages, so every
 * monetary calculation (gross, deductions, penalties, absence, net, totals) must
 * go through Decimal here. Native JS number arithmetic on money is a bug.
 *
 * Storage: the DB columns are Postgres `numeric(12,2)` (exact fixed-precision).
 * We read them back as JS numbers (safe to *wrap* immediately in Decimal) and
 * write them back as fixed 2dp strings via `toDb()` so no float ever re-enters.
 *
 *   D(x)        → a Decimal from a number | string | null (null → 0)
 *   money(x)    → a Decimal rounded to 2dp (bankers-free, ROUND_HALF_UP)
 *   toDb(x)     → "123.45" string for a numeric column
 *   toNum(x)    → a 2dp JS number, for JSON breakdowns / API responses
 *   sum(arr,f)  → Decimal sum
 *   maxZero(x)  → never-negative (pay is floored at 0)
 */
import Decimal from "decimal.js";

// Round half up, 2 decimal places, for all money.
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;

/** Coerce anything money-ish to a Decimal; null/undefined/NaN → 0. */
export function D(x: number | string | Decimal | null | undefined): Decimal {
  if (x == null) return new Decimal(0);
  if (x instanceof Decimal) return x;
  const d = new Decimal(x);
  return d.isFinite() ? d : new Decimal(0);
}

/** A Decimal rounded to 2 decimal places. */
export function money(x: number | string | Decimal | null | undefined): Decimal {
  return D(x).toDecimalPlaces(2);
}

/** Fixed 2dp string for writing to a `numeric(12,2)` column (no float round-trip). */
export function toDb(x: number | string | Decimal | null | undefined): string {
  return money(x).toFixed(2);
}

/** 2dp JS number for JSON breakdowns / API payloads (display, not further math). */
export function toNum(x: number | string | Decimal | null | undefined): number {
  return money(x).toNumber();
}

/** Never below zero — payroll can never be negative. */
export function maxZero(x: Decimal): Decimal {
  return x.isNegative() ? new Decimal(0) : x;
}

/** Sum a list, optionally via a selector, as Decimal. */
export function sum<T>(items: T[], select: (t: T) => number | string | Decimal | null | undefined): Decimal {
  return items.reduce<Decimal>((acc, it) => acc.plus(D(select(it))), new Decimal(0));
}
