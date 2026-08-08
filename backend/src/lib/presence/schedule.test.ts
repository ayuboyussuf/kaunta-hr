/**
 * Why the random checks never arrived.
 *
 * The first test is the bug as reported: a business asking for one check a day
 * got none. Under the old rule the check needed the elapsed shift fraction to
 * reach 1.0 before floor(1 × frac) became 1 — i.e. the end of the shift — so
 * either it fired as the person walked out, or the five-minute tick missed the
 * moment entirely and it never fired at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { checkTimes, dueNow, shuffleForTick, MAX_FIRES_PER_TICK } from "./schedule";

const DAY = "2026-08-05";
const start = new Date("2026-08-05T05:00:00.000Z"); // 08:00 Nairobi
const end = new Date("2026-08-05T14:00:00.000Z"); //  17:00 Nairobi
const base = { employeeId: "emp-1", ymd: DAY, shiftStart: start, shiftEnd: end, salt: "s3cret" };

const hoursIn = (h: number) => new Date(start.getTime() + h * 3600_000);

test("one check a day actually fires, and not as they are leaving", () => {
  const times = checkTimes({ ...base, count: 1 });
  assert.equal(times.length, 1, "the bug: this used to be unreachable until the shift ended");

  const t = times[0];
  assert.ok(t > start, "not before the shift");
  assert.ok(t < end, "and not at the very end");

  // Comfortably inside the working day, not in the last handful of minutes.
  const fractionThrough = (t.getTime() - start.getTime()) / (end.getTime() - start.getTime());
  assert.ok(fractionThrough > 0.05 && fractionThrough < 0.85, `fired at ${fractionThrough}`);
});

test("checks avoid the first and last of the shift", () => {
  for (let n = 1; n <= 4; n++) {
    for (const t of checkTimes({ ...base, count: n })) {
      const f = (t.getTime() - start.getTime()) / (end.getTime() - start.getTime());
      assert.ok(f >= 0.1, "a check the moment somebody clocks in proves nothing");
      assert.ok(f <= 0.8, "a check as they leave is a trap, not a control");
    }
  }
});

test("the same day always produces the same times", () => {
  // The scheduler wakes every five minutes. If the times moved on each tick it
  // would fire constantly, or never — and a check could never be explained
  // after the fact.
  const a = checkTimes({ ...base, count: 3 });
  const b = checkTimes({ ...base, count: 3 });
  assert.deepEqual(a.map(Number), b.map(Number));
});

test("but they move from day to day, and differ between people", () => {
  const monday = checkTimes({ ...base, count: 2 });
  const tuesday = checkTimes({ ...base, ymd: "2026-08-06", count: 2 });
  assert.notDeepEqual(monday.map(Number), tuesday.map(Number), "otherwise staff learn the time");

  const other = checkTimes({ ...base, employeeId: "emp-2", count: 2 });
  assert.notDeepEqual(
    monday.map(Number),
    other.map(Number),
    "and otherwise one person warns the next"
  );
});

test("the times are unguessable without the secret", () => {
  const withSalt = checkTimes({ ...base, count: 2 });
  const guessed = checkTimes({ ...base, salt: "wrong-guess", count: 2 });
  assert.notDeepEqual(withSalt.map(Number), guessed.map(Number));
});

test("checks come in order and are never bunched together", () => {
  const times = checkTimes({ ...base, count: 3 });
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] > times[i - 1], "ascending");
    assert.ok(
      times[i].getTime() - times[i - 1].getTime() >= 45 * 60_000,
      "two checks 10 minutes apart is harassment, not a control"
    );
  }
});

test("a short shift gets fewer checks rather than a barrage", () => {
  const shortEnd = new Date(start.getTime() + 3 * 3600_000);
  const times = checkTimes({ ...base, shiftEnd: shortEnd, count: 4 });
  assert.ok(times.length < 4, "three hours has no room for four spaced checks");
  assert.ok(times.length >= 1, "but it still gets one");
});

test("zero means off, and a broken shift produces nothing", () => {
  assert.deepEqual(checkTimes({ ...base, count: 0 }), []);
  assert.deepEqual(checkTimes({ ...base, shiftEnd: start, count: 2 }), []);
  assert.deepEqual(checkTimes({ ...base, shiftEnd: hoursIn(-1), count: 2 }), []);
});

/* ── Firing ───────────────────────────────────────────────────────────── */

test("nothing is due before its time, and one is due after", () => {
  const times = [hoursIn(2), hoursIn(5)];
  assert.equal(dueNow(times, hoursIn(1), 0), null);
  assert.deepEqual(dueNow(times, hoursIn(3), 0), times[0]);
});

test("a scheduler that wakes late fires one, not the whole backlog", () => {
  const times = [hoursIn(2), hoursIn(5)];
  // Woken at hour 6 having fired nothing: both are overdue.
  assert.deepEqual(dueNow(times, hoursIn(6), 0), times[0], "the first, alone");
  // Next tick, one already fired.
  assert.deepEqual(dueNow(times, hoursIn(6), 1), times[1]);
  // Quota met.
  assert.equal(dueNow(times, hoursIn(6), 2), null);
});

test("the day's quota is never exceeded", () => {
  const times = checkTimes({ ...base, count: 2 });
  assert.equal(dueNow(times, end, times.length), null);
  assert.equal(dueNow(times, end, 99), null);
});

/* ── The catch-up burst ───────────────────────────────────────────────── */

test("a backlog does not go out as one batch", () => {
  // The service slept, or checks were switched on mid-shift. Every overdue
  // check is due at once — measured at 19 of 20 before the cap existed.
  const wake = hoursIn(7);
  const due = Array.from({ length: 20 }, (_, i) =>
    checkTimes({ ...base, employeeId: `emp-${i}`, count: 1 })
  ).filter((times) => dueNow(times, wake, 0)).length;

  assert.ok(due > 10, "the burst is real, not hypothetical");
  assert.ok(
    MAX_FIRES_PER_TICK < due,
    "so the cap has to be lower than the burst or it does nothing"
  );
  assert.ok(MAX_FIRES_PER_TICK >= 1, "but never zero, or nothing ever fires");
});

test("in steady state the cap never binds", () => {
  // Each employee is seeded independently, so twenty people on one shift
  // spread across the day on their own.
  const times = Array.from({ length: 20 }, (_, i) =>
    checkTimes({ ...base, employeeId: `emp-${i}`, count: 1 })[0]
  );
  const perTick = new Map<number, number>();
  for (const t of times) {
    const tick = Math.floor((t.getTime() - start.getTime()) / (5 * 60_000));
    perTick.set(tick, (perTick.get(tick) ?? 0) + 1);
  }
  assert.ok(
    Math.max(...perTick.values()) <= MAX_FIRES_PER_TICK,
    "a normal day should never hit the cap"
  );
});

test("the drain order changes between ticks", () => {
  const people = Array.from({ length: 12 }, (_, i) => `emp-${i}`);
  const first = shuffleForTick(people, "salt:2026-08-05T09:00");
  const second = shuffleForTick(people, "salt:2026-08-05T09:05");

  assert.notDeepEqual(first, second, "otherwise the same few absorb every burst");
  assert.deepEqual([...first].sort(), [...people].sort(), "and nobody is dropped");
  assert.deepEqual(
    shuffleForTick(people, "salt:2026-08-05T09:00"),
    first,
    "stable within a tick, so two instances agree"
  );
});
