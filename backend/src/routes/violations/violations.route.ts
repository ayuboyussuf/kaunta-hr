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
import { requireOwner, requireEmployee, resolveOwner, verifyEmployeeSession } from "../../lib/auth";
import { canAppeal, msLeft, stageOf, STAGE_LABEL, STAGE_LABEL_OWNER } from "../../lib/violations/stage";
import { signViolationDocument } from "../../lib/violations/finalize";
import { sendText } from "../../lib/messaging";

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
        "appeal_window_end, outcome, pdf_url, pdf_path, pay_cycle_id, created_at, " +
        "notified_at, notify_error, acknowledged_at, notice_tracked, " +
        "employees!inner(name, phone, org_id), " +
        "appeals(id, message, decision, submitted_at, decided_at)"
    )
    .eq("employees.org_id", orgId)
    .order("created_at", { ascending: false });

  if (status) q = q.eq("status", status);
  if (employeeId) q = q.eq("employee_id", employeeId);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const nowMs = Date.now();
  const violations = (data ?? []).map((v: any) => {
    const emp = Array.isArray(v.employees) ? v.employees[0] : v.employees;
    const appeal = Array.isArray(v.appeals) ? v.appeals[0] : v.appeals;
    const s = { status: v.status, appeal_window_end: v.appeal_window_end, hasAppeal: !!appeal };
    const stage = stageOf(s, nowMs);
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
      stage,
      stage_label: STAGE_LABEL_OWNER[stage],
      appeal_window_end: v.appeal_window_end,
      outcome: v.outcome,
      has_document: Boolean(v.pdf_path || v.pdf_url),
      // Whether the employee was actually told. An undelivered penalty is the
      // owner's problem to fix, so it belongs on their screen, not in a log.
      notified_at: v.notified_at ?? null,
      notify_error: v.notify_error ?? null,
      acknowledged_at: v.acknowledged_at ?? null,
      // False for rows raised before delivery was recorded: null notified_at
      // means unknown there, not failed.
      notice_tracked: v.notice_tracked !== false,
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

// ── The outcome document, signed on demand ────────────────────────────────────
//
// Reachable by the employee it concerns and by an owner in the same org. Signed
// per request rather than stored: `pdf_url` used to hold a seven-day signed link
// written into the row permanently, so the document that exists precisely to be
// producible months later stopped opening after a week.
// Both principals reach the same document, so the token decides which check
// applies: an employee JWT means "must be yours", a Supabase session means
// "must be in your org". Either way a failure is 404, never 403 — the existence
// of another org's penalty is not something to confirm.
router.get("/:id/document", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "invalid id" });

  const bearer = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return res.status(401).json({ error: "unauthorized" });

  const db = getServiceClient();
  const { data } = await db
    .from("violations")
    .select("id, employee_id, pdf_path, pdf_url, employees!inner(org_id)")
    .eq("id", id.data)
    .maybeSingle();
  if (!data) return res.status(404).json({ error: "not found" });

  const empRow = Array.isArray((data as any).employees)
    ? (data as any).employees[0]
    : (data as any).employees;

  const asEmployee = verifyEmployeeSession(bearer);
  let permitted = false;
  if (asEmployee) {
    permitted = data.employee_id === asEmployee.employeeId;
  } else {
    const owner = await resolveOwner(bearer);
    permitted = Boolean(owner && empRow?.org_id === owner.orgId);
  }
  if (!permitted) return res.status(404).json({ error: "not found" });

  const url = await signViolationDocument(
    (data.pdf_path as string | null) ?? null,
    (data.pdf_url as string | null) ?? null
  );
  if (!url) return res.status(404).json({ error: "no document yet" });
  res.json({ url });
});

// ── Owner: resend a notice that never arrived ─────────────────────────────────
//
// The dashboard raises "penalties nobody received". It used to be a dead end:
// a red number with nowhere to go and nothing that would ever clear it, which
// is worse than not raising it at all — an alert you cannot act on trains
// people to ignore alerts.
//
// This is the action. It re-sends to whatever number is on file now, so fixing
// a mistyped phone and pressing resend actually resolves the thing.
router.post("/:id/resend-notice", requireOwner, async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "invalid id" });

  const db = getServiceClient();
  const { data: v } = await db
    .from("violations")
    .select("id, reason, amount, employee_id, employees!inner(name, phone, org_id)")
    .eq("id", id.data)
    .maybeSingle();

  const emp = v
    ? (Array.isArray((v as any).employees) ? (v as any).employees[0] : (v as any).employees)
    : null;
  if (!v || !emp || emp.org_id !== req.owner!.orgId) {
    return res.status(404).json({ error: "not found" });
  }
  if (!emp.phone) {
    return res.status(400).json({
      error: "No phone number on file for this employee. Add one on their profile, then resend.",
    });
  }

  const amount = `KES ${Number(v.amount).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
  try {
    await sendText(
      emp.phone as string,
      `Aproksi HR: ${v.reason} — ${amount}. If you disagree, open your record to appeal.`
    );
    await db
      .from("violations")
      .update({ notified_at: new Date().toISOString(), notify_error: null, notice_tracked: true })
      .eq("id", v.id);
    res.json({ sent: true });
  } catch (err) {
    const message = (err as Error).message;
    await db
      .from("violations")
      .update({ notify_error: message.slice(0, 300) })
      .eq("id", v.id);
    res.status(502).json({ sent: false, error: message });
  }
});

// ── Owner: stop chasing one that cannot be delivered ──────────────────────────
//
// Some cannot be fixed — the person has left, the number is dead. Marking it
// so is a decision the owner records, not a row that quietly disappears: the
// penalty still stands, and the record still says nobody could be reached.
router.post("/:id/notice-unreachable", requireOwner, async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "invalid id" });

  const db = getServiceClient();
  const { data } = await db
    .from("violations")
    .select("id, employees!inner(org_id)")
    .eq("id", id.data)
    .maybeSingle();
  const emp = data
    ? (Array.isArray((data as any).employees) ? (data as any).employees[0] : (data as any).employees)
    : null;
  if (!data || emp?.org_id !== req.owner!.orgId) return res.status(404).json({ error: "not found" });

  await db
    .from("violations")
    .update({ notice_tracked: false, notify_error: "Owner marked this employee unreachable." })
    .eq("id", id.data);

  res.json({ ok: true });
});

// ── Employee: acknowledge a penalty ───────────────────────────────────────────
//
// "Nobody told me" is the commonest thing said about a deduction, and until now
// nothing could answer it. The SMS is best-effort and can silently fail; this is
// the employee confirming, in the app, that they have seen it. It changes
// nothing about the penalty or the appeal window — it only records that they
// know, which protects them as much as the owner: an unacknowledged penalty
// shows up on the owner's screen as one that may never have arrived.
router.post("/:id/acknowledge", requireEmployee, async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "invalid id" });

  const db = getServiceClient();
  const { data, error } = await db
    .from("violations")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("employee_id", req.employee!.employeeId)
    .is("acknowledged_at", null) // first time only; never overwrite the record
    .select("id, acknowledged_at")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  // Already acknowledged is a success, not an error — the tap was a no-op.
  res.json({ acknowledged_at: data?.acknowledged_at ?? null, ok: true });
});

// ── Employee: my own violations + appeal state ────────────────────────────────
router.get("/mine", requireEmployee, async (req, res) => {
  const db = getServiceClient();
  const employeeId = req.employee!.employeeId;

  const { data, error } = await db
    .from("violations")
    .select(
      "id, reason, evidence, amount, status, appeal_window_end, outcome, pdf_url, pdf_path, " +
        "notified_at, acknowledged_at, created_at, " +
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
    // Derived from the deadline, never from whether the sweep has run — see
    // lib/violations/stage for why that distinction is the whole bug.
    const s = { status: v.status, appeal_window_end: v.appeal_window_end, hasAppeal: !!appeal };
    return {
      id: v.id,
      reason: v.reason,
      evidence: v.evidence,
      amount: Number(v.amount),
      status: v.status,
      stage: stageOf(s, now),
      stage_label: STAGE_LABEL[stageOf(s, now)],
      ms_left: msLeft(s, now),
      workplace_name: wp?.name ?? null,
      appeal_window_end: v.appeal_window_end,
      can_appeal: canAppeal(s, now),
      outcome: v.outcome,
      has_document: Boolean(v.pdf_path || v.pdf_url),
      notified_at: v.notified_at ?? null,
      acknowledged_at: v.acknowledged_at ?? null,
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
