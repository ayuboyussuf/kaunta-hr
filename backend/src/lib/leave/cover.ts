/**
 * "Is this employee on approved leave on this date?"
 *
 * One function, one answer, used by everything that could otherwise punish a
 * day the owner already signed off: the scan path, the absence sweep, the
 * presence-check scheduler. It lives on its own because the first version of
 * this product asked the question in only one of those places, and an employee
 * on approved leave who walked in and scanned was recorded late and fined.
 *
 * A day covered by an approved request is never an absence, never late, and
 * never chased for a presence check.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type HalfDay = "morning" | "afternoon";

export interface LeaveCover {
  id: string;
  /** The owner's call at approval time. Null only for undecided rows, which we never return. */
  paid: boolean | null;
  start_date: string;
  end_date: string;
  /** null = the whole day; otherwise which half of a single day. */
  half_day: HalfDay | null;
}

const COVER_COLS = "id, paid, start_date, end_date, half_day";

/**
 * The approved leave covering `onDate` (YYYY-MM-DD), or null.
 *
 * Cancelled, declined and still-pending requests cover nothing — a request the
 * owner has not approved yet is not permission to be away.
 */
export async function approvedLeaveOn(
  db: SupabaseClient,
  employeeId: string,
  onDate: string
): Promise<LeaveCover | null> {
  const { data, error } = await db
    .from("leave_requests")
    .select(COVER_COLS)
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .lte("start_date", onDate)
    .gte("end_date", onDate)
    .order("start_date", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return toCover(data[0] as Record<string, unknown>);
}

function toCover(row: Record<string, unknown>): LeaveCover {
  return {
    id: row.id as string,
    paid: (row.paid as boolean | null) ?? null,
    start_date: row.start_date as string,
    end_date: row.end_date as string,
    half_day: (row.half_day as HalfDay | null) ?? null,
  };
}

/**
 * Approved leave for a set of employees on one date, as a map keyed by
 * employee id. One query instead of N — for the dashboard and the sweeps.
 */
export async function approvedLeaveForAll(
  db: SupabaseClient,
  employeeIds: string[],
  onDate: string
): Promise<Map<string, LeaveCover>> {
  const out = new Map<string, LeaveCover>();
  if (employeeIds.length === 0) return out;

  const { data } = await db
    .from("leave_requests")
    .select(`employee_id, ${COVER_COLS}`)
    .in("employee_id", employeeIds)
    .eq("status", "approved")
    .lte("start_date", onDate)
    .gte("end_date", onDate);

  for (const row of data ?? []) {
    const key = row.employee_id as string;
    if (out.has(key)) continue; // first cover wins; overlaps are equivalent here
    out.set(key, toCover(row as Record<string, unknown>));
  }
  return out;
}

/* ── Leave as days, for payroll ───────────────────────────────────────── */

export interface LeaveDay {
  date: string;
  paid: boolean;
  half_day: HalfDay | null;
  /** 1 for a whole day, 0.5 for a half. What payroll actually counts. */
  fraction: number;
  request_id: string;
}

/** Every YYYY-MM-DD from start to end inclusive. */
function expand(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  // A malformed range must not spin forever; a year of leave is already absurd.
  for (let i = 0; d <= last && i < 400; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Approved leave across a window, one entry per calendar day.
 *
 * Payroll needs days, not requests: a five-day request that straddles the end
 * of a pay cycle contributes to both, and only the days inside the window
 * count. Overlapping approvals collapse to one day — nobody is on leave twice.
 */
export async function approvedLeaveDays(
  db: SupabaseClient,
  employeeId: string,
  fromDate: string,
  toDate: string
): Promise<Map<string, LeaveDay>> {
  const days = new Map<string, LeaveDay>();

  const { data } = await db
    .from("leave_requests")
    .select(COVER_COLS)
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .lte("start_date", toDate)
    .gte("end_date", fromDate);

  for (const raw of data ?? []) {
    const r = toCover(raw as Record<string, unknown>);
    for (const date of expand(r.start_date, r.end_date)) {
      if (date < fromDate || date > toDate) continue;
      const existing = days.get(date);
      const day: LeaveDay = {
        date,
        paid: r.paid === true,
        half_day: r.half_day,
        fraction: r.half_day ? 0.5 : 1,
        request_id: r.id,
      };
      // If two approvals touch the same day, the fuller and better-paid one
      // wins — the employee cannot be worse off for having asked twice.
      if (!existing || day.fraction > existing.fraction || (day.paid && !existing.paid)) {
        days.set(date, day);
      }
    }
  }
  return days;
}
