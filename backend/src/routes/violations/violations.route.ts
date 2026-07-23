/**
 * Penalties / violations (spec §5).
 *
 *   • POST /api/violations            (owner) — log a violation against an employee.
 *   • GET  /api/violations            (owner) — list violations (filter status / employee).
 *   • GET  /api/violations/mine       (employee) — the caller's own violations + appeal state.
 *
 * Appeal submission + owner decisions live in appeals.route.ts. Auto-locking of
 * un-appealed violations past their window is handled by the cron. This module
 * never reimplements finalizeViolation — it is only reached via the appeals route.
 */
import { Router } from "express";
import { z } from "zod";
import { getServiceClient } from "../../lib/supabase";
import { requireOwner, requireEmployee } from "../../lib/auth";

const router = Router();

// ── Log a violation ───────────────────────────────────────────────────────────
const logSchema = z
  .object({
    employee_id: z.string().uuid(),
    rule_id: z.string().uuid().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    amount: z.number().nonnegative().optional(),
    evidence: z.string().trim().max(2000).optional(),
    note: z.string().trim().max(2000).optional(),
    attendance_id: z.string().uuid().optional(),
    workplace_id: z.string().uuid().optional(),
  })
  .refine((d) => !!d.rule_id || (!!d.reason && d.amount != null), {
    message: "Provide a rule_id, or a free-form reason with an amount.",
  });

router.post("/", requireOwner, async (req, res) => {
  const parsed = logSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const body = parsed.data;
  const db = getServiceClient();
  const orgId = req.owner!.orgId;

  // Employee must belong to the owner's org.
  const { data: emp } = await db
    .from("employees")
    .select("id, workplace_id")
    .eq("id", body.employee_id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!emp) return res.status(404).json({ error: "employee not found" });

  let reason = body.reason ?? "";
  let amount = body.amount ?? 0;
  let ruleId: string | null = null;
  let appealWindowHours = 24;

  // Rule path: resolve reason / amount / appeal window from the penalty rule and
  // verify the rule is owned by this org (rule → ruleset → org).
  if (body.rule_id) {
    const { data: rule } = await db
      .from("penalty_rules")
      .select("id, reason, amount, appeal_window_hours, rulesets!inner(org_id)")
      .eq("id", body.rule_id)
      .maybeSingle();
    const rs = rule
      ? (Array.isArray((rule as any).rulesets) ? (rule as any).rulesets[0] : (rule as any).rulesets)
      : null;
    if (!rule || !rs || rs.org_id !== orgId) {
      return res.status(404).json({ error: "penalty rule not found" });
    }
    ruleId = rule.id as string;
    reason = (rule.reason as string) ?? reason;
    amount = Number(rule.amount ?? 0);
    appealWindowHours = Number(rule.appeal_window_hours ?? 24);
  }

  // Optional attendance entry must belong to this employee.
  if (body.attendance_id) {
    const { data: att } = await db
      .from("attendance_entries")
      .select("id")
      .eq("id", body.attendance_id)
      .eq("employee_id", emp.id)
      .maybeSingle();
    if (!att) return res.status(404).json({ error: "attendance entry not found" });
  }

  const appealWindowEnd = new Date(Date.now() + appealWindowHours * 3600 * 1000).toISOString();
  const evidence = [body.evidence, body.note].filter(Boolean).join("\n").trim() || null;

  const { data: inserted, error } = await db
    .from("violations")
    .insert({
      employee_id: emp.id,
      workplace_id: body.workplace_id ?? emp.workplace_id ?? null,
      rule_id: ruleId,
      attendance_id: body.attendance_id ?? null,
      reason,
      evidence,
      amount,
      status: "open",
      appeal_window_end: appealWindowEnd,
      created_by: req.owner!.userId,
    })
    .select("id, employee_id, reason, amount, status, appeal_window_end, created_at")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json({ violation: inserted });
});

// ── List violations (owner) ───────────────────────────────────────────────────
router.get("/", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const orgId = req.owner!.orgId;

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const employeeId = typeof req.query.employee_id === "string" ? req.query.employee_id : undefined;

  let q = db
    .from("violations")
    .select(
      "id, employee_id, workplace_id, rule_id, reason, evidence, amount, status, " +
        "appeal_window_end, outcome, pdf_url, pay_cycle_id, created_at, " +
        "employees!inner(name, phone, org_id), " +
        "appeals(id, message, decision, submitted_at, decided_at)"
    )
    .eq("employees.org_id", orgId)
    .order("created_at", { ascending: false });

  if (status) q = q.eq("status", status);
  if (employeeId) q = q.eq("employee_id", employeeId);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const violations = (data ?? []).map((v: any) => {
    const emp = Array.isArray(v.employees) ? v.employees[0] : v.employees;
    const appeal = Array.isArray(v.appeals) ? v.appeals[0] : v.appeals;
    return {
      id: v.id,
      employee_id: v.employee_id,
      employee_name: emp?.name ?? null,
      workplace_id: v.workplace_id,
      rule_id: v.rule_id,
      reason: v.reason,
      evidence: v.evidence,
      amount: Number(v.amount),
      status: v.status,
      appeal_window_end: v.appeal_window_end,
      outcome: v.outcome,
      pdf_url: v.pdf_url,
      pay_cycle_id: v.pay_cycle_id,
      created_at: v.created_at,
      appeal: appeal
        ? {
            id: appeal.id,
            message: appeal.message,
            decision: appeal.decision,
            submitted_at: appeal.submitted_at,
            decided_at: appeal.decided_at,
          }
        : null,
    };
  });

  res.json({ violations });
});

// ── Employee: my own violations + appeal state ────────────────────────────────
router.get("/mine", requireEmployee, async (req, res) => {
  const db = getServiceClient();
  const employeeId = req.employee!.employeeId;

  const { data, error } = await db
    .from("violations")
    .select(
      "id, reason, evidence, amount, status, appeal_window_end, outcome, pdf_url, created_at, " +
        "workplaces(name), " +
        "appeals(id, message, decision, submitted_at, decided_at)"
    )
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const now = Date.now();
  const violations = (data ?? []).map((v: any) => {
    const wp = Array.isArray(v.workplaces) ? v.workplaces[0] : v.workplaces;
    const appeal = Array.isArray(v.appeals) ? v.appeals[0] : v.appeals;
    const canAppeal = v.status === "open" && new Date(v.appeal_window_end).getTime() > now;
    return {
      id: v.id,
      reason: v.reason,
      evidence: v.evidence,
      amount: Number(v.amount),
      status: v.status,
      workplace_name: wp?.name ?? null,
      appeal_window_end: v.appeal_window_end,
      can_appeal: canAppeal,
      outcome: v.outcome,
      pdf_url: v.pdf_url,
      created_at: v.created_at,
      appeal: appeal
        ? {
            id: appeal.id,
            message: appeal.message,
            decision: appeal.decision,
            submitted_at: appeal.submitted_at,
            decided_at: appeal.decided_at,
          }
        : null,
    };
  });

  res.json({ violations });
});

export default { basePath: "/api/violations", router };
