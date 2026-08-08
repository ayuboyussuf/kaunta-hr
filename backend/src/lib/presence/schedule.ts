/**
 * When a random presence check should fire.
 *
 * The old rule was: fire once the elapsed fraction of the shift reaches k/N.
 * Two things were wrong with it, and both meant the feature quietly did not
 * work.
 *
 *   1. With N = 1 — the obvious first setting an owner picks — the fraction
 *      has to reach 1.0 before floor(1 × frac) is 1. That is the END of the
 *      shift. So a business asking for one check a day got one in the final
 *      five minutes as the person was leaving, or, if the tick fell wrong,
 *      none at all. It was reported as "no random checks in two days".
 *
 *   2. It was not random. With N = 2 the checks landed at exactly mid-shift
 *      and exactly the end, every day, for everyone. Staff learn that inside a
 *      week, and a check you can predict is a check you can arrange to pass
 *      from the wrong place.
 *
 * The times are now drawn from a seeded generator keyed on the employee, the
 * date and the cron secret. That gives three properties at once:
 *
 *   - Unpredictable to staff, because the secret is secret.
 *   - Stable, because the same day always produces the same times — so the
 *     scheduler can run every five minutes without reshuffling what it already
 *     decided, and no check is ever fired twice or silently moved.
 *   - Reproducible, because a check's timing can be explained afterwards from
 *     the same inputs, which matters when a missed one costs somebody money.
 *
 * Checks avoid the first tenth and the last fifth of a shift: one the moment
 * somebody clocks in proves nothing, and one as they are leaving is a trap
 * rather than a check.
 */
import crypto from "crypto";

/** Deterministic 0..1 generator seeded by a string. */
function seeded(seed: string): () => number {
  let h = crypto.createHash("sha256").update(seed).digest();
  let i = 0;
  return () => {
    if (i >= h.length - 4) {
      h = crypto.createHash("sha256").update(h).digest();
      i = 0;
    }
    const v = h.readUInt32BE(i);
    i += 4;
    return v / 0x1_0000_0000;
  };
}

export interface ScheduleInput {
  employeeId: string;
  /** Nairobi date, YYYY-MM-DD. Makes the times change day to day. */
  ymd: string;
  shiftStart: Date;
  shiftEnd: Date;
  /** Checks per shift. 0 disables. */
  count: number;
  /** Keeps the times unguessable. The cron secret is already secret. */
  salt: string;
}

/** How much of the shift is off-limits at each end. */
const HEAD = 0.1;
const TAIL = 0.2;
/** Two checks closer together than this are a nuisance, not a control. */
const MIN_GAP_MS = 45 * 60 * 1000;

/**
 * The times this employee's checks should fire today, ascending.
 *
 * Returns fewer than `count` when the shift is too short to space them out —
 * cramming four checks into a three-hour shift would be harassment, and the
 * honest answer is that the shift only has room for two.
 */
export function checkTimes(input: ScheduleInput): Date[] {
  const { shiftStart, shiftEnd, count } = input;
  if (count <= 0) return [];

  const total = shiftEnd.getTime() - shiftStart.getTime();
  if (total <= 0) return [];

  const from = shiftStart.getTime() + total * HEAD;
  const to = shiftEnd.getTime() - total * TAIL;
  const usable = to - from;
  if (usable <= 0) return [];

  const rand = seeded(`${input.salt}:${input.employeeId}:${input.ymd}`);

  // One slot per check, each randomised inside its own band. Banding stops all
  // the checks clustering in one hour the way independent draws sometimes do,
  // while keeping each individual time unguessable.
  const times: number[] = [];
  for (let k = 0; k < count; k++) {
    const bandStart = from + (usable * k) / count;
    const bandEnd = from + (usable * (k + 1)) / count;
    const at = bandStart + rand() * (bandEnd - bandStart);
    if (times.length > 0 && at - times[times.length - 1] < MIN_GAP_MS) continue;
    times.push(at);
  }

  return times.map((t) => new Date(Math.round(t)));
}

/**
 * The check that is due now: the earliest scheduled time that has passed and
 * has not been fired yet. Null when nothing is due.
 *
 * `firedCount` is how many have already gone out today, so a scheduler that
 * wakes late fires one and catches up gradually rather than firing three at
 * once — being behind is not a reason to bombard somebody.
 */
export function dueNow(times: Date[], now: Date, firedCount: number): Date | null {
  const next = times[firedCount];
  if (!next) return null;
  return next.getTime() <= now.getTime() ? next : null;
}

/**
 * How many checks may fire in a single tick, across everybody.
 *
 * In steady state this never binds: each employee's times are seeded
 * independently, so twenty people on one shift spread naturally across the day
 * and the worst five-minute tick holds two of them.
 *
 * It binds after a GAP — the service slept, a deploy restarted it, checks were
 * switched on mid-shift, or a crew clocked in hours after their slot. Then
 * every overdue check is due at once: nineteen of twenty on a single tick, in
 * one measurement of this.
 *
 * The cost is the least of it. Nineteen phones buzzing in the same minute tells
 * everyone in the building that a batch just went out — they can corroborate
 * each other, and a check the whole shift knows about is not a check. Draining
 * a backlog slowly keeps them looking like what they are meant to be: one
 * person, at an unremarkable moment.
 */
export const MAX_FIRES_PER_TICK = 3;

/**
 * Order candidates unpredictably but deterministically for this tick.
 *
 * Without it a capped backlog drains in whatever order the database returned,
 * which is stable — so the same few people would absorb every catch-up burst
 * and the ones at the end of the list would rarely be checked at all.
 */
export function shuffleForTick<T>(items: T[], tickSeed: string): T[] {
  const rand = seeded(tickSeed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Why nothing fired for this employee — so "is it working?" has an answer. */
export type SkipReason =
  | "no_shift"
  | "not_clocked_in"
  | "outside_shift"
  | "on_leave"
  | "already_pending"
  | "quota_met"
  | "none_due_yet";
