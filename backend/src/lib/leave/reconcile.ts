/**
 * Approving leave has to reach backwards.
 *
 * The order things happen in is the whole problem. The absence sweep runs at
 * 21:30; a staff member who was away on Tuesday and files on Wednesday gets
 * approved on Wednesday — by which time Tuesday already carries an absence
 * penalty, and nothing ever went back to look at it. The approval SMS even
 * promises "you will not be marked absent on those days", which by then is not
 * true.
 *
 * So the guarantee the product actually makes — an approved day is never a
 * penalty — cannot be enforced only at the moment a rule fires. It has to be
 * enforced again at the moment of approval, over the days just approved.
 *
 * Two deliberate limits:
 *
 *   It only touches penalties that are still open or appealed. A case somebody
 *   already decided is closed, and quietly rewriting a decided case is exactly
 *   the thing the locked-document design exists to prevent. If a penalty was
 *   upheld and leave is approved afterwards, that is a conversation between two
 *   people, not something to paper over.
 *
 *   It attributes the reversal. The outcome names the leave approval as the
 *   cause, so six months later the record says why the charge disappeared
 *   rather than leaving a gap where a penalty used to be.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface VoidedPenalty {
  violationId: string;
  onDate: string;
  amount: number;
  reason: string;
}

/**
 * Void the open penalties covered by a newly approved leave range.
 *
 * Returns what it voided so the caller can tell the employee what happened —
 * "your leave is approved" and "the KES 1,000 you were charged for Tuesday is
 * cancelled" are two different pieces of good news and the second one is the
 * one they were worried about.
 */
export async function voidPenaltiesCoveredByLeave(
  db: SupabaseClient,
  params: {
    employeeId: string;
    startDate: string;
    endDate: string;
    /** Half-day leave still cancels that day's lateness — see the note below. */
    halfDay: "morning" | "afternoon" | null;
    /** Recorded on the violation so the reversal is attributable. */
    approvedByUserId: string | null;
  }
): Promise<VoidedPenalty[]> {
  const { data: rows, error } = await db
    .from("violations")
    .select("id, on_date, amount, reason, status")
    .eq("employee_id", params.employeeId)
    .in("status", ["open", "appealed"])
    .gte("on_date", params.startDate)
    .lte("on_date", params.endDate);

  if (error || !rows || rows.length === 0) return [];

  // A half day suppresses the whole day's lateness for the same reason the
  // engine does it: the owner configured one shift start, and inventing a
  // second one for the remaining half would be the system writing a rule
  // nobody wrote. Unpaid half-days are still deducted, in payroll, from the
  // leave record — that is pay, not a penalty.
  const voided: VoidedPenalty[] = [];

  for (const row of rows) {
    // Snapshot before the write. The caller reports these figures to the
    // employee ("KES 1,000 cancelled"), and reading them back off the row after
    // setting amount to 0 would report every cancellation as being worth
    // nothing — which is the one number in the message that matters.
    const onDate = String(row.on_date).slice(0, 10);
    const wasAmount = Number(row.amount);
    const wasReason = (row.reason as string) ?? "Penalty";
    const wasAppealed = row.status === "appealed";

    const note =
      `Cancelled automatically: leave for ${onDate} was approved` +
      (params.halfDay ? ` (${params.halfDay})` : "") +
      ". An approved day does not carry a penalty.";

    const { error: updateError } = await db
      .from("violations")
      .update({
        status: "locked",
        amount: 0,
        outcome: note,
        voided_reason: "leave_approved",
        voided_at: new Date().toISOString(),
        voided_by: params.approvedByUserId,
      })
      .eq("id", row.id)
      // Guard against a decision landing between the read and the write.
      .in("status", ["open", "appealed"]);

    if (updateError) {
      console.error(`[leave] could not void penalty ${row.id}:`, updateError.message);
      continue;
    }

    // If they had already appealed it, that appeal is answered — by the
    // approval, in the employee's favour. Leaving it pending would put a
    // decision request in the owner's queue for a penalty that no longer
    // exists, which is how a queue stops being trusted.
    if (wasAppealed) {
      const { error: appealError } = await db
        .from("appeals")
        .update({
          decision: "accepted",
          decided_at: new Date().toISOString(),
          decided_by: params.approvedByUserId,
        })
        .eq("violation_id", row.id)
        .eq("decision", "pending");
      if (appealError) {
        console.error(`[leave] penalty ${row.id} voided but its appeal did not close:`, appealError.message);
      }
    }

    voided.push({
      violationId: row.id as string,
      onDate,
      amount: wasAmount,
      reason: wasReason,
    });
  }

  return voided;
}
