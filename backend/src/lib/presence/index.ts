/**
 * Mid-shift presence checks. An employee who clocks in, leaves, and returns only
 * to clock out can't be caught by two scans alone — so at random points during a
 * shift we prompt them to re-scan. A scan while a check is pending confirms it;
 * an unanswered check past its window is marked missed (owner review).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

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
