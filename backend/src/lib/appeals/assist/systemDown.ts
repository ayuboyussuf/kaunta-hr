/**
 * "The app wouldn't let me clock in."
 *
 * The one appeal Aproksi can genuinely check, because the thing being appealed
 * about is Aproksi. Every question worth asking has an answer in our own tables:
 * did their phone report failures that morning, did we reject any of their
 * scans ourselves, and were their colleagues clocking in normally at the same
 * site in the same minutes.
 *
 * Which is why it needs no model and asks the employee nothing. The user asked
 * for an agent that only sends an SMS when it needs something specific — here
 * it needs nothing, because the record already holds it. Every SMS not sent is
 * one the employee does not have to answer to keep their money.
 *
 * The findings point in directions. They never add up to an answer, and this
 * file deliberately contains no arithmetic that would let them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistFinding, AssistBrief } from "./types";
import {
  attemptEvidence,
  claimHistory,
  disputeWindow,
  siteEvidence,
  type PenaltyFacts,
} from "./facts";
import { summarise } from "./summary";
import type { Trace } from "../../observability/log";

export async function assessSystemNotWorking(
  db: SupabaseClient,
  facts: PenaltyFacts,
  appealId: string,
  confidence: "high" | "low",
  trace: Trace
): Promise<AssistBrief> {
  const { fromISO, toISO } = disputeWindow(facts);
  const findings: AssistFinding[] = [];
  const missing: string[] = [];

  /* ── The penalty itself, stated plainly ────────────────────────────── */

  findings.push({
    kind: "penalty",
    stance: "neutral",
    headline:
      facts.lateByMin != null && facts.expectedStart
        ? `Clocked in at ${facts.scannedAtLocal}, ${facts.lateByMin} minutes past the ${facts.expectedStart} start plus ${facts.graceMinutes ?? 0} minutes' grace`
        : `${facts.reason} raised on ${facts.onDate ?? facts.createdAt.slice(0, 10)}`,
    detail:
      facts.raisedBy === "engine"
        ? "Applied automatically by your rules the moment the scan landed. Nobody reviewed it first — that is what the appeal is for."
        : "Raised manually.",
    evidence: {
      amount_kes: facts.amount,
      ...(facts.lateByMin != null ? { late_by_min: facts.lateByMin } : {}),
      ...(facts.graceMinutes != null ? { grace_min: facts.graceMinutes } : {}),
      raised_by: facts.raisedBy,
    },
    source: "violations",
  });

  /* ── Did their phone leave a trace? ────────────────────────────────── */

  trace.step("tool:attempt_evidence");
  const attempts = await attemptEvidence(db, facts.employeeId, fromISO, toISO);
  trace.step("tool:attempt_evidence:result", { total: attempts.total, witnessed: attempts.serverWitnessed });

  if (attempts.total === 0) {
    findings.push({
      kind: "no_attempts",
      stance: "contradicts",
      headline: "No failed clock-in was recorded from their phone that morning",
      detail:
        "The app keeps a note of failures it cannot send and forwards them on its next connection. " +
        (facts.scannedAtLocal
          ? `It did connect at ${facts.scannedAtLocal} to record this clock-in, and nothing was waiting.`
          : "Nothing has arrived since.") +
        " A phone switched off, or an older version of the app, would also leave no trace.",
      evidence: { attempts_found: 0, window: `${fmtWindow(fromISO, toISO)}` },
      source: "scan_attempts",
    });
    missing.push("Anything showing an attempt was made — a photo of the error, or a colleague who saw it.");
  } else {
    const witnessed = attempts.serverWitnessed > 0;
    findings.push({
      kind: "attempts",
      stance: "supports",
      headline: witnessed
        ? `Aproksi itself rejected ${attempts.serverWitnessed} of their scans between ${attempts.firstAt} and ${attempts.lastAt}`
        : `Their phone reported ${attempts.deviceReported} failed attempt(s) between ${attempts.firstAt} and ${attempts.lastAt}`,
      detail: witnessed
        ? `These are rejections we issued, not something the phone told us: ${attempts.outcomes.join("; ")}.`
        : `These come from the device, so they are the employee's account rather than something Aproksi observed: ${attempts.outcomes.join("; ")}.`,
      evidence: {
        total: attempts.total,
        witnessed_by_aproksi: attempts.serverWitnessed,
        reported_by_phone: attempts.deviceReported,
      },
      source: "scan_attempts",
    });
  }

  /* ── Was it just them? ─────────────────────────────────────────────── */

  if (facts.workplaceId) {
    trace.step("tool:site_evidence");
    const site = await siteEvidence(db, facts.workplaceId, facts.employeeId, fromISO, toISO);
    trace.step("tool:site_evidence:result", {
      scans_by_others: site.successfulScansByOthers,
      colleagues: site.colleaguesOnSite,
    });

    if (site.colleaguesOnSite === 0) {
      findings.push({
        kind: "site_alone",
        stance: "unverifiable",
        headline: "Nobody else works at this site, so there is nothing to compare against",
        detail:
          "Whether the site was working can normally be checked against colleagues clocking in at the same time. Here there are none.",
        evidence: { other_active_staff: 0 },
        source: "employees",
      });
      missing.push("Another person at the same site at the same time — there was nobody.");
    } else if (site.successfulScansByOthers > 0) {
      findings.push({
        kind: "site_working",
        stance: "contradicts",
        headline: `${site.distinctOthersWhoScanned} other ${site.distinctOthersWhoScanned === 1 ? "person" : "people"} clocked in normally at ${facts.workplaceName ?? "the same site"} in the same window`,
        detail:
          `${site.successfulScansByOthers} scan(s) went through while this one was failing. ` +
          "That does not rule out a problem with one phone, one camera or one printed code — it does mean Aproksi was reachable and the site's QR was being read.",
        evidence: {
          successful_scans_by_others: site.successfulScansByOthers,
          distinct_people: site.distinctOthersWhoScanned,
          window: fmtWindow(fromISO, toISO),
        },
        source: "attendance_entries",
      });
    } else if (site.failedAttemptsByOthers > 0) {
      findings.push({
        kind: "site_down",
        stance: "supports",
        headline: `Nobody at ${facts.workplaceName ?? "this site"} could clock in during that window`,
        detail: `${site.failedAttemptsByOthers} failed attempt(s) from other staff and no successful scans. ${
          site.serverSideFailures > 0
            ? `${site.serverSideFailures} of those were rejections Aproksi issued itself.`
            : "All of them were reported by the phones rather than seen by Aproksi."
        }`,
        evidence: {
          failed_attempts_by_others: site.failedAttemptsByOthers,
          server_side_failures: site.serverSideFailures,
          successful_scans_by_others: 0,
        },
        source: "scan_attempts",
      });
    } else {
      findings.push({
        kind: "site_quiet",
        stance: "neutral",
        headline: "No other staff scanned at this site during that window either way",
        detail:
          "Neither successes nor failures from anyone else, so the site's state at that moment cannot be established from attendance.",
        evidence: { other_active_staff: site.colleaguesOnSite, scans_by_others: 0 },
        source: "attendance_entries",
      });
      missing.push("Any scan by another person at that site in the disputed window.");
    }
  }

  /* ── Context, not character ────────────────────────────────────────── */

  trace.step("tool:claim_history");
  const history = await claimHistory(db, facts.employeeId, "system_not_working", appealId);
  if (history.appealsInNinetyDays > 0) {
    findings.push({
      kind: "history",
      stance: "neutral",
      headline: `${history.appealsInNinetyDays} other appeal(s) from this person in the last 90 days`,
      detail:
        `${history.waived} waived, ${history.upheld} upheld, ${history.pending} still open` +
        (history.sameClaimBefore > 0
          ? `. ${history.sameClaimBefore} of them said the same thing about the app.`
          : ".") +
        " Included because a pattern is worth seeing, not because it makes this appeal more or less true.",
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
    claim: "system_not_working",
    confidence,
    findings,
    summary: summarise("system_not_working", facts, findings),
    missing,
    // Nothing to ask. The record already holds everything obtainable, and an
    // SMS asking them to re-describe a morning would add words, not evidence.
    ask: null,
  };
}

function fmtWindow(fromISO: string, toISO: string): string {
  const t = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Nairobi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  return `${t(fromISO)}–${t(toISO)}`;
}
