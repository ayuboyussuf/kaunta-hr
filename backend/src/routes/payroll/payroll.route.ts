/**
 * Payroll (spec §6).
 *
 *   • POST /api/payroll/cycles                 (owner) — create a pay cycle.
 *   • GET  /api/payroll/cycles                 (owner) — list cycles.
 *   • POST /api/payroll/cycles/:id/run         (owner) — run payroll for a cycle.
 *   • GET  /api/payroll/cycles/:id/payslips    (owner) — payslips for a cycle.
 *   • GET  /api/payroll/payslips               (owner) — all payslips (filter employee).
 *
 * Deduction / rollover rule (spec §6):
 *   gross       = employees.base_salary
 *   deductions  = the employee's LOCKED violations (status='locked') whose
 *                 created_at falls inside the cycle window AND that are not yet
 *                 attached to a prior payslip (pay_cycle_id IS NULL, or already
 *                 this cycle so re-runs are idempotent). Each included violation
 *                 has its pay_cycle_id stamped to this cycle.
 *   net         = gross - Σ deductions
 *
 * Violations still in appeal at payday (status 'open' or 'appealed' — anything
 * NOT 'locked') are deliberately skipped and left with pay_cycle_id = null, so a
 * later cycle's run picks them up automatically. No manual rollover needed.
 */
import { Router } from "express";
import { z } from "zod";
import { getServiceClient } from "../../lib/supabase";
import { requireOwner } from "../../lib/auth";
import { sendDocument } from "../../lib/whatsapp/meta";
import { runPayrollDraft } from "../../lib/payroll/run";

const router = Router();

// ── Create a pay cycle ────────────────────────────────────────────────────────
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const cycleSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    start_date: dateStr,
    end_date: dateStr,
    pay_date: dateStr,
  })
  .refine((d) => d.start_date <= d.end_date, {
    message: "start_date must be on or before end_date",
  });

router.post("/cycles", requireOwner, async (req, res) => {
  const parsed = cycleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const db = getServiceClient();
  const { data, error } = await db
    .from("pay_cycles")
    .insert({ org_id: req.owner!.orgId, ...parsed.data })
    .select("id, label, start_date, end_date, pay_date, status, created_at")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ cycle: data });
});

// ── List cycles ───────────────────────────────────────────────────────────────
router.get("/cycles", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("pay_cycles")
    .select("id, label, start_date, end_date, pay_date, status, summary_pdf_url, released_at, auto, created_at")
    .eq("org_id", req.owner!.orgId)
    .order("pay_date", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ cycles: data ?? [] });
});

// ── Run payroll for a cycle → DRAFT (no payslips sent yet) ────────────────────
router.post("/cycles/:id/run", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid cycle id" });

  const db = getServiceClient();
  const { data: cycle } = await db
    .from("pay_cycles")
    .select("id")
    .eq("id", idParse.data)
    .eq("org_id", req.owner!.orgId)
    .maybeSingle();
  if (!cycle) return res.status(404).json({ error: "pay cycle not found" });

  try {
    const result = await runPayrollDraft(idParse.data);
    res.json(result);
  } catch (err) {
    console.error("[payroll] run failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Release: send the (already-computed) payslips to employees ────────────────
router.post("/cycles/:id/release", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid cycle id" });

  const db = getServiceClient();
  const orgId = req.owner!.orgId;
  const { data: cycle } = await db
    .from("pay_cycles")
    .select("id, label, status")
    .eq("id", idParse.data)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!cycle) return res.status(404).json({ error: "pay cycle not found" });
  if (cycle.status !== "draft" && cycle.status !== "paid") {
    return res.status(409).json({ error: "run payroll before releasing" });
  }

  const { data: slips } = await db
    .from("payslips")
    .select("id, pdf_url, sent_at, employees!inner(name, phone, org_id)")
    .eq("cycle_id", idParse.data)
    .eq("employees.org_id", orgId);

  let sent = 0;
  for (const s of slips ?? []) {
    const emp = Array.isArray((s as any).employees) ? (s as any).employees[0] : (s as any).employees;
    if (!emp?.phone || !s.pdf_url) continue;
    try {
      await sendDocument(emp.phone, s.pdf_url, `payslip-${String(s.id).slice(0, 8)}.pdf`, `Payslip — ${cycle.label}`);
      await db.from("payslips").update({ sent_at: new Date().toISOString() }).eq("id", s.id);
      sent++;
    } catch (err) {
      console.error(`[payroll] release send failed for payslip ${s.id}:`, (err as Error).message);
    }
  }

  await db
    .from("pay_cycles")
    .update({ status: "paid", released_at: new Date().toISOString() })
    .eq("id", idParse.data);

  res.json({ ok: true, sent });
});

// ── Payslips for a cycle ──────────────────────────────────────────────────────
router.get("/cycles/:id/payslips", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid cycle id" });
  const db = getServiceClient();
  const orgId = req.owner!.orgId;

  // Confirm the cycle is in this org.
  const { data: cycle } = await db
    .from("pay_cycles")
    .select("id")
    .eq("id", idParse.data)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!cycle) return res.status(404).json({ error: "pay cycle not found" });

  const { data, error } = await db
    .from("payslips")
    .select(
      "id, employee_id, gross, deductions, net, pdf_url, sent_at, created_at, " +
        "employees!inner(name, org_id, workplace:workplaces(name))"
    )
    .eq("cycle_id", idParse.data)
    .eq("employees.org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ payslips: (data ?? []).map(shapePayslip) });
});

// ── All payslips (filter by employee) ─────────────────────────────────────────
router.get("/payslips", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const orgId = req.owner!.orgId;
  const employeeId = typeof req.query.employee_id === "string" ? req.query.employee_id : undefined;

  let q = db
    .from("payslips")
    .select(
      "id, employee_id, cycle_id, gross, deductions, net, pdf_url, sent_at, created_at, " +
        "employees!inner(name, org_id), pay_cycles(label, pay_date)"
    )
    .eq("employees.org_id", orgId)
    .order("created_at", { ascending: false });
  if (employeeId) q = q.eq("employee_id", employeeId);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ payslips: (data ?? []).map(shapePayslip) });
});

function shapePayslip(p: any) {
  const emp = Array.isArray(p.employees) ? p.employees[0] : p.employees;
  const cyc = Array.isArray(p.pay_cycles) ? p.pay_cycles[0] : p.pay_cycles;
  const wp = emp ? (Array.isArray(emp.workplace) ? emp.workplace[0] : emp.workplace) : null;
  return {
    id: p.id,
    employee_id: p.employee_id,
    employee_name: emp?.name ?? null,
    workplace_name: wp?.name ?? "Unassigned",
    cycle_id: p.cycle_id ?? null,
    cycle_label: cyc?.label ?? null,
    pay_date: cyc?.pay_date ?? null,
    gross: Number(p.gross),
    deductions: (p.deductions ?? []) as { reason: string; amount: number; violation_id?: string }[],
    net: Number(p.net),
    pdf_url: p.pdf_url,
    sent_at: p.sent_at,
    created_at: p.created_at,
  };
}

export default { basePath: "/api/payroll", router };
