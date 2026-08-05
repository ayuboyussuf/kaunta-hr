/**
 * The evidence behind "the system wasn't working".
 *
 * These numbers are what an owner will be shown when someone appeals a
 * lateness penalty on those grounds. If they are wrong, the owner either fines
 * somebody the app locked out or waives a penalty that was earned — so the
 * counting is worth pinning down.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../test/fakeDb";
import {
  attemptsByEmployee,
  recordClientAttempt,
  recordServerAttempt,
  siteHealthAround,
  OUTCOME_LABEL,
} from "./attempts";

const ORG = "org-1";
const EMP = "emp-1";
const WP = "wp-1";
const FROM = "2026-08-05T04:30:00.000Z";
const TO = "2026-08-05T06:00:00.000Z";

test("a server rejection is recorded as something we witnessed", async () => {
  const db = fakeDb({ scan_attempts: [] });
  await recordServerAttempt(db as never, "rotated_qr", { orgId: ORG, employeeId: EMP, workplaceId: WP }, "old print");

  const row = db.tables.scan_attempts[0];
  assert.equal(row.source, "server");
  assert.equal(row.outcome, "rotated_qr");
  assert.equal(row.detail, "old print");
});

test("a device report is recorded as a claim, with no detail from the device", async () => {
  const db = fakeDb({ scan_attempts: [] });
  await recordClientAttempt(db as never, "network_error", { orgId: ORG, employeeId: EMP });

  const row = db.tables.scan_attempts[0];
  assert.equal(row.source, "client", "what the phone says is not what we saw");
  assert.equal(row.detail, null, "no free text may come from the device");
});

test("logging never throws — a broken log must not cost a clock-in", async () => {
  const exploding = {
    from() {
      throw new Error("database is on fire");
    },
  };
  await recordServerAttempt(exploding as never, "server_error", { orgId: ORG });
  // Reaching here without an exception is the assertion.
  assert.ok(true);
});

test("an employee's attempts come back in the order they happened", async () => {
  const db = fakeDb({
    scan_attempts: [
      { id: "a2", employee_id: EMP, occurred_at: "2026-08-05T05:02:00.000Z", source: "client", outcome: "network_error" },
      { id: "a1", employee_id: EMP, occurred_at: "2026-08-05T04:58:00.000Z", source: "client", outcome: "network_error" },
      { id: "b1", employee_id: "other", occurred_at: "2026-08-05T05:00:00.000Z", source: "client", outcome: "network_error" },
      { id: "a0", employee_id: EMP, occurred_at: "2026-08-04T05:00:00.000Z", source: "client", outcome: "network_error" },
    ],
  });

  const out = await attemptsByEmployee(db as never, EMP, FROM, TO);
  assert.deepEqual(
    out.map((a) => a.id),
    ["a1", "a2"],
    "someone else's attempts, and yesterday's, are not this appeal"
  );
});

test("site health separates 'nobody could scan' from 'only you couldn't'", async () => {
  const db = fakeDb({
    attendance_entries: [
      { employee_id: "colleague-1", workplace_id: WP, scanned_at: "2026-08-05T04:55:00.000Z" },
      { employee_id: "colleague-2", workplace_id: WP, scanned_at: "2026-08-05T05:01:00.000Z" },
      { employee_id: "colleague-2", workplace_id: WP, scanned_at: "2026-08-05T05:40:00.000Z" },
      { employee_id: EMP, workplace_id: WP, scanned_at: "2026-08-05T05:45:00.000Z" },
      { employee_id: "colleague-3", workplace_id: "other-site", scanned_at: "2026-08-05T05:00:00.000Z" },
    ],
    scan_attempts: [
      { employee_id: EMP, workplace_id: WP, source: "client", outcome: "network_error", occurred_at: "2026-08-05T04:58:00.000Z" },
      { employee_id: "colleague-1", workplace_id: WP, source: "server", outcome: "server_error", occurred_at: "2026-08-05T04:52:00.000Z" },
    ],
  });

  const h = await siteHealthAround(db as never, WP, FROM, TO, EMP);
  assert.equal(h.successful_scans_by_others, 3, "the appellant's own scan is not corroboration");
  assert.equal(h.distinct_others_who_scanned, 2, "three scans, two people");
  assert.equal(h.failed_attempts_by_others, 1, "and their own failures aren't either");
  assert.equal(h.server_side_failures, 1);
});

test("a site where nothing worked reports nothing working", async () => {
  const db = fakeDb({ attendance_entries: [], scan_attempts: [] });
  const h = await siteHealthAround(db as never, WP, FROM, TO, EMP);
  assert.equal(h.successful_scans_by_others, 0);
  assert.equal(h.distinct_others_who_scanned, 0);
});

test("every outcome has words an owner can read", () => {
  for (const [code, label] of Object.entries(OUTCOME_LABEL)) {
    assert.ok(label.length > 10, `${code} needs a plain-English label`);
    assert.ok(!label.includes("_"), `${code}'s label still reads like a code`);
  }
});
