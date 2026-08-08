/**
 * Three bugs found by scanning a real QR at a real till.
 *
 *   1. Any of the business's codes worked at any of its sites.
 *   2. Answering a presence check clocked the employee out.
 *   3. A weak GPS fix meant an honest answer could not be given at all.
 *
 * None of them errored. Each scan succeeded and recorded the wrong thing,
 * which is why they had to be reported by a person rather than caught by a log.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { qrIsUsableBy, directionFor, locationVerdict } from "./scanRules";

const ORG = "org-1";
const KAPLONG = "wp-kaplong";
const NAIROBI = "wp-nairobi";

/* ── 1. The wrong-site loophole ───────────────────────────────────────── */

test("your own site's code works", () => {
  assert.equal(qrIsUsableBy(KAPLONG, KAPLONG, ORG, ORG), true);
});

test("another site's code does not — this was the loophole", () => {
  // Same business, different site. Before the fix this was accepted, so one
  // photographed QR unlocked every branch the owner had.
  assert.equal(qrIsUsableBy(NAIROBI, KAPLONG, ORG, ORG), false);
});

test("another business's code never works, assigned or not", () => {
  assert.equal(qrIsUsableBy(KAPLONG, KAPLONG, "other-org", ORG), false);
  assert.equal(qrIsUsableBy(null, KAPLONG, "other-org", ORG), false);
});

test("somebody with no assigned site may use any of their own org's", () => {
  // A relief driver or an owner covering a shift is a genuine floater.
  assert.equal(qrIsUsableBy(null, KAPLONG, ORG, ORG), true);
  assert.equal(qrIsUsableBy(null, NAIROBI, ORG, ORG), true);
});

/* ── 2. A check is not a clock-out ────────────────────────────────────── */

test("the first scan of the day is a clock-in", () => {
  assert.equal(directionFor(false, null), "in");
});

test("the next one is a clock-out", () => {
  assert.equal(directionFor(false, "in"), "out");
});

test("and after clocking out, back in", () => {
  assert.equal(directionFor(false, "out"), "in");
});

test("answering an open check is neither — this was the bug", () => {
  // Whatever the toggle would have said, an open check claims the scan.
  assert.equal(directionFor(true, "in"), "check", "it used to return 'out' and end the shift");
  assert.equal(directionFor(true, "out"), "check");
  assert.equal(directionFor(true, null), "check");
});

test("a check does not move where the toggle stands", () => {
  // The toggle reads past CLOCK scans only. So: clock in, answer a check,
  // then the next ordinary scan is still the clock-OUT it should be.
  assert.equal(directionFor(false, "in"), "out", "the check in between changed nothing");
});

/* ── 3. An answer that can always be given ────────────────────────────── */

test("inside the geofence confirms the location", () => {
  assert.equal(locationVerdict(true, true, true), true);
});

test("outside it is recorded as outside — not as a refusal to accept", () => {
  // The answer still counts; this only says the location did not back it up.
  assert.equal(locationVerdict(true, true, false), false);
});

test("nothing to judge by is null, never false", () => {
  // A workplace with no coordinates, or a phone that got no fix. Calling that
  // "outside the geofence" would accuse somebody on the strength of a missing
  // measurement.
  assert.equal(locationVerdict(false, true, false), null);
  assert.equal(locationVerdict(true, false, false), null);
  assert.equal(locationVerdict(false, false, true), null);
});
