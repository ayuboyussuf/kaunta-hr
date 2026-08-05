/**
 * The two promises the logging layer makes.
 *
 *   1. It observes. It cannot change a result, cannot swallow a failure, and
 *      cannot fail a request by failing itself.
 *   2. Nothing sensitive reaches storage. Not "is cleaned before display" —
 *      never written. The test therefore inspects what was handed to the
 *      database, not what comes back out of it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../test/fakeDb";
import { observed, Trace, writeLog } from "./log";

const ORG = "org-1";
const GRACE = "8f2c1d4e-0a3b-4c5d-9e6f-7a8b9c0d1e2f";

const world = () =>
  fakeDb({
    employees: [{ id: GRACE, org_id: ORG, name: "Grace Wanjiru", phone: "+254796411540" }],
    conversation_logs: [],
    conversation_traces: [],
  });

/* ── It observes ──────────────────────────────────────────────────────── */

test("the wrapped result comes back untouched", async () => {
  const db = world();
  const out = await observed(db as never, { orgId: ORG, kind: "test" }, async () => ({
    result: { brief: "unchanged", n: 42 },
    record: { outcome: "ready" as const },
  }));
  assert.deepEqual(out, { brief: "unchanged", n: 42 });
});

test("a failure is recorded and then rethrown, not swallowed", async () => {
  const db = world();
  await assert.rejects(
    () =>
      observed(db as never, { orgId: ORG, kind: "test" }, async () => {
        throw new Error("the tool exploded");
      }),
    /the tool exploded/
  );
  const row = db.tables.conversation_logs[0];
  assert.equal(row.outcome, "failed");
  assert.match(String(row.error_redacted), /exploded/);
});

test("a broken log never breaks the work", async () => {
  const exploding = {
    from() {
      throw new Error("logging database is down");
    },
  };
  const out = await observed(exploding as never, { orgId: ORG, kind: "test" }, async () => ({
    result: "the work still finished",
    record: { outcome: "ready" as const },
  }));
  assert.equal(out, "the work still finished");
});

test("the trace counts tool calls and nothing else", async () => {
  const db = world();
  await observed(db as never, { orgId: ORG, kind: "test" }, async (trace) => {
    trace.step("classify", { claim: "system_not_working" });
    trace.step("tool:one");
    trace.step("tool:two");
    trace.step("persist");
    return { result: null, record: { outcome: "ready" as const } };
  });

  assert.equal(db.tables.conversation_logs[0].tool_calls, 2);
  assert.equal(db.tables.conversation_traces.length, 4, "every step is kept, not just the tools");
  assert.deepEqual(
    db.tables.conversation_traces.map((t) => t.seq),
    [0, 1, 2, 3],
    "order is the point of a trace"
  );
});

/* ── Nothing sensitive is written ─────────────────────────────────────── */

test("a name, a phone and a wage never reach storage", async () => {
  const db = world();
  await writeLog(
    db as never,
    {
      orgId: ORG,
      kind: "appeal_assist",
      subjectRef: "appeal-1",
      input: "Grace Wanjiru (0796411540) says the KES 200 penalty is unfair",
      output: "Grace was 12 minutes late and is appealing. Her net pay was 38,200 shillings.",
      outcome: "ready",
    },
    new Trace()
  );

  const written = JSON.stringify(db.inserts);
  for (const secret of ["Grace", "Wanjiru", "0796411540", "796411540", "38,200"]) {
    assert.ok(!written.includes(secret), `"${secret}" was written to storage`);
  }
});

test("the structure of the question survives the redaction", async () => {
  const db = world();
  await writeLog(
    db as never,
    {
      orgId: ORG,
      kind: "appeal_assist",
      input: "why was Grace Wanjiru docked KES 200 on 2026-08-04",
      outcome: "ready",
    },
    new Trace()
  );

  const input = String(db.tables.conversation_logs[0].input_redacted);
  assert.match(input, /^why was \[employee_ref:[0-9a-f-]+\] docked \[amount_redacted\] on 2026-08-04$/);
});

test("trace details are scrubbed too — call sites drift", async () => {
  const db = world();
  const trace = new Trace();
  trace.step("tool:lookup", { employee_name: "Grace Wanjiru", amount: 200, count: 3 });
  await writeLog(db as never, { orgId: ORG, kind: "test", outcome: "ready" }, trace);

  const detail = JSON.stringify(db.tables.conversation_traces[0].detail);
  assert.ok(!detail.includes("Grace"));
  assert.ok(!detail.includes("200"));
  assert.ok(detail.includes("3"), "the counts that make a trace useful are kept");
});

test("an error message is scrubbed like everything else", async () => {
  const db = world();
  await assert.rejects(() =>
    observed(db as never, { orgId: ORG, kind: "test" }, async () => {
      throw new Error("could not SMS Grace Wanjiru on +254796411540");
    })
  );
  const written = String(db.tables.conversation_logs[0].error_redacted);
  assert.ok(!written.includes("Grace"));
  assert.ok(!written.includes("796411540"));
  assert.match(written, /could not SMS/, "the failure is still diagnosable");
});

test("no org means pattern scrubbing still happens", async () => {
  const db = world();
  await writeLog(
    db as never,
    { orgId: null, kind: "test", input: "reached +254712345678 about KES 900", outcome: "ready" },
    new Trace()
  );
  const input = String(db.tables.conversation_logs[0].input_redacted);
  assert.ok(!input.includes("712345678"));
  assert.ok(!input.includes("900"));
});
