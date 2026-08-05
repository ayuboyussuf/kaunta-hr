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
import { DateTime } from "luxon";
import Decimal from "decimal.js";
import { z } from "zod";
import { getServiceClient } from "../supabase";
import { D, money, toDb, toNum, maxZero, sum } from "../money";
import { nairobiDate, datesInRange, weekdayOf } from "../time";
import { approvedLeaveDays, type LeaveDay } from "../leave/cover";

// Every computed figure is validated against this before it can be persisted or
// land on a payslip. A malformed/missing money or attendance value must be caught
// here and flagged — never silently written through.
const finiteMoney = z.number().finite().min(0);
const nonNegInt = z.number().int().min(0);
/**
 * Days that can be halves. Since half-day leave exists, absence is no longer
 * whole-numbered — but it is still only ever a multiple of 0.5, and anything
 * else means the day arithmetic has gone wrong upstream and must be caught
 * here rather than written to a payslip.
 */
const nonNegHalfDays = z
  .number()
  .finite()
  .min(0)
  .refine((n) => Number.isInteger(n * 2), { message: "days must be a whole or half day" });
const payslipComputedSchema = z.object({
  gross: finiteMoney,
  net_computed: finiteMoney,
  days_present: nonNegInt,
  expected_days: nonNegInt,
  absent_days: nonNegHalfDays,
  paid_leave_days: nonNegHalfDays,
  unpaid_leave_days: nonNegHalfDays,
  deductions: z.array(z.object({ amount: finiteMoney }).passthrough()),
});

export interface PayrollFlag {
  code:
    | "missing_clockins"
    | "flagged_attendance"
    | "incomplete_session"
    | "no_pay_config"
    | "invalid_computation"
    | "paid_leave_unvalued";
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

  // Attendance-query bounds (unchanged semantics: UTC-midnight of the cycle dates).
  const startBoundary = DateTime.fromISO(`${cycle.start_date}T00:00:00`, { zone: "utc" }).toISO()!;
  const endBoundary = DateTime.fromISO(`${cycle.end_date}T00:00:00`, { zone: "utc" }).plus({ days: 1 }).toISO()!;
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

    // Leave the owner approved, as days. Without this a paid leave day looks
    // exactly like an absence — no scan against a scheduled day — and the
    // prorate policy quietly deducts salary for time the owner signed off and
    // said would be paid. That is the same mistake as fining someone for a
    // day they were given, in the one place it is hardest to notice.
    const leaveDays = expectedDates.length
      ? await approvedLeaveDays(db, emp.id as string, expectedDates[0], expectedDates[expectedDates.length - 1])
      : new Map<string, LeaveDay>();

    // Counted in Decimal like everything else that reaches a payslip: a half
    // day is 0.5, and 0.1 + 0.2 problems have no business anywhere near the
    // number that gets multiplied by somebody's salary.
    let paidLeave = D(0);
    let unpaidLeave = D(0);
    for (const d of expectedDates) {
      const l = leaveDays.get(d);
      if (!l) continue;
      // Someone who came in anyway is present; the day is not also leave.
      if (presentDates.has(d)) continue;
      if (l.paid) paidLeave = paidLeave.plus(l.fraction);
      else unpaidLeave = unpaidLeave.plus(l.fraction);
    }
    const paidLeaveDays = paidLeave.toNumber();
    const unpaidLeaveDays = unpaidLeave.toNumber();

    // Only days with no scan AND no approved cover are missing.
    const missingDates = expectedDates.filter((d) => !presentDates.has(d) && !leaveDays.has(d));
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
      // Paid leave is paid: on a daily rate that means the day still earns.
      const earningDays = paidLeave.plus(daysPresent);
      gross = money(D(payRate).times(earningDays));
      grossBasis =
        paidLeaveDays > 0
          ? `${daysPresent} day(s) worked + ${paidLeaveDays} day(s) paid leave × ${toNum(payRate ?? 0)}/day`
          : `${daysPresent} day(s) × ${toNum(payRate ?? 0)}/day`;
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

    // An hourly employee's paid leave has no hours attached to it, and guessing
    // a shift length to invent some would be the engine deciding what somebody
    // is owed. Say so instead and let the owner add it as an adjustment.
    if (payType === "hourly" && paidLeaveDays > 0) {
      flags.push({
        code: "paid_leave_unvalued",
        message: `${paidLeaveDays} day(s) of paid leave approved, but hourly pay has no hours for them. Add an adjustment if they should be paid.`,
        resolved: false,
        blocking: false,
      });
    }

    // Absence (monthly only). Daily/hourly already pay per day/hour, so absence is
    // already reflected in gross. Everything below is derived from recorded
    // attendance + the salary + the schedule — nothing invented.
    const expectedDays = expectedDates.length;
    // Absent = scheduled, no scan, and no approved cover. Leave is accounted
    // for separately below, because "you were away without telling anyone" and
    // "you took the unpaid day I approved" are different things, and a payslip
    // that calls them both absence is lying to both sides.
    const absentDecimal = D(expectedDays).minus(daysPresent).minus(paidLeave).minus(unpaidLeave);
    const absentDays = (absentDecimal.isNegative() ? D(0) : absentDecimal).toNumber();
    const payable = baseSalary != null && baseSalary.gt(0) && expectedDays > 0;

    let absenceAmount = new Decimal(0); // applied deduction (prorate)
    let absenceSuggestion = new Decimal(0); // suggested-only (flat)
    if (payType === "monthly" && payable && absentDays > 0) {
      // dailyEquiv × absentDays, exact — base_salary / expected_days × absent_days.
      const amt = money(baseSalary!.dividedBy(expectedDays).times(absentDays));
      if (absencePolicy === "prorate") absenceAmount = amt;
      else absenceSuggestion = amt;
    }
    const absenceLines = absenceAmount.gt(0)
      ? [{ source: "absence" as const, label: `Absence (${absentDays} day(s))`, amount: toNum(absenceAmount) }]
      : [];

    // Unpaid leave is deducted whatever the absence policy says. The owner did
    // not fail to notice these days — they pressed "Approve — unpaid" against
    // this exact request. Treating that as a suggestion would make the button
    // do nothing.
    const unpaidLeaveAmount =
      payType === "monthly" && payable && unpaidLeave.gt(0)
        ? money(baseSalary!.dividedBy(expectedDays).times(unpaidLeave))
        : new Decimal(0);
    const leaveLines = unpaidLeaveAmount.gt(0)
      ? [
          {
            source: "absence" as const,
            label: `Unpaid leave (${unpaidLeaveDays} day(s), approved)`,
            amount: toNum(unpaidLeaveAmount),
          },
        ]
      : [];

    const allDeductions = [...penaltyLines, ...absenceLines, ...leaveLines];
    // Payroll can never be negative — floor at zero.
    const netComputed = maxZero(
      money(gross.minus(penaltyTotal).minus(absenceAmount).minus(unpaidLeaveAmount))
    );

    const breakdown = {
      pay_type: payType,
      pay_rate: payRate == null ? null : toNum(payRate),
      base_salary: baseSalary == null ? null : toNum(baseSalary),
      days_present: daysPresent,
      expected_days: expectedDays,
      absent_days: absentDays,
      paid_leave_days: paidLeaveDays,
      unpaid_leave_days: unpaidLeaveDays,
      leave_dates: [...leaveDays.values()]
        .filter((l) => !presentDates.has(l.date))
        .map((l) => ({ date: l.date, paid: l.paid, half_day: l.half_day })),
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
      invalid_computation: false,
      workplace_name: wp?.name ?? "Unassigned",
    };

    // Validate every computed figure before it can be persisted. If anything is
    // malformed/missing (NaN, negative, non-integer day count), do NOT pass it
    // through silently: raise a blocking flag and zero the net so the run cannot be
    // approved until a human resolves it.
    const check = payslipComputedSchema.safeParse(breakdown);
    let persistNet = netComputed;
    if (!check.success) {
      const issue = check.error.issues[0];
      flags.push({
        code: "invalid_computation",
        message: `A computed figure failed validation (${issue?.path.join(".") || "figure"}: ${issue?.message}). Review this line — it can't be approved as-is.`,
        resolved: false,
        blocking: true,
      });
      persistNet = new Decimal(0);
      breakdown.net_computed = 0;
      breakdown.invalid_computation = true;
    }

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
          net: toDb(persistNet),
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
