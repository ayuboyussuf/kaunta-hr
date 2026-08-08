/**
 * Payroll — compliance-grade, human-gated, calculate-only. Aproksi computes and
 * prepares payment but NEVER moves money and NEVER auto-approves. Every figure is
 * traceable (payslips.breakdown); missing/ambiguous data is flagged, not guessed;
 * the owner reviews + overrides (audited), approves with a PIN, and the run locks
 * immutably, outputting locked payslip PDFs + a payment list (table + CSV) the
 * owner pays manually. No M-Pesa/Daraja integration anywhere.
 */
import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getServiceClient } from "../../lib/supabase";
import { requireOwner } from "../../lib/auth";
import { runPayrollDraft, recomputeNet, recomputeCycle } from "../../lib/payroll/run";
import { toDb, toNum } from "../../lib/money";
import { enqueue } from "../../lib/queue";

const router = Router();

const CYCLE_COLS =
  "id, label, start_date, end_date, pay_date, status, locked, approved_at, approved_by, " +
  "flagged_count, total_net, employee_count, auto, created_at";

/** Load a cycle scoped to the owner's org. */
async function loadCycle(db: ReturnType<typeof getServiceClient>, cycleId: string, orgId: string) {
  const { data } = await db.from("pay_cycles").select(CYCLE_COLS).eq("id", cycleId).eq("org_id", orgId).maybeSingle();
  return data as any;
}

/** Load a payslip and confirm it's in this cycle AND this owner's org. */
async function loadPayslip(
  db: ReturnType<typeof getServiceClient>,
  payslipId: string,
  cycleId: string,
  orgId: string
) {
  const { data } = await db
    .from("payslips")
    .select("id, cycle_id, employee_id, breakdown, flags, held, net, override_net, payment_status, payment_ref, employees!inner(name, phone, org_id)")
    .eq("id", payslipId)
    .eq("cycle_id", cycleId)
    .maybeSingle();
  if (!data) return null;
  const emp = Array.isArray((data as any).employees) ? (data as any).employees[0] : (data as any).employees;
  if (!emp || emp.org_id !== orgId) return null;
  return { ...(data as any), employee: emp };
}

// ── Payroll PIN (approval credential) ─────────────────────────────────────────
router.post("/pin", requireOwner, async (req, res) => {
  const pin = String(req.body?.pin ?? "");
  if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: "PIN must be 4–6 digits" });
  const db = getServiceClient();
  const hash = await bcrypt.hash(pin, 10);
  const { error } = await db.from("orgs").update({ payroll_pin_hash: hash }).eq("id", req.owner!.orgId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Create a pay run ──────────────────────────────────────────────────────────
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const cycleSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    start_date: dateStr,
    end_date: dateStr,
    pay_date: dateStr,
  })
  .refine((d) => d.start_date <= d.end_date, { message: "start_date must be on or before end_date" });

router.post("/cycles", requireOwner, async (req, res) => {
  const parsed = cycleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid body" });
  const db = getServiceClient();
  const { data, error } = await db
    .from("pay_cycles")
    .insert({ org_id: req.owner!.orgId, ...parsed.data })
    .select(CYCLE_COLS)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ cycle: data });
});

// ── List runs ─────────────────────────────────────────────────────────────────
router.get("/cycles", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("pay_cycles")
    .select(CYCLE_COLS)
    .eq("org_id", req.owner!.orgId)
    .order("pay_date", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ cycles: data ?? [] });
});

// ── Run → DRAFT (compute only; never sends) ───────────────────────────────────
router.post("/cycles/:id/run", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid cycle id" });
  const db = getServiceClient();
  const cycle = await loadCycle(db, idParse.data, req.owner!.orgId);
  if (!cycle) return res.status(404).json({ error: "pay run not found" });
  if (cycle.locked) return res.status(409).json({ error: "this run is approved and locked" });
  try {
    await runPayrollDraft(idParse.data);
    res.json({ cycle: await loadCycle(db, idParse.data, req.owner!.orgId) });
  } catch (err) {
    console.error("[payroll] run failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Payslip lines for a run (full breakdown for the drill-down) ───────────────
router.get("/cycles/:id/payslips", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid cycle id" });
  const db = getServiceClient();
  const orgId = req.owner!.orgId;
  const cycle = await loadCycle(db, idParse.data, orgId);
  if (!cycle) return res.status(404).json({ error: "pay run not found" });

  const { data, error } = await db
    .from("payslips")
    .select(
      "id, employee_id, gross, net, override_net, held, payment_status, payment_ref, pdf_url, sent_at, " +
        "breakdown, flags, employees!inner(name, phone, org_id)"
    )
    .eq("cycle_id", idParse.data)
    .eq("employees.org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const payslips = (data ?? []).map((p: any) => {
    const emp = Array.isArray(p.employees) ? p.employees[0] : p.employees;
    const flags = Array.isArray(p.flags) ? p.flags : [];
    return {
      id: p.id,
      employee_id: p.employee_id,
      employee_name: emp?.name ?? null,
      phone: emp?.phone ?? null,
      workplace_name: p.breakdown?.workplace_name ?? "Unassigned",
      gross: toNum(p.gross),
      net: toNum(p.net),
      override_net: p.override_net == null ? null : toNum(p.override_net),
      held: !!p.held,
      payment_status: p.payment_status,
      payment_ref: p.payment_ref,
      pdf_url: p.pdf_url,
      breakdown: p.breakdown ?? {},
      flags,
      has_unresolved_flag: flags.some((f: any) => !f.resolved),
    };
  });
  res.json({ cycle, payslips });
});

// ── Audit log for a line ──────────────────────────────────────────────────────
router.get("/cycles/:id/lines/:pid/audit", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const slip = await loadPayslip(db, req.params.pid, req.params.id, req.owner!.orgId);
  if (!slip) return res.status(404).json({ error: "line not found" });
  const { data } = await db
    .from("payroll_adjustments")
    .select("id, type, amount, note, created_by, created_at")
    .eq("payslip_id", slip.id)
    .order("created_at", { ascending: false });
  res.json({ adjustments: data ?? [] });
});

// ── Owner adjustments (blocked once locked; a note is always required) ────────
type Guard = { ok: false; status: number; msg: string } | { ok: true; cycle: any; slip: any };
async function guardEditable(db: ReturnType<typeof getServiceClient>, cycleId: string, orgId: string, pid: string): Promise<Guard> {
  const cycle = await loadCycle(db, cycleId, orgId);
  if (!cycle) return { ok: false, status: 404, msg: "pay run not found" };
  if (cycle.locked) return { ok: false, status: 409, msg: "this run is approved and locked — no further edits" };
  const slip = await loadPayslip(db, pid, cycleId, orgId);
  if (!slip) return { ok: false, status: 404, msg: "line not found" };
  return { ok: true, cycle, slip };
}

const noteBody = z.object({ note: z.string().trim().min(1).max(500) });
const amountNoteBody = noteBody.extend({ amount: z.number().positive().max(1e9) });

/** Insert an adjustment, then re-derive the line + run. */
async function applyAdjustment(
  db: ReturnType<typeof getServiceClient>,
  cycleId: string,
  payslipId: string,
  userId: string,
  type: string,
  amount: number | null,
  note: string
) {
  // Money stored as fixed 2dp (numeric column); null for non-money types (hold).
  await db.from("payroll_adjustments").insert({ payslip_id: payslipId, type, amount: amount == null ? null : toDb(amount), note, created_by: userId });
  await recomputeNet(db, payslipId);
  await recomputeCycle(db, cycleId);
}

router.post("/cycles/:id/lines/:pid/override", requireOwner, async (req, res) => {
  const body = z.object({ note: z.string().trim().min(1).max(500), net: z.number().min(0).max(1e9) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "net (≥0) and a note are required" });
  const db = getServiceClient();
  const g = await guardEditable(db, req.params.id, req.owner!.orgId, req.params.pid);
  if (!g.ok) return res.status(g.status).json({ error: g.msg });
  await applyAdjustment(db, req.params.id, g.slip.id, req.owner!.userId, "override_net", body.data.net, body.data.note);
  res.json({ ok: true });
});

router.post("/cycles/:id/lines/:pid/bonus", requireOwner, async (req, res) => {
  const body = amountNoteBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "a positive amount and a note are required" });
  const db = getServiceClient();
  const g = await guardEditable(db, req.params.id, req.owner!.orgId, req.params.pid);
  if (!g.ok) return res.status(g.status).json({ error: g.msg });
  await applyAdjustment(db, req.params.id, g.slip.id, req.owner!.userId, "bonus", body.data.amount, body.data.note);
  res.json({ ok: true });
});

router.post("/cycles/:id/lines/:pid/deduction", requireOwner, async (req, res) => {
  const body = amountNoteBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "a positive amount and a note are required" });
  const db = getServiceClient();
  const g = await guardEditable(db, req.params.id, req.owner!.orgId, req.params.pid);
  if (!g.ok) return res.status(g.status).json({ error: g.msg });
  await applyAdjustment(db, req.params.id, g.slip.id, req.owner!.userId, "deduction", body.data.amount, body.data.note);
  res.json({ ok: true });
});

router.post("/cycles/:id/lines/:pid/hold", requireOwner, async (req, res) => {
  const body = z.object({ note: z.string().trim().min(1).max(500), held: z.boolean() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "held (true/false) and a note are required" });
  const db = getServiceClient();
  const g = await guardEditable(db, req.params.id, req.owner!.orgId, req.params.pid);
  if (!g.ok) return res.status(g.status).json({ error: g.msg });
  await applyAdjustment(db, req.params.id, g.slip.id, req.owner!.userId, body.data.held ? "hold" : "unhold", null, body.data.note);
  res.json({ ok: true });
});

router.post("/cycles/:id/lines/:pid/resolve-flag", requireOwner, async (req, res) => {
  const body = z.object({ note: z.string().trim().min(1).max(500), code: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "a flag code and a note are required" });
  const db = getServiceClient();
  const g = await guardEditable(db, req.params.id, req.owner!.orgId, req.params.pid);
  if (!g.ok) return res.status(g.status).json({ error: g.msg });

  const flags = Array.isArray(g.slip.flags) ? (g.slip.flags as any[]) : [];
  const idx = flags.findIndex((f) => f.code === body.data.code && !f.resolved);
  if (idx === -1) return res.status(404).json({ error: "no unresolved flag with that code" });
  flags[idx] = { ...flags[idx], resolved: true, resolved_by: req.owner!.userId, resolved_at: new Date().toISOString(), resolution_note: body.data.note };
  await db.from("payslips").update({ flags }).eq("id", g.slip.id);
  await db.from("payroll_adjustments").insert({
    payslip_id: g.slip.id,
    type: "flag_resolved",
    amount: null,
    note: `${body.data.code}: ${body.data.note}`,
    created_by: req.owner!.userId,
  });
  await recomputeCycle(db, req.params.id);
  res.json({ ok: true });
});

// ── Remove an owner adjustment (undo a bonus / deduction / override) ──────────
router.delete("/cycles/:id/lines/:pid/adjustments/:adjId", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const g = await guardEditable(db, req.params.id, req.owner!.orgId, req.params.pid);
  if (!g.ok) return res.status(g.status).json({ error: g.msg });

  // The adjustment must belong to this payslip. Only owner-created money
  // adjustments can be removed (not the flag-resolution audit trail).
  const { data: adj } = await db
    .from("payroll_adjustments")
    .select("id, type")
    .eq("id", req.params.adjId)
    .eq("payslip_id", g.slip.id)
    .maybeSingle();
  if (!adj) return res.status(404).json({ error: "adjustment not found" });
  if (!["bonus", "deduction", "override_net", "hold", "unhold"].includes(adj.type)) {
    return res.status(400).json({ error: "this entry can't be removed" });
  }

  await db.from("payroll_adjustments").delete().eq("id", adj.id);
  await recomputeNet(db, g.slip.id);
  await recomputeCycle(db, req.params.id);
  res.json({ ok: true });
});

// ── Approve → lock + outputs (requires the payroll PIN; no unresolved flags) ──
router.post("/cycles/:id/approve", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid cycle id" });
  const pin = String(req.body?.pin ?? "");
  const db = getServiceClient();
  const orgId = req.owner!.orgId;

  const cycle = await loadCycle(db, idParse.data, orgId);
  if (!cycle) return res.status(404).json({ error: "pay run not found" });
  if (cycle.locked) return res.status(409).json({ error: "this run is already approved" });

  // Verify the payroll PIN.
  const { data: org } = await db.from("orgs").select("payroll_pin_hash").eq("id", orgId).single();
  if (!org?.payroll_pin_hash) return res.status(400).json({ error: "Set a payroll PIN in Settings before approving." });
  if (!(await bcrypt.compare(pin, org.payroll_pin_hash))) return res.status(401).json({ error: "Incorrect payroll PIN." });

  // Refuse while any line has an unresolved flag.
  await recomputeCycle(db, idParse.data);
  const fresh = await loadCycle(db, idParse.data, orgId);
  if (Number(fresh.flagged_count) > 0) {
    return res.status(409).json({ error: "Resolve all flagged items before approving." });
  }

  // Freeze: lock, stamp approver, generate a locked payslip PDF + payment ref per
  // non-held line. Auto-sends nothing.
  await db.from("pay_cycles").update({ status: "approved", locked: true, approved_at: new Date().toISOString(), approved_by: req.owner!.userId }).eq("id", idParse.data);

  const { data: slips } = await db
    .from("payslips")
    .select("id, employee_id, held")
    .eq("cycle_id", idParse.data)
    .eq("employees.org_id", orgId)
    .order("created_at", { ascending: true });

  // Assign the payment reference synchronously (the payment list/CSV needs it
  // immediately), then enqueue the heavy payslip-PDF generation as background
  // jobs so approval returns fast. Each PDF job is idempotent (deterministic
  // jobId + a no-op when pdf_url is already set), so a retry never duplicates.
  let i = 0;
  for (const s of slips ?? []) {
    if (s.held) continue;
    i += 1;
    const paymentRef = `PY-${String(idParse.data).slice(0, 4).toUpperCase()}-${String(i).padStart(3, "0")}`;
    await db.from("payslips").update({ payment_ref: paymentRef }).eq("id", s.id);
    try {
      await enqueue("pdf", { payslipId: s.id }, `pdf:${s.id}`);
    } catch (err) {
      console.error(`[payroll] could not enqueue payslip PDF for ${s.id}:`, (err as Error).message);
    }
  }

  await recomputeCycle(db, idParse.data);
  res.json({ cycle: await loadCycle(db, idParse.data, orgId) });
});

// ── Approved payment list — CSV (the ONLY payment-related output) ─────────────
router.get("/cycles/:id/payment-list.csv", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid cycle id" });
  const db = getServiceClient();
  const orgId = req.owner!.orgId;
  const cycle = await loadCycle(db, idParse.data, orgId);
  if (!cycle) return res.status(404).json({ error: "pay run not found" });
  if (!cycle.locked) return res.status(409).json({ error: "approve the run before exporting the payment list" });

  const { data: slips } = await db
    .from("payslips")
    .select("net, payment_ref, held, employees!inner(name, phone, org_id)")
    .eq("cycle_id", idParse.data)
    .eq("employees.org_id", orgId)
    .order("created_at", { ascending: true });

  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [["Employee name", "M-Pesa phone", "Net amount (KES)", "Payment reference"]];
  for (const s of slips ?? []) {
    if (s.held) continue; // held payments are excluded from the payout list
    const emp = Array.isArray((s as any).employees) ? (s as any).employees[0] : (s as any).employees;
    rows.push([emp?.name ?? "", emp?.phone ?? "", toDb(s.net), s.payment_ref ?? ""]);
  }
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="payment-list-${cycle.label.replace(/[^a-z0-9]+/gi, "-")}.csv"`);
  res.send(csv);
});

// ── Manual post-payment status (allowed AFTER lock — tracking, not a figure) ──
router.patch("/cycles/:id/lines/:pid/payment-status", requireOwner, async (req, res) => {
  const status = String(req.body?.status ?? "");
  if (!["not_yet", "paid", "failed"].includes(status)) return res.status(400).json({ error: "invalid status" });
  const db = getServiceClient();
  const slip = await loadPayslip(db, req.params.pid, req.params.id, req.owner!.orgId);
  if (!slip) return res.status(404).json({ error: "line not found" });
  await db.from("payslips").update({ payment_status: status }).eq("id", slip.id);
  res.json({ ok: true });
});

// ── All payslips for an employee (owner view) ─────────────────────────────────
router.get("/payslips", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const orgId = req.owner!.orgId;
  const employeeId = typeof req.query.employee_id === "string" ? req.query.employee_id : undefined;
  let q = db
    .from("payslips")
    .select("id, employee_id, cycle_id, gross, net, pdf_url, payment_status, created_at, employees!inner(name, org_id), pay_cycles(label, pay_date)")
    .eq("employees.org_id", orgId)
    .order("created_at", { ascending: false });
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  const payslips = (data ?? []).map((p: any) => {
    const emp = Array.isArray(p.employees) ? p.employees[0] : p.employees;
    const cyc = Array.isArray(p.pay_cycles) ? p.pay_cycles[0] : p.pay_cycles;
    return {
      id: p.id,
      employee_id: p.employee_id,
      employee_name: emp?.name ?? null,
      cycle_label: cyc?.label ?? null,
      gross: toNum(p.gross),
      net: toNum(p.net),
      pdf_url: p.pdf_url,
      payment_status: p.payment_status,
      created_at: p.created_at,
    };
  });
  res.json({ payslips });
});

export default { basePath: "/api/payroll", router };
