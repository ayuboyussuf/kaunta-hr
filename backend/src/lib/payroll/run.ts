/**
 * Payroll run engine (shared by the manual route and the auto cron).
 *
 * `runPayrollDraft` computes everyone's pay + deductions for a cycle, writes the
 * payslips and their PDFs, builds a per-workplace payout summary + summary PDF,
 * and leaves the cycle in 'draft' — it does NOT send payslips to employees. That
 * is the owner's explicit "release" step (see payroll.route.ts). Deduction logic
 * is unchanged from the original route: locked, in-window violations, idempotent.
 */
import { getServiceClient } from "../supabase";
import { payslipPdf, payrollSummaryPdf } from "../pdf/templates";
import { uploadPdf } from "../pdf/render";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PayrollEmployeeResult {
  employee_id: string;
  employee_name: string;
  workplace_id: string | null;
  workplace_name: string;
  gross: number;
  deduction_total: number;
  net: number;
}

export interface PayrollRunResult {
  cycle_id: string;
  count: number;
  results: PayrollEmployeeResult[];
  grand_total: number;
  summary_pdf_url: string | null;
}

/** Compute + persist a draft payroll for a cycle. Throws on hard DB errors. */
export async function runPayrollDraft(cycleId: string): Promise<PayrollRunResult> {
  const db = getServiceClient();

  const { data: cycle, error: cErr } = await db
    .from("pay_cycles")
    .select("id, org_id, label, start_date, end_date")
    .eq("id", cycleId)
    .single();
  if (cErr || !cycle) throw new Error(cErr?.message ?? "pay cycle not found");

  // Cycle window as a half-open timestamp interval [start_date, end_date + 1 day).
  const startBoundary = `${cycle.start_date}T00:00:00.000Z`;
  const end = new Date(`${cycle.end_date}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const endBoundary = end.toISOString();

  await db.from("pay_cycles").update({ status: "processing" }).eq("id", cycleId);

  const { data: employees, error: empErr } = await db
    .from("employees")
    .select("id, name, base_salary, workplace_id, workplace:workplaces(name)")
    .eq("org_id", cycle.org_id)
    .eq("status", "active");
  if (empErr) throw new Error(empErr.message);

  const results: PayrollEmployeeResult[] = [];

  for (const emp of employees ?? []) {
    const wp = Array.isArray((emp as any).workplace)
      ? (emp as any).workplace[0]
      : (emp as any).workplace;
    const gross = round2(Number(emp.base_salary ?? 0));

    const { data: viols, error: vErr } = await db
      .from("violations")
      .select("id, reason, amount, pay_cycle_id")
      .eq("employee_id", emp.id)
      .eq("status", "locked")
      .gte("created_at", startBoundary)
      .lt("created_at", endBoundary)
      .or(`pay_cycle_id.is.null,pay_cycle_id.eq.${cycleId}`);
    if (vErr) throw new Error(vErr.message);

    const deductions = (viols ?? []).map((v: any) => ({
      reason: v.reason as string,
      amount: round2(Number(v.amount ?? 0)),
      violation_id: v.id as string,
    }));
    const deductionTotal = round2(deductions.reduce((s, d) => s + d.amount, 0));
    const net = round2(gross - deductionTotal);

    const { data: slip, error: slipErr } = await db
      .from("payslips")
      .upsert(
        { employee_id: emp.id, cycle_id: cycleId, gross, deductions, net },
        { onConflict: "employee_id,cycle_id" }
      )
      .select("id")
      .single();
    if (slipErr) throw new Error(slipErr.message);
    const payslipId = slip.id as string;

    if (deductions.length) {
      await db
        .from("violations")
        .update({ pay_cycle_id: cycleId })
        .in("id", deductions.map((d) => d.violation_id));
    }

    // Generate + store the payslip PDF now (so it's ready), but DO NOT send it —
    // release is a separate, explicit step.
    const pdf = await payslipPdf({
      employeeName: emp.name,
      cycleLabel: cycle.label,
      gross,
      deductions: deductions.map((d) => ({ reason: d.reason, amount: d.amount })),
      net,
    });
    const { signedUrl } = await uploadPdf(`payslips/${payslipId}.pdf`, pdf);
    await db.from("payslips").update({ pdf_url: signedUrl }).eq("id", payslipId);

    results.push({
      employee_id: emp.id,
      employee_name: emp.name,
      workplace_id: emp.workplace_id ?? null,
      workplace_name: wp?.name ?? "Unassigned",
      gross,
      deduction_total: deductionTotal,
      net,
    });
  }

  // Group by workplace for the owner payout summary.
  const byWp = new Map<string, { name: string; employees: { name: string; net: number }[]; subtotal: number }>();
  for (const r of results) {
    const key = r.workplace_id ?? "none";
    const g = byWp.get(key) ?? { name: r.workplace_name, employees: [], subtotal: 0 };
    g.employees.push({ name: r.employee_name, net: r.net });
    g.subtotal = round2(g.subtotal + r.net);
    byWp.set(key, g);
  }
  const workplaces = [...byWp.values()];
  const grandTotal = round2(workplaces.reduce((s, w) => s + w.subtotal, 0));

  // Owner payout summary PDF.
  let summaryPdfUrl: string | null = null;
  try {
    const { data: org } = await db.from("orgs").select("name").eq("id", cycle.org_id).maybeSingle();
    const buf = await payrollSummaryPdf({
      orgName: org?.name ?? "Your business",
      cycleLabel: cycle.label,
      workplaces,
      grandTotal,
    });
    const up = await uploadPdf(`payroll-summary/${cycleId}.pdf`, buf);
    summaryPdfUrl = up.signedUrl;
  } catch (err) {
    console.error(`[payroll] summary PDF failed for cycle ${cycleId}:`, (err as Error).message);
  }

  await db
    .from("pay_cycles")
    .update({ status: "draft", summary_pdf_url: summaryPdfUrl })
    .eq("id", cycleId);

  return { cycle_id: cycleId, count: results.length, results, grand_total: grandTotal, summary_pdf_url: summaryPdfUrl };
}
