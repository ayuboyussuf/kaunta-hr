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

export interface LeaveCover {
  id: string;
  /** The owner's call at approval time. Null only for undecided rows, which we never return. */
  paid: boolean | null;
  start_date: string;
  end_date: string;
}

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
    .select("id, paid, start_date, end_date")
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .lte("start_date", onDate)
    .gte("end_date", onDate)
    .order("start_date", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return {
    id: row.id as string,
    paid: (row.paid as boolean | null) ?? null,
    start_date: row.start_date as string,
    end_date: row.end_date as string,
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
    .select("id, employee_id, paid, start_date, end_date")
    .in("employee_id", employeeIds)
    .eq("status", "approved")
    .lte("start_date", onDate)
    .gte("end_date", onDate);

  for (const row of data ?? []) {
    const key = row.employee_id as string;
    if (out.has(key)) continue; // first cover wins; overlaps are equivalent here
    out.set(key, {
      id: row.id as string,
      paid: (row.paid as boolean | null) ?? null,
      start_date: row.start_date as string,
      end_date: row.end_date as string,
    });
  }
  return out;
}
