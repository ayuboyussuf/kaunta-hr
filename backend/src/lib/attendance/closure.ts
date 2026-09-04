/**
 * "Nobody came in at Juja on Monday." What follows from that?
 *
 * Before this, the answer was: fine all six of them and send six text messages
 * saying so. That is the correct behaviour if six people independently chose
 * not to turn up, and the wrong behaviour in every other case — a public
 * holiday, a closure, a power cut, a network outage, a QR code that fell off
 * the wall. The sweep could not tell those apart because it never asked the
 * question at site level: it looked at one employee at a time, and one employee
 * with no scan really is just an absence.
 *
 * Seen per site, the same data reads completely differently. Six of six missing
 * is not six absences; it is one event. This module decides when a site-day is
 * that kind of event, so the sweep can hold rather than charge.
 *
 * Deterministic throughout. It counts scans against a roster and compares two
 * numbers. The one fact it cannot know — WHY the site was empty — is the one
 * thing it asks a person for.
 */

/** Below this many rostered people, an empty day is just absence. */
export const MIN_ROSTERED_FOR_REVIEW = 2;

export interface SiteDay {
  workplaceId: string | null;
  /** Active employees rostered to work that day at that site. */
  rostered: number;
  /** Distinct employees with at least one accepted scan. */
  scanned: number;
  /** Failed clock-in attempts the phones reported from that site that day. */
  failedAttempts: number;
}

export type ClosureVerdict =
  | { hold: false; reason: "site_worked" | "too_few_rostered" }
  | { hold: true; reason: "nobody_scanned"; likely: LikelyCause };

/**
 * What the numbers suggest — offered to the owner as a starting point for the
 * question, never as an answer. The distinction matters: `system_problem` and
 * `closed` lead to the same outcome for the employee (no penalty) but very
 * different follow-up for the owner, and guessing wrong wastes their morning.
 */
export type LikelyCause = "system_problem" | "closed";

/**
 * Should the absences for this site-day be held rather than raised?
 *
 * The threshold is deliberately absolute: ZERO scans, not "unusually few". A
 * partial day is genuinely ambiguous — five of six in could be one person
 * absent or one person covering a closure — and holding penalties on ambiguity
 * would mean an owner answering questions constantly, which is how a safety
 * feature gets switched off. One person absent among their working colleagues
 * is an absence, and the existing rules handle it.
 */
export function assessSiteDay(day: SiteDay): ClosureVerdict {
  if (day.scanned > 0) return { hold: false, reason: "site_worked" };
  if (day.rostered < MIN_ROSTERED_FOR_REVIEW) {
    return { hold: false, reason: "too_few_rostered" };
  }
  return {
    hold: true,
    reason: "nobody_scanned",
    // People standing at the gate failing to scan is not people staying home.
    // The phones already report these — see lib/attendance/attempts — so the
    // question can often answer itself before the owner reads it.
    likely: day.failedAttempts > 0 ? "system_problem" : "closed",
  };
}

/**
 * The question, in the words an owner would use.
 *
 * Assembled from the counts, never generated. It states what was observed and
 * asks the one thing the record cannot know, which is the whole division of
 * labour: the system counts, the person explains.
 */
export function closureQuestion(params: {
  siteName: string | null;
  dateLabel: string;
  rostered: number;
  failedAttempts: number;
}): string {
  const where = params.siteName ? `at ${params.siteName}` : "across the business";
  const base = `Nobody clocked in ${where} on ${params.dateLabel}, with ${params.rostered} rostered.`;

  if (params.failedAttempts > 0) {
    return (
      `${base} ${params.failedAttempts} clock-in attempt${params.failedAttempts === 1 ? "" : "s"} ` +
      `failed on the phones that day, so this may have been the app or the code rather than the staff. ` +
      `No penalties have been applied.`
    );
  }
  return `${base} No penalties have been applied. Was the site closed?`;
}

/**
 * How long an unanswered question waits before the held penalties are thrown
 * away for good.
 *
 * Seven days rather than "forever pending": an owner who has not answered in a
 * week is not going to, and leaving the question open leaves the staff not
 * knowing whether a charge is coming. Discarding is the safe direction — the
 * penalties can always be raised by hand if the owner really does believe
 * everybody stayed home.
 */
export const REVIEW_EXPIRY_DAYS = 7;

export function isExpired(createdAt: string, now: Date = new Date()): boolean {
  const age = now.getTime() - new Date(createdAt).getTime();
  return age > REVIEW_EXPIRY_DAYS * 86400000;
}
