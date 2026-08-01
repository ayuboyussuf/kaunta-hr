/**
 * Mid-shift presence checks. An employee who clocks in, leaves, and returns only
 * to clock out can't be caught by two scans alone — so at random points during a
 * shift we prompt them to re-scan. A scan while a check is pending confirms it;
 * an unanswered check past its window is marked missed (owner review).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * If the employee has a pending, in-window presence check, mark the most recent
 * one confirmed against this scan. Called on every scan (best-effort).
 */
export async function confirmPendingCheck(
  db: SupabaseClient,
  employeeId: string,
  entryId: string
): Promise<void> {
  const { data: pending } = await db
    .from("presence_checks")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("status", "pending")
    .gte("respond_by", new Date().toISOString())
    .order("due_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pending) return;

  await db
    .from("presence_checks")
    .update({ status: "confirmed", responded_entry_id: entryId })
    .eq("id", pending.id);
}
