/**
 * Appeals (spec §5).
 *
 *   • POST /api/appeals            (employee) — appeal one's own violation, in-window.
 *   • GET  /api/appeals            (owner)    — list appeals (default: pending).
 *   • POST /api/appeals/:id/decide (owner)    — accept → waived, reject → upheld.
 *
 * Owner decisions call finalizeViolation (locks the violation, generates the
 * outcome PDF, and WhatsApps it to the employee). We never reimplement that.
 */
import { Router } from "express";
import { z } from "zod";
import { getServiceClient } from "../../lib/supabase";
import { requireOwner, requireEmployee } from "../../lib/auth";
import { finalizeViolation } from "../../lib/violations/finalize";

const router = Router();

// ── Employee: submit an appeal ────────────────────────────────────────────────
const appealSchema = z.object({
  violation_id: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
});

router.post("/", requireEmployee, async (req, res) => {
  const parsed = appealSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const db = getServiceClient();
  const employeeId = req.employee!.employeeId;

  // The violation must belong to the caller.
  const { data: v } = await db
    .from("violations")
    .select("id, status, appeal_window_end")
    .eq("id", parsed.data.violation_id)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!v) return res.status(404).json({ error: "violation not found" });

  if (v.status !== "open") {
    return res.status(409).json({ error: "this violation can no longer be appealed" });
  }
  if (new Date(v.appeal_window_end).getTime() <= Date.now()) {
    return res.status(409).json({ error: "the appeal window has closed" });
  }

  // Guard against a second appeal on the same violation.
  const { data: existing } = await db
    .from("appeals")
    .select("id")
    .eq("violation_id", v.id)
    .maybeSingle();
  if (existing) return res.status(409).json({ error: "an appeal already exists for this violation" });

  const { data: appeal, error } = await db
    .from("appeals")
    .insert({ violation_id: v.id, message: parsed.data.message })
    .select("id, violation_id, message, decision, submitted_at")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await db.from("violations").update({ status: "appealed" }).eq("id", v.id);

  res.status(201).json({ appeal });
});

// ── Owner: list appeals (default pending) ─────────────────────────────────────
router.get("/", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const orgId = req.owner!.orgId;
  const decision = typeof req.query.decision === "string" ? req.query.decision : "pending";

  let q = db
    .from("appeals")
    .select(
      "id, violation_id, message, decision, submitted_at, decided_at, " +
        "violations!inner(id, reason, amount, status, created_at, employee_id, " +
        "employees!inner(name, phone, org_id))"
    )
    .eq("violations.employees.org_id", orgId)
    .order("submitted_at", { ascending: false });

  if (decision !== "all") q = q.eq("decision", decision);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const appeals = (data ?? []).map((a: any) => {
    const v = Array.isArray(a.violations) ? a.violations[0] : a.violations;
    const emp = v ? (Array.isArray(v.employees) ? v.employees[0] : v.employees) : null;
    return {
      id: a.id,
      violation_id: a.violation_id,
      message: a.message,
      decision: a.decision,
      submitted_at: a.submitted_at,
      decided_at: a.decided_at,
      violation: v
        ? {
            id: v.id,
            reason: v.reason,
            amount: Number(v.amount),
            status: v.status,
            created_at: v.created_at,
            employee_id: v.employee_id,
            employee_name: emp?.name ?? null,
          }
        : null,
    };
  });

  res.json({ appeals });
});

// ── Owner: decide an appeal ───────────────────────────────────────────────────
const decideSchema = z.object({ decision: z.enum(["accept", "reject"]) });

router.post("/:id/decide", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid appeal id" });
  const parsed = decideSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "decision must be 'accept' or 'reject'" });

  const db = getServiceClient();
  const orgId = req.owner!.orgId;

  // Appeal must belong to this org and still be pending.
  const { data: appeal } = await db
    .from("appeals")
    .select("id, decision, violation_id, violations!inner(id, employees!inner(org_id))")
    .eq("id", idParse.data)
    .maybeSingle();
  const v = appeal
    ? (Array.isArray((appeal as any).violations) ? (appeal as any).violations[0] : (appeal as any).violations)
    : null;
  const emp = v ? (Array.isArray(v.employees) ? v.employees[0] : v.employees) : null;
  if (!appeal || !emp || emp.org_id !== orgId) {
    return res.status(404).json({ error: "appeal not found" });
  }
  if (appeal.decision !== "pending") {
    return res.status(409).json({ error: "this appeal has already been decided" });
  }

  const accepted = parsed.data.decision === "accept";

  // finalizeViolation locks the violation, writes the outcome PDF, and WhatsApps
  // it to the employee. Accept → waived (no deduction); reject → upheld.
  let pdfUrl: string;
  try {
    const r = await finalizeViolation(appeal.violation_id, accepted ? "waived" : "upheld");
    pdfUrl = r.pdfUrl;
  } catch (err) {
    console.error(`[appeals] finalize failed for ${appeal.violation_id}:`, err);
    return res.status(502).json({ error: "failed to finalize the violation" });
  }

  await db
    .from("appeals")
    .update({
      decision: accepted ? "accepted" : "rejected",
      decided_at: new Date().toISOString(),
      decided_by: req.owner!.userId,
    })
    .eq("id", appeal.id);

  res.json({ ok: true, decision: accepted ? "accepted" : "rejected", pdf_url: pdfUrl });
});

export default { basePath: "/api/appeals", router };
