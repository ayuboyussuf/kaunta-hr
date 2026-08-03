/**
 * Automatic rule enforcement.
 *
 * The owner writes the rules; this evaluates them and raises the violation
 * without anybody opening the dashboard. Two hard constraints shape it:
 *
 *   1. It is DETERMINISTIC. No model, no inference, no judgement. The same
 *      scan and the same ruleset always produce the same amount. A deduction
 *      that cannot be reproduced cannot be defended in a dispute, so the
 *      arithmetic lives here in plain code.
 *   2. It only ever applies a rule the owner configured. If there is no
 *      matching enabled rule, nothing happens — the engine never invents a
 *      penalty, and never guesses an amount.
 *
 * Every violation it raises records the rule it matched and the engine
 * version that matched it, so an old decision can still be explained after
 * the rules have moved on.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText } from "../messaging";

/** Bump when the matching logic changes in a way that alters outcomes. */
export const ENGINE_VERSION = "1.0.0";

/** Rule codes the engine knows how to apply automatically. */
export type RuleCode = "late" | "absent";

type PenaltyRule = {
  id: string;
  code: string;
  reason: string;
  amount: number;
  calc: Record<string, unknown> | null;
  appeal_window_hours: number;
};

export type Applied = {
  violationId: string;
  ruleId: string;
  amount: number;
  reason: string;
};

/* ── Rule lookup ─────────────────────────────────────────────────── */

/**
 * The rules in force for a workplace: its own ruleset if it has one,
 * otherwise the org's shared default.
 */
async function rulesFor(
  db: SupabaseClient,
  orgId: string,
  workplaceId: string | null
): Promise<PenaltyRule[]> {
  let rulesetId: string | null = null;

  if (workplaceId) {
    const { data: wp } = await db
      .from("workplaces")
      .select("ruleset_id")
      .eq("id", workplaceId)
      .maybeSingle();
    rulesetId = (wp?.ruleset_id as string | null) ?? null;
  }

  if (!rulesetId) {
    const { data: shared } = await db
      .from("rulesets")
      .select("id")
      .eq("org_id", orgId)
      .eq("is_shared", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    rulesetId = (shared?.id as string | null) ?? null;
  }

  if (!rulesetId) return [];

  const { data } = await db
    .from("penalty_rules")
    .select("id, code, reason, amount, calc, appeal_window_hours")
    .eq("ruleset_id", rulesetId);

  return (data ?? []) as PenaltyRule[];
}

/**
 * Pick the rule for a code. Ties are broken by lowest amount so a
 * misconfigured duplicate can never silently charge the larger sum.
 */
function pickRule(rules: PenaltyRule[], code: RuleCode): PenaltyRule | null {
  const matches = rules.filter((r) => r.code === code);
  if (matches.length === 0) return null;
  return matches.sort((a, b) => Number(a.amount) - Number(b.amount))[0];
}

/**
 * Amount for a lateness rule. Supports a flat amount, or a per-minute rate
 * with an optional cap when the owner configured one in `calc`:
 *
 *   { "per_minute": 10, "max": 500 }
 *
 * Anything the owner did not configure is simply not applied.
 */
export function amountForLateness(rule: PenaltyRule, lateByMin: number): number {
  const calc = (rule.calc ?? {}) as { per_minute?: number; max?: number };
  const flat = Number(rule.amount) || 0;

  if (typeof calc.per_minute === "number" && calc.per_minute > 0) {
    const scaled = calc.per_minute * Math.max(0, lateByMin);
    const capped =
      typeof calc.max === "number" && calc.max > 0 ? Math.min(scaled, calc.max) : scaled;
    return Math.round(capped * 100) / 100;
  }
  return Math.round(flat * 100) / 100;
}

/* ── Idempotency ─────────────────────────────────────────────────── */

/** One attendance entry can only ever carry one automatic violation. */
async function alreadyRaised(db: SupabaseClient, attendanceId: string): Promise<boolean> {
  const { data } = await db
    .from("violations")
    .select("id")
    .eq("attendance_id", attendanceId)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/* ── Enforcement ─────────────────────────────────────────────────── */

async function raise(
  db: SupabaseClient,
  params: {
    employeeId: string;
    workplaceId: string | null;
    attendanceId: string | null;
    rule: PenaltyRule;
    amount: number;
    evidence: string;
  }
): Promise<Applied | null> {
  const appealEnd = new Date(
    Date.now() + (params.rule.appeal_window_hours ?? 24) * 3600 * 1000
  ).toISOString();

  const { data, error } = await db
    .from("violations")
    .insert({
      employee_id: params.employeeId,
      workplace_id: params.workplaceId,
      rule_id: params.rule.id,
      attendance_id: params.attendanceId,
      reason: params.rule.reason,
      evidence: params.evidence,
      amount: params.amount,
      status: "open",
      appeal_window_end: appealEnd,
      // created_by stays null: nobody pressed a button, the engine applied it
      raised_by: "engine",
      engine_version: ENGINE_VERSION,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[rules] could not raise violation:", error.message);
    return null;
  }

  return {
    violationId: data.id as string,
    ruleId: params.rule.id,
    amount: params.amount,
    reason: params.rule.reason,
  };
}

/** Tell the employee, so the first they hear of it is not the payslip. */
async function notify(
  db: SupabaseClient,
  employeeId: string,
  applied: Applied,
  detail: string
): Promise<void> {
  const { data: emp } = await db
    .from("employees")
    .select("phone, full_name")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp?.phone) return;

  const amount = `KES ${Number(applied.amount).toLocaleString("en-KE", {
    maximumFractionDigits: 0,
  })}`;
  try {
    await sendText(
      emp.phone as string,
      `Kaunta HR: ${applied.reason} — ${amount}. ${detail} If you disagree, open your record to appeal.`
    );
  } catch (err) {
    // A failed SMS must never undo the record.
    console.error("[rules] notice failed:", (err as Error).message);
  }
}

/**
 * Evaluate one accepted clock-in. Called from the scan path, so a late
 * arrival becomes a notified violation within seconds of the scan.
 *
 * Returns null when no rule applied — which is the common case.
 */
export async function evaluateScan(
  db: SupabaseClient,
  params: {
    orgId: string;
    employeeId: string;
    workplaceId: string | null;
    attendanceId: string;
    status: string;
    lateByMin: number;
    scannedAt: string;
  }
): Promise<Applied | null> {
  if (params.status !== "late" || params.lateByMin <= 0) return null;
  if (await alreadyRaised(db, params.attendanceId)) return null;

  const rules = await rulesFor(db, params.orgId, params.workplaceId);
  const rule = pickRule(rules, "late");
  if (!rule) return null; // the owner has not configured a lateness rule

  const amount = amountForLateness(rule, params.lateByMin);
  if (amount <= 0) return null; // configured, but costs nothing — record only

  const evidence = `Scanned ${new Date(params.scannedAt).toISOString()}, ${params.lateByMin} min after the grace period. Applied automatically by rule engine ${ENGINE_VERSION}.`;

  const applied = await raise(db, {
    employeeId: params.employeeId,
    workplaceId: params.workplaceId,
    attendanceId: params.attendanceId,
    rule,
    amount,
    evidence,
  });

  if (applied) {
    await notify(db, params.employeeId, applied, `You were ${params.lateByMin} minutes late.`);
  }
  return applied;
}

/**
 * Evaluate a rostered shift that closed with no scan against it.
 *
 * Approved leave is checked first: a day the owner signed off is never an
 * absence, and never attracts a penalty.
 */
export async function evaluateAbsence(
  db: SupabaseClient,
  params: {
    orgId: string;
    employeeId: string;
    workplaceId: string | null;
    onDate: string; // YYYY-MM-DD
  }
): Promise<Applied | null> {
  const { data: leave } = await db
    .from("leave_requests")
    .select("id")
    .eq("employee_id", params.employeeId)
    .eq("status", "approved")
    .lte("start_date", params.onDate)
    .gte("end_date", params.onDate)
    .limit(1)
    .maybeSingle();
  if (leave) return null; // on approved leave — not absent

  const rules = await rulesFor(db, params.orgId, params.workplaceId);
  const rule = pickRule(rules, "absent");
  if (!rule) return null;

  const amount = Math.round((Number(rule.amount) || 0) * 100) / 100;
  if (amount <= 0) return null;

  const applied = await raise(db, {
    employeeId: params.employeeId,
    workplaceId: params.workplaceId,
    attendanceId: null,
    rule,
    amount,
    evidence: `No scan recorded against the shift rostered for ${params.onDate}. Applied automatically by rule engine ${ENGINE_VERSION}.`,
  });

  if (applied) {
    await notify(db, params.employeeId, applied, `No clock-in was recorded for ${params.onDate}.`);
  }
  return applied;
}
