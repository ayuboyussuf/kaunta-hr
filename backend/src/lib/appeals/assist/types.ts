/**
 * What an appeal assist is allowed to say.
 *
 * The shape enforces the rule. There is no `verdict`, no `recommendation`, no
 * `confidence_it_is_true`, no score — because the moment one exists, an owner
 * with forty staff and ten minutes starts reading it instead of the findings,
 * and Aproksi has quietly begun deciding who gets paid.
 *
 * What it can say is: here is what the record shows, here is which parts point
 * which way, and here is what would settle it that we do not have.
 */

/** The three things people actually appeal with, plus the honest fourth. */
export type Claim = "system_not_working" | "sick" | "road_closed" | "unclear";

/**
 * Which way a finding points — relative to the EMPLOYEE'S claim, not to any
 * outcome. "Contradicts" means the record disagrees with what they said. It
 * does not mean uphold the penalty; people misremember mornings.
 */
export type Stance = "supports" | "contradicts" | "neutral" | "unverifiable";

export interface AssistFinding {
  kind: string;
  stance: Stance;
  /** One line, readable on a phone. */
  headline: string;
  /** The reasoning, in full sentences, with the numbers in it. */
  detail: string;
  /** The counts it was derived from. Shown, so the owner can go and check. */
  evidence: Record<string, string | number>;
  /** Which record this came from — "scan_attempts", "attendance_entries", … */
  source: string;
}

/** The one thing we can usefully ask for, when the record cannot answer it. */
export interface InfoAsk {
  code: "which_road" | "sick_note";
  /** Exactly what the employee will be asked. */
  question: string;
}

export interface AssistBrief {
  claim: Claim;
  confidence: "high" | "low";
  findings: AssistFinding[];
  /** Assembled from the findings by template. Never generated prose. */
  summary: string;
  /** What would settle this, that the record does not contain. */
  missing: string[];
  /** Null when the record already holds everything obtainable. */
  ask: InfoAsk | null;
}

/** Bump when the fact-finding changes in a way that would alter a brief. */
export const ASSIST_VERSION = "1.0.0";
