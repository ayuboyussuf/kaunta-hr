/**
 * Answering "what happened on the day nobody came in?"
 *
 * The sweep held the penalties rather than raising them, so at this point
 * nothing has been charged and nobody has been told anything. That is
 * deliberate and it shapes everything here: the cheap, quiet, reversible state
 * is the DEFAULT, and raising penalties is the action that requires somebody to
 * say so explicitly.
 *
 * Four ways it can end:
 *
 *   closed_holiday / closed_other  the day is recorded as non-working, so it
 *                                  stops being a hole in the record and payroll
 *                                  stops treating it as a day people owed.
 *   system_problem                 nothing is charged; the day is recorded as a
 *                                  failure of ours, not of theirs.
 *   everyone_absent                the owner asserts it. Only now are penalties
 *                                  raised, and they are raised as a decision
 *                                  somebody made, not as a sweep result.
 *   expired                        nobody answered in a week. Discarded.
 *
 * The last one is the important one. It would be easy to leave a question
 * pending forever, or to charge on timeout because "the rule says absent". Both
 * are wrong: the staff would be left not knowing whether a deduction is coming,
 * and the burden of asserting that a whole site stayed home belongs to whoever
 * is claiming it. Not answering is not that assertion.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateAbsence } from "../rules/engine";
import { REVIEW_EXPIRY_DAYS, isExpired } from "./closure";

export type ClosureResolution =
  | "closed_holiday"
  | "closed_other"
  | "system_problem"
  | "everyone_absent";

export interface ResolveResult {
  reviewId: string;
  resolution: ClosureResolution | "expired";
  /** Penalties actually raised. Zero for everything except everyone_absent. */
  raised: number;
  /** Whether a non-working day was recorded, so the calendar stops showing a hole. */
  recordedNonWorking: boolean;
}

interface ReviewRow {
  id: string;
  org_id: string;
  workplace_id: string | null;
  on_date: string;
  status: string;
}

/**
 * Apply an owner's answer to one held site-day.
 *
 * Returns null when the review does not exist, belongs to another org, or has
 * already been resolved — all three are the same thing from the caller's point
 * of view, and none of them should be distinguishable to a client probing ids.
 */
export async function resolveClosureReview(
  db: SupabaseClient,
  params: {
    reviewId: string;
    orgId: string;
    resolution: ClosureResolution;
    note?: string | null;
    /** Only meaningful for a closure: were staff paid for the day? */
    paid?: boolean;
    resolvedByUserId: string | null;
  }
): Promise<ResolveResult | null> {
  const { data: review } = await db
    .from("closure_reviews")
    .select("id, org_id, workplace_id, on_date, status")
    .eq("id", params.reviewId)
    .eq("org_id", params.orgId)
    .eq("status", "pending")
    .maybeSingle();
  if (!review) return null;

  const r = review as ReviewRow;
  let raised = 0;
  let recordedNonWorking = false;

  if (params.resolution === "everyone_absent") {
    raised = await raiseHeldAbsences(db, r);
  } else if (params.resolution === "closed_holiday" || params.resolution === "closed_other") {
    // Record it as a declared non-working day. Two reasons: payroll should not
    // count it as a day owed, and if the sweep is ever replayed for that date
    // it now short-circuits instead of asking the same question again.
    recordedNonWorking = await recordNonWorkingDay(db, {
      orgId: r.org_id,
      workplaceId: r.workplace_id,
      onDate: r.on_date,
      label: params.note?.trim() || (params.resolution === "closed_holiday" ? "Public holiday" : "Closed"),
      paid: params.paid !== false,
      createdBy: params.resolvedByUserId,
    });
  }
  // system_problem records nothing and charges nothing. The day stays visible
  // as a site failure, which is the honest description and the thing the owner
  // should go and fix.

  await db
    .from("closure_reviews")
    .update({
      status: params.resolution === "everyone_absent" ? "worked" : "closed",
      resolution: params.resolution,
      note: params.note ?? null,
      resolved_by: params.resolvedByUserId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", r.id);

  return { reviewId: r.id, resolution: params.resolution, raised, recordedNonWorking };
}

/**
 * Raise the absences that were held — the only path that takes money.
 *
 * Approved leave is still checked, inside evaluateAbsence, because an owner
 * asserting "everyone was absent" is asserting something about the people who
 * were expected, and somebody on signed-off leave was not expected.
 */
async function raiseHeldAbsences(db: SupabaseClient, review: ReviewRow): Promise<number> {
  let query = db
    .from("employees")
    .select("id, org_id, workplace_id")
    .eq("org_id", review.org_id)
    .eq("status", "active")
    .not("shift_id", "is", null);

  query = review.workplace_id
    ? query.eq("workplace_id", review.workplace_id)
    : query.is("workplace_id", null);

  const { data: employees } = await query;

  let raised = 0;
  for (const emp of employees ?? []) {
    try {
      const applied = await evaluateAbsence(db, {
        orgId: emp.org_id as string,
        employeeId: emp.id as string,
        workplaceId: (emp.workplace_id as string | null) ?? null,
        onDate: review.on_date,
      });
      if (applied) raised++;
    } catch (err) {
      console.error(`[closure] could not raise absence for ${emp.id}:`, (err as Error).message);
    }
  }
  return raised;
}

async function recordNonWorkingDay(
  db: SupabaseClient,
  row: {
    orgId: string;
    workplaceId: string | null;
    onDate: string;
    label: string;
    paid: boolean;
    createdBy: string | null;
  }
): Promise<boolean> {
  const { data: existing } = await db
    .from("non_working_days")
    .select("id, workplace_id")
    .eq("org_id", row.orgId)
    .eq("on_date", row.onDate);
  if ((existing ?? []).some((d) => d.workplace_id === row.workplaceId)) return false;

  const { error } = await db.from("non_working_days").insert({
    org_id: row.orgId,
    workplace_id: row.workplaceId,
    on_date: row.onDate,
    label: row.label.slice(0, 120),
    paid: row.paid,
    created_by: row.createdBy,
  });
  if (error) {
    console.error("[closure] could not record non-working day:", error.message);
    return false;
  }
  return true;
}

/**
 * Discard questions nobody answered.
 *
 * Called from the daily sweep. Marks them expired and raises nothing — the held
 * penalties simply cease to exist, which is the outcome that cannot hurt anyone
 * who did nothing wrong. An owner who genuinely believes a whole site stayed
 * home can still raise those penalties by hand, with their name against them.
 */
export async function expireStaleReviews(
  db: SupabaseClient,
  now: Date = new Date()
): Promise<{ expired: number }> {
  const cutoff = new Date(now.getTime() - REVIEW_EXPIRY_DAYS * 86400000).toISOString();

  const { data: stale } = await db
    .from("closure_reviews")
    .select("id, created_at")
    .eq("status", "pending")
    .lt("created_at", cutoff);

  let expired = 0;
  for (const row of stale ?? []) {
    if (!isExpired(row.created_at as string, now)) continue;
    const { error } = await db
      .from("closure_reviews")
      .update({
        status: "expired",
        resolution: "expired",
        resolved_at: now.toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "pending");
    if (!error) expired++;
  }
  return { expired };
}
