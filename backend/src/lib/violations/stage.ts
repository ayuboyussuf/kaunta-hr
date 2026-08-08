/**
 * What stage a penalty is at, worked out from the clock.
 *
 * The bug this exists to kill: the UI read `status` alone. `status` only
 * changes when the close-appeals sweep runs — and that sweep was configured as
 * a Render cron service, which never fired at all. So a penalty whose appeal
 * window had closed weeks ago still sat at `open`, the employee still saw an
 * "Appeal" button that the server would reject, and the owner saw a dash where
 * an outcome should be with nothing to download.
 *
 * That is not a cosmetic problem. A penalty stuck at `open` forever is one that
 * never locks, never reaches a payslip and never produces a document — which is
 * a free pass for anyone who notices, and confusion for everyone who doesn't.
 *
 * So the stage is DERIVED. The deadline is a timestamp; whether it has passed
 * is arithmetic, not a job. The sweep still does the real work — locking the
 * row, generating the document, notifying — but nothing user-facing waits on it
 * to tell the truth. If the sweep is down for a day, the screens stay honest
 * and the paperwork catches up.
 */

export type Stage =
  /** Inside the window, nobody has appealed. Action available to the employee. */
  | "open"
  /** Appealed, waiting on the owner. */
  | "appealed"
  /** Window passed with no appeal. Stands. Paperwork may still be catching up. */
  | "closed_no_appeal"
  /** Decided and locked. Final, with a document. */
  | "settled";

export interface StageInput {
  status: string;
  appeal_window_end: string | null;
  hasAppeal: boolean;
  /** Set once the sweep or an owner decision has locked it. */
  outcome?: string | null;
}

export function stageOf(v: StageInput, now: number = Date.now()): Stage {
  if (v.status === "locked") return "settled";
  if (v.status === "appealed" || v.hasAppeal) return "appealed";

  const closesAt = v.appeal_window_end ? new Date(v.appeal_window_end).getTime() : null;
  if (closesAt != null && closesAt <= now) return "closed_no_appeal";
  return "open";
}

/** Whether an appeal would actually be accepted right now. */
export function canAppeal(v: StageInput, now: number = Date.now()): boolean {
  return stageOf(v, now) === "open";
}

/**
 * How this reads to a person. Deliberately not "open"/"locked" — those are our
 * words for our rows, and neither tells an employee whether they still have a
 * decision to make.
 */
export const STAGE_LABEL: Record<Stage, string> = {
  open: "You can appeal this",
  appealed: "Appealed — with your employer",
  closed_no_appeal: "Closed — not appealed in time",
  settled: "Closed — decided",
};

export const STAGE_LABEL_OWNER: Record<Stage, string> = {
  open: "Appeal window open",
  appealed: "Waiting on your decision",
  closed_no_appeal: "Closed — window elapsed, not appealed",
  settled: "Closed — decided",
};

/** Milliseconds left to appeal; null when the question no longer applies. */
export function msLeft(v: StageInput, now: number = Date.now()): number | null {
  if (stageOf(v, now) !== "open" || !v.appeal_window_end) return null;
  return Math.max(0, new Date(v.appeal_window_end).getTime() - now);
}
