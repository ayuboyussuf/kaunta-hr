/**
 * The daily digest, and the 160 characters it has to live in.
 *
 * The budget is not a nicety. One of these goes to every owner every morning;
 * a second segment on each is a doubled bill for the life of the product. So
 * the size assertion is the point of this file, and it is checked against the
 * worst realistic input rather than a friendly one.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyDigest } from "./daily";
import { smsCost } from "../sms/gsm7";
import type { AttendanceReport } from "../reports/attendance";

const LINK = "aproksi.app/r/260818";
const DAY = "Tue 18 Aug";

function report(over: Partial<AttendanceReport["totals"]> = {}, sites: unknown[] = []): AttendanceReport {
  return {
    range: { from: "2026-08-18", to: "2026-08-18" },
    generatedAt: "2026-08-19T03:30:00.000Z",
    periodComplete: true,
    workingDays: 1,
    totals: {
      headcount: 11,
      daysPresent: 9,
      daysLate: 2,
      daysAbsent: 1,
      leaveDays: 0,
      checksConfirmed: 3,
      checksMissed: 1,
      penalties: 1,
      penaltyTotal: 1000,
      closedDays: 0,
      ...over,
    },
    sites: sites as AttendanceReport["sites"],
    employees: [],
  };
}

const site = (name: string, over: Record<string, number> = {}) => ({
  workplaceId: name,
  name,
  headcount: 6,
  daysPresent: 4,
  daysLate: 1,
  daysAbsent: 1,
  leaveDays: 0,
  checksMissed: 0,
  emptyDays: 0,
  closedDays: 0,
  ...over,
});

const build = (r: AttendanceReport, closures: { siteName: string | null; rostered: number }[] = []) =>
  buildDailyDigest({ report: r, closures, dayLabel: DAY, link: LINK });

/* ── Silence ──────────────────────────────────────────────────────────── */

test("a clean day sends nothing at all", () => {
  // A message that says "all normal" every morning trains its reader to ignore
  // it, and then it says something that matters.
  const d = build(report({ daysLate: 0, daysAbsent: 0, checksMissed: 0 }));
  assert.equal(d.text, null);
  assert.equal(d.reason, "clean");
});

test("one missed check is enough to be worth a message", () => {
  const d = build(report({ daysLate: 0, daysAbsent: 0, checksMissed: 1 }));
  assert.ok(d.text);
  assert.equal(d.reason, "exceptions");
});

/* ── The budget ───────────────────────────────────────────────────────── */

test("a normal digest fits one segment and carries the link", () => {
  const d = build(report({}, [site("Ruiru"), site("Juja")]));
  assert.equal(d.segments, 1);
  assert.ok(d.text!.endsWith(LINK));
  assert.equal(smsCost(d.text!).encoding, "GSM-7");
});

test("it still fits one segment with long site names and every count set", () => {
  const d = build(
    report({ headcount: 48, daysPresent: 31, daysLate: 9, daysAbsent: 8, checksMissed: 6 }, [
      site("Ruiru Kenyatta Highway Station"),
      site("Juja Farm Road Station"),
    ])
  );
  assert.equal(d.segments, 1, `over budget: ${d.text}`);
  assert.ok(d.text!.endsWith(LINK), "and the link survived the trim");
});

test("past two sites it counts them instead of truncating mid-name", () => {
  const d = build(report({}, [site("Ruiru"), site("Juja"), site("Thika"), site("Ngong")]));
  assert.match(d.text!, /4 sites need a look/);
  assert.equal(d.segments, 1);
});

test("sites where nothing went wrong are not named", () => {
  const d = build(
    report({}, [site("Ruiru", { daysLate: 0, daysAbsent: 0, checksMissed: 0 }), site("Juja")])
  );
  assert.match(d.text!, /Juja/);
  assert.doesNotMatch(d.text!, /Ruiru/, "a site that had a good day does not need its ratio printed");
});

/* ── Priority ─────────────────────────────────────────────────────────── */

test("a held closure outranks the statistics", () => {
  // Penalties are suspended, staff are waiting, and it expires unanswered.
  // How many people were late elsewhere can wait for the link.
  const d = build(report(), [{ siteName: "Juja Station", rostered: 6 }]);

  assert.equal(d.reason, "closure");
  assert.match(d.text!, /nobody clocked in at Juja Station/);
  assert.match(d.text!, /6 rostered/);
  assert.match(d.text!, /No penalties applied/);
  assert.equal(d.segments, 1);
});

test("several closures are counted, and the people are totalled", () => {
  const d = build(report(), [
    { siteName: "Juja", rostered: 6 },
    { siteName: "Thika", rostered: 4 },
  ]);
  assert.match(d.text!, /at 2 sites/);
  assert.match(d.text!, /10 rostered/);
  assert.equal(d.segments, 1);
});

test("a closure is reported even on a day that would otherwise be silent", () => {
  const d = build(report({ daysLate: 0, daysAbsent: 0, checksMissed: 0 }), [
    { siteName: "Juja", rostered: 6 },
  ]);
  assert.ok(d.text, "held penalties are never silent");
  assert.equal(d.reason, "closure");
});
