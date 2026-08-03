/**
 * Payroll compute engine — compliance-grade, calculate-only (never sends, never
 * moves money). Produces a DRAFT run whose every figure is traceable to a source
 * record and which FLAGS (never guesses) missing or ambiguous data.
 *
 *   runPayrollDraft(cycleId)  → compute all lines, set run draft|flagged
 *   recomputeNet(payslipId)   → re-derive one line's net from breakdown + audited
 *                               adjustments (bonus/deduction/override/hold)
 *   recomputeCycle(cycleId)   → roll up totals + flag count + run status
 *
 * Deduction source of truth is unchanged: `locked` violations dated in the
 * window, idempotently stamped to the cycle.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import Decimal from "decimal.js";
import { getServiceClient } from "../supabase";
import { D, money, toDb, toNum, maxZero, sum } from "../money";

const TZ = "Africa/Nairobi";

/** Nairobi calendar date (YYYY-MM-DD) for an instant. */
function nairobiDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Every YYYY-MM-DD from start to end inclusive. */
function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const weekdayOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat

export interface PayrollFlag {
  code: "missing_clockins" | "flagged_attendance" | "incomplete_session" | "no_pay_config";
  message: string;
  resolved: boolean;
  // Only blocking flags gate approval. Informational ones (e.g. absence already
  // reflected in pay) are shown but don't block.
  blocking: boolean;
}

/** Compute + persist a draft payroll for a cycle. */
export async function runPayrollDraft(cycleId: string): Promise<{ cycle_id: string; count: number }> {
  const db = getServiceClient();

  const { data: cycle, error: cErr } = await db
    .from("pay_cycles")
    .select("id, org_id, label, start_date, end_date, locked")
    .eq("id", cycleId)
    .single();
  if (cErr || !cycle) throw new Error(cErr?.message ?? "pay cycle not found");
  if (cycle.locked) throw new Error("this run is approved and locked");

  // How monthly absence is treated: 'flat' (pay full, absence is a blocking flag +
  // a suggested deduction) or 'prorate' (auto-deduct absent days, non-blocking).
  const { data: org } = await db.from("orgs").select("absence_policy").eq("id", cycle.org_id).maybeSingle();
  const absencePolicy = (org?.absence_policy as string) ?? "flat";

  const startBoundary = `${cycle.start_date}T00:00:00.000Z`;
  const endD = new Date(`${cycle.end_date}T00:00:00.000Z`);
  endD.setUTCDate(endD.getUTCDate() + 1);
  const endBoundary = endD.toISOString();
  const todayYmd = nairobiDate(new Date().toISOString());

  await db.from("pay_cycles").update({ status: "processing" }).eq("id", cycleId);

  const { data: employees, error: empErr } = await db
    .from("employees")
    .select(
      "id, name, base_salary, pay_type, pay_rate, workplace_id, start_date, created_at, " +
        "workplace:workplaces(name), shift:shifts(days_of_week)"
    )
    .eq("org_id", cycle.org_id)
    .eq("status", "active");
  if (empErr) throw new Error(empErr.message);

  for (const emp of (employees ?? []) as any[]) {
    const wp = Array.isArray((emp as any).workplace) ? (emp as any).workplace[0] : (emp as any).workplace;
    const shift = Array.isArray((emp as any).shift) ? (emp as any).shift[0] : (emp as any).shift;
    const daysOfWeek: number[] = shift?.days_of_week ?? [];
    const payType = (emp.pay_type as string) ?? "monthly";
    // Only measure from when the employee joined (hire date, else the day they
    // were added) and no further than today — so a late-added employee isn't
    // flagged for days before they existed, and future days aren't "missing".
    const employmentStart = (emp.start_date as string) ?? (emp.created_at ? nairobiDate(emp.created_at) : cycle.start_date);
    const effStart = employmentStart > cycle.start_date ? employmentStart : cycle.start_date;
    const effEnd = cycle.end_date < todayYmd ? cycle.end_date : todayYmd;

    // All entries in window (asc) for day counting, hourly pairing, flag checks.
    const { data: entries } = await db
      .from("attendance_entries")
      .select("id, scanned_at, direction, status")
      .eq("employee_id", emp.id)
      .gte("scanned_at", startBoundary)
      .lt("scanned_at", endBoundary)
      .order("scanned_at", { ascending: true });

    const flags: PayrollFlag[] = [];

    // Days present = distinct Nairobi days with an 'in' scan.
    const presentDates = new Set<string>();
    const inEntryIds: string[] = [];
    let anyFlaggedAttendance = false;
    for (const e of entries ?? []) {
      if (e.status === "flagged") anyFlaggedAttendance = true;
      if (e.direction === "in") {
        presentDates.add(nairobiDate(e.scanned_at));
        inEntryIds.push(e.id);
      }
    }
    const daysPresent = presentDates.size;

    // Expected working days from the shift schedule, within the employment window.
    const effRange = effStart <= effEnd ? datesInRange(effStart, effEnd) : [];
    const expectedDates = daysOfWeek.length ? effRange.filter((d) => daysOfWeek.includes(weekdayOf(d))) : [];
    const missingDates = expectedDates.filter((d) => !presentDates.has(d));
    if (missingDates.length > 0) {
      // Blocks approval only when it affects pay in a way the owner must confirm:
      // a monthly-flat employee paid full despite absence. Where pay already
      // reflects attendance (daily/hourly, or monthly-prorate), it's informational.
      // Informational — a computed absence figure exists (or the owner pays flat),
      // so the owner reviews and approves; this never hard-blocks.
      flags.push({
        code: "missing_clockins",
        message: `No clock-in on ${missingDates.length} scheduled day(s): ${missingDates.join(", ")}`,
        resolved: false,
        blocking: false,
      });
    }
    if (anyFlaggedAttendance) {
      // Informational — the owner sees flagged scans and decides.
      flags.push({
        code: "flagged_attendance",
        blocking: false,
        message: "One or more scans in this period were flagged for review.",
        resolved: false,
      });
    }

    // Gross by pay model. payRate/baseSalary are money → Decimal (null = not set).
    const payRate = emp.pay_rate == null ? null : money(emp.pay_rate);
    const baseSalary = emp.base_salary == null ? null : money(emp.base_salary);
    let gross = new Decimal(0);
    let grossBasis = "";
    let hoursWorked: number | undefined;

    if (payType === "monthly") {
      if (baseSalary == null || baseSalary.lte(0)) {
        flags.push({ code: "no_pay_config", message: "No monthly salary set for this employee.", resolved: false, blocking: true });
      }
      gross = money(baseSalary ?? 0);
      grossBasis = "Monthly salary";
    } else if (payType === "daily") {
      if (payRate == null) {
        flags.push({ code: "no_pay_config", message: "No daily rate set for this employee.", resolved: false, blocking: true });
      }
      gross = money(D(payRate).times(daysPresent));
      grossBasis = `${daysPresent} day(s) × ${toNum(payRate ?? 0)}/day`;
    } else {
      // hourly — pair in→out chronologically.
      if (payRate == null) {
        flags.push({ code: "no_pay_config", message: "No hourly rate set for this employee.", resolved: false, blocking: true });
      }
      let ms = 0;
      let openIn: string | null = null;
      let incomplete = false;
      for (const e of entries ?? []) {
        if (e.direction === "in") {
          if (openIn) incomplete = true; // two ins with no out between
          openIn = e.scanned_at;
        } else if (e.direction === "out") {
          if (openIn) {
            ms += new Date(e.scanned_at).getTime() - new Date(openIn).getTime();
            openIn = null;
          }
        }
      }
      if (openIn) incomplete = true; // trailing in with no out
      if (incomplete) {
        flags.push({
          code: "incomplete_session",
          message: "A clock-in has no matching clock-out — hours can't be computed for it.",
          resolved: false,
          blocking: true,
        });
      }
      // Hours worked (time, not money) at 2dp; gross = rate × hours via Decimal.
      const hours = new Decimal(ms).dividedBy(3_600_000).toDecimalPlaces(2);
      hoursWorked = hours.toNumber();
      gross = money(D(payRate).times(hours));
      grossBasis = `${hoursWorked} hour(s) × ${toNum(payRate ?? 0)}/hr`;
    }

    // Deductions = locked violations in-window (idempotent stamp).
    const { data: viols } = await db
      .from("violations")
      .select("id, rule_id, reason, amount, pay_cycle_id")
      .eq("employee_id", emp.id)
      .eq("status", "locked")
      .gte("created_at", startBoundary)
      .lt("created_at", endBoundary)
      .or(`pay_cycle_id.is.null,pay_cycle_id.eq.${cycleId}`);

    const penaltyLines = (viols ?? []).map((v: any) => ({
      source: "penalty" as const,
      violation_id: v.id as string,
      rule_id: (v.rule_id as string) ?? null,
      label: (v.reason as string) ?? "Penalty",
      amount: toNum(v.amount), // 2dp for the JSON breakdown
    }));
    if (penaltyLines.length) {
      await db.from("violations").update({ pay_cycle_id: cycleId }).in("id", penaltyLines.map((p) => p.violation_id));
    }
    const penaltyTotal = money(sum(penaltyLines, (p) => p.amount));

    // Absence (monthly only). Daily/hourly already pay per day/hour, so absence is
    // already reflected in gross. Everything below is derived from recorded
    // attendance + the salary + the schedule — nothing invented.
    const expectedDays = expectedDates.length;
    const absentDays = Math.max(0, expectedDays - daysPresent);
    let absenceAmount = new Decimal(0); // applied deduction (prorate)
    let absenceSuggestion = new Decimal(0); // suggested-only (flat)
    if (payType === "monthly" && expectedDays > 0 && baseSalary != null && baseSalary.gt(0) && absentDays > 0) {
      // dailyEquiv × absentDays, exact — base_salary / expected_days × absent_days.
      const amt = money(baseSalary.dividedBy(expectedDays).times(absentDays));
      if (absencePolicy === "prorate") absenceAmount = amt;
      else absenceSuggestion = amt;
    }
    const absenceLines = absenceAmount.gt(0)
      ? [{ source: "absence" as const, label: `Absence (${absentDays} day(s))`, amount: toNum(absenceAmount) }]
      : [];
    const allDeductions = [...penaltyLines, ...absenceLines];
    // Payroll can never be negative — floor at zero.
    const netComputed = maxZero(money(gross.minus(penaltyTotal).minus(absenceAmount)));

    const breakdown = {
      pay_type: payType,
      pay_rate: payRate == null ? null : toNum(payRate),
      base_salary: baseSalary == null ? null : toNum(baseSalary),
      days_present: daysPresent,
      expected_days: expectedDays,
      absent_days: absentDays,
      present_dates: [...presentDates].sort(),
      missing_dates: missingDates,
      attendance_entry_ids: inEntryIds,
      hours_worked: hoursWorked,
      gross_basis: grossBasis,
      gross: toNum(gross),
      deductions: allDeductions, // penalties + absence (prorate); adjustments merged in recomputeNet
      additions: [] as unknown[],
      manual_deductions: [] as unknown[],
      absence_suggestion: absenceSuggestion.gt(0) ? toNum(absenceSuggestion) : null,
      override_net: null as number | null,
      net_computed: toNum(netComputed),
      workplace_name: wp?.name ?? "Unassigned",
    };

    // Upsert the line. Money columns are written as fixed 2dp strings (toDb) so no
    // float re-enters the numeric(12,2) columns. Preserve owner state (held/override)
    // across re-runs — recomputeNet re-derives net from audited adjustments.
    const { data: slip, error: slipErr } = await db
      .from("payslips")
      .upsert(
        {
          employee_id: emp.id,
          cycle_id: cycleId,
          gross: toDb(gross),
          deductions: allDeductions,
          net: toDb(netComputed),
          breakdown,
          flags,
        },
        { onConflict: "employee_id,cycle_id" }
      )
      .select("id")
      .single();
    if (slipErr || !slip) throw new Error(slipErr?.message ?? "payslip upsert failed");
    await recomputeNet(db, (slip as { id: string }).id);
  }

  await recomputeCycle(db, cycleId);
  return { cycle_id: cycleId, count: (employees ?? []).length };
}

/** Re-derive a line's net from its computed base + the audited adjustment log. */
export async function recomputeNet(db: SupabaseClient, payslipId: string): Promise<number> {
  const { data: slip } = await db.from("payslips").select("breakdown").eq("id", payslipId).single();
  const breakdown = (slip?.breakdown ?? {}) as Record<string, unknown>;
  const netComputed = D(breakdown.net_computed as number | undefined);

  const { data: adj } = await db
    .from("payroll_adjustments")
    .select("id, type, amount, note, created_at")
    .eq("payslip_id", payslipId)
    .order("created_at", { ascending: true });

  const additions: { adjustment_id: string; label: string; amount: number }[] = [];
  const manualDeductions: { adjustment_id: string; label: string; amount: number }[] = [];
  let override: Decimal | null = null;
  let overrideId: string | null = null;
  let held = false;

  for (const a of adj ?? []) {
    if (a.type === "bonus") additions.push({ adjustment_id: a.id, label: a.note, amount: toNum(a.amount) });
    else if (a.type === "deduction") manualDeductions.push({ adjustment_id: a.id, label: a.note, amount: toNum(a.amount) });
    else if (a.type === "override_net") { override = money(a.amount); overrideId = a.id; }
    else if (a.type === "hold") held = true;
    else if (a.type === "unhold") held = false;
  }

  const addTotal = sum(additions, (x) => x.amount);
  const dedTotal = sum(manualDeductions, (x) => x.amount);
  const derived = money(netComputed.plus(addTotal).minus(dedTotal));
  // Never negative.
  const net = maxZero(override != null ? override : derived);
  const overrideNum = override != null ? toNum(override) : null;

  const nextBreakdown = { ...breakdown, additions, manual_deductions: manualDeductions, override_net: overrideNum, override_adjustment_id: overrideId };
  await db
    .from("payslips")
    .update({ net: toDb(net), override_net: override != null ? toDb(override) : null, held, breakdown: nextBreakdown })
    .eq("id", payslipId);
  return toNum(net);
}

/** Roll up run totals, unresolved-flag count, and status (unless locked). */
export async function recomputeCycle(db: SupabaseClient, cycleId: string): Promise<void> {
  const { data: cycle } = await db.from("pay_cycles").select("locked").eq("id", cycleId).single();
  const { data: slips } = await db.from("payslips").select("net, held, flags").eq("cycle_id", cycleId);

  let total = new Decimal(0);
  let count = 0;
  let flaggedLines = 0;
  for (const s of slips ?? []) {
    if (!s.held) {
      total = total.plus(D(s.net));
      count += 1;
    }
    // Only unresolved BLOCKING flags gate approval. (Flags from before this field
    // existed are treated as blocking for safety: blocking !== false.)
    const flags = Array.isArray(s.flags) ? (s.flags as { resolved?: boolean; blocking?: boolean }[]) : [];
    if (flags.some((f) => !f.resolved && f.blocking !== false)) flaggedLines += 1;
  }

  const patch: Record<string, unknown> = {
    total_net: toDb(total),
    employee_count: count,
    flagged_count: flaggedLines,
  };
  // Don't touch status once approved/locked.
  if (!cycle?.locked) patch.status = flaggedLines > 0 ? "flagged" : "draft";
  await db.from("pay_cycles").update(patch).eq("id", cycleId);
}
