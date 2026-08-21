/**
 * "I was on approved leave."
 *
 * This is the only one of the four claims that Aproksi can settle outright. The
 * others end in a judgement the owner has to make — whether a sick note is
 * genuine, whether a road really was closed, whether a phone really did fail.
 * This one is a lookup: either the owner approved that day or they did not, and
 * the answer is already in the database with their name against it.
 *
 * Which is what made the old behaviour indefensible. "I'm on approved leave"
 * matched no keyword, routed to `unclear`, and produced a brief that said the
 * reason could not be matched to anything checkable — the employee holding the
 * strongest possible defence got the weakest possible brief. Worse, for an
 * absence penalty the date resolved to null, so even the incidental leave check
 * in the baseline path returned "not covered" without querying anything.
 *
 * Two things this still does not do. It does not decide the appeal, because a
 * penalty raised on an approved day may be one of several things — a sweep that
 * ran before the approval, leave approved for the wrong dates, or a genuine
 * mistake by whoever approved it — and which of those it is belongs to the
 * owner. And it does not silently reverse anything: the penalty stands until
 * somebody decides, so the record shows that a human closed it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistBrief, AssistFinding } from "./types";
import { type PenaltyFacts, claimHistory, neighbouringLeave } from "./facts";
import { approvedLeaveOn } from "../../leave/cover";
import { summarise } from "./summary";
import type { Trace } from "../../observability/log";

export async function assessOnLeave(
  db: SupabaseClient,
  facts: PenaltyFacts,
  appealId: string,
  confidence: "high" | "low",
  trace: Trace
): Promise<AssistBrief> {
  const findings: AssistFinding[] = [penaltyFinding(facts)];
  const missing: string[] = [];

  trace.step("tool:approved_leave_on", { on_date: facts.onDate });

  if (!facts.onDate) {
    // Should not happen now that violations carry a date, but saying so beats
    // reporting "no leave found" when the truth is "we could not look".
    findings.push({
      kind: "leave_undated",
      stance: "unverifiable",
      headline: "This penalty has no date recorded, so leave could not be checked",
      detail:
        "Aproksi could not establish which day this penalty is about, so it has not looked for leave " +
        "covering it. Check the leave record for this employee by hand before deciding.",
      evidence: { checked: "no" },
      source: "violations",
    });
    missing.push("The day this penalty relates to, which this record does not carry.");
    return brief(facts, findings, missing, confidence);
  }

  const cover = await approvedLeaveOn(db, facts.employeeId, facts.onDate);

  if (cover) {
    const half = cover.half_day ? ` — the ${cover.half_day} only` : "";
    findings.push({
      kind: "leave_cover",
      stance: "supports",
      headline: `${facts.onDate} was covered by leave you approved${half}`,
      detail:
        `An approved leave request covers ${cover.start_date}` +
        (cover.end_date !== cover.start_date ? ` to ${cover.end_date}` : "") +
        `, recorded as ${cover.paid ? "paid" : "unpaid"}${half}. ` +
        "Approved leave is meant to stop a penalty being raised at all, so this one either predates the " +
        "approval or was raised in error. Open the leave request to see who approved it and when.",
      evidence: {
        leave_request: cover.id,
        covers_from: cover.start_date,
        covers_to: cover.end_date,
        paid: cover.paid ? "yes" : "no",
        half_day: cover.half_day ?? "whole day",
      },
      source: "leave_requests",
    });

    // The single most useful thing to know next: did the approval come after
    // the penalty? That distinguishes a timing artefact from a real mistake,
    // and it is the difference between "the system did the right thing in the
    // wrong order" and "somebody approved a day that was already charged".
    const approvedAfter = await approvalCameAfter(db, cover.id, facts.createdAt);
    if (approvedAfter !== null) {
      findings.push({
        kind: "leave_approval_timing",
        stance: "neutral",
        headline: approvedAfter
          ? "The leave was approved after this penalty was raised"
          : "The leave was already approved when this penalty was raised",
        detail: approvedAfter
          ? "The penalty was raised first and the approval followed, so the rules were applied against the " +
            "record as it stood at the time. Nothing reversed it afterwards, which is why it is still here."
          : "The approval was already on file when the penalty was raised. That should not have been possible, " +
            "and is worth looking at beyond this appeal.",
        evidence: { approved_after_penalty: approvedAfter ? "yes" : "no" },
        source: "leave_requests",
      });
    }
  } else {
    findings.push({
      kind: "no_leave_cover",
      stance: "contradicts",
      headline: `No approved leave covers ${facts.onDate}`,
      detail:
        "Aproksi found no approved leave request covering that day for this employee. Requests that are still " +
        "pending, declined or withdrawn cover nothing. If leave was agreed verbally it will not be here — " +
        "that is a gap in the record, not proof either way.",
      evidence: { approved_leave_found: "no", checked_date: facts.onDate },
      source: "leave_requests",
    });

    // A request for the day either side, or one still pending, is the usual
    // innocent explanation: the person did ask, and got a date wrong or was
    // never answered. Reporting that is not deciding anything, and withholding
    // it would leave the owner to conclude they simply made it up.
    trace.step("tool:neighbouring_leave");
    const near = await neighbouringLeave(db, facts.employeeId, facts.onDate);
    if (near.length > 0) {
      findings.push({
        kind: "leave_nearby",
        stance: "neutral",
        headline: `They do have ${near.length} leave request(s) close to that date`,
        detail:
          near
            .map(
              (r) =>
                `${r.start_date}${r.end_date !== r.start_date ? ` to ${r.end_date}` : ""} — ${r.status}`
            )
            .join("; ") +
          ". A day out on the dates, or a request nobody answered, both look like this.",
        evidence: { nearby_requests: near.length },
        source: "leave_requests",
      });
    } else {
      missing.push("Any leave request near that date — there is none on file at all.");
    }
  }

  trace.step("tool:claim_history");
  const history = await claimHistory(db, facts.employeeId, "on_leave", appealId);
  if (history.appealsInNinetyDays > 0) {
    findings.push({
      kind: "history",
      stance: "neutral",
      headline: `${history.appealsInNinetyDays} other appeal(s) from this person in the last 90 days`,
      detail:
        `${history.waived} waived, ${history.upheld} upheld, ${history.pending} still open` +
        (history.sameClaimBefore > 0
          ? `. ${history.sameClaimBefore} of them also claimed approved leave.`
          : "."),
      evidence: {
        appeals_90d: history.appealsInNinetyDays,
        waived: history.waived,
        upheld: history.upheld,
        same_claim: history.sameClaimBefore,
      },
      source: "appeals",
    });
  }

  return brief(facts, findings, missing, confidence);
}

function penaltyFinding(facts: PenaltyFacts): AssistFinding {
  return {
    kind: "penalty",
    stance: "neutral",
    headline:
      facts.lateByMin != null && facts.expectedStart
        ? `Clocked in at ${facts.scannedAtLocal}, ${facts.lateByMin} minutes past the ${facts.expectedStart} start`
        : `${facts.reason} recorded for ${facts.onDate ?? facts.createdAt.slice(0, 10)}`,
    detail:
      facts.raisedBy === "engine"
        ? "Applied automatically by your rules."
        : "Raised manually.",
    evidence: { amount_kes: facts.amount, raised_by: facts.raisedBy },
    source: "violations",
  };
}

function brief(
  facts: PenaltyFacts,
  findings: AssistFinding[],
  missing: string[],
  confidence: "high" | "low"
): AssistBrief {
  return {
    claim: "on_leave",
    confidence,
    findings,
    summary: summarise("on_leave", facts, findings),
    missing,
    // Nothing to ask. Either the approval is on file or it is not, and the
    // employee cannot produce it — the owner is the one who granted it.
    ask: null,
  };
}

/**
 * Was the leave approved after the penalty was raised?
 *
 * Null when the request carries no decision timestamp, which is possible for
 * rows approved before that column was populated. Null means "unknown", and
 * unknown gets said rather than assumed either way.
 */
async function approvalCameAfter(
  db: SupabaseClient,
  leaveRequestId: string,
  penaltyCreatedAt: string
): Promise<boolean | null> {
  const { data } = await db
    .from("leave_requests")
    .select("decided_at")
    .eq("id", leaveRequestId)
    .maybeSingle();
  const decided = (data?.decided_at as string | null) ?? null;
  if (!decided) return null;
  return new Date(decided).getTime() > new Date(penaltyCreatedAt).getTime();
}
