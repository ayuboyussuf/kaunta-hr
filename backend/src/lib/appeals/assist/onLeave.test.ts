/**
 * "I was on approved leave" — the claim the record can actually settle.
 *
 * Every test here failed before this change, and the reported symptom was
 * exactly the combination of two of them: an absence penalty (no scan, so no
 * date) appealed with "I'm on approved leave" (no keyword, so routed to
 * `unclear`) produced a brief telling the owner the record held nothing either
 * way — while the owner's own approval sat in leave_requests.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, captureSms } from "../../../test/fakeDb";
import { runAssist } from "./index";
import { classify } from "./classify";
import { FORBIDDEN } from "./summary";

captureSms();

const ORG = "org-1";
const EMP = "emp-1";
const WP = "wp-1";
const APPEAL = "appeal-1";

const LATE_SCAN = "2026-08-05T05:22:00.000Z"; // 08:22 Nairobi
const DAY = "2026-08-05";

/**
 * `kind` picks which shape of penalty is under appeal:
 *   "late"   — attached to a scan, so it always had a derivable date
 *   "absent" — no scan and no attendance_id, which is the case that broke
 */
function world(
  kind: "late" | "absent",
  leave: Record<string, unknown>[] = [],
  overrides: Record<string, unknown> = {}
) {
  const violation =
    kind === "late"
      ? {
          id: "viol-1",
          employee_id: EMP,
          workplace_id: WP,
          reason: "Late arrival",
          amount: 200,
          raised_by: "engine",
          created_at: LATE_SCAN,
          attendance_id: "att-1",
          on_date: DAY,
          employees: { name: "Grace Wanjiru" },
          workplaces: { name: "Ngong Road" },
          ...overrides,
        }
      : {
          id: "viol-1",
          employee_id: EMP,
          workplace_id: WP,
          reason: "Absent without notice",
          amount: 1000,
          raised_by: "engine",
          created_at: "2026-08-05T18:30:00.000Z",
          attendance_id: null,
          on_date: DAY,
          employees: { name: "Grace Wanjiru" },
          workplaces: { name: "Ngong Road" },
          ...overrides,
        };

  return fakeDb({
    violations: [violation],
    attendance_entries:
      kind === "late"
        ? [
            {
              id: "att-1",
              employee_id: EMP,
              workplace_id: WP,
              direction: "in",
              status: "late",
              scanned_at: LATE_SCAN,
              roster_expected: { expected_start: "08:00", late_by_min: 12 },
            },
          ]
        : [],
    employees: [
      {
        id: EMP,
        org_id: ORG,
        workplace_id: WP,
        status: "active",
        name: "Grace Wanjiru",
        phone: "+254700111222",
        shift: { grace_minutes: 10 },
      },
    ],
    appeals: [],
    appeal_assists: [],
    appeal_info_requests: [],
    scan_attempts: [],
    leave_requests: leave,
    conversation_logs: [],
    conversation_traces: [],
  });
}

const approved = (over: Record<string, unknown> = {}) => ({
  id: "leave-1",
  org_id: ORG,
  employee_id: EMP,
  status: "approved",
  paid: true,
  start_date: DAY,
  end_date: DAY,
  half_day: null,
  decided_at: "2026-08-06T07:00:00.000Z", // the morning after
  ...over,
});

const appeal = (message: string) => ({ id: APPEAL, violation_id: "viol-1", message });

/* ── Routing ──────────────────────────────────────────────────────────── */

test("leave phrasings route to on_leave instead of falling through to unclear", () => {
  const phrasings = [
    "I'm on approved leave",
    "I was on leave that day, you approved it",
    "you approved my leave for that day",
    "niko on leave",
    "nilikuwa na likizo",
    "I had permission to be away",
  ];
  for (const text of phrasings) {
    assert.equal(classify(text).claim, "on_leave", `"${text}" should route to on_leave`);
  }
});

test("the word leave alone does not hijack an unrelated appeal", () => {
  // "leave" is a common verb. A sick appeal that happens to contain it must
  // not be re-routed away from the check that actually applies.
  assert.equal(classify("I was sick, I had to leave the hospital late").claim, "sick");
});

/* ── The reported bug ─────────────────────────────────────────────────── */

test("an ABSENCE appealed as approved leave finds the approval", async () => {
  const db = world("absent", [approved()]);
  const brief = await runAssist(db as never, appeal("I'm on approved leave"), ORG);

  assert.equal(brief!.claim, "on_leave");
  const cover = brief!.findings.find((f) => f.kind === "leave_cover");
  assert.ok(cover, "the approved leave has to appear as a finding");
  assert.equal(cover!.stance, "supports");
  assert.match(brief!.summary, /consistent with that/i);
  assert.doesNotMatch(
    brief!.summary,
    /holds nothing either way/i,
    "this was the reported symptom: an approval on file, reported as no evidence"
  );
});

test("a LATE penalty appealed as approved leave finds it too", async () => {
  const db = world("late", [approved()]);
  const brief = await runAssist(db as never, appeal("I was on approved leave"), ORG);

  assert.ok(brief!.findings.some((f) => f.kind === "leave_cover"));
});

test("an absence with no on_date still resolves a date rather than giving up", async () => {
  // Rows written before violations carried a date. The fallback is created_at,
  // because silently failing to check is worse than a date that is nearly right.
  const db = world("absent", [approved()], { on_date: null });
  const brief = await runAssist(db as never, appeal("I'm on approved leave"), ORG);

  assert.ok(
    brief!.findings.some((f) => f.kind === "leave_cover"),
    "a null on_date must not turn into a silent 'no leave found'"
  );
});

/* ── Honesty when there is no cover ───────────────────────────────────── */

test("no approved leave is reported as contradicting, not as nothing found", async () => {
  const db = world("absent", []);
  const brief = await runAssist(db as never, appeal("I'm on approved leave"), ORG);

  const none = brief!.findings.find((f) => f.kind === "no_leave_cover");
  assert.ok(none);
  assert.equal(none!.stance, "contradicts");
  // The gap has to be named: verbal permission leaves no row.
  assert.match(none!.detail, /verbally|will not be here/i);
});

test("a pending or wrongly-dated request nearby is surfaced, not hidden", async () => {
  const db = world("absent", [
    approved({ id: "leave-2", status: "pending", start_date: "2026-08-06", end_date: "2026-08-06" }),
  ]);
  const brief = await runAssist(db as never, appeal("I'm on approved leave"), ORG);

  const near = brief!.findings.find((f) => f.kind === "leave_nearby");
  assert.ok(near, "a request for the next day is the usual innocent explanation");
  assert.match(near!.detail, /pending/);
});

test("it distinguishes leave approved after the penalty from leave approved before", async () => {
  const after = await runAssist(
    world("absent", [approved({ decided_at: "2026-08-06T07:00:00.000Z" })]) as never,
    appeal("I'm on approved leave"),
    ORG
  );
  const timing = after!.findings.find((f) => f.kind === "leave_approval_timing");
  assert.ok(timing);
  assert.match(timing!.headline, /approved after/i);

  const before = await runAssist(
    world("absent", [approved({ decided_at: "2026-08-01T07:00:00.000Z" })]) as never,
    appeal("I'm on approved leave"),
    ORG
  );
  assert.match(
    before!.findings.find((f) => f.kind === "leave_approval_timing")!.headline,
    /already approved/i
  );
});

/* ── It still refuses to decide ───────────────────────────────────────── */

test("the brief never recommends an outcome, even when the leave is clear-cut", async () => {
  const db = world("absent", [approved()]);
  const brief = await runAssist(db as never, appeal("I'm on approved leave"), ORG);

  const text = `${brief!.summary} ${brief!.findings.map((f) => f.detail).join(" ")}`.toLowerCase();
  for (const word of FORBIDDEN) {
    assert.ok(!text.includes(word), `a brief must not contain "${word}"`);
  }
  assert.equal((brief as unknown as { verdict?: unknown }).verdict, undefined);
  assert.match(brief!.summary, /The decision is yours\.$/);
});

test("it asks the employee for nothing — the owner is the one who granted it", async () => {
  const db = world("absent", [approved()]);
  const brief = await runAssist(db as never, appeal("I'm on approved leave"), ORG);

  assert.equal(brief!.ask, null);
  assert.equal(db.tables.appeal_info_requests.length, 0);
});

/* ── The check that runs whatever they wrote ──────────────────────────── */

test("approved leave is reported even when the appeal claims something else", async () => {
  // Routes to system_not_working. Before this, the leave check only ran in the
  // `unclear` path, so an approval on file went unmentioned entirely.
  const db = world("absent", [approved()]);
  const brief = await runAssist(
    db as never,
    appeal("the app would not open, the scanner kept failing"),
    ORG
  );

  assert.equal(brief!.claim, "system_not_working");
  assert.ok(
    brief!.findings.some((f) => f.kind === "leave_cover"),
    "a penalty on a signed-off day is the owner's business regardless of the claim"
  );
  assert.match(brief!.summary, /approved/i, "and the summary has to reflect it");
});
