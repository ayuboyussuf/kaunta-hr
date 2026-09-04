/**
 * The day nobody came in.
 *
 * Before this, a public holiday meant the sweep fined every member of staff and
 * texted them all at 21:30 to say they had been absent. These tests pin the two
 * halves of the fix: nothing is charged for a day nobody explained, and the
 * only path that ever charges is an owner explicitly saying so.
 *
 * The sweep is driven for real against the fake database, because the whole
 * point of this branch is that it fires on days you cannot sit and watch.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, captureSms } from "../../test/fakeDb";
import { runAbsenceSweep } from "../../routes/cron/absence-sweep.route";
import { assessSiteDay, closureQuestion, MIN_ROSTERED_FOR_REVIEW } from "./closure";
import { resolveClosureReview, expireStaleReviews } from "./resolveClosure";

captureSms();
process.env.CRON_SECRET ||= "test-cron-secret";

const ORG = "org-1";
const WP = "wp-1";
const DAY = "2026-08-17"; // a Monday
const OWNER = "user-1";

/* ── The judgement itself ─────────────────────────────────────────────── */

test("a site where somebody scanned is never held", () => {
  const v = assessSiteDay({ workplaceId: WP, rostered: 6, scanned: 1, failedAttempts: 0 });
  assert.equal(v.hold, false);
});

test("one person alone missing is an absence, not a closure", () => {
  // Holding penalties on ambiguity would have the owner answering questions
  // constantly, which is how a safety feature gets switched off.
  const v = assessSiteDay({ workplaceId: WP, rostered: 1, scanned: 0, failedAttempts: 0 });
  assert.equal(v.hold, false);
  assert.equal(v.reason, "too_few_rostered");
  assert.equal(MIN_ROSTERED_FOR_REVIEW, 2);
});

test("nobody in, several rostered, is held and read as a closure", () => {
  const v = assessSiteDay({ workplaceId: WP, rostered: 6, scanned: 0, failedAttempts: 0 });
  assert.equal(v.hold, true);
  assert.equal(v.hold && v.likely, "closed");
});

test("failed scan attempts change the likely cause to a system problem", () => {
  // People standing at the gate failing to scan is not people staying home.
  const v = assessSiteDay({ workplaceId: WP, rostered: 6, scanned: 0, failedAttempts: 4 });
  assert.equal(v.hold, true);
  assert.equal(v.hold && v.likely, "system_problem");
});

test("the question states its evidence and never accuses anybody", () => {
  const q = closureQuestion({
    siteName: "Juja Station",
    dateLabel: "Monday 17 August",
    rostered: 6,
    failedAttempts: 4,
  });
  assert.match(q, /Juja Station/);
  assert.match(q, /6 rostered/);
  assert.match(q, /4 clock-in attempts failed/);
  assert.match(q, /No penalties have been applied/);
  assert.doesNotMatch(q, /absent/i, "nobody has been called absent yet, because nobody knows");
});

/* ── The sweep ────────────────────────────────────────────────────────── */

function world(over: {
  scans?: Record<string, unknown>[];
  attempts?: Record<string, unknown>[];
  nonWorking?: Record<string, unknown>[];
  reviews?: Record<string, unknown>[];
  staff?: number;
} = {}) {
  const staff = over.staff ?? 6;
  return fakeDb({
    employees: Array.from({ length: staff }, (_, i) => ({
      id: `emp-${i + 1}`,
      org_id: ORG,
      workplace_id: WP,
      shift_id: "shift-1",
      status: "active",
      name: `Staff ${i + 1}`,
      phone: `+25470011100${i}`,
      shift: { days_of_week: [1, 2, 3, 4, 5] },
    })),
    workplaces: [{ id: WP, name: "Juja Station", org_id: ORG }],
    attendance_entries: over.scans ?? [],
    scan_attempts: over.attempts ?? [],
    non_working_days: over.nonWorking ?? [],
    closure_reviews: over.reviews ?? [],
    violations: [],
    leave_requests: [],
    rulesets: [{ id: "rs-1", org_id: ORG, is_shared: true, created_at: "2026-01-01T00:00:00Z" }],
    penalty_rules: [
      {
        id: "rule-absent",
        ruleset_id: "rs-1",
        code: "absent",
        reason: "Absent without notice",
        amount: 1000,
        calc: null,
        appeal_window_hours: 48,
      },
    ],
  });
}

const scan = (empId: string) => ({
  id: `att-${empId}`,
  employee_id: empId,
  workplace_id: WP,
  direction: "in",
  status: "normal",
  scanned_at: `${DAY}T05:00:00.000Z`,
});

test("a holiday no longer fines the entire site", async () => {
  const db = world();
  const r = await runAbsenceSweep({ db: db as never, dateOverride: DAY });

  assert.equal(r.raised, 0, "not one penalty");
  assert.equal(r.held, 6);
  assert.equal(r.sites_reviewed, 1);
  assert.equal(db.tables.violations.length, 0, "and nothing was written to violations");

  const review = db.tables.closure_reviews[0];
  assert.equal(review.status, "pending");
  assert.equal(review.rostered, 6);
  assert.equal(review.scanned, 0);
});

test("a normal day with one absentee still raises exactly one penalty", async () => {
  // The guard must not become an excuse to stop enforcing anything.
  const db = world({ scans: ["emp-1", "emp-2", "emp-3", "emp-4", "emp-5"].map(scan) });
  const r = await runAbsenceSweep({ db: db as never, dateOverride: DAY });

  assert.equal(r.held, 0);
  assert.equal(r.raised, 1);
  assert.equal(db.tables.closure_reviews.length, 0, "no question needed — the site worked");
});

test("a day declared closed in advance asks nothing at all", async () => {
  const db = world({
    nonWorking: [
      { id: "nwd-1", org_id: ORG, workplace_id: WP, on_date: DAY, label: "Madaraka Day", paid: true },
    ],
  });
  const r = await runAbsenceSweep({ db: db as never, dateOverride: DAY });

  assert.equal(r.raised, 0);
  assert.equal(r.held, 0);
  assert.equal(r.skipped_declared_closed, 6);
  assert.equal(db.tables.closure_reviews.length, 0, "the owner already told us");
});

test("an org-wide closure covers a site that has its own id", async () => {
  const db = world({
    nonWorking: [
      { id: "nwd-1", org_id: ORG, workplace_id: null, on_date: DAY, label: "Christmas", paid: true },
    ],
  });
  const r = await runAbsenceSweep({ db: db as never, dateOverride: DAY });
  assert.equal(r.skipped_declared_closed, 6);
});

test("re-running the sweep does not ask the same question twice", async () => {
  const db = world();
  await runAbsenceSweep({ db: db as never, dateOverride: DAY });
  await runAbsenceSweep({ db: db as never, dateOverride: DAY });
  assert.equal(db.tables.closure_reviews.length, 1);
});

test("nobody is evaluated for a day they were not rostered", async () => {
  // 2026-08-16 is a Sunday; the shift runs Monday to Friday. The old sweep
  // never checked the weekday at all.
  const db = world();
  const r = await runAbsenceSweep({ db: db as never, dateOverride: "2026-08-16" });

  assert.equal(r.checked, 0);
  assert.equal(r.held, 0);
  assert.equal(db.tables.closure_reviews.length, 0);
});

/* ── Answering ────────────────────────────────────────────────────────── */

async function heldWorld() {
  const db = world();
  await runAbsenceSweep({ db: db as never, dateOverride: DAY });
  return db;
}

test("answering 'holiday' charges nothing and records the day as non-working", async () => {
  const db = await heldWorld();
  const review = db.tables.closure_reviews[0];

  const out = await resolveClosureReview(db as never, {
    reviewId: review.id as string,
    orgId: ORG,
    resolution: "closed_holiday",
    note: "Madaraka Day",
    paid: true,
    resolvedByUserId: OWNER,
  });

  assert.equal(out!.raised, 0);
  assert.equal(out!.recordedNonWorking, true);
  assert.equal(db.tables.violations.length, 0);

  const day = db.tables.non_working_days[0];
  assert.equal(day.label, "Madaraka Day");
  assert.equal(day.paid, true);
  assert.equal(db.tables.closure_reviews[0].status, "closed");
});

test("answering 'system problem' charges nothing and declares nothing", async () => {
  const db = await heldWorld();
  const out = await resolveClosureReview(db as never, {
    reviewId: db.tables.closure_reviews[0].id as string,
    orgId: ORG,
    resolution: "system_problem",
    resolvedByUserId: OWNER,
  });

  assert.equal(out!.raised, 0);
  assert.equal(out!.recordedNonWorking, false, "it was our failure, not a closure");
  assert.equal(db.tables.violations.length, 0);
});

test("only an explicit 'everyone was absent' ever raises the penalties", async () => {
  const db = await heldWorld();
  const out = await resolveClosureReview(db as never, {
    reviewId: db.tables.closure_reviews[0].id as string,
    orgId: ORG,
    resolution: "everyone_absent",
    resolvedByUserId: OWNER,
  });

  assert.equal(out!.raised, 6);
  assert.equal(db.tables.violations.length, 6);
  assert.equal(db.tables.closure_reviews[0].status, "worked");
});

test("someone on approved leave is not caught by 'everyone was absent'", async () => {
  const db = await heldWorld();
  db.tables.leave_requests.push({
    id: "leave-1",
    employee_id: "emp-3",
    status: "approved",
    paid: true,
    start_date: DAY,
    end_date: DAY,
    half_day: null,
  });

  const out = await resolveClosureReview(db as never, {
    reviewId: db.tables.closure_reviews[0].id as string,
    orgId: ORG,
    resolution: "everyone_absent",
    resolvedByUserId: OWNER,
  });

  assert.equal(out!.raised, 5, "the person who was signed off was not expected");
});

test("a review belonging to another org cannot be answered", async () => {
  const db = await heldWorld();
  const out = await resolveClosureReview(db as never, {
    reviewId: db.tables.closure_reviews[0].id as string,
    orgId: "someone-else",
    resolution: "everyone_absent",
    resolvedByUserId: "intruder",
  });
  assert.equal(out, null);
  assert.equal(db.tables.violations.length, 0);
});

test("a review cannot be answered twice", async () => {
  const db = await heldWorld();
  const id = db.tables.closure_reviews[0].id as string;
  await resolveClosureReview(db as never, {
    reviewId: id, orgId: ORG, resolution: "closed_holiday", resolvedByUserId: OWNER,
  });
  const second = await resolveClosureReview(db as never, {
    reviewId: id, orgId: ORG, resolution: "everyone_absent", resolvedByUserId: OWNER,
  });
  assert.equal(second, null, "and certainly not answered a second time into a charge");
  assert.equal(db.tables.violations.length, 0);
});

/* ── Silence ──────────────────────────────────────────────────────────── */

test("silence discards the held penalties rather than applying them", async () => {
  const db = await heldWorld();
  db.tables.closure_reviews[0].created_at = "2026-08-01T00:00:00.000Z";

  const { expired } = await expireStaleReviews(db as never, new Date("2026-08-17T21:30:00Z"));

  assert.equal(expired, 1);
  assert.equal(db.tables.closure_reviews[0].status, "expired");
  assert.equal(db.tables.violations.length, 0, "nobody is charged for a question nobody answered");
});

test("a question inside the window is left alone", async () => {
  const db = await heldWorld();
  db.tables.closure_reviews[0].created_at = "2026-08-16T00:00:00.000Z";

  const { expired } = await expireStaleReviews(db as never, new Date("2026-08-17T21:30:00Z"));
  assert.equal(expired, 0);
  assert.equal(db.tables.closure_reviews[0].status, "pending");
});
