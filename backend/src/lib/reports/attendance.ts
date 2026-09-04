/**
 * What happened, over a range of days, across every site at once.
 *
 * The dashboard could only ever answer "today", and the only historical
 * surface was a per-employee PDF for one month. So "how many people came in
 * last Tuesday" meant opening eleven employee records and counting by hand,
 * and "was August worse than July" was not answerable at all.
 *
 * ── One report, not three ────────────────────────────────────────────────
 *
 * Daily, monthly and yearly as three features would be three query paths,
 * three sets of edge cases and three sets of bugs — and none of them would
 * answer "who was in on the 14th". This is one range, and the periods are a
 * thin wrapper over it.
 *
 * ── Why a partial period is treated differently ──────────────────────────
 *
 * Not because it is incomplete. Because it invites a false comparison. "August:
 * 42 late" next to "July: 71" reads as an improvement when August is half over,
 * and a reader has no way to see that from the numbers. So a range report and a
 * sealed period report are different objects: one is a live query, the other is
 * a document. `periodComplete` is what tells them apart, and every caller has
 * to decide what to do with it rather than being allowed to forget.
 *
 * Deterministic throughout. Counting arrivals is a query; there is no judgement
 * anywhere in this file, and there should never be one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { approvedLeaveDays } from "../leave/cover";
import { dayWindowUtc, datesInRange, nairobiDate, weekdayOf } from "../time";

export interface ReportRange {
  from: string; // YYYY-MM-DD
  to: string; // inclusive
}

export interface EmployeeLine {
  employeeId: string;
  name: string;
  workplaceId: string | null;
  /** Distinct days with an accepted clock-in. */
  daysPresent: number;
  daysLate: number;
  /** Rostered, no scan, not on leave, not a declared closure. */
  daysAbsent: number;
  leaveDays: number;
  checksConfirmed: number;
  checksMissed: number;
  penalties: number;
  penaltyTotal: number;
}

export interface SiteLine {
  workplaceId: string | null;
  name: string;
  headcount: number;
  daysPresent: number;
  daysLate: number;
  daysAbsent: number;
  leaveDays: number;
  checksMissed: number;
  /** Days in the range where the site recorded nothing at all. */
  emptyDays: number;
  closedDays: number;
}

export interface AttendanceReport {
  range: ReportRange;
  generatedAt: string;
  /** False for a month or year still running. Callers must not compare those. */
  periodComplete: boolean;
  workingDays: number;
  totals: {
    headcount: number;
    daysPresent: number;
    daysLate: number;
    daysAbsent: number;
    leaveDays: number;
    checksConfirmed: number;
    checksMissed: number;
    penalties: number;
    penaltyTotal: number;
    /** Closures the owner declared or confirmed inside the range. */
    closedDays: number;
  };
  sites: SiteLine[];
  employees: EmployeeLine[];
}

interface EmployeeRow {
  id: string;
  name: string;
  workplace_id: string | null;
  shift: { days_of_week: number[] } | { days_of_week: number[] }[] | null;
}

const one = <T>(x: unknown): T | null =>
  Array.isArray(x) ? ((x[0] as T) ?? null) : ((x as T) ?? null);

const blankLine = (e: EmployeeRow): EmployeeLine => ({
  employeeId: e.id,
  name: e.name,
  workplaceId: e.workplace_id,
  daysPresent: 0,
  daysLate: 0,
  daysAbsent: 0,
  leaveDays: 0,
  checksConfirmed: 0,
  checksMissed: 0,
  penalties: 0,
  penaltyTotal: 0,
});

/**
 * Build the report.
 *
 * `now` is injectable so `periodComplete` can be tested — a rule about
 * unfinished periods that only takes effect on the last day of a month is
 * otherwise untestable until the last day of a month.
 */
export async function buildAttendanceReport(
  db: SupabaseClient,
  params: { orgId: string; range: ReportRange; periodComplete?: boolean; now?: Date }
): Promise<AttendanceReport> {
  const now = params.now ?? new Date();
  const { from, to } = params.range;
  const { startISO, endISO } = dayWindowUtc(from, to);
  const dates = datesInRange(from, to);

  const { data: employeesRaw } = await db
    .from("employees")
    .select("id, name, workplace_id, shift:shifts(days_of_week)")
    .eq("org_id", params.orgId)
    .eq("status", "active");
  const employees = (employeesRaw ?? []) as unknown as EmployeeRow[];

  const { data: workplaces } = await db
    .from("workplaces")
    .select("id, name")
    .eq("org_id", params.orgId);

  const ids = employees.map((e) => e.id);
  const lines = new Map<string, EmployeeLine>(employees.map((e) => [e.id, blankLine(e)]));

  // Each of these reads once. An earlier draft queried attendance twice (once
  // for the lines, once to derive absence) and leave twice per employee, which
  // on a 40-person year would have been eighty round trips for data already in
  // hand.
  const present: Map<string, DaySets> =
    ids.length > 0 ? await presentDates(db, ids, startISO, endISO) : new Map();
  const leaveByEmployee = new Map<string, Map<string, { fraction: number }>>();
  for (const e of employees) {
    leaveByEmployee.set(e.id, await approvedLeaveDays(db, e.id, from, to));
  }

  if (ids.length > 0) {
    applyAttendance(present, lines);
    await Promise.all([
      addChecks(db, ids, startISO, endISO, lines),
      addPenalties(db, ids, from, to, lines),
    ]);
  }
  for (const e of employees) {
    const line = lines.get(e.id)!;
    const days = leaveByEmployee.get(e.id)!;
    line.leaveDays = [...days.values()].reduce((n, d) => n + d.fraction, 0);
  }

  // Days the business was shut. These are removed from the roster expectation
  // below, so a public holiday never shows up as a column of absences — which
  // is the same mistake the absence sweep used to make in money.
  const closed = await closedDays(db, params.orgId, from, to);

  // Absence is derived, not stored: rostered for that weekday, no scan, not on
  // leave, site not closed. It has to be computed here rather than counted from
  // violations, because a business running no penalty rules still wants to know
  // who did not turn up.
  for (const e of employees) {
    const line = lines.get(e.id)!;
    const shift = one<{ days_of_week: number[] }>(e.shift);
    const rostered = shift?.days_of_week ?? [];
    const seen = present.get(e.id);
    const leave = leaveByEmployee.get(e.id)!;

    for (const d of dates) {
      if (rostered.length > 0 && !rostered.includes(weekdayOf(d))) continue;
      if (isClosed(closed, e.workplace_id, d)) continue;
      if (seen?.present.has(d)) continue;
      if (leave.has(d)) continue;
      line.daysAbsent++;
    }
  }

  const siteName = new Map((workplaces ?? []).map((w) => [w.id as string, w.name as string]));
  const sites = rollUpSites([...lines.values()], siteName, closed, dates);

  const totals = [...lines.values()].reduce(
    (t, l) => ({
      headcount: t.headcount + 1,
      daysPresent: t.daysPresent + l.daysPresent,
      daysLate: t.daysLate + l.daysLate,
      daysAbsent: t.daysAbsent + l.daysAbsent,
      leaveDays: t.leaveDays + l.leaveDays,
      checksConfirmed: t.checksConfirmed + l.checksConfirmed,
      checksMissed: t.checksMissed + l.checksMissed,
      penalties: t.penalties + l.penalties,
      penaltyTotal: t.penaltyTotal + l.penaltyTotal,
      closedDays: t.closedDays,
    }),
    {
      headcount: 0,
      daysPresent: 0,
      daysLate: 0,
      daysAbsent: 0,
      leaveDays: 0,
      checksConfirmed: 0,
      checksMissed: 0,
      penalties: 0,
      penaltyTotal: 0,
      closedDays: closed.length,
    }
  );

  return {
    range: params.range,
    generatedAt: now.toISOString(),
    periodComplete: params.periodComplete ?? to < nairobiDate(now),
    workingDays: dates.length,
    totals,
    sites,
    employees: [...lines.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/* ── The pieces ───────────────────────────────────────────────────────── */

interface DaySets {
  present: Set<string>;
  late: Set<string>;
}

/**
 * Clock-ins as DAYS, per employee.
 *
 * Days, not scans: somebody who clocks in and out four times across a split
 * shift worked one day, and counting rows would report four.
 */
async function presentDates(
  db: SupabaseClient,
  ids: string[],
  startISO: string,
  endISO: string
): Promise<Map<string, DaySets>> {
  const out = new Map<string, DaySets>();

  const { data } = await db
    .from("attendance_entries")
    .select("employee_id, scanned_at, direction, status")
    .in("employee_id", ids)
    .gte("scanned_at", startISO)
    .lt("scanned_at", endISO);

  for (const row of data ?? []) {
    if (row.direction !== "in") continue;
    const id = row.employee_id as string;
    const sets = out.get(id) ?? out.set(id, { present: new Set(), late: new Set() }).get(id)!;
    const day = nairobiDate(row.scanned_at as string);
    sets.present.add(day);
    if (row.status === "late") sets.late.add(day);
  }
  return out;
}

function applyAttendance(
  present: Map<string, DaySets>,
  lines: Map<string, EmployeeLine>
): void {
  for (const [id, sets] of present) {
    const line = lines.get(id);
    if (!line) continue;
    line.daysPresent = sets.present.size;
    line.daysLate = sets.late.size;
  }
}

async function addChecks(
  db: SupabaseClient,
  ids: string[],
  startISO: string,
  endISO: string,
  lines: Map<string, EmployeeLine>
): Promise<void> {
  const { data } = await db
    .from("presence_checks")
    .select("employee_id, status, due_at")
    .in("employee_id", ids)
    .gte("due_at", startISO)
    .lt("due_at", endISO);

  for (const row of data ?? []) {
    const line = lines.get(row.employee_id as string);
    if (!line) continue;
    if (row.status === "confirmed") line.checksConfirmed++;
    else if (row.status === "missed") line.checksMissed++;
  }
}

async function addPenalties(
  db: SupabaseClient,
  ids: string[],
  from: string,
  to: string,
  lines: Map<string, EmployeeLine>
): Promise<void> {
  // Dated by on_date, not created_at: an absence swept at 21:30 belongs to the
  // day it is about, and a report that filed it under the sweep's own date
  // would put month-end absences in the following month.
  const { data } = await db
    .from("violations")
    .select("employee_id, amount, on_date, status")
    .in("employee_id", ids)
    .gte("on_date", from)
    .lte("on_date", to);

  for (const row of data ?? []) {
    const line = lines.get(row.employee_id as string);
    if (!line) continue;
    // A waived or cancelled penalty was zeroed rather than deleted, so counting
    // rows with a value keeps "penalties" meaning "money actually charged".
    const amount = Number(row.amount ?? 0);
    if (amount <= 0) continue;
    line.penalties++;
    line.penaltyTotal += amount;
  }
}

interface ClosedDay {
  workplaceId: string | null;
  date: string;
}

async function closedDays(
  db: SupabaseClient,
  orgId: string,
  from: string,
  to: string
): Promise<ClosedDay[]> {
  const { data } = await db
    .from("non_working_days")
    .select("workplace_id, on_date")
    .eq("org_id", orgId)
    .gte("on_date", from)
    .lte("on_date", to);

  return (data ?? []).map((d) => ({
    workplaceId: (d.workplace_id as string | null) ?? null,
    date: String(d.on_date).slice(0, 10),
  }));
}

/** A null workplace on a closure means the whole business. */
function isClosed(closed: ClosedDay[], workplaceId: string | null, date: string): boolean {
  return closed.some(
    (c) => c.date === date && (c.workplaceId === null || c.workplaceId === workplaceId)
  );
}

function rollUpSites(
  lines: EmployeeLine[],
  siteName: Map<string, string>,
  closed: ClosedDay[],
  dates: string[]
): SiteLine[] {
  const sites = new Map<string, SiteLine>();

  for (const l of lines) {
    const key = l.workplaceId ?? "-";
    const site =
      sites.get(key) ??
      sites
        .set(key, {
          workplaceId: l.workplaceId,
          name: l.workplaceId ? (siteName.get(l.workplaceId) ?? "Unknown site") : "No fixed site",
          headcount: 0,
          daysPresent: 0,
          daysLate: 0,
          daysAbsent: 0,
          leaveDays: 0,
          checksMissed: 0,
          emptyDays: 0,
          closedDays: 0,
        })
        .get(key)!;

    site.headcount++;
    site.daysPresent += l.daysPresent;
    site.daysLate += l.daysLate;
    site.daysAbsent += l.daysAbsent;
    site.leaveDays += l.leaveDays;
    site.checksMissed += l.checksMissed;
  }

  for (const site of sites.values()) {
    site.closedDays = dates.filter((d) => isClosed(closed, site.workplaceId, d)).length;
  }

  return [...sites.values()].sort((a, b) => a.name.localeCompare(b.name));
}
