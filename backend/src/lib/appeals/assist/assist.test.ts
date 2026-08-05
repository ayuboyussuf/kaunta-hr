/**
 * The appeal assist, held to the two promises made about it.
 *
 *   1. It never decides. No finding, no summary, no stored column expresses an
 *      outcome — and the test for that greps the actual output rather than
 *      trusting the code to have stayed honest.
 *   2. It never invents. Every number in a brief traces to rows, so the tests
 *      set up rows and assert the numbers, including the awkward direction:
 *      when the record contradicts the employee, it must say so plainly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, captureSms } from "../../../test/fakeDb";
import { classify } from "./classify";
import { runAssist } from "./index";
import { FORBIDDEN, summarise } from "./summary";

captureSms();

const ORG = "org-1";
const EMP = "emp-1";
const WP = "wp-1";
const VIOL = "viol-1";
const APPEAL = "appeal-1";
const ATT = "att-1";

const SCAN = "2026-08-05T05:22:00.000Z"; // 08:22 Nairobi

function world(over: { attempts?: Record<string, unknown>[]; entries?: Record<string, unknown>[]; staff?: number } = {}) {
  const colleagues = Array.from({ length: over.staff ?? 2 }, (_, i) => ({
    id: `mate-${i + 1}`,
    workplace_id: WP,
    status: "active",
    name: `Colleague ${i + 1}`,
    phone: `+2547000000${i}`,
  }));

  return fakeDb({
    violations: [
      {
        id: VIOL,
        employee_id: EMP,
        workplace_id: WP,
        reason: "Late arrival",
        amount: 200,
        raised_by: "engine",
        created_at: SCAN,
        attendance_id: ATT,
        employees: { name: "Grace Wanjiru" },
        workplaces: { name: "Ngong Road" },
      },
    ],
    attendance_entries: [
      {
        id: ATT,
        employee_id: EMP,
        workplace_id: WP,
        scanned_at: SCAN,
        roster_expected: { expected_start: "08:00", late_by_min: 12 },
      },
      ...(over.entries ?? []),
    ],
    employees: [
      { id: EMP, workplace_id: WP, status: "active", name: "Grace Wanjiru", phone: "+254700111222", shift: { grace_minutes: 10 } },
      ...colleagues,
    ],
    scan_attempts: over.attempts ?? [],
    appeals: [],
    appeal_assists: [],
    appeal_info_requests: [],
    leave_requests: [],
  });
}

const appeal = (message: string) => ({ id: APPEAL, violation_id: VIOL, message });

/* ── Routing ──────────────────────────────────────────────────────────── */

test("routes the three claims people actually make", () => {
  assert.equal(classify("The app would not scan, it kept hanging").claim, "system_not_working");
  assert.equal(classify("I was sick and went to the clinic").claim, "sick");
  assert.equal(classify("The road was closed so the matatu took forever").claim, "road_closed");
});

test("routes Swahili the way staff actually type it", () => {
  assert.equal(classify("app ilihang, mtandao haikufanya kazi").claim, "system_not_working");
  assert.equal(classify("nilikuwa mgonjwa, nilienda hospitali").claim, "sick");
  assert.equal(classify("barabara ilifungwa, gari ilikwama kwa foleni").claim, "road_closed");
});

test("an appeal it cannot place is called unclear, not guessed at", () => {
  assert.equal(classify("this is not fair at all").claim, "unclear");
  assert.equal(classify("").claim, "unclear");
});

test("two claims in one sentence lower the confidence rather than pick one", () => {
  const c = classify("I was sick and the matatu jam was terrible on that road");
  assert.equal(c.confidence, "low", "being unsure is the correct output here");
});

/* ── The record contradicting the employee ────────────────────────────── */

test("says plainly when colleagues were clocking in fine", async () => {
  const db = world({
    entries: [
      { id: "e2", employee_id: "mate-1", workplace_id: WP, scanned_at: "2026-08-05T05:00:00.000Z" },
      { id: "e3", employee_id: "mate-2", workplace_id: WP, scanned_at: "2026-08-05T05:05:00.000Z" },
    ],
  });

  const brief = await runAssist(db as never, appeal("The app would not scan at all"), ORG);
  assert.ok(brief);

  const siteWorking = brief!.findings.find((f) => f.kind === "site_working");
  assert.ok(siteWorking, "the awkward finding must still be produced");
  assert.equal(siteWorking!.stance, "contradicts");
  assert.equal(siteWorking!.evidence.distinct_people, 2);

  const noAttempts = brief!.findings.find((f) => f.kind === "no_attempts");
  assert.equal(noAttempts!.stance, "contradicts");
});

test("says plainly when nobody could clock in", async () => {
  const db = world({
    attempts: [
      { id: "a1", employee_id: EMP, workplace_id: WP, source: "server", outcome: "server_error", occurred_at: "2026-08-05T04:58:00.000Z" },
      { id: "a2", employee_id: EMP, workplace_id: WP, source: "server", outcome: "server_error", occurred_at: "2026-08-05T05:04:00.000Z" },
      { id: "a3", employee_id: "mate-1", workplace_id: WP, source: "server", outcome: "server_error", occurred_at: "2026-08-05T05:01:00.000Z" },
    ],
  });

  const brief = await runAssist(db as never, appeal("The app kept failing, it would not scan"), ORG);
  const attempts = brief!.findings.find((f) => f.kind === "attempts");
  assert.equal(attempts!.stance, "supports");
  assert.equal(attempts!.evidence.witnessed_by_kaunta, 2);
  assert.match(attempts!.headline, /Kaunta itself rejected/);

  const site = brief!.findings.find((f) => f.kind === "site_down");
  assert.equal(site!.stance, "supports");
});

test("a device report is presented as the employee's account, not as proof", async () => {
  const db = world({
    attempts: [
      { id: "a1", employee_id: EMP, workplace_id: WP, source: "client", outcome: "network_error", occurred_at: "2026-08-05T05:02:00.000Z" },
    ],
  });
  const brief = await runAssist(db as never, appeal("no network, the app could not load"), ORG);
  const attempts = brief!.findings.find((f) => f.kind === "attempts");
  assert.match(attempts!.detail, /from the device|employee's account/i);
  assert.equal(attempts!.evidence.witnessed_by_kaunta, 0);
});

test("a site with nobody else to compare against says so instead of concluding", async () => {
  const db = world({ staff: 0 });
  const brief = await runAssist(db as never, appeal("the app would not scan"), ORG);
  const alone = brief!.findings.find((f) => f.kind === "site_alone");
  assert.equal(alone!.stance, "unverifiable");
  assert.ok(brief!.missing.length > 0, "and names what is missing");
});

/* ── The promises ─────────────────────────────────────────────────────── */

test("no brief ever expresses a verdict", async () => {
  const dbs = [
    world({ entries: [{ id: "e2", employee_id: "mate-1", workplace_id: WP, scanned_at: "2026-08-05T05:00:00.000Z" }] }),
    world({ attempts: [{ id: "a1", employee_id: EMP, workplace_id: WP, source: "server", outcome: "server_error", occurred_at: "2026-08-05T05:02:00.000Z" }] }),
    world({ staff: 0 }),
  ];

  for (const db of dbs) {
    const brief = await runAssist(db as never, appeal("the app would not scan"), ORG);
    const text = [brief!.summary, ...brief!.findings.map((f) => `${f.headline} ${f.detail}`)]
      .join(" ")
      .toLowerCase();
    for (const word of FORBIDDEN) {
      assert.ok(!text.includes(word), `a brief said "${word}"`);
    }
    assert.ok(!("verdict" in brief!), "the brief has no verdict field to fill in");
    assert.ok(!("recommendation" in brief!));
  }
});

test("the brief is stored against the appeal and nothing else is touched", async () => {
  const db = world();
  await runAssist(db as never, appeal("the app would not scan"), ORG);

  assert.equal(db.tables.appeal_assists.length, 1);
  const stored = db.tables.appeal_assists[0];
  assert.equal(stored.appeal_id, APPEAL);
  assert.equal(stored.claim, "system_not_working");
  assert.equal(stored.status, "ready");
  assert.ok(!("decision" in stored), "an assist has no business holding a decision");

  // The violation and the appeal are exactly as they were.
  assert.equal(db.tables.violations[0].status, undefined);
  assert.equal(db.inserts.filter((i) => i.table === "violations").length, 0);
});

test("this claim asks the employee for nothing — the record already has it", async () => {
  const db = world();
  const brief = await runAssist(db as never, appeal("the app would not scan"), ORG);
  assert.equal(brief!.ask, null);
  assert.equal(db.tables.appeal_info_requests.length, 0, "no SMS the employee has to answer");
});

test("a penalty on an approved leave day is surfaced as the bug it is", async () => {
  const db = world();
  db.tables.leave_requests = [
    {
      id: "lv-1",
      employee_id: EMP,
      status: "approved",
      paid: true,
      half_day: null,
      start_date: "2026-08-05",
      end_date: "2026-08-05",
    },
  ];
  const brief = await runAssist(db as never, appeal("this is not fair"), ORG);
  const cover = brief!.findings.find((f) => f.kind === "leave_cover");
  assert.ok(cover, "an unclear appeal still gets the checks that are cheap and certain");
  assert.equal(cover!.stance, "supports");
});

test("an unroutable appeal gets the facts and an honest gap, not a fabricated check", async () => {
  const db = world();
  const brief = await runAssist(db as never, appeal("this is not fair at all"), ORG);
  assert.equal(brief!.claim, "unclear");
  const gap = brief!.findings.find((f) => f.kind === "not_checked");
  assert.equal(gap!.stance, "unverifiable");
});

test("a missing violation yields nothing rather than a brief about nothing", async () => {
  const db = world();
  db.tables.violations = [];
  assert.equal(await runAssist(db as never, appeal("the app would not scan"), ORG), null);
});

test("the summary carries the arithmetic the owner would otherwise recompute", () => {
  const text = summarise(
    "system_not_working",
    {
      employeeName: "Grace",
      lateByMin: 12,
      expectedStart: "08:00",
    } as never,
    [
      { kind: "a", stance: "contradicts", headline: "Others clocked in fine", detail: "", evidence: {}, source: "x" },
    ]
  );
  assert.match(text, /12 minutes late/);
  assert.match(text, /does not fit/);
  assert.match(text, /decision is yours/i);
});
