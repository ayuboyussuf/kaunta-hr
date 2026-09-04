/**
 * Yesterday, in 160 characters.
 *
 * The constraint is the design. Africa's Talking bills per segment, an owner
 * with four sites gets one of these every morning, and 365 messages a year is
 * real money — so this fits in ONE GSM-7 segment or it does not go. Everything
 * below follows from that:
 *
 *   The link is reserved first. A digest trimmed to the character limit loses
 *   its URL, and the URL is the only part that leads anywhere.
 *
 *   Sites degrade rather than truncate. Two fit by name; past that it says how
 *   many need looking at, because "Ruiru 5/5, Juja 4/6, Thika 3/8, Ngong 2..."
 *   cut off mid-word is worse than a count.
 *
 *   A pending closure question outranks the statistics. If a whole site
 *   recorded nothing and penalties are being held pending an answer, that is
 *   the message; how many people were late somewhere else can wait for the
 *   link.
 *
 * ── Silence is a feature ──────────────────────────────────────────────────
 *
 * A message that says "all normal" every morning for three weeks trains its
 * reader to ignore it, and then it says something that matters and they ignore
 * that too. So a clean day sends nothing at all. This is the same rule the
 * attention queue follows by rendering nothing when it is empty.
 */
import { fitSegments, smsCost } from "../sms/gsm7";
import type { AttendanceReport } from "../reports/attendance";

export interface PendingClosure {
  siteName: string | null;
  rostered: number;
}

export interface DigestInput {
  report: AttendanceReport;
  /** Days where nobody clocked in and penalties are being held. */
  closures: PendingClosure[];
  /** "Tue 18 Aug" — already short, because the budget is 160. */
  dayLabel: string;
  /** Short by design: /r/260817 rather than /dashboard/reports?from=…&to=… */
  link: string;
}

export interface Digest {
  /** Null when there is nothing worth a message. */
  text: string | null;
  reason: "clean" | "exceptions" | "closure";
  segments: number;
}

/**
 * Is anything here worth waking somebody up for?
 *
 * Presence: a day where everybody turned up on time and answered their checks
 * is a day the owner does not need a text about. Absences, lateness, missed
 * checks and held closures are all worth one.
 */
function hasExceptions(r: AttendanceReport): boolean {
  return (
    r.totals.daysAbsent > 0 || r.totals.daysLate > 0 || r.totals.checksMissed > 0
  );
}

export function buildDailyDigest(input: DigestInput): Digest {
  const { report, closures, dayLabel, link } = input;
  const suffix = ` ${link}`;

  // A held closure is the most important thing that can be in this message:
  // penalties are suspended, staff are waiting, and it expires unanswered.
  if (closures.length > 0) {
    const people = closures.reduce((n, c) => n + c.rostered, 0);
    const where =
      closures.length === 1
        ? `at ${closures[0].siteName ?? "your site"}`
        : `at ${closures.length} sites`;
    const body =
      `Aproksi HR ${dayLabel}: nobody clocked in ${where} (${people} rostered). ` +
      `No penalties applied - say what happened:`;
    const text = fitSegments(body, suffix, 1);
    return { text, reason: "closure", segments: smsCost(text).segments };
  }

  if (!hasExceptions(report)) {
    return { text: null, reason: "clean", segments: 0 };
  }

  const t = report.totals;
  const headline =
    `Aproksi HR ${dayLabel}: ${t.daysPresent}/${t.headcount} in` +
    (t.daysLate > 0 ? `, ${t.daysLate} late` : "") +
    (t.daysAbsent > 0 ? `, ${t.daysAbsent} absent` : "") +
    (t.checksMissed > 0 ? `, ${t.checksMissed} missed check${t.checksMissed === 1 ? "" : "s"}` : "") +
    ".";

  const text = fitSegments(`${headline}${sitePart(report)}`, suffix, 1);
  return { text, reason: "exceptions", segments: smsCost(text).segments };
}

/**
 * Site detail, or an honest count when it will not fit.
 *
 * Only sites with something wrong are named — a site where everyone turned up
 * on time does not need its ratio printed in a message this tight.
 */
function sitePart(report: AttendanceReport): string {
  const troubled = report.sites.filter(
    (s) => s.daysAbsent > 0 || s.daysLate > 0 || s.checksMissed > 0
  );
  if (troubled.length === 0) return "";

  if (troubled.length <= 2) {
    return (
      " " +
      troubled
        .map((s) => `${s.name} ${s.daysPresent}/${s.headcount}`)
        .join(", ") +
      "."
    );
  }
  return ` ${troubled.length} sites need a look.`;
}
