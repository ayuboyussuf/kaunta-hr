/**
 * Running an appeal assist and storing what it found.
 *
 * The shape of the whole thing, in order:
 *
 *   1. Read the appeal. Route it — keywords, in Aproksi, never a fact.
 *   2. Gather what the record says, with the tools in facts.ts.
 *   3. Assemble a brief by template.
 *   4. If one specific thing is missing, ask for that one thing by SMS with a
 *      link back to the dashboard. Otherwise ask nothing.
 *   5. Store it against the appeal for the owner to read.
 *
 * It never touches the appeal's decision, never writes to violations, and has
 * no code path that could. The employer waives or upholds; this makes that
 * ten seconds of reading instead of twenty minutes of guessing.
 *
 * Failure is not allowed to matter. An assist that throws leaves the appeal
 * exactly as it was — a message and a decision to make, which is what the
 * owner had before any of this existed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ASSIST_VERSION, type AssistBrief } from "./types";
import { classify } from "./classify";
import { penaltyFacts, leaveEvidence, type PenaltyFacts } from "./facts";
import { assessSystemNotWorking } from "./systemDown";
import { assessSick } from "./sickNote";
import { assessRoadClosed } from "./roadClosed";
import { assessOnLeave } from "./onLeave";
import { summarise } from "./summary";
import { sendText } from "../../messaging";
import { env } from "../../env";
import { observed, Trace } from "../../observability/log";

export { classify } from "./classify";
export * from "./types";

interface AppealRow {
  id: string;
  violation_id: string;
  message: string;
}

/**
 * Assess one appeal. Returns the brief, or null if there was nothing to work
 * with — a violation that has vanished, a database that would not answer.
 */
export async function runAssist(
  db: SupabaseClient,
  appeal: AppealRow,
  orgId: string
): Promise<AssistBrief | null> {
  // Wrapped for observability. The wrapper returns exactly what the work
  // returns and cannot alter it — see lib/observability/log.
  return observed<AssistBrief | null>(
    db,
    {
      orgId,
      kind: "appeal_assist",
      subjectRef: appeal.id,
      input: appeal.message,
      engineVersion: ASSIST_VERSION,
    },
    async (trace) => {
      const brief = await assess(db, appeal, orgId, trace);
      if (!brief) {
        return { result: null, record: { outcome: "no_subject" as const } };
      }
      return {
        result: brief,
        record: {
          claim: brief.claim,
          confidence: brief.confidence,
          findings: brief.findings.length,
          askedEmployee: Boolean(brief.ask),
          output: brief.summary,
          outcome:
            brief.findings.length === 0
              ? ("empty" as const)
              : brief.ask
                ? ("awaiting_employee" as const)
                : ("ready" as const),
        },
      };
    }
  );
}

async function assess(
  db: SupabaseClient,
  appeal: AppealRow,
  orgId: string,
  trace: Trace
): Promise<AssistBrief | null> {
  trace.step("tool:penalty_facts");
  const facts = await penaltyFacts(db, appeal.violation_id);
  if (!facts) {
    trace.step("abort", { reason: "violation_missing" });
    return null;
  }

  const routed = classify(appeal.message);
  trace.step("classify", {
    claim: routed.claim,
    confidence: routed.confidence,
    signals: routed.matched.length,
  });
  let brief: AssistBrief;

  switch (routed.claim) {
    case "system_not_working":
      brief = await assessSystemNotWorking(db, facts, appeal.id, routed.confidence, trace);
      break;

    // Sick notes and road closures are the two checks that need something from
    // outside Aproksi — a document to read, a road to ask about. Until those are
    // built, an appeal routed here gets the facts of the penalty and an honest
    // statement that the claim itself has not been checked, rather than a brief
    // that looks complete and is not.
    case "sick": {
      const answer = await answerFor(db, appeal.id, "sick_note");
      brief = await assessSick(db, facts, appeal.id, routed.confidence, trace, answer);
      break;
    }

    case "road_closed": {
      const answer = await answerFor(db, appeal.id, "which_road");
      brief = await assessRoadClosed(db, facts, appeal.id, routed.confidence, trace, answer);
      break;
    }

    case "on_leave":
      brief = await assessOnLeave(db, facts, appeal.id, routed.confidence, trace);
      break;

    case "unclear":
    default:
      brief = await baseline(db, facts, routed.claim, routed.confidence, trace);
      break;
  }

  // Whatever they wrote, a penalty sitting on a day the owner signed off is a
  // fact the owner needs — and it is the one thing here that is cheap, certain,
  // and previously only checked when the routing happened to fall through to
  // `unclear`. Someone appealing an approved-leave absence with "I told you I
  // was away, the app is useless" routes to system_not_working and, until now,
  // never got the approval mentioned at all.
  brief = await withLeaveCover(db, facts, brief, trace);

  trace.step("persist", { findings: brief.findings.length });
  await persist(db, appeal, orgId, brief);
  if (brief.ask) {
    trace.step("ask_employee", { ask_code: brief.ask.code });
    await askEmployee(db, appeal, facts.employeeId, brief);
  }
  return brief;
}

/**
 * What the employee has already told us, if this is a re-run.
 *
 * The assist runs twice for the two claims that need something: once when the
 * appeal lands, and again when the answer arrives. The second run replaces the
 * first brief rather than adding to it, so the owner always sees one current
 * picture instead of a thread they have to read in order.
 */
async function answerFor(
  db: SupabaseClient,
  appealId: string,
  askCode: string
): Promise<
  { answered: boolean; declined: boolean; documentPath: string | null; answer: string | null } | undefined
> {
  const { data } = await db
    .from("appeal_info_requests")
    .select("answered_at, answer, declined, document_path")
    .eq("appeal_id", appealId)
    .eq("ask_code", askCode)
    .maybeSingle();
  if (!data) return undefined;
  return {
    answered: Boolean(data.answered_at),
    declined: data.declined === true,
    documentPath: (data.document_path as string | null) ?? null,
    answer: (data.answer as string | null) ?? null,
  };
}

/* ── The check that runs whatever the claim was ───────────────────────── */

/**
 * Add the approved-leave finding to a brief that does not already have one.
 *
 * `assessOnLeave` reports this in far more detail, so it is skipped there. For
 * every other claim this is a one-line lookup that changes the whole complexion
 * of a case, and leaving it to the routing was wrong: what somebody chose to
 * write in an appeal has no bearing on whether the day was signed off.
 *
 * The summary is rebuilt rather than appended to, because a summary that says
 * "the record holds nothing either way" above a finding that says "you approved
 * this day" is worse than either sentence on its own.
 */
async function withLeaveCover(
  db: SupabaseClient,
  facts: PenaltyFacts,
  brief: AssistBrief,
  trace: Trace
): Promise<AssistBrief> {
  if (brief.claim === "on_leave") return brief;
  if (brief.findings.some((f) => f.kind === "leave_cover")) return brief;

  trace.step("tool:leave_evidence");
  const leave = await leaveEvidence(db, facts.employeeId, facts.onDate);
  if (!leave.covered) return brief;

  const findings: AssistBrief["findings"] = [
    ...brief.findings,
    {
      kind: "leave_cover",
      stance: "supports",
      headline: `${facts.onDate} was covered by leave you had already approved`,
      detail:
        `Approved as ${leave.paid ? "paid" : "unpaid"}${leave.halfDay ? ` (${leave.halfDay} only)` : ""}. ` +
        "Approved leave is meant to prevent a penalty being raised at all, so this one either predates the " +
        "approval or was raised in error — worth settling before anything else in this appeal.",
      evidence: { approved: "yes", paid: leave.paid ? "yes" : "no" },
      source: "leave_requests",
    },
  ];

  return { ...brief, findings, summary: summarise(brief.claim, facts, findings) };
}

/* ── The floor: what we can always say ────────────────────────────────── */

async function baseline(
  db: SupabaseClient,
  facts: PenaltyFacts,
  claim: AssistBrief["claim"],
  confidence: "high" | "low",
  trace: Trace
): Promise<AssistBrief> {
  const findings: AssistBrief["findings"] = [
    {
      kind: "penalty",
      stance: "neutral",
      headline:
        facts.lateByMin != null && facts.expectedStart
          ? `Clocked in at ${facts.scannedAtLocal}, ${facts.lateByMin} minutes past the ${facts.expectedStart} start plus ${facts.graceMinutes ?? 0} minutes' grace`
          : `${facts.reason} raised on ${facts.onDate ?? facts.createdAt.slice(0, 10)}`,
      detail:
        facts.raisedBy === "engine"
          ? "Applied automatically by your rules when the scan landed."
          : "Raised manually.",
      evidence: { amount_kes: facts.amount, raised_by: facts.raisedBy },
      source: "violations",
    },
  ];

  // Cheap and worth doing every time: a penalty on a day that turns out to
  // have been signed off is a bug, and the owner should see it as one.
  trace.step("tool:leave_evidence");
  const leave = await leaveEvidence(db, facts.employeeId, facts.onDate);
  if (leave.covered) {
    findings.push({
      kind: "leave_cover",
      stance: "supports",
      headline: "This day was covered by leave you had already approved",
      detail:
        `Approved as ${leave.paid ? "paid" : "unpaid"}${leave.halfDay ? ` (${leave.halfDay} only)` : ""}. ` +
        "A penalty should not have been raised against it.",
      evidence: { approved: "yes", paid: leave.paid ? "yes" : "no" },
      source: "leave_requests",
    });
  }

  findings.push({
    kind: "not_checked",
    stance: "unverifiable",
    headline:
      claim === "unclear"
        ? "The reason given could not be matched to anything checkable"
        : "This kind of claim cannot yet be checked automatically",
    detail:
      claim === "unclear"
        ? "Read the employee's own words below — the facts above are the penalty itself, not an assessment of what they said."
        : "The facts above describe the penalty. The claim itself has not been verified either way.",
    evidence: { claim, routing_confidence: confidence },
    source: "—",
  });

  return {
    claim,
    confidence,
    findings,
    summary: summarise(claim, facts, findings),
    missing: ["A check of the claim itself, which Aproksi cannot yet perform."],
    ask: null,
  };
}

/* ── Storage ──────────────────────────────────────────────────────────── */

async function persist(
  db: SupabaseClient,
  appeal: AppealRow,
  orgId: string,
  brief: AssistBrief
): Promise<string | null> {
  const { data, error } = await db
    .from("appeal_assists")
    .upsert(
      {
        appeal_id: appeal.id,
        org_id: orgId,
        claim: brief.claim,
        confidence: brief.confidence,
        status: brief.ask ? "awaiting_employee" : "ready",
        findings: brief.findings,
        summary: brief.summary,
        missing: brief.missing,
        engine_version: ASSIST_VERSION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "appeal_id" }
    )
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[assist] could not store brief:", error.message);
    return null;
  }
  return (data?.id as string) ?? null;
}

/* ── The one question ─────────────────────────────────────────────────── */

/**
 * One SMS, one specific ask, a link back to the dashboard, and "I can't provide
 * this" always available. Not a conversation, and never asked twice.
 */
async function askEmployee(
  db: SupabaseClient,
  appeal: AppealRow,
  employeeId: string,
  brief: AssistBrief
): Promise<void> {
  if (!brief.ask) return;
  try {
    const { data: assist } = await db
      .from("appeal_assists")
      .select("id")
      .eq("appeal_id", appeal.id)
      .maybeSingle();
    if (!assist) return;

    const { data: existing } = await db
      .from("appeal_info_requests")
      .select("id")
      .eq("appeal_id", appeal.id)
      .eq("ask_code", brief.ask.code)
      .maybeSingle();
    if (existing) return; // asked already; asking again is harassment, not diligence

    await db.from("appeal_info_requests").insert({
      assist_id: assist.id,
      appeal_id: appeal.id,
      employee_id: employeeId,
      ask_code: brief.ask.code,
      question: brief.ask.question,
    });

    const { data: emp } = await db
      .from("employees")
      .select("phone")
      .eq("id", employeeId)
      .maybeSingle();
    if (!emp?.phone) return;

    await sendText(
      emp.phone as string,
      `Aproksi HR: about your appeal — ${brief.ask.question} Answer at ${env.appUrl}/me/violations. If you can't, choose "not available" there and it still goes to your employer.`
    );
  } catch (err) {
    console.error("[assist] could not ask the employee:", (err as Error).message);
  }
}
