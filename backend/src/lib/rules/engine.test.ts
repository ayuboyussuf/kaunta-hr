/**
 * What the rules engine must never do.
 *
 * Every case here is money. A test that goes red is an employee who was
 * charged for a day they should not have been, or a rule the owner wrote that
 * quietly stopped applying.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, captureSms } from "../../test/fakeDb";
import { amountForLateness, evaluateScan, evaluateAbsence } from "./engine";

const sms = captureSms();

const ORG = "org-1";
const EMP = "emp-1";
const WP = "wp-1";

/** A workplace on the org's shared ruleset, with the rules given. */
function world(rules: Record<string, unknown>[], extra: Record<string, unknown[]> = {}) {
  return fakeDb({
    workplaces: [{ id: WP, ruleset_id: "rs-1" }],
    rulesets: [{ id: "rs-1", org_id: ORG, is_shared: true, created_at: "2026-01-01" }],
    penalty_rules: rules.map((r, i) => ({
      id: `rule-${i + 1}`,
      ruleset_id: "rs-1",
      appeal_window_hours: 24,
      calc: null,
      ...r,
    })),
    employees: [{ id: EMP, name: "Test Employee", phone: "+254700000000" }],
    violations: [],
    leave_requests: [],
    ...extra,
  });
}

const scan = {
  orgId: ORG,
  employeeId: EMP,
  workplaceId: WP,
  attendanceId: "att-1",
  status: "late",
  lateByMin: 20,
  scannedAt: "2026-08-05T05:20:00.000Z",
  onDate: "2026-08-05",
};

/* ── The bug this file exists for ─────────────────────────────────────── */

test("approved leave blocks a lateness penalty", async () => {
  const db = world([{ code: "late", reason: "Late arrival", amount: 200 }], {
    leave_requests: [
      {
        id: "lv-1",
        employee_id: EMP,
        status: "approved",
        paid: true,
        start_date: "2026-08-04",
        end_date: "2026-08-06",
      },
    ],
  });

  const applied = await evaluateScan(db as never, scan);
  assert.equal(applied, null, "an approved leave day must not be charged");
  assert.equal(db.tables.violations.length, 0, "nothing may be written either");
});

test("a leave request the owner has not approved blocks nothing", async () => {
  for (const status of ["pending", "declined", "cancelled"]) {
    const db = world([{ code: "late", reason: "Late arrival", amount: 200 }], {
      leave_requests: [
        {
          id: "lv-1",
          employee_id: EMP,
          status,
          paid: null,
          start_date: "2026-08-04",
          end_date: "2026-08-06",
        },
      ],
    });
    const applied = await evaluateScan(db as never, scan);
    assert.ok(applied, `${status} leave must not excuse lateness`);
  }
});

test("leave for a different date does not cover this one", async () => {
  const db = world([{ code: "late", reason: "Late arrival", amount: 200 }], {
    leave_requests: [
      {
        id: "lv-1",
        employee_id: EMP,
        status: "approved",
        paid: true,
        start_date: "2026-08-06",
        end_date: "2026-08-07",
      },
    ],
  });
  const applied = await evaluateScan(db as never, scan);
  assert.ok(applied, "leave starting tomorrow does not cover today");
});

test("leave belonging to someone else does not cover this employee", async () => {
  const db = world([{ code: "late", reason: "Late arrival", amount: 200 }], {
    leave_requests: [
      {
        id: "lv-1",
        employee_id: "someone-else",
        status: "approved",
        paid: true,
        start_date: "2026-08-04",
        end_date: "2026-08-06",
      },
    ],
  });
  const applied = await evaluateScan(db as never, scan);
  assert.ok(applied);
});

test("approved leave blocks an absence penalty too", async () => {
  const db = world([{ code: "absent", reason: "Absent", amount: 1000 }], {
    leave_requests: [
      {
        id: "lv-1",
        employee_id: EMP,
        status: "approved",
        paid: false,
        start_date: "2026-08-05",
        end_date: "2026-08-05",
      },
    ],
  });
  const applied = await evaluateAbsence(db as never, {
    orgId: ORG,
    employeeId: EMP,
    workplaceId: WP,
    onDate: "2026-08-05",
  });
  assert.equal(applied, null);
  assert.equal(db.tables.violations.length, 0);
});

/* ── The rest of the money path ───────────────────────────────────────── */

test("a configured lateness rule is applied and recorded as the engine's", async () => {
  const db = world([{ code: "late", reason: "Late arrival", amount: 200 }]);
  const applied = await evaluateScan(db as never, scan);

  assert.ok(applied);
  assert.equal(applied!.amount, 200);
  const v = db.tables.violations[0];
  assert.equal(v.raised_by, "engine", "provenance must say the engine did it");
  assert.equal(v.created_by, undefined, "no person pressed a button");
  assert.equal(v.attendance_id, "att-1");
  assert.equal(v.status, "open");
  assert.ok(String(v.evidence).includes("20 min"), "evidence must carry the arithmetic");
});

test("the employee hears about it — the payslip is not the first they know", async () => {
  const db = world([{ code: "late", reason: "Late arrival", amount: 200 }]);
  const before = sms.length;
  await evaluateScan(db as never, scan);

  const sent = sms.slice(before).join("\n");
  assert.ok(sent.length > 0, "a penalty with no notice is an ambush");
  assert.ok(sent.includes("Late+arrival") || sent.includes("Late arrival"), "it must say what for");
  assert.ok(sent.includes("200"), "and how much");
  assert.match(sent, /appeal/i, "and that it can be appealed");
});

test("no configured rule means no penalty — the engine never invents one", async () => {
  const db = world([]);
  assert.equal(await evaluateScan(db as never, scan), null);
  assert.equal(db.tables.violations.length, 0);
});

test("a rule worth zero records nothing", async () => {
  const db = world([{ code: "late", reason: "Late arrival", amount: 0 }]);
  assert.equal(await evaluateScan(db as never, scan), null);
});

test("duplicate rules resolve to the cheaper one", async () => {
  const db = world([
    { code: "late", reason: "Late arrival", amount: 500 },
    { code: "late", reason: "Late arrival (dup)", amount: 150 },
  ]);
  const applied = await evaluateScan(db as never, scan);
  assert.equal(applied!.amount, 150, "a misconfigured duplicate must not charge more");
});

test("one attendance entry can only ever carry one violation", async () => {
  const db = world([{ code: "late", reason: "Late arrival", amount: 200 }]);
  assert.ok(await evaluateScan(db as never, scan));
  assert.equal(await evaluateScan(db as never, scan), null, "a retry must not double-charge");
  assert.equal(db.tables.violations.length, 1);
});

test("an on-time or flagged scan is not a lateness matter", async () => {
  const db = world([{ code: "late", reason: "Late arrival", amount: 200 }]);
  assert.equal(await evaluateScan(db as never, { ...scan, status: "normal", lateByMin: 0 }), null);
  assert.equal(await evaluateScan(db as never, { ...scan, status: "on_leave", lateByMin: 20 }), null);
  assert.equal(await evaluateScan(db as never, { ...scan, status: "late", lateByMin: 0 }), null);
});

test("per-minute rates scale, and stop at the owner's cap", () => {
  const rule = {
    id: "r",
    code: "late",
    reason: "Late",
    amount: 0,
    appeal_window_hours: 24,
    calc: { per_minute: 10, max: 500 },
  };
  assert.equal(amountForLateness(rule, 0), 0);
  assert.equal(amountForLateness(rule, 12), 120);
  assert.equal(amountForLateness(rule, 200), 500, "the cap is the owner's promise");
});

test("a flat rule ignores how late it was", () => {
  const rule = { id: "r", code: "late", reason: "Late", amount: 250, appeal_window_hours: 24, calc: null };
  assert.equal(amountForLateness(rule, 5), 250);
  assert.equal(amountForLateness(rule, 500), 250);
});

test("a workplace with no ruleset falls back to the org's shared one", async () => {
  const db = world([{ code: "late", reason: "Late arrival", amount: 200 }]);
  db.tables.workplaces = [{ id: WP, ruleset_id: null }];
  const applied = await evaluateScan(db as never, scan);
  assert.equal(applied!.amount, 200);
});
