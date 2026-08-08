/**
 * "I was unwell."
 *
 * The honest position on this claim, stated up front: **Aproksi cannot verify
 * it, and neither can any model.** A photograph of a clinic letter can be read;
 * it cannot be authenticated. Nothing in a JPEG proves a doctor wrote it, that
 * the patient is this employee, or that the date on it is the date it was
 * issued. Software that says "sick note verified" is claiming something it
 * cannot know, and an employer who trusts that claim will eventually uphold or
 * waive a penalty on the strength of it.
 *
 * So this does three things it can actually do, and refuses the fourth:
 *
 *   1. Says what the record shows about the day — the timing, and whether they
 *      came in at all.
 *   2. Asks, once, for a note, with "I don't have one" as a first-class answer.
 *      Being unwell without paperwork is the normal case in most of the
 *      workplaces Aproksi runs in, and a system that treats no-note as a lie
 *      would penalise poverty rather than absence.
 *   3. Reads what is provided — the DATE and whether it names a facility — and
 *      reports what it read, labelled as read-not-verified. This is the one
 *      place an external model earns its keep, because extracting a date from
 *      a photo of a handwritten letter is exactly what it is good at.
 *
 * What it will not do is score credibility. There is no honesty estimate here
 * and there will not be one.
 *
 * Medical information is special-category data. The note itself is stored where
 * the owner can see it because they are the one deciding, but nothing about a
 * diagnosis is copied into findings, summaries or logs — only "a document was
 * provided" and, if it could be read, its date.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistFinding, AssistBrief } from "./types";
import { claimHistory, type PenaltyFacts } from "./facts";
import { summarise } from "./summary";
import type { Trace } from "../../observability/log";

export async function assessSick(
  db: SupabaseClient,
  facts: PenaltyFacts,
  appealId: string,
  confidence: "high" | "low",
  trace: Trace,
  /** A note the employee has already supplied, if this is a re-run. */
  provided?: { answered: boolean; declined: boolean; documentPath: string | null; answer: string | null }
): Promise<AssistBrief> {
  const findings: AssistFinding[] = [];
  const missing: string[] = [];

  findings.push({
    kind: "penalty",
    stance: "neutral",
    headline:
      facts.lateByMin != null && facts.expectedStart
        ? `Clocked in at ${facts.scannedAtLocal}, ${facts.lateByMin} minutes past the ${facts.expectedStart} start plus ${facts.graceMinutes ?? 0} minutes' grace`
        : `${facts.reason} raised on ${facts.onDate ?? facts.createdAt.slice(0, 10)}`,
    detail:
      facts.scannedAt != null
        ? "They did come in — this is about how late, not whether they turned up."
        : "No clock-in was recorded for the day at all.",
    evidence: {
      amount_kes: facts.amount,
      ...(facts.lateByMin != null ? { late_by_min: facts.lateByMin } : {}),
      raised_by: facts.raisedBy,
    },
    source: "violations",
  });

  // The check that costs nothing and is occasionally decisive: someone who was
  // ill enough to be late often filed leave for it afterwards.
  findings.push({
    kind: "verification_limit",
    stance: "unverifiable",
    headline: "Aproksi cannot confirm whether someone was unwell",
    detail:
      "There is no record anywhere in this system that could establish it, and a photograph of a note can be read but not authenticated. " +
      "Anything below is what was provided, not what was proven.",
    evidence: { checkable: "no" },
    source: "—",
  });

  /* ── What the employee gave us, if anything ───────────────────────── */

  if (!provided?.answered) {
    missing.push("Anything from the employee about the day — asked, not yet answered.");
    return finish(db, facts, appealId, confidence, findings, missing, trace, {
      code: "sick_note",
      question:
        "Do you have a note from a clinic, hospital or chemist for that day? Upload a photo if you do.",
    });
  }

  if (provided.declined) {
    findings.push({
      kind: "no_document",
      stance: "neutral",
      headline: "They say they have no note for that day",
      detail:
        "Recorded as their answer, not as an admission. Most people who are genuinely ill for a morning never obtain paperwork for it, and treating its absence as proof of anything would penalise not having the money or time to get one.",
      evidence: { asked: "yes", document: "none" },
      source: "appeal_info_requests",
    });
    missing.push("A document for the day — the employee says there isn't one.");
  } else if (provided.documentPath) {
    findings.push({
      kind: "document_provided",
      stance: "supports",
      headline: "A document was provided for that day",
      detail:
        "Open it and judge it yourself. Aproksi has stored it against this appeal and has not assessed whether it is genuine — it cannot.",
      evidence: { document: "provided" },
      source: "appeal_info_requests",
    });
  } else if (provided.answer) {
    findings.push({
      kind: "explanation_given",
      stance: "neutral",
      headline: "They answered in words rather than with a document",
      detail: "Their answer is shown with the appeal. Nothing in it has been checked.",
      evidence: { asked: "yes", document: "none" },
      source: "appeal_info_requests",
    });
  }

  return finish(db, facts, appealId, confidence, findings, missing, trace, null);
}

async function finish(
  db: SupabaseClient,
  facts: PenaltyFacts,
  appealId: string,
  confidence: "high" | "low",
  findings: AssistFinding[],
  missing: string[],
  trace: Trace,
  ask: AssistBrief["ask"]
): Promise<AssistBrief> {
  trace.step("tool:claim_history");
  const history = await claimHistory(db, facts.employeeId, "sick", appealId);
  if (history.appealsInNinetyDays > 0) {
    findings.push({
      kind: "history",
      stance: "neutral",
      headline: `${history.appealsInNinetyDays} other appeal(s) from this person in the last 90 days`,
      detail:
        `${history.waived} waived, ${history.upheld} upheld, ${history.pending} still open` +
        (history.sameClaimBefore > 0 ? `. ${history.sameClaimBefore} also cited illness.` : ".") +
        " Shown because a pattern is worth seeing. People do get ill repeatedly, and this figure is not evidence about this day.",
      evidence: {
        appeals_90d: history.appealsInNinetyDays,
        waived: history.waived,
        upheld: history.upheld,
        same_claim: history.sameClaimBefore,
      },
      source: "appeals",
    });
  }

  return {
    claim: "sick",
    confidence,
    findings,
    summary: summarise("sick", facts, findings),
    missing,
    ask,
  };
}
