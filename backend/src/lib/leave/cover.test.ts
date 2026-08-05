/**
 * Turning approved requests into days.
 *
 * Payroll counts days, not requests, and gets the counting wrong in expensive
 * ways: a request that straddles the end of a cycle paid twice, a half day
 * counted as a whole one, a paid day counted as an absence. Each of those is
 * somebody's salary.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../test/fakeDb";
import { approvedLeaveDays, approvedLeaveOn } from "./cover";

const EMP = "emp-1";

const req = (over: Record<string, unknown> = {}) => ({
  id: "lv-1",
  employee_id: EMP,
  status: "approved",
  paid: true,
  half_day: null,
  start_date: "2026-08-03",
  end_date: "2026-08-05",
  ...over,
});

test("a multi-day request becomes one entry per day", async () => {
  const db = fakeDb({ leave_requests: [req()] });
  const days = await approvedLeaveDays(db as never, EMP, "2026-08-01", "2026-08-31");
  assert.deepEqual([...days.keys()].sort(), ["2026-08-03", "2026-08-04", "2026-08-05"]);
  assert.equal(days.get("2026-08-04")!.fraction, 1);
});

test("days outside the window are not this cycle's problem", async () => {
  const db = fakeDb({ leave_requests: [req({ start_date: "2026-07-30", end_date: "2026-08-02" })] });
  const days = await approvedLeaveDays(db as never, EMP, "2026-08-01", "2026-08-31");
  assert.deepEqual([...days.keys()].sort(), ["2026-08-01", "2026-08-02"], "July is July's cycle");
});

test("a half day counts as half", async () => {
  const db = fakeDb({
    leave_requests: [req({ start_date: "2026-08-04", end_date: "2026-08-04", half_day: "morning" })],
  });
  const days = await approvedLeaveDays(db as never, EMP, "2026-08-01", "2026-08-31");
  assert.equal(days.size, 1);
  assert.equal(days.get("2026-08-04")!.fraction, 0.5);
  assert.equal(days.get("2026-08-04")!.half_day, "morning");
});

test("unapproved requests contribute no days", async () => {
  const db = fakeDb({
    leave_requests: [req({ status: "pending" }), req({ id: "lv-2", status: "declined" })],
  });
  const days = await approvedLeaveDays(db as never, EMP, "2026-08-01", "2026-08-31");
  assert.equal(days.size, 0);
});

test("overlapping approvals do not double-count, and the employee is not worse off", async () => {
  const db = fakeDb({
    leave_requests: [
      req({ id: "lv-1", start_date: "2026-08-04", end_date: "2026-08-04", half_day: "morning", paid: false }),
      req({ id: "lv-2", start_date: "2026-08-04", end_date: "2026-08-04", half_day: null, paid: true }),
    ],
  });
  const days = await approvedLeaveDays(db as never, EMP, "2026-08-01", "2026-08-31");
  assert.equal(days.size, 1, "one day is one day however many times it was asked for");
  assert.equal(days.get("2026-08-04")!.fraction, 1, "the fuller cover wins");
  assert.equal(days.get("2026-08-04")!.paid, true, "and the better-paid one");
});

test("half-day cover still answers the on-leave question for that day", async () => {
  const db = fakeDb({
    leave_requests: [req({ start_date: "2026-08-04", end_date: "2026-08-04", half_day: "afternoon" })],
  });
  const cover = await approvedLeaveOn(db as never, EMP, "2026-08-04");
  assert.ok(cover, "the engine has no second start time to measure a half day against");
  assert.equal(cover!.half_day, "afternoon");
});

test("somebody else's leave is not yours", async () => {
  const db = fakeDb({ leave_requests: [req({ employee_id: "someone-else" })] });
  const days = await approvedLeaveDays(db as never, EMP, "2026-08-01", "2026-08-31");
  assert.equal(days.size, 0);
});
