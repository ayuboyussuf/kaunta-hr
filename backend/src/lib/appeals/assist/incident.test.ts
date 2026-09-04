/**
 * Appeals about the same morning.
 *
 * The interesting tests here are the ones asserting what it does NOT say. A
 * memory feature in an appeals system is one step away from building a case
 * against whoever complains, and these pin the step it must not take.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, captureSms } from "../../../test/fakeDb";
import { runAssist } from "./index";
import { FORBIDDEN } from "./summary";

captureSms();

const ORG = "org-1";
const WP = "wp-1";
const DAY = "2026-08-17";
const SCAN = `${DAY}T05:22:00.000Z`;

/** `mates` are colleagues who also got a penalty that day; each may appeal. */
function world(mates: { id: string; appeal?: string; decided?: boolean }[], roster = 6) {
  const violations = [
    {
      id: "viol-1",
      employee_id: "emp-1",
      workplace_id: WP,
      reason: "Late arrival",
      amount: 200,
      raised_by: "engine",
      created_at: SCAN,
      attendance_id: "att-1",
      on_date: DAY,
      employees: { name: "Grace Wanjiru" },
      workplaces: { name: "Juja Station" },
    },
    ...mates.map((m, i) => ({
      id: `viol-${i + 2}`,
      employee_id: m.id,
      workplace_id: WP,
      reason: "Late arrival",
      amount: 200,
      raised_by: "engine",
      created_at: SCAN,
      attendance_id: null,
      on_date: DAY,
    })),
  ];

  const appeals = mates
    .filter((m) => m.appeal)
    .map((m, i) => ({
      id: `ap-mate-${i + 1}`,
      violation_id: violations.find((v) => v.employee_id === m.id)!.id,
      message: m.appeal!,
      decision: m.decided ? "rejected" : "pending",
    }));

  return fakeDb({
    violations,
    appeals,
    attendance_entries: [
      {
        id: "att-1",
        employee_id: "emp-1",
        workplace_id: WP,
        direction: "in",
        status: "late",
        scanned_at: SCAN,
        roster_expected: { expected_start: "07:00", late_by_min: 22 },
      },
    ],
    employees: [
      {
        id: "emp-1",
        org_id: ORG,
        workplace_id: WP,
        status: "active",
        name: "Grace Wanjiru",
        phone: "+254700111222",
        shift: { grace_minutes: 10 },
      },
      ...Array.from({ length: roster - 1 }, (_, i) => ({
        id: `emp-${i + 2}`,
        org_id: ORG,
        workplace_id: WP,
        status: "active",
        name: `Colleague ${i + 1}`,
        phone: `+25470022200${i}`,
      })),
    ],
    workplaces: [{ id: WP, org_id: ORG, name: "Juja Station" }],
    appeal_assists: [],
    appeal_info_requests: [],
    scan_attempts: [],
    leave_requests: [],
    conversation_logs: [],
    conversation_traces: [],
    presence_checks: [],
  });
}

const mine = (message: string) => ({ id: "ap-1", violation_id: "viol-1", message });
const ROAD = "the road was blocked at Kenol, the matatu was turned back";

test("colleagues appealing the same morning on the same grounds is surfaced", async () => {
  const db = world([
    { id: "emp-2", appeal: ROAD },
    { id: "emp-3", appeal: "barabara ilikuwa imefungwa, gari ilikwama" },
  ]);
  const brief = await runAssist(db as never, mine(ROAD), ORG);

  const f = brief!.findings.find((x) => x.kind === "same_incident");
  assert.ok(f, "three people describing one morning is the strongest thing here");
  assert.equal(f!.stance, "supports");
  assert.equal(f!.evidence.colleagues_same_claim, 2);
  assert.match(brief!.summary, /colleagues appealed the same day/i);
});

test("it counts the people who did NOT appeal, as the counterweight", async () => {
  // Two of six is a different morning from two of forty, and reporting only
  // the two would be reporting half of it.
  const db = world([{ id: "emp-2", appeal: ROAD }], 6);
  const f = (await runAssist(db as never, mine(ROAD), ORG))!.findings.find(
    (x) => x.kind === "same_incident"
  );
  assert.equal(f!.evidence.did_not_appeal, 4);
  assert.match(f!.detail, /4 other staff members at that site did not appeal/);
});

test("a colleague appealing something ELSE is not corroboration", async () => {
  const db = world([{ id: "emp-2", appeal: "I was sick and went to the clinic" }]);
  const brief = await runAssist(db as never, mine(ROAD), ORG);
  assert.equal(
    brief!.findings.find((x) => x.kind === "same_incident"),
    undefined,
    "different claims about the same day are not the same account"
  );
});

test("colleagues who were penalised but never appealed add nothing", async () => {
  const db = world([{ id: "emp-2" }, { id: "emp-3" }]);
  const brief = await runAssist(db as never, mine(ROAD), ORG);
  assert.equal(brief!.findings.find((x) => x.kind === "same_incident"), undefined);
});

test("a solo appeal is never told that nobody else complained", async () => {
  // The line this feature must not cross. Announcing "you are the only one" on
  // every solo appeal builds a case against whoever speaks up first.
  const db = world([]);
  const brief = await runAssist(db as never, mine(ROAD), ORG);

  assert.equal(brief!.findings.find((x) => x.kind === "same_incident"), undefined);

  // Narrowly about APPEALING. The road-closed check separately, and honestly,
  // reports that no colleague scanned that day so there is no arrival baseline
  // to compare against — that is a statement about missing data, not about
  // this person being the only one to complain.
  const text = `${brief!.summary} ${brief!.findings.map((f) => f.detail).join(" ")}`;
  assert.doesNotMatch(text, /(only|nobody else|no one else)[^.]{0,40}appeal/i);
  assert.doesNotMatch(text, /appeal[^.]{0,40}(alone|only one|nobody else)/i);
});

test("it says how many siblings are still undecided", async () => {
  // So they get decided together. One event answered four different ways is
  // the failure mode this exists to prevent.
  const db = world([
    { id: "emp-2", appeal: ROAD },
    { id: "emp-3", appeal: ROAD, decided: true },
  ]);
  const f = (await runAssist(db as never, mine(ROAD), ORG))!.findings.find(
    (x) => x.kind === "same_incident"
  );
  assert.equal(f!.evidence.still_undecided, 1);
  assert.match(f!.detail, /1 still waiting on a decision/);
});

test("it runs whatever the claim was routed to", async () => {
  const SYSTEM = "the app would not scan, the camera kept failing";
  const db = world([{ id: "emp-2", appeal: SYSTEM }]);
  const brief = await runAssist(db as never, mine(SYSTEM), ORG);

  assert.equal(brief!.claim, "system_not_working");
  assert.ok(brief!.findings.some((x) => x.kind === "same_incident"));
});

test("it still never recommends an outcome", async () => {
  const db = world([
    { id: "emp-2", appeal: ROAD },
    { id: "emp-3", appeal: ROAD },
    { id: "emp-4", appeal: ROAD },
  ]);
  const brief = await runAssist(db as never, mine(ROAD), ORG);

  const text = `${brief!.summary} ${brief!.findings.map((f) => f.detail).join(" ")}`.toLowerCase();
  for (const word of FORBIDDEN) {
    assert.ok(!text.includes(word), `corroboration must not become a verdict: "${word}"`);
  }
  assert.match(brief!.summary, /The decision is yours\.$/);
});
