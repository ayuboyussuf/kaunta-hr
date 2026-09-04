/**
 * SMS costs money per segment, and the segment size is decided by one
 * character. These tests exist because that fact was invisible: the send path
 * logged `msgLen` in characters, so the penalty notice — the highest-volume
 * message in the product — cost two segments instead of one for months, on the
 * strength of a single em dash, and nothing anywhere said so.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { smsCost, toGsm7, fitSegments } from "./gsm7";

/* ── Counting ─────────────────────────────────────────────────────────── */

test("plain ASCII is GSM-7 and fits 160 in one segment", () => {
  const c = smsCost("A".repeat(160));
  assert.equal(c.encoding, "GSM-7");
  assert.equal(c.units, 160);
  assert.equal(c.segments, 1);
});

test("161 GSM-7 characters costs two segments, not one", () => {
  assert.equal(smsCost("A".repeat(161)).segments, 2);
});

test("extension-table characters cost two units each", () => {
  // Square brackets and braces are GSM-7, but only via the escape table.
  assert.equal(smsCost("[]").units, 4);
  assert.equal(smsCost("{}").units, 4);
});

test("one em dash drops capacity from 160 to 70 for the WHOLE message", () => {
  const body = "A".repeat(100) + "—";
  const c = smsCost(body);
  assert.equal(c.encoding, "UCS-2");
  assert.equal(c.segments, 2, "101 characters now needs two segments");
  assert.equal(c.offender, "—", "and it says which character did it");
});

test("a curly apostrophe does the same thing", () => {
  assert.equal(smsCost("it's fine").encoding, "GSM-7");
  assert.equal(smsCost("it’s fine").encoding, "UCS-2");
});

/* ── Sanitising ───────────────────────────────────────────────────────── */

test("sanitising the real penalty notice halves its cost", () => {
  const body = "Aproksi HR: Late arrival — KES 200. You were 22 minutes late. If you disagree, open your record to appeal.";

  const before = smsCost(body);
  assert.equal(before.encoding, "UCS-2");
  assert.equal(before.segments, 2);

  const after = smsCost(toGsm7(body));
  assert.equal(after.encoding, "GSM-7");
  assert.equal(after.segments, 1, "one segment, for the price of one hyphen");
});

test("substitutions keep the message readable", () => {
  assert.equal(toGsm7("don’t — do"), "don't - do");
  assert.equal(toGsm7("wait…"), "wait...");
  assert.equal(toGsm7("a b"), "a b");
});

test("a name it cannot transliterate is left alone rather than mangled", () => {
  // Saving a shilling is not worth misspelling somebody's name. It simply
  // costs more, and smsCost says so.
  const body = "Aproksi HR: Njeri Wanjikũ was late.";
  assert.equal(toGsm7(body), body);
  assert.equal(smsCost(toGsm7(body)).encoding, "UCS-2");
});

/* ── Fitting a budget ─────────────────────────────────────────────────── */

test("a body within budget is returned whole, with its link", () => {
  const out = fitSegments("Aproksi HR Tue 18 Aug: 9/11 in, 2 late.", " r.aproksi.app/a1b2c3", 1);
  assert.ok(out.endsWith(" r.aproksi.app/a1b2c3"));
  assert.equal(smsCost(out).segments, 1);
});

test("an over-long body is trimmed but never at the cost of the link", () => {
  // The link is the only part that leads anywhere. Truncating it would leave a
  // message that reports a problem and offers no way to look at it.
  const link = " r.aproksi.app/a1b2c3";
  const out = fitSegments("word ".repeat(80), link, 1);

  assert.equal(smsCost(out).segments, 1);
  assert.ok(out.endsWith(link), "the link survived");
  assert.ok(!out.includes("  "), "and it was cut on a word boundary");
});

/* ── The regression guard ─────────────────────────────────────────────── */

test("every message template in the product fits its segment budget", () => {
  // Realistic substitutions — the long ones are the ones that matter, because
  // a template that fits with a short name may not with a long one.
  const templates: [string, string, number][] = [
    [
      "penalty notice",
      "Aproksi HR: Absent without notice - KES 1,000. No clock-in was recorded for 2026-08-17. If you disagree, open your record to appeal.",
      1,
    ],
    [
      "presence check",
      "Aproksi HR: please open the app and scan within 10 minutes to confirm you're at work.",
      1,
    ],
    [
      "missed check, to the owner",
      "Aproksi HR: Grace Wanjiru missed a random presence check at Ruiru Station. The clock-in is flagged for your review.",
      1,
    ],
    [
      "leave approved",
      "Aproksi HR: your leave for 2026-08-05 to 2026-08-09 is approved (unpaid). You will not be marked absent on those days.",
      1,
    ],
    [
      "leave approved, with a cancelled penalty",
      "Aproksi HR: your leave for 2026-08-05 is approved (paid). You will not be marked absent on those days. 1 penalty raised for those days (KES 1,000) has been cancelled.",
      2,
    ],
  ];

  for (const [label, body, budget] of templates) {
    const c = smsCost(toGsm7(body));
    assert.equal(c.encoding, "GSM-7", `${label} must not be UCS-2 (offender: ${c.offender})`);
    assert.ok(
      c.segments <= budget,
      `${label} is ${c.segments} segment(s), budget ${budget} — ${c.units} units`
    );
  }
});
