/**
 * The scrubber, tried on things that would actually leak.
 *
 * These are not tidy inputs. They are the shapes real text takes — a phone
 * number typed four different ways, an amount with no currency marker, a name
 * inside a sentence, a selfie pasted into a payload. Anything that gets past
 * this file gets written to disk and stays there.
 *
 * The last test is the one that matters most: it asserts that no raw value
 * survives, rather than asserting that a particular pattern was matched. A
 * scrubber tested only on the cases it was written for will always pass.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { scrub, scrubText, employeeRef, REDACTED } from "./scrub";

const GRACE = "8f2c1d4e-0a3b-4c5d-9e6f-7a8b9c0d1e2f";
const OTIENO = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const ctx = {
  subjects: [
    { id: GRACE, name: "Grace Wanjiru", phone: "+254796411540" },
    { id: OTIENO, name: "Otieno Odhiambo", phone: "0712345678" },
  ],
};

/* ── Names ────────────────────────────────────────────────────────────── */

test("a name becomes a reference, and the sentence still reads", () => {
  const out = scrubText("Why was Grace Wanjiru docked on the 4th?", ctx);
  assert.equal(out, `Why was ${employeeRef(GRACE)} docked on the 4th?`);
});

test("a first name on its own is still a name", () => {
  assert.match(scrubText("Grace says the QR would not scan", ctx), /^\[employee_ref:/);
});

test("names are matched whatever the casing", () => {
  const out = scrubText("GRACE and otieno both appealed", ctx);
  assert.ok(!/grace/i.test(out));
  assert.ok(!/otieno/i.test(out));
});

test("two people stay distinguishable — the log is useless if they merge", () => {
  const out = scrubText("Grace covered for Otieno", ctx);
  assert.ok(out.includes(employeeRef(GRACE)));
  assert.ok(out.includes(employeeRef(OTIENO)));
  assert.notEqual(employeeRef(GRACE), employeeRef(OTIENO));
});

/* ── Phone numbers ────────────────────────────────────────────────────── */

test("a phone number is redacted however it was typed", () => {
  for (const form of [
    "+254796411540",
    "254796411540",
    "0796411540",
    "0796 411 540",
    "+254 796 411 540",
    "0796-411-540",
  ]) {
    const out = scrubText(`call ${form} about the shift`, ctx);
    assert.ok(!out.includes("411540"), `${form} survived as ${out}`);
    assert.ok(!out.includes("796411"), `${form} survived as ${out}`);
  }
});

test("a phone number nobody on the roster owns is still a phone number", () => {
  const out = scrubText("the number given was 0722000111", {});
  assert.ok(out.includes(REDACTED.phone));
  assert.ok(!out.includes("0722000111"));
});

/* ── Money ────────────────────────────────────────────────────────────── */

test("amounts go, in every form they get written", () => {
  for (const form of ["KES 200", "KES200", "Ksh 1,250.50", "1,200/=", "200 shillings", "3000 bob"]) {
    const out = scrubText(`docked ${form} for lateness`, {});
    assert.ok(out.includes(REDACTED.amount), `${form} survived as ${out}`);
  }
});

test("a bare number that is not money keeps its meaning", () => {
  const out = scrubText("clocked in 20 minutes after the grace period", {});
  assert.ok(out.includes("20 minutes"), "lateness is the structure, not the secret");
});

/* ── Identity documents, mail, faces ──────────────────────────────────── */

test("an ID-length digit run does not survive", () => {
  const out = scrubText("ID 23456789 was presented", {});
  assert.ok(out.includes(REDACTED.id));
  assert.ok(!out.includes("23456789"));
});

test("an email address does not survive", () => {
  const out = scrubText("sent to owner@example.co.ke last night", {});
  assert.ok(out.includes(REDACTED.email));
  assert.ok(!out.includes("example.co.ke"));
});

test("an inline selfie does not survive", () => {
  const selfie = `data:image/jpeg;base64,${"QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=".repeat(6)}`;
  const out = scrubText(`selfie was ${selfie}`, {});
  assert.ok(out.includes(REDACTED.image));
  assert.ok(out.length < 120, "no image bytes may remain");
});

/* ── Structured payloads ──────────────────────────────────────────────── */

test("a field is redacted for what it holds, not for how it looks", () => {
  const out = scrub(
    { employee_id: GRACE, name: "Grace Wanjiru", amount: 200, base_salary: 45000, phone: "+254796411540" },
    ctx
  );
  assert.equal(out.employee_id, employeeRef(GRACE), "the reference survives — that is the point");
  assert.equal(out.name, REDACTED.name);
  assert.equal(out.amount, REDACTED.amount, "200 has no shape; only the key says it is money");
  assert.equal(out.base_salary, REDACTED.amount);
  assert.equal(out.phone, REDACTED.phone);
});

test("nesting does not hide anything", () => {
  const out = scrub(
    {
      question: "why was Grace Wanjiru docked KES 200",
      context: { employee: { id: GRACE, pay: { net: 38200 } }, notes: ["called +254796411540"] },
    },
    ctx
  );
  const flat = JSON.stringify(out);
  assert.ok(!flat.includes("Grace"));
  assert.ok(!flat.includes("38200"));
  assert.ok(!flat.includes("796411540"));
});

test("structure is preserved — a scrubbed log is still a readable question", () => {
  const out = scrubText("why was Grace Wanjiru docked KES 200 on 2026-08-04", ctx);
  assert.match(out, /^why was \[employee_ref:[0-9a-f-]+\] docked \[amount_redacted\] on 2026-08-04$/);
});

test("scrubbing twice changes nothing", () => {
  const once = scrubText("Grace was docked KES 200, call +254796411540", ctx);
  assert.equal(scrubText(once, ctx), once, "tokens must not be eaten by a second pass");
});

test("a uuid inside a reference is not mistaken for an ID number", () => {
  const out = scrubText(`ref ${GRACE} raised it`, ctx);
  assert.ok(out.includes(employeeRef(GRACE)));
  assert.ok(!out.includes(REDACTED.id), "the reference must come back whole");
});

/* ── The one that matters ─────────────────────────────────────────────── */

test("no raw sensitive value survives a realistic payload", () => {
  const payload = {
    turn: 3,
    tool: "explain_deduction",
    prompt:
      "Grace Wanjiru (0796411540) says she was docked KES 200 unfairly on 2026-08-04. " +
      "Her ID is 23456789 and her net pay was 38,200 shillings.",
    args: { employee_id: GRACE, amount: 200, employee_name: "Grace Wanjiru" },
    selfie: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    result: { upheld: false, base_salary: 45000, phone: "+254796411540" },
  };

  const flat = JSON.stringify(scrub(payload, ctx));

  for (const secret of [
    "Grace",
    "Wanjiru",
    "0796411540",
    "796411540",
    "23456789",
    "38,200",
    "45000",
    "iVBORw0KGgo",
  ]) {
    assert.ok(!flat.includes(secret), `"${secret}" survived into: ${flat}`);
  }

  // …and the shape of the event is still there to debug with.
  assert.ok(flat.includes("explain_deduction"));
  assert.ok(flat.includes("2026-08-04"));
  assert.ok(flat.includes(GRACE), "the reference must remain joinable under access control");
});
