/**
 * What a presence check actually says, and how often it can say it.
 *
 * The message it replaced was:
 *
 *     "Aproksi HR: please open the app and scan within 10 minutes to confirm
 *      you're at work."
 *
 * — no site, no deadline, no link, and 85 of the 160 characters available. A
 * staff member on two sites this week could not tell which one it meant, and
 * "within 10 minutes" is measured from a moment they never saw.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { checkMessage, tooSoon, CHECK_COOLDOWN_MS } from "./notify";
import { smsCost } from "../sms/gsm7";

// 12:45 UTC is 15:45 in Nairobi.
const RESPOND_BY = "2026-08-18T12:45:00.000Z";

test("it names the site, the deadline and where to go", () => {
  const m = checkMessage({ siteName: "Ruiru Station", respondBy: RESPOND_BY });

  assert.match(m, /Ruiru Station/, "which site");
  assert.match(m, /15:45/, "a real deadline, not a duration measured from a moment they missed");
  assert.match(m, /me\/clock-in/, "and a way to get there from the message they are reading");
});

test("without a site it does not point at a place it never named", () => {
  const m = checkMessage({ siteName: null, respondBy: RESPOND_BY });
  assert.doesNotMatch(m, /there/, "'the code there' means nothing when there is no there");
  assert.match(m, /your site's QR code/);
});

test("it stays inside one segment, even with a long site name", () => {
  for (const name of [
    null,
    "Juja",
    "Ruiru Kenyatta Highway Service Station",
    "Nairobi Industrial Area Depot and Yard Number Four",
  ]) {
    const m = checkMessage({ siteName: name, respondBy: RESPOND_BY });
    const c = smsCost(m);
    assert.equal(c.segments, 1, `${name}: ${c.units} units — ${m}`);
    assert.equal(c.encoding, "GSM-7");
  }
});

test("a very long site name costs the sentence, never the link", () => {
  // The link is the only part that leads anywhere; trimming it would leave a
  // message that reports an obligation and offers no way to meet it.
  const m = checkMessage({
    siteName: "A".repeat(140),
    respondBy: RESPOND_BY,
  });
  assert.match(m, /me\/clock-in$/);
  assert.equal(smsCost(m).segments, 1);
});

/* ── The cooldown ─────────────────────────────────────────────────────── */

test("two checks cannot land on top of each other", () => {
  // Production sent two identical texts minutes apart. The 45-minute spacing in
  // checkTimes only ever applied to DRAWN times, and an owner-requested check
  // does not count toward the drawn quota — so the schedule could fire right
  // after one.
  const now = new Date("2026-08-18T12:00:00.000Z");
  const twoMinutesAgo = new Date(now.getTime() - 2 * 60_000);

  assert.equal(tooSoon(twoMinutesAgo, now), true);
});

test("after the cooldown another check is allowed", () => {
  const now = new Date("2026-08-18T12:00:00.000Z");
  const longAgo = new Date(now.getTime() - CHECK_COOLDOWN_MS - 1000);
  assert.equal(tooSoon(longAgo, now), false);
});

test("the first check of a shift has nothing to be too close to", () => {
  assert.equal(tooSoon(null, new Date()), false);
});
