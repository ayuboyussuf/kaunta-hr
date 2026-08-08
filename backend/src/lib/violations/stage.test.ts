/**
 * The appeal-window loophole.
 *
 * A penalty whose window had closed still read as "open" on both screens,
 * because the screens read `status`, and `status` only changes when a sweep
 * runs — and the sweep was a Render cron service that never fired. The employee
 * saw an Appeal button the server would reject; the owner saw a dash where an
 * outcome belonged, with nothing to download.
 *
 * These tests hold the fix in place: the stage comes from the clock, so it is
 * right the second the deadline passes and stays right if the sweep never runs
 * again.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { canAppeal, msLeft, stageOf, STAGE_LABEL, STAGE_LABEL_OWNER } from "./stage";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");
const inHours = (h: number) => new Date(NOW + h * 3600_000).toISOString();

test("inside the window with no appeal, it is open", () => {
  const v = { status: "open", appeal_window_end: inHours(6), hasAppeal: false };
  assert.equal(stageOf(v, NOW), "open");
  assert.equal(canAppeal(v, NOW), true);
  assert.equal(msLeft(v, NOW), 6 * 3600_000);
});

test("the second the window passes it is closed — no sweep required", () => {
  const v = { status: "open", appeal_window_end: inHours(-0.001), hasAppeal: false };
  assert.equal(stageOf(v, NOW), "closed_no_appeal", "this is the loophole");
  assert.equal(canAppeal(v, NOW), false);
  assert.equal(msLeft(v, NOW), null);
});

test("a window that closed weeks ago still reads closed, not open", () => {
  // The real state of the rows on the deployed system: the sweep never ran, so
  // status is still 'open' and always would have been.
  const v = { status: "open", appeal_window_end: inHours(-24 * 21), hasAppeal: false };
  assert.equal(stageOf(v, NOW), "closed_no_appeal");
});

test("an appeal outranks the deadline — it is with the owner now", () => {
  const v = { status: "open", appeal_window_end: inHours(-5), hasAppeal: true };
  assert.equal(stageOf(v, NOW), "appealed", "filed in time; the owner still owes an answer");
  assert.equal(canAppeal(v, NOW), false, "and it cannot be appealed twice");
});

test("appealed status counts even without the joined row", () => {
  const v = { status: "appealed", appeal_window_end: inHours(2), hasAppeal: false };
  assert.equal(stageOf(v, NOW), "appealed");
});

test("locked is settled whatever the dates say", () => {
  for (const end of [inHours(-100), inHours(100)]) {
    assert.equal(stageOf({ status: "locked", appeal_window_end: end, hasAppeal: true }, NOW), "settled");
    assert.equal(stageOf({ status: "locked", appeal_window_end: end, hasAppeal: false }, NOW), "settled");
  }
});

test("a missing deadline never silently closes a penalty", () => {
  const v = { status: "open", appeal_window_end: null, hasAppeal: false };
  assert.equal(stageOf(v, NOW), "open", "no deadline is not an expired deadline");
  assert.equal(canAppeal(v, NOW), true);
});

test("every stage says something a person can act on", () => {
  for (const labels of [STAGE_LABEL, STAGE_LABEL_OWNER]) {
    for (const [stage, text] of Object.entries(labels)) {
      assert.ok(text.length > 6, `${stage} needs real words`);
      // "open" and "locked" are our words for our rows. Neither tells an
      // employee whether they still have a decision to make.
      assert.ok(!/^(open|locked|appealed)$/i.test(text), `${stage} is still database jargon`);
    }
  }
  assert.match(STAGE_LABEL_OWNER.closed_no_appeal, /elapsed|not appealed/i);
});
