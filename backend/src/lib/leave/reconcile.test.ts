/**
 * Approving leave has to reach backwards.
 *
 * The sweep runs at 21:30. Somebody away on Tuesday who files on Wednesday is
 * approved onto a day that already carries an absence penalty, and until this
 * existed nothing went back to look — so the approval SMS promised days that
 * were still charged. These tests pin the promise.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../test/fakeDb";
import { voidPenaltiesCoveredByLeave } from "./reconcile";

const EMP = "emp-1";
const OWNER = "user-1";

function world(violations: Record<string, unknown>[], appeals: Record<string, unknown>[] = []) {
  return fakeDb({ violations, appeals });
}

const penalty = (over: Record<string, unknown> = {}) => ({
  id: "viol-1",
  employee_id: EMP,
  on_date: "2026-08-05",
  amount: 1000,
  reason: "Absent without notice",
  status: "open",
  ...over,
});

const range = (over: Record<string, unknown> = {}) => ({
  employeeId: EMP,
  startDate: "2026-08-05",
  endDate: "2026-08-05",
  halfDay: null,
  approvedByUserId: OWNER,
  ...over,
});

test("an open penalty on an approved day is cancelled", async () => {
  const db = world([penalty()]);
  const voided = await voidPenaltiesCoveredByLeave(db as never, range());

  assert.equal(voided.length, 1);
  assert.equal(voided[0].amount, 1000);

  const row = db.tables.violations[0];
  assert.equal(row.amount, 0, "a cancelled penalty must cost nothing");
  assert.equal(row.status, "locked");
  assert.equal(row.voided_reason, "leave_approved");
  assert.equal(row.voided_by, OWNER, "the reversal has to be attributable");
  assert.match(String(row.outcome), /leave for 2026-08-05 was approved/);
});

test("a penalty outside the approved range is left alone", async () => {
  const db = world([penalty({ on_date: "2026-08-07" })]);
  const voided = await voidPenaltiesCoveredByLeave(db as never, range());

  assert.equal(voided.length, 0);
  assert.equal(db.tables.violations[0].amount, 1000);
  assert.equal(db.tables.violations[0].status, "open");
});

test("every day of a multi-day approval is covered", async () => {
  const db = world([
    penalty({ id: "v1", on_date: "2026-08-05" }),
    penalty({ id: "v2", on_date: "2026-08-06" }),
    penalty({ id: "v3", on_date: "2026-08-09" }), // outside
  ]);
  const voided = await voidPenaltiesCoveredByLeave(
    db as never,
    range({ startDate: "2026-08-05", endDate: "2026-08-07" })
  );

  assert.deepEqual(voided.map((v) => v.violationId).sort(), ["v1", "v2"]);
});

test("a decided case is never rewritten", async () => {
  // Locked means somebody made a decision and a document exists. Quietly
  // editing it is exactly what the locked-document design prevents; if leave is
  // approved afterwards that is a conversation, not a silent overwrite.
  const db = world([penalty({ status: "locked", amount: 1000 })]);
  const voided = await voidPenaltiesCoveredByLeave(db as never, range());

  assert.equal(voided.length, 0);
  assert.equal(db.tables.violations[0].amount, 1000);
});

test("a penalty already under appeal is cancelled and its appeal closed", async () => {
  const db = world(
    [penalty({ status: "appealed" })],
    [{ id: "ap-1", violation_id: "viol-1", decision: "pending", message: "I was on leave" }]
  );
  const voided = await voidPenaltiesCoveredByLeave(db as never, range());

  assert.equal(voided.length, 1);
  const appeal = db.tables.appeals[0];
  assert.equal(appeal.decision, "accepted", "resolved in the employee's favour");
  assert.equal(appeal.decided_by, OWNER);
  assert.ok(appeal.decided_at, "a closed appeal needs a time on it");
});

test("half-day leave still cancels that day's penalty", async () => {
  // Same reasoning as the engine: the owner configured one shift start, and
  // inventing a second one for the remaining half would be the system writing
  // a rule nobody wrote. Unpaid halves are handled in payroll, as pay.
  const db = world([penalty({ reason: "Late arrival", amount: 200 })]);
  const voided = await voidPenaltiesCoveredByLeave(db as never, range({ halfDay: "morning" }));

  assert.equal(voided.length, 1);
  assert.match(String(db.tables.violations[0].outcome), /\(morning\)/);
});

test("nothing to cancel is not an error", async () => {
  const db = world([]);
  assert.deepEqual(await voidPenaltiesCoveredByLeave(db as never, range()), []);
});
