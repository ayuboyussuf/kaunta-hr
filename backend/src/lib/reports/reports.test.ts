/**
 * Reports, and the rule that a period has to be over.
 *
 * The counting tests matter because absence here is DERIVED — rostered, no
 * scan, not on leave, site not closed — and every one of those four conditions
 * has already been a bug somewhere in this product.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../test/fakeDb";
import { buildAttendanceReport } from "./attendance";
import {
  parseMonth,
  parseYear,
  periodAvailable,
  closedMonths,
  closedYears,
} from "./periods";

const ORG = "org-1";
const WP = "wp-1";

/* ── The gate ─────────────────────────────────────────────────────────── */

const AUG_15 = new Date("2026-08-15T09:00:00+03:00");

test("a month that has finished is reportable", () => {
  assert.equal(periodAvailable(parseMonth("2026-07")!, AUG_15).available, true);
});

test("the month you are standing in is refused, with a reason", () => {
  const a = periodAvailable(parseMonth("2026-08")!, AUG_15);
  assert.equal(a.available, false);
  assert.match(a.reason!, /has not finished/);
  // The reason has to explain the hazard, not just state the rule.
  assert.match(a.reason!, /comparison|improvement/);
  assert.equal(a.readyOn, "2026-09-01");
});

test("the last day of a month is still not over", () => {
  // The 31st is a working day and its scans are still arriving.
  const a = periodAvailable(parseMonth("2026-08")!, new Date("2026-08-31T23:00:00+03:00"));
  assert.equal(a.available, false);
  assert.match(a.reason!, /today is its last day/);
  assert.equal(a.readyOn, "2026-09-01");
});

test("a month becomes reportable the moment the next one starts", () => {
  const a = periodAvailable(parseMonth("2026-08")!, new Date("2026-09-01T00:05:00+03:00"));
  assert.equal(a.available, true);
});

test("the current year is refused and last year is not", () => {
  assert.equal(periodAvailable(parseYear("2026")!, AUG_15).available, false);
  assert.equal(periodAvailable(parseYear("2025")!, AUG_15).available, true);
});

test("the pickers never offer a period that would then be refused", () => {
  for (const m of closedMonths(AUG_15)) {
    assert.equal(periodAvailable(m, AUG_15).available, true, `${m.key} was offered but is not ready`);
  }
  for (const y of closedYears(AUG_15)) {
    assert.equal(periodAvailable(y, AUG_15).available, true, `${y.key} was offered but is not ready`);
  }
  assert.ok(!closedMonths(AUG_15).some((m) => m.key === "2026-08"), "not the current month");
});

test("month boundaries are whole months", () => {
  const feb = parseMonth("2028-02")!; // a leap year, for the obvious reason
  assert.equal(feb.from, "2028-02-01");
  assert.equal(feb.to, "2028-02-29");
});

/* ── Counting ─────────────────────────────────────────────────────────── */

const MON = "2026-08-17";
const TUE = "2026-08-18";
const WED = "2026-08-19";

function world(over: {
  scans?: Record<string, unknown>[];
  leave?: Record<string, unknown>[];
  closed?: Record<string, unknown>[];
  violations?: Record<string, unknown>[];
  checks?: Record<string, unknown>[];
} = {}) {
  return fakeDb({
    employees: [
      {
        id: "emp-1",
        org_id: ORG,
        workplace_id: WP,
        status: "active",
        name: "Grace Wanjiru",
        shift: { days_of_week: [1, 2, 3, 4, 5] },
      },
      {
        id: "emp-2",
        org_id: ORG,
        workplace_id: WP,
        status: "active",
        name: "Peter Mwangi",
        shift: { days_of_week: [1, 2, 3, 4, 5] },
      },
    ],
    workplaces: [{ id: WP, org_id: ORG, name: "Juja Station" }],
    attendance_entries: over.scans ?? [],
    presence_checks: over.checks ?? [],
    violations: over.violations ?? [],
    leave_requests: over.leave ?? [],
    non_working_days: over.closed ?? [],
  });
}

const scanIn = (emp: string, day: string, status = "normal") => ({
  id: `att-${emp}-${day}`,
  employee_id: emp,
  workplace_id: WP,
  direction: "in",
  status,
  scanned_at: `${day}T05:00:00.000Z`,
});

const report = (db: ReturnType<typeof fakeDb>, from: string, to: string) =>
  buildAttendanceReport(db as never, {
    orgId: ORG,
    range: { from, to },
    now: new Date("2026-08-24T09:00:00+03:00"),
  });

test("it answers who was in over a range, which nothing could before", async () => {
  const db = world({ scans: [scanIn("emp-1", MON), scanIn("emp-2", MON), scanIn("emp-1", TUE)] });
  const r = await report(db, MON, TUE);

  assert.equal(r.totals.headcount, 2);
  assert.equal(r.totals.daysPresent, 3);
  assert.equal(r.employees.find((e) => e.name.startsWith("Grace"))!.daysPresent, 2);
  assert.equal(r.employees.find((e) => e.name.startsWith("Peter"))!.daysPresent, 1);
});

test("several scans in one day are one day, not several", async () => {
  const db = world({
    scans: [
      scanIn("emp-1", MON),
      { ...scanIn("emp-1", MON), id: "att-b", scanned_at: `${MON}T11:00:00.000Z` },
    ],
  });
  const r = await report(db, MON, MON);
  assert.equal(r.employees.find((e) => e.name.startsWith("Grace"))!.daysPresent, 1);
});

test("absence is derived from the roster, not from penalties", async () => {
  // A business running no penalty rules still needs to know who did not come.
  const db = world({ scans: [scanIn("emp-1", MON)] });
  const r = await report(db, MON, MON);

  assert.equal(r.totals.daysAbsent, 1);
  assert.equal(r.employees.find((e) => e.name.startsWith("Peter"))!.daysAbsent, 1);
  assert.equal(r.totals.penalties, 0, "and it counted no penalties, because there are none");
});

test("nobody is absent on a day they were not rostered", async () => {
  const SUN = "2026-08-16";
  const r = await report(world(), SUN, SUN);
  assert.equal(r.totals.daysAbsent, 0);
});

test("approved leave is leave, never absence", async () => {
  const db = world({
    leave: [
      {
        id: "lv-1",
        employee_id: "emp-2",
        status: "approved",
        paid: true,
        start_date: MON,
        end_date: MON,
        half_day: null,
      },
    ],
    scans: [scanIn("emp-1", MON)],
  });
  const r = await report(db, MON, MON);

  assert.equal(r.totals.daysAbsent, 0);
  assert.equal(r.totals.leaveDays, 1);
});

test("a half day of leave counts as half", async () => {
  const db = world({
    leave: [
      {
        id: "lv-1",
        employee_id: "emp-2",
        status: "approved",
        paid: false,
        start_date: MON,
        end_date: MON,
        half_day: "morning",
      },
    ],
    scans: [scanIn("emp-1", MON)],
  });
  const r = await report(db, MON, MON);
  assert.equal(r.totals.leaveDays, 0.5);
});

test("a declared closure is not a column of absences", async () => {
  // The same mistake the absence sweep used to make, but in a report rather
  // than in money.
  const db = world({
    closed: [{ id: "nwd-1", org_id: ORG, workplace_id: null, on_date: MON, label: "Holiday", paid: true }],
  });
  const r = await report(db, MON, MON);

  assert.equal(r.totals.daysAbsent, 0);
  assert.equal(r.totals.closedDays, 1);
  assert.equal(r.sites[0].closedDays, 1);
});

test("penalties are dated by the day they are about, not the day they were swept", async () => {
  // An absence swept at 21:30 on the 31st belongs to the 31st. Filing it by
  // created_at would push month-end absences into the following month.
  const db = world({
    violations: [
      {
        id: "v-1",
        employee_id: "emp-2",
        amount: 1000,
        on_date: MON,
        created_at: `${WED}T18:30:00.000Z`,
        status: "open",
      },
    ],
  });
  const r = await report(db, MON, MON);
  assert.equal(r.totals.penalties, 1);
  assert.equal(r.totals.penaltyTotal, 1000);
});

test("a cancelled penalty is not counted as money charged", async () => {
  const db = world({
    violations: [
      { id: "v-1", employee_id: "emp-2", amount: 0, on_date: MON, status: "locked", voided_reason: "leave_approved" },
    ],
  });
  const r = await report(db, MON, MON);
  assert.equal(r.totals.penalties, 0);
  assert.equal(r.totals.penaltyTotal, 0);
});

test("sites roll up, and a range that is still running says so", async () => {
  const db = world({ scans: [scanIn("emp-1", MON, "late")] });
  const r = await buildAttendanceReport(db as never, {
    orgId: ORG,
    range: { from: MON, to: "2026-08-24" },
    now: new Date("2026-08-24T09:00:00+03:00"),
  });

  assert.equal(r.sites.length, 1);
  assert.equal(r.sites[0].name, "Juja Station");
  assert.equal(r.sites[0].headcount, 2);
  assert.equal(r.totals.daysLate, 1);
  assert.equal(r.periodComplete, false, "the range includes today, so it is not a closed period");
});
