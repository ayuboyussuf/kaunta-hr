/**
 * The two claims Aproksi cannot verify.
 *
 * The risk with these is not that they under-deliver — it is that they
 * over-claim. A brief that reads like a check was performed, when no check is
 * possible, is worse than no brief: the employer trusts it and decides on it.
 * So the tests assert the disclaimers are present, that no wording implies
 * verification, and that "I have no note" is never treated as an admission.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, captureSms } from "../../../test/fakeDb";
import { runAssist } from "./index";
import { FORBIDDEN } from "./summary";

captureSms();

const ORG = "org-1";
const EMP = "emp-1";
const WP = "wp-1";
const VIOL = "viol-1";
const APPEAL = "appeal-1";
const SCAN = "2026-08-05T05:22:00.000Z"; // 08:22 Nairobi

function world(over: { entries?: Record<string, unknown>[]; info?: Record<string, unknown>[] } = {}) {
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
        attendance_id: "att-1",
        employees: { name: "Grace Wanjiru" },
        workplaces: { name: "Ngong Road" },
      },
    ],
    attendance_entries: [
      {
        id: "att-1",
        employee_id: EMP,
        workplace_id: WP,
        direction: "in",
        status: "late",
        scanned_at: SCAN,
        roster_expected: { expected_start: "08:00", late_by_min: 12 },
      },
      ...(over.entries ?? []),
    ],
    employees: [
      { id: EMP, org_id: ORG, workplace_id: WP, status: "active", name: "Grace Wanjiru", phone: "+254700111222", shift: { grace_minutes: 10 } },
      { id: "mate-1", org_id: ORG, workplace_id: WP, status: "active", name: "Mate One", phone: "+254700111333" },
    ],
    appeals: [],
    appeal_assists: [],
    appeal_info_requests: over.info ?? [],
    scan_attempts: [],
    leave_requests: [],
    conversation_logs: [],
    conversation_traces: [],
  });
}

const appeal = (message: string) => ({ id: APPEAL, violation_id: VIOL, message });

/* ── Sick ─────────────────────────────────────────────────────────────── */

test("the sick brief says outright that it cannot verify illness", async () => {
  const db = world();
  const brief = await runAssist(db as never, appeal("I was sick and went to the clinic"), ORG);
  assert.equal(brief!.claim, "sick");

  const limit = brief!.findings.find((f) => f.kind === "verification_limit");
  assert.ok(limit, "the limitation is a finding, not a footnote");
  assert.equal(limit!.stance, "unverifiable");
  assert.match(limit!.detail, /read but not authenticated/i);
});

test("it asks for a note once, and the SMS offers a way out", async () => {
  const db = world();
  const brief = await runAssist(db as never, appeal("I was sick and went to the clinic"), ORG);

  assert.equal(brief!.ask?.code, "sick_note");
  assert.equal(db.tables.appeal_info_requests.length, 1);

  const sent = db.tables.appeal_info_requests[0];
  assert.match(String(sent.question), /note|clinic|hospital/i);
});

test("having no note is recorded as an answer, never as an admission", async () => {
  const db = world({
    info: [
      {
        id: "ir-1",
        assist_id: "as-1",
        appeal_id: APPEAL,
        employee_id: EMP,
        ask_code: "sick_note",
        question: "Do you have a note?",
        answered_at: "2026-08-05T09:00:00.000Z",
        declined: true,
        answer: null,
        document_path: null,
      },
    ],
  });

  const brief = await runAssist(db as never, appeal("I was sick, I went to the clinic"), ORG);
  const none = brief!.findings.find((f) => f.kind === "no_document");
  assert.ok(none);
  assert.equal(none!.stance, "neutral", "not 'contradicts' — no note is not a lie");
  assert.match(none!.detail, /not as an admission/i);
  assert.equal(brief!.ask, null, "and it is not asked a second time");
});

test("a provided document is offered for the owner to judge, not judged", async () => {
  const db = world({
    info: [
      {
        id: "ir-1",
        assist_id: "as-1",
        appeal_id: APPEAL,
        employee_id: EMP,
        ask_code: "sick_note",
        question: "Do you have a note?",
        answered_at: "2026-08-05T09:00:00.000Z",
        declined: false,
        answer: null,
        document_path: "emp-1/appeal-1.jpg",
      },
    ],
  });

  const brief = await runAssist(db as never, appeal("I was sick, hospital"), ORG);
  const doc = brief!.findings.find((f) => f.kind === "document_provided");
  assert.ok(doc);
  assert.match(doc!.detail, /judge it yourself|has not assessed/i);
});

/* ── Road ─────────────────────────────────────────────────────────────── */

test("a shared delay is found from colleagues, not from a traffic API", async () => {
  const db = world({
    entries: [
      { id: "e2", employee_id: "mate-1", workplace_id: WP, direction: "in", status: "late", scanned_at: "2026-08-05T05:19:00.000Z" },
      { id: "e3", employee_id: "mate-2", workplace_id: WP, direction: "in", status: "late", scanned_at: "2026-08-05T05:25:00.000Z" },
    ],
  });

  const brief = await runAssist(db as never, appeal("the road was closed, terrible traffic"), ORG);
  const shared = brief!.findings.find((f) => f.kind === "shared_delay");
  assert.ok(shared, "two others late on a site that is normally punctual");
  assert.equal(shared!.stance, "supports");
  assert.equal(shared!.evidence.late_others_today, 2);
});

test("being the only late one is reported plainly", async () => {
  const db = world({
    entries: [
      { id: "e2", employee_id: "mate-1", workplace_id: WP, direction: "in", status: "normal", scanned_at: "2026-08-05T04:55:00.000Z" },
    ],
  });

  const brief = await runAssist(db as never, appeal("the road was blocked, matatu jam"), ORG);
  const alone = brief!.findings.find((f) => f.kind === "alone_in_lateness");
  assert.ok(alone);
  assert.equal(alone!.stance, "contradicts");
  assert.match(alone!.detail, /need not block anyone else/i, "and it does not overstate itself");
});

test("the road brief refuses to pretend a past closure can be looked up", async () => {
  const db = world();
  const brief = await runAssist(db as never, appeal("the road was closed"), ORG);
  const limit = brief!.findings.find((f) => f.kind === "verification_limit");
  assert.ok(limit);
  assert.match(limit!.detail, /conditions now, not last/i);
});

test("it asks which road, once", async () => {
  const db = world();
  const brief = await runAssist(db as never, appeal("the road was closed"), ORG);
  assert.equal(brief!.ask?.code, "which_road");
  assert.equal(db.tables.appeal_info_requests.length, 1);
});

/* ── Both, held to the same promise ───────────────────────────────────── */

test("neither claim's brief ever expresses a verdict", async () => {
  for (const message of [
    "I was sick and went to the clinic",
    "the road was closed, terrible jam",
    "I was sick, no note though",
  ]) {
    const brief = await runAssist(world() as never, appeal(message), ORG);
    const text = [brief!.summary, ...brief!.findings.map((f) => `${f.headline} ${f.detail}`)]
      .join(" ")
      .toLowerCase();
    for (const word of FORBIDDEN) {
      assert.ok(!text.includes(word), `"${message}" produced a brief saying "${word}"`);
    }
  }
});

test("every run is logged, and the log holds no name or wage", async () => {
  const db = world();
  await runAssist(db as never, appeal("Grace was sick, went to hospital"), ORG);

  assert.equal(db.tables.conversation_logs.length, 1);
  const log = db.tables.conversation_logs[0];
  assert.equal(log.claim, "sick");
  assert.equal(log.asked_employee, true);
  assert.ok(Number(log.tool_calls) > 0, "the tools it ran are counted");

  const written = JSON.stringify(db.tables.conversation_logs);
  assert.ok(!written.includes("Grace"));
  assert.ok(!written.includes("Wanjiru"));
});
