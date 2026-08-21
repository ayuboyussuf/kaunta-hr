/**
 * Is the presence-check cron actually working?
 *
 * That question could not be answered from outside before this file existed.
 * The production log said `orgs_enabled: 1, employees_considered: 2, fired: 0,
 * skipped: { not_clocked_in: 2 }` — which is either a healthy system with
 * nobody on shift, or a broken one that thinks nobody is ever on shift, and the
 * log reads identically in both cases.
 *
 * So the job takes an injectable clock and db, and these tests drive the real
 * one. The night-shift case below failed before the fix: a guard who clocked in
 * at 20:05 and was standing at the post at 02:00 read as "not clocked in",
 * because the lookup was bounded to the Nairobi calendar day while the shift
 * window check already handled crossing midnight. Night staff — the people a
 * presence check is worth the most for — were unreachable for the entire
 * after-midnight half of every shift.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, captureSms } from "../../test/fakeDb";
import { runPresenceChecks } from "./presence-checks.route";
import { checkTimes } from "../../lib/presence/schedule";

captureSms();

// The cron secret doubles as the seed salt for the randomised check times, so
// the test has to know it to work out when a check is actually due. Set before
// the job runs; env reads it lazily on each call.
process.env.CRON_SECRET ||= "test-cron-secret";

const ORG = "org-1";
const EMP = "emp-1";
const SALT = process.env.CRON_SECRET;

const at = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+03:00`);

function world(over: {
  clockIn?: Date | null;
  shift?: { start_time: string; end_time: string };
  perShift?: number;
  leave?: Record<string, unknown>[];
  checks?: Record<string, unknown>[];
} = {}) {
  const shift = over.shift ?? { start_time: "07:00", end_time: "17:00" };
  return fakeDb({
    orgs: [
      {
        id: ORG,
        presence_checks_per_shift: over.perShift ?? 1,
        presence_check_window_min: 10,
        presence_sms_fallback: true,
      },
    ],
    employees: [
      {
        id: EMP,
        org_id: ORG,
        workplace_id: "wp-1",
        status: "active",
        name: "Grace Wanjiru",
        phone: "+254700111222",
        shift,
      },
    ],
    workplaces: [{ id: "wp-1", name: "Ngong Road" }],
    attendance_entries:
      over.clockIn === null
        ? []
        : [
            {
              id: "att-1",
              employee_id: EMP,
              workplace_id: "wp-1",
              direction: "in",
              status: "normal",
              flags: [],
              scanned_at: (over.clockIn ?? at("2026-08-17", "06:58")).toISOString(),
            },
          ],
    presence_checks: over.checks ?? [],
    leave_requests: over.leave ?? [],
    push_subscriptions: [],
  });
}

/** A moment the schedule actually drew for this employee, so a check is due. */
function dueMoment(ymd: string, shiftStart: string, shiftEnd: string, count = 1): Date {
  const times = checkTimes({
    employeeId: EMP,
    ymd,
    shiftStart: at(ymd, shiftStart),
    shiftEnd: at(ymd, shiftEnd),
    count,
    salt: SALT,
  });
  return times[0];
}

test("a check fires for somebody on a day shift at a drawn moment", async () => {
  const db = world();
  const now = dueMoment("2026-08-17", "07:00", "17:00");

  const r = await runPresenceChecks({ db: db as never, now });

  assert.equal(r.fired, 1, `expected one check to fire, got ${JSON.stringify(r)}`);
  assert.equal(db.tables.presence_checks.length, 1);
  const check = db.tables.presence_checks[0];
  assert.equal(check.status, "pending");
  assert.equal(check.source, "schedule");
  assert.equal(check.session_entry_id, "att-1", "the check belongs to the open clock-in");
});

test("the night shift is reachable after midnight — the day-bounded bug", async () => {
  // Clocked in at 20:05 yesterday, on a 20:00–06:00 shift, now 02:00.
  const db = world({
    shift: { start_time: "20:00", end_time: "06:00" },
    clockIn: at("2026-08-16", "20:05"),
  });

  // A moment the schedule drew for the overnight window.
  const times = checkTimes({
    employeeId: EMP,
    ymd: "2026-08-17",
    shiftStart: at("2026-08-17", "20:00"),
    shiftEnd: at("2026-08-18", "06:00"),
    count: 1,
    salt: SALT,
  });
  // The cron builds the window from `now`'s Nairobi day, so drive it at a
  // clock time inside the after-midnight half.
  const now = at("2026-08-17", "02:00");
  void times;

  const r = await runPresenceChecks({ db: db as never, now });

  assert.equal(
    r.skipped.not_clocked_in,
    0,
    "a clock-in from yesterday evening still means they are on shift now"
  );
});

test("nobody clocked in is reported as exactly that — the production log was right", async () => {
  const db = world({ clockIn: null });
  const r = await runPresenceChecks({ db: db as never, now: at("2026-08-17", "15:10") });

  assert.equal(r.fired, 0);
  assert.equal(r.skipped.not_clocked_in, 1);
  assert.equal(db.tables.presence_checks.length, 0, "and nothing was written");
});

test("approved leave is never chased", async () => {
  const db = world({
    leave: [
      {
        id: "leave-1",
        employee_id: EMP,
        status: "approved",
        paid: true,
        start_date: "2026-08-17",
        end_date: "2026-08-17",
        half_day: null,
      },
    ],
  });
  const r = await runPresenceChecks({
    db: db as never,
    now: dueMoment("2026-08-17", "07:00", "17:00"),
  });

  assert.equal(r.fired, 0);
  assert.equal(r.skipped.on_leave, 1);
});

test("the daily quota is enforced against scheduled checks only", async () => {
  const now = dueMoment("2026-08-17", "07:00", "17:00");
  const answered = {
    id: "chk-1",
    employee_id: EMP,
    session_entry_id: "att-1",
    status: "confirmed",
    source: "schedule",
    due_at: at("2026-08-17", "09:00").toISOString(),
    respond_by: at("2026-08-17", "09:10").toISOString(),
    created_at: at("2026-08-17", "09:00").toISOString(),
  };

  // One per shift, one already answered → the quota is met.
  const met = world({ perShift: 1, checks: [answered] });
  const r1 = await runPresenceChecks({ db: met as never, now });
  assert.equal(r1.skipped.quota_met, 1, "a check already drawn today spends the quota");

  // The same check, but the owner asked for it. That must NOT spend the random
  // draw, or an owner would be choosing between the check they want and the
  // check that keeps everybody honest.
  const ownerAsked = world({
    perShift: 1,
    checks: [{ ...answered, source: "owner", requested_by: "user-1" }],
  });
  const r2 = await runPresenceChecks({ db: ownerAsked as never, now });
  assert.equal(r2.skipped.quota_met, 0, "an owner-requested check is a separate event");
  assert.equal(r2.fired, 1);
});

test("an open check blocks a second one", async () => {
  const now = dueMoment("2026-08-17", "07:00", "17:00");
  const db = world({
    checks: [
      {
        id: "chk-1",
        employee_id: EMP,
        session_entry_id: "att-1",
        status: "pending",
        source: "schedule",
        due_at: new Date(now.getTime() - 5 * 60_000).toISOString(),
        respond_by: new Date(now.getTime() + 5 * 60_000).toISOString(),
        created_at: new Date(now.getTime() - 5 * 60_000).toISOString(),
      },
    ],
  });

  const r = await runPresenceChecks({ db: db as never, now });
  assert.equal(r.fired, 0);
  assert.equal(r.skipped.already_pending, 1);
});

test("outside the shift, nothing fires", async () => {
  const db = world({ clockIn: at("2026-08-17", "06:58") });
  const r = await runPresenceChecks({ db: db as never, now: at("2026-08-17", "22:30") });

  assert.equal(r.fired, 0);
  assert.equal(r.skipped.outside_shift, 1);
});

test("an overdue check becomes missed and flags the clock-in", async () => {
  const now = at("2026-08-17", "12:00");
  const db = world({
    checks: [
      {
        id: "chk-1",
        employee_id: EMP,
        session_entry_id: "att-1",
        status: "pending",
        source: "schedule",
        due_at: at("2026-08-17", "11:00").toISOString(),
        respond_by: at("2026-08-17", "11:10").toISOString(),
        created_at: at("2026-08-17", "11:00").toISOString(),
      },
    ],
  });

  const r = await runPresenceChecks({ db: db as never, now });

  assert.equal(r.missed, 1);
  assert.equal(db.tables.presence_checks[0].status, "missed");
  const entry = db.tables.attendance_entries[0];
  assert.ok(
    (entry.flags as string[]).includes("missed_presence_check"),
    "the owner has to be able to see which clock-in this landed against"
  );
});
