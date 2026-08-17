/**
 * Mid-shift presence checks. An employee who clocks in, leaves, and returns only
 * to clock out can't be caught by two scans alone — so at random points during a
 * shift we prompt them to re-scan. A scan while a check is pending confirms it;
 * an unanswered check past its window is marked missed (owner review).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How far back to look for the clock-in that opened the current shift.
 *
 * This used to be "since midnight in Nairobi", and that quietly excluded the
 * people a presence check is most worth sending to. A guard who clocks in at
 * 20:00 is still on shift at 02:00 — but their clock-in is on yesterday's date,
 * so the day-bounded lookup found no entry, read them as "not clocked in", and
 * skipped them. The cron already handles overnight shifts when it checks the
 * shift WINDOW (it pushes the end past midnight); only the clocked-in lookup
 * was still thinking in calendar days. Night staff were therefore unreachable
 * for the entire after-midnight half of every shift.
 *
 * 26 hours covers the longest plausible shift plus a margin, and it is safe to
 * be generous: every caller also checks that `now` falls inside the shift
 * window, so a stale clock-in from a shift that has ended is rejected there.
 */
const OPEN_SHIFT_LOOKBACK_MS = 26 * 3600 * 1000;

/**
 * Is this employee on shift right now — that is, was their most recent clock
 * scan an 'in'?
 *
 * Shared by the schedule and the owner's "check on them now", because these two
 * disagreeing about who is at work is a bug with no upside.
 *
 * Only `in` and `out` are considered. A `check` entry is the most recent row
 * immediately after somebody answers a check, and reading that as "their last
 * state" would mean no further check could reach them for the rest of the shift.
 */
export async function openShiftEntry(
  db: SupabaseClient,
  employeeId: string,
  now: Date = new Date()
): Promise<{ id: string; scanned_at: string } | null> {
  const { data } = await db
    .from("attendance_entries")
    .select("id, direction, scanned_at")
    .eq("employee_id", employeeId)
    .in("direction", ["in", "out"])
    .gte("scanned_at", new Date(now.getTime() - OPEN_SHIFT_LOOKBACK_MS).toISOString())
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || data.direction !== "in") return null;
  return { id: data.id as string, scanned_at: data.scanned_at as string };
}

export interface ConfirmContext {
  /** True inside the radius, false outside, null when there was nothing to judge by. */
  verdict: boolean | null;
}

/**
 * Mark the employee's open presence check as answered by this scan.
 *
 * The answer ALWAYS counts. That is a deliberate change from the first version,
 * which returned early unless the scan was inside the geofence — and which,
 * read from the employee's side, meant this: standing at the till with a cheap
 * handset indoors, you scan the right code at the right site, and nothing
 * happens. The banner stays. Fifteen minutes later the check ages into
 * 'missed', your clock-in is flagged, and the owner is told you ignored it.
 * There was no action available to you that would have worked.
 *
 * A control that an honest person cannot satisfy is not a control; it is a
 * trap that fires on whoever has the worst phone. So the check is confirmed and
 * the QUALITY of the answer is recorded instead: `location_verified` says
 * whether the location backed it up, false when it did not, null when there
 * were no coordinates to judge by. The owner sees a confirmation they can
 * weigh; the employee always has a way to comply.
 *
 * The QR itself still carries real weight — it is signed, it is rotated, and
 * it now has to belong to the site this person is assigned to.
 */
export async function confirmPendingCheck(
  db: SupabaseClient,
  employeeId: string,
  entryId: string,
  ctx: ConfirmContext
): Promise<{ confirmed: boolean; locationVerified: boolean | null }> {
  const { data: pending } = await db
    .from("presence_checks")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("status", "pending")
    .gte("respond_by", new Date().toISOString())
    .order("due_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pending) return { confirmed: false, locationVerified: null };

  const locationVerified = ctx.verdict;

  await db
    .from("presence_checks")
    .update({
      status: "confirmed",
      responded_entry_id: entryId,
      location_verified: locationVerified,
    })
    .eq("id", pending.id);

  return { confirmed: true, locationVerified };
}
