/**
 * "The road was blocked."
 *
 * The honest position, again first: there is **no reliable way to look up
 * whether a particular Nairobi road was closed at 07:40 last Tuesday.** Traffic
 * APIs report live conditions, not history. By the time an appeal is read the
 * jam has cleared and the API will say the road is fine, which is worse than
 * no answer — it looks like a check and it disproves nothing.
 *
 * But there is a check nobody thinks of, it costs nothing, and it is far better
 * evidence than any map: **the colleagues who travel the same way.** If four
 * other people at that site were also late that morning when they normally are
 * not, something happened on the road. If everyone else arrived on time, that
 * is worth the employer knowing too. This is Aproksi's own data answering a
 * question about the outside world, and it is the reason this agent needs
 * nothing external at all.
 *
 * The one thing worth asking the employee is WHICH road, because that is what
 * makes the answer checkable by a human who knows the area — and because an
 * employer reading "Ngong Road at Prestige" can confirm or dismiss it in a
 * second from their own knowledge of that morning.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistFinding, AssistBrief } from "./types";
import { claimHistory, type PenaltyFacts } from "./facts";
import { summarise } from "./summary";
import { nairobiDate } from "../../time";
import type { Trace } from "../../observability/log";

/**
 * How many colleagues at the same site were late on the same morning, against
 * how often that site runs late normally.
 *
 * The baseline is what makes it evidence rather than an anecdote: a site where
 * three people are late every day tells you nothing when three people are late
 * today.
 */
async function lateTogether(
  db: SupabaseClient,
  workplaceId: string,
  employeeId: string,
  onDate: string
): Promise<{
  lateOthersToday: number;
  othersScannedToday: number;
  typicalLatePerDay: number;
  baselineDays: number;
}> {
  const dayStart = new Date(`${onDate}T00:00:00+03:00`).toISOString();
  const dayEnd = new Date(`${onDate}T23:59:59+03:00`).toISOString();
  const baselineFrom = new Date(new Date(dayStart).getTime() - 28 * 864e5).toISOString();

  const [{ data: today }, { data: baseline }] = await Promise.all([
    db
      .from("attendance_entries")
      .select("employee_id, status, direction")
      .eq("workplace_id", workplaceId)
      .eq("direction", "in")
      .gte("scanned_at", dayStart)
      .lte("scanned_at", dayEnd)
      .limit(300),
    db
      .from("attendance_entries")
      .select("employee_id, status, direction, scanned_at")
      .eq("workplace_id", workplaceId)
      .eq("direction", "in")
      .gte("scanned_at", baselineFrom)
      .lt("scanned_at", dayStart)
      .limit(2000),
  ]);

  const othersToday = (today ?? []).filter((e) => e.employee_id !== employeeId);
  const lateOthersToday = new Set(
    othersToday.filter((e) => e.status === "late").map((e) => e.employee_id as string)
  ).size;

  // Average distinct late people per day over the four weeks before, excluding
  // the appellant, so their own record does not set their own baseline.
  const byDay = new Map<string, Set<string>>();
  const daysSeen = new Set<string>();
  for (const e of baseline ?? []) {
    if (e.employee_id === employeeId) continue;
    const d = nairobiDate(e.scanned_at as string);
    daysSeen.add(d);
    if (e.status !== "late") continue;
    byDay.set(d, (byDay.get(d) ?? new Set()).add(e.employee_id as string));
  }
  const baselineDays = daysSeen.size;
  const totalLate = [...byDay.values()].reduce((s, set) => s + set.size, 0);

  return {
    lateOthersToday,
    othersScannedToday: new Set(othersToday.map((e) => e.employee_id as string)).size,
    typicalLatePerDay: baselineDays === 0 ? 0 : Number((totalLate / baselineDays).toFixed(2)),
    baselineDays,
  };
}

export async function assessRoadClosed(
  db: SupabaseClient,
  facts: PenaltyFacts,
  appealId: string,
  confidence: "high" | "low",
  trace: Trace,
  provided?: { answered: boolean; declined: boolean; answer: string | null }
): Promise<AssistBrief> {
  const findings: AssistFinding[] = [];
  const missing: string[] = [];

  findings.push({
    kind: "penalty",
    stance: "neutral",
    headline:
      facts.lateByMin != null && facts.expectedStart
        ? `Clocked in at ${facts.scannedAtLocal}, ${facts.lateByMin} minutes past the ${facts.expectedStart} start plus ${facts.graceMinutes ?? 0} minutes' grace`
        : `${facts.reason} raised on ${facts.onDate ?? facts.createdAt.slice(0, 10)}`,
    detail: "They came in — this is about how late.",
    evidence: {
      amount_kes: facts.amount,
      ...(facts.lateByMin != null ? { late_by_min: facts.lateByMin } : {}),
      raised_by: facts.raisedBy,
    },
    source: "violations",
  });

  /* ── Did the same morning happen to anybody else? ─────────────────── */

  if (facts.workplaceId && facts.onDate) {
    trace.step("tool:late_together");
    const t = await lateTogether(db, facts.workplaceId, facts.employeeId, facts.onDate);
    trace.step("tool:late_together:result", {
      late_others: t.lateOthersToday,
      typical: t.typicalLatePerDay,
    });

    if (t.othersScannedToday === 0) {
      findings.push({
        kind: "no_colleagues",
        stance: "unverifiable",
        headline: "Nobody else clocked in at this site that day to compare against",
        detail: "A shared delay normally shows up as several people late at once. There is nobody to see it in.",
        evidence: { others_scanned: 0 },
        source: "attendance_entries",
      });
      missing.push("Another person travelling to the same site that morning — there was nobody.");
    } else if (t.lateOthersToday === 0) {
      findings.push({
        kind: "alone_in_lateness",
        stance: "contradicts",
        headline: `Nobody else at ${facts.workplaceName ?? "this site"} was late that morning`,
        detail: `${t.othersScannedToday} other ${t.othersScannedToday === 1 ? "person" : "people"} clocked in on time. A road that blocks one person's route need not block anyone else's — but a general closure usually delays more than one.`,
        evidence: {
          late_others_today: 0,
          others_scanned_today: t.othersScannedToday,
          typical_late_per_day: t.typicalLatePerDay,
        },
        source: "attendance_entries",
      });
    } else if (t.lateOthersToday > t.typicalLatePerDay) {
      findings.push({
        kind: "shared_delay",
        stance: "supports",
        headline: `${t.lateOthersToday} other ${t.lateOthersToday === 1 ? "person was" : "people were"} also late that morning`,
        detail:
          `This site averages ${t.typicalLatePerDay} late arrival(s) a day over the previous ${t.baselineDays} working day(s), so that morning ran against the pattern. ` +
          "Something delayed more than one person's journey.",
        evidence: {
          late_others_today: t.lateOthersToday,
          typical_late_per_day: t.typicalLatePerDay,
          baseline_days: t.baselineDays,
        },
        source: "attendance_entries",
      });
    } else {
      findings.push({
        kind: "usual_lateness",
        stance: "neutral",
        headline: `${t.lateOthersToday} other(s) were late, which is normal for this site`,
        detail: `The four-week average is ${t.typicalLatePerDay} a day, so that morning was not unusual either way.`,
        evidence: {
          late_others_today: t.lateOthersToday,
          typical_late_per_day: t.typicalLatePerDay,
          baseline_days: t.baselineDays,
        },
        source: "attendance_entries",
      });
    }
  }

  /* ── Which road ───────────────────────────────────────────────────── */

  findings.push({
    kind: "verification_limit",
    stance: "unverifiable",
    headline: "Whether a road was closed at a past moment cannot be looked up",
    detail:
      "Traffic services report conditions now, not last Tuesday at 07:40 — by the time an appeal is read they would say the road is clear, which would disprove nothing while looking like a check. What can be checked is whether other people were delayed too, above.",
    evidence: { checkable: "no" },
    source: "—",
  });

  let ask: AssistBrief["ask"] = null;
  if (!provided?.answered) {
    ask = {
      code: "which_road",
      question: "Which road or junction was blocked, and roughly when?",
    };
    missing.push("Which road it was — asked, not yet answered.");
  } else if (provided.declined) {
    findings.push({
      kind: "road_not_named",
      stance: "neutral",
      headline: "They did not name a road",
      detail: "Recorded as their answer. It is not evidence either way, but a named road is something you could recognise.",
      evidence: { asked: "yes", named: "no" },
      source: "appeal_info_requests",
    });
  } else if (provided.answer) {
    findings.push({
      kind: "road_named",
      stance: "neutral",
      headline: "They named the road",
      detail:
        `They said: “${provided.answer}”. Aproksi has not checked this and cannot. You will know that road and that morning better than any system does.`,
      evidence: { asked: "yes", named: "yes" },
      source: "appeal_info_requests",
    });
  }

  trace.step("tool:claim_history");
  const history = await claimHistory(db, facts.employeeId, "road_closed", appealId);
  if (history.appealsInNinetyDays > 0) {
    findings.push({
      kind: "history",
      stance: "neutral",
      headline: `${history.appealsInNinetyDays} other appeal(s) from this person in the last 90 days`,
      detail:
        `${history.waived} waived, ${history.upheld} upheld, ${history.pending} still open` +
        (history.sameClaimBefore > 0
          ? `. ${history.sameClaimBefore} also blamed traffic — worth noting that a bad commute is usually a permanent feature of a route, not a one-off.`
          : ".") +
        " Shown because a pattern is worth seeing, not as evidence about this day.",
      evidence: {
        appeals_90d: history.appealsInNinetyDays,
        waived: history.waived,
        upheld: history.upheld,
        same_claim: history.sameClaimBefore,
      },
      source: "appeals",
    });
  }

  return {
    claim: "road_closed",
    confidence,
    findings,
    summary: summarise("road_closed", facts, findings),
    missing,
    ask,
  };
}
