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
import { payslipPdf } from "../../lib/pdf/templates";
import { uploadPdf } from "../../lib/pdf/render";
import { sendDocument } from "../../lib/whatsapp/meta";

const router = Router();

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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
    .select("id, label, start_date, end_date, pay_date, status, created_at")
    .eq("org_id", req.owner!.orgId)
    .order("pay_date", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ cycles: data ?? [] });
});

// ── Run payroll for a cycle ───────────────────────────────────────────────────
router.post("/cycles/:id/run", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid cycle id" });

  const db = getServiceClient();
  const orgId = req.owner!.orgId;
  const cycleId = idParse.data;

  const { data: cycle } = await db
    .from("pay_cycles")
    .select("id, label, start_date, end_date, status")
    .eq("id", cycleId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!cycle) return res.status(404).json({ error: "pay cycle not found" });

  // Cycle window as a half-open timestamp interval [start_date, end_date + 1 day).
  const startBoundary = `${cycle.start_date}T00:00:00.000Z`;
  const end = new Date(`${cycle.end_date}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const endBoundary = end.toISOString();

  await db.from("pay_cycles").update({ status: "processing" }).eq("id", cycleId);

  const { data: employees, error: empErr } = await db
    .from("employees")
    .select("id, name, phone, base_salary")
    .eq("org_id", orgId)
    .eq("status", "active");
  if (empErr) return res.status(500).json({ error: empErr.message });

  const results: {
    employee_id: string;
    employee_name: string;
    payslip_id: string;
    gross: number;
    deduction_total: number;
    net: number;
    sent: boolean;
  }[] = [];

  for (const emp of employees ?? []) {
    const gross = round2(Number(emp.base_salary ?? 0));

    // Locked violations in-window, not attached to a prior cycle. Include ones
    // already stamped to THIS cycle so re-running the cycle is idempotent.
    const { data: viols, error: vErr } = await db
      .from("violations")
      .select("id, reason, amount, pay_cycle_id")
      .eq("employee_id", emp.id)
      .eq("status", "locked")
      .gte("created_at", startBoundary)
      .lt("created_at", endBoundary)
      .or(`pay_cycle_id.is.null,pay_cycle_id.eq.${cycleId}`);
    if (vErr) return res.status(500).json({ error: vErr.message });

    const deductions = (viols ?? []).map((v: any) => ({
      reason: v.reason as string,
      amount: round2(Number(v.amount ?? 0)),
      violation_id: v.id as string,
    }));
    const deductionTotal = round2(deductions.reduce((s, d) => s + d.amount, 0));
    const net = round2(gross - deductionTotal);

    // Upsert the payslip first so we have an id for the PDF path.
    const { data: slip, error: slipErr } = await db
      .from("payslips")
      .upsert(
        {
          employee_id: emp.id,
          cycle_id: cycleId,
          gross,
          deductions,
          net,
        },
        { onConflict: "employee_id,cycle_id" }
      )
      .select("id")
      .single();
    if (slipErr) return res.status(500).json({ error: slipErr.message });
    const payslipId = slip.id as string;

    // Stamp the included violations to this cycle so no other cycle re-deducts them.
    if (deductions.length) {
      await db
        .from("violations")
        .update({ pay_cycle_id: cycleId })
        .in(
          "id",
          deductions.map((d) => d.violation_id)
        );
    }

    // Generate + store the payslip PDF, then deliver over WhatsApp.
    const pdf = await payslipPdf({
      employeeName: emp.name,
      cycleLabel: cycle.label,
      gross,
      deductions: deductions.map((d) => ({ reason: d.reason, amount: d.amount })),
      net,
    });
    const { signedUrl } = await uploadPdf(`payslips/${payslipId}.pdf`, pdf);

    let sent = false;
    if (emp.phone) {
      try {
        await sendDocument(
          emp.phone,
          signedUrl,
          `payslip-${payslipId.slice(0, 8)}.pdf`,
          `Payslip — ${cycle.label}`
        );
        sent = true;
      } catch (err) {
        console.error(`[payroll] WhatsApp delivery failed for ${emp.id}:`, err);
      }
    }

    await db
      .from("payslips")
      .update({ pdf_url: signedUrl, ...(sent ? { sent_at: new Date().toISOString() } : {}) })
      .eq("id", payslipId);

    results.push({
      employee_id: emp.id,
      employee_name: emp.name,
      payslip_id: payslipId,
      gross,
      deduction_total: deductionTotal,
      net,
      sent,
    });
  }

  await db.from("pay_cycles").update({ status: "paid" }).eq("id", cycleId);

  res.json({ cycle_id: cycleId, count: results.length, results });
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
    .select("id, employee_id, gross, deductions, net, pdf_url, sent_at, created_at, employees!inner(name, org_id)")
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
  return {
    id: p.id,
    employee_id: p.employee_id,
    employee_name: emp?.name ?? null,
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
