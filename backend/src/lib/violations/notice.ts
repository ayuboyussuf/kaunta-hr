/**
 * Telling somebody they have been penalised.
 *
 * There were two ways a penalty came into existence and only one of them said
 * anything. The rules engine notified; `POST /api/violations` — the owner
 * raising a penalty by hand for phone use, uniform, leaving the pump — inserted
 * the row and returned. No SMS, no `notified_at`, nothing.
 *
 * That is the worst of the two to leave silent. An automatic lateness penalty
 * at least follows an event the employee was present for; a manual one is a
 * judgement made about them somewhere else, and the first they would learn of
 * it is the payslip. It also has an appeal window ticking from the moment it is
 * raised, so silence spends the window they would have used to object.
 *
 * And because `notice_tracked` defaults to true, every one of those silent
 * penalties has been sitting in the owner's "penalties nobody received" queue
 * with no error against it — reported as a delivery failure when nothing was
 * ever attempted.
 *
 * One function now, used by both paths, so they cannot drift again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText } from "../messaging";

export interface NoticeResult {
  sent: boolean;
  error?: string;
}

/**
 * Send the notice for a penalty and record what happened to it.
 *
 * Never throws. Whether the employee was told decides whether a deduction is
 * defensible, so a failure is written to the row the owner reads rather than to
 * a console nobody does — but it must not undo the penalty, because a penalty
 * that vanishes when the network hiccups is worse than one that is late.
 */
export async function sendPenaltyNotice(
  db: SupabaseClient,
  params: {
    violationId: string;
    employeeId: string;
    reason: string;
    amount: number;
    /** One extra sentence — "You were 22 minutes late." Optional. */
    detail?: string;
  }
): Promise<NoticeResult> {
  const { data: emp } = await db
    .from("employees")
    .select("phone")
    .eq("id", params.employeeId)
    .maybeSingle();

  if (!emp?.phone) {
    const error = "No phone number on file for this employee.";
    await db.from("violations").update({ notify_error: error }).eq("id", params.violationId);
    return { sent: false, error };
  }

  const amount = `KES ${Number(params.amount).toLocaleString("en-KE", {
    maximumFractionDigits: 0,
  })}`;
  const detail = params.detail ? ` ${params.detail}` : "";

  try {
    await sendText(
      emp.phone as string,
      `Aproksi HR: ${params.reason} - ${amount}.${detail} If you disagree, open your record to appeal.`
    );
    await db
      .from("violations")
      .update({
        notified_at: new Date().toISOString(),
        notify_error: null,
        notice_tracked: true,
      })
      .eq("id", params.violationId);
    return { sent: true };
  } catch (err) {
    const error = (err as Error).message;
    console.error("[violations] notice failed:", error);
    await db
      .from("violations")
      .update({ notify_error: error.slice(0, 300), notice_tracked: true })
      .eq("id", params.violationId);
    return { sent: false, error };
  }
}
