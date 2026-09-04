/**
 * Four people appealing the same morning is one incident with four witnesses.
 *
 * Every brief until now was computed in isolation, which meant the single most
 * telling fact available was invisible: that other people at the same site, on
 * the same day, are saying the same thing. `lateTogether` already counted
 * whether colleagues ARRIVED late — it had no idea whether any of them also
 * OBJECTED, or what they objected with.
 *
 * ── Why this and not "memory" in general ────────────────────────────────────
 *
 * The obvious version of appeal memory is a history of the person: how often
 * they appeal, how often they lose. That already exists as a neutral finding
 * and is deliberately not extended, because it is a prior on the individual
 * rather than evidence about the morning — and worse, it recycles the owner's
 * own past decisions back to them as if they were data. Three unfair rejections
 * become "3 rejected", which makes the fourth rejection easier and dresses it
 * up as a fact.
 *
 * This is the opposite shape. It is memory of EVENTS, not of people: it says
 * what else happened at that place on that day, which is checkable, which is
 * about the world rather than about anybody's character, and which the owner
 * would want to know regardless of who was asking.
 *
 * It still decides nothing. Corroboration cuts both ways and the brief says so:
 * three colleagues claiming the road was blocked is worth knowing, and so is
 * being the only one of six who claims it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistFinding, Claim } from "./types";
import type { PenaltyFacts } from "./facts";
import { classify } from "./classify";

export interface SiblingAppeal {
  appealId: string;
  employeeId: string;
  claim: Claim;
  /** Whether the owner has decided it yet — pending siblings are the common case. */
  decided: boolean;
}

export interface IncidentEvidence {
  /** Appeals from OTHER people, same site, same day. */
  siblings: SiblingAppeal[];
  /** People rostered at that site that day who did NOT appeal. */
  didNotAppeal: number;
}

/**
 * Other appeals about the same site on the same day.
 *
 * Keyed on the penalty's `on_date` rather than the appeal's submission time: a
 * road closed on Monday morning produces appeals on Monday, Tuesday and
 * whenever the third person gets round to it, and grouping by when somebody
 * typed would scatter one incident across three days.
 */
export async function incidentEvidence(
  db: SupabaseClient,
  facts: PenaltyFacts,
  thisAppealId: string
): Promise<IncidentEvidence | null> {
  if (!facts.onDate || !facts.workplaceId) return null;

  const { data: violations } = await db
    .from("violations")
    .select("id, employee_id")
    .eq("workplace_id", facts.workplaceId)
    .eq("on_date", facts.onDate);

  const others = (violations ?? []).filter((v) => v.employee_id !== facts.employeeId);
  if (others.length === 0) {
    return { siblings: [], didNotAppeal: await rosterGap(db, facts, 0) };
  }

  const { data: appeals } = await db
    .from("appeals")
    .select("id, violation_id, message, decision")
    .in(
      "violation_id",
      others.map((v) => v.id as string)
    );

  const byViolation = new Map(others.map((v) => [v.id as string, v.employee_id as string]));
  const siblings: SiblingAppeal[] = [];

  for (const a of appeals ?? []) {
    if (a.id === thisAppealId) continue;
    const employeeId = byViolation.get(a.violation_id as string);
    if (!employeeId) continue;
    siblings.push({
      appealId: a.id as string,
      employeeId,
      // Routed the same way this appeal was, so "the same claim" means the same
      // thing on both sides of the comparison.
      claim: classify((a.message as string) ?? "").claim,
      decided: a.decision !== "pending",
    });
  }

  return { siblings, didNotAppeal: await rosterGap(db, facts, siblings.length) };
}

/**
 * How many people were at that site that day and did NOT object.
 *
 * The counterweight. Three of five appealing is a very different morning from
 * three of forty, and reporting only the three would be reporting half of it.
 */
async function rosterGap(
  db: SupabaseClient,
  facts: PenaltyFacts,
  appealed: number
): Promise<number> {
  const { count } = await db
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("workplace_id", facts.workplaceId!)
    .eq("status", "active");

  // Minus this appellant, minus everyone who also appealed.
  return Math.max(0, (count ?? 0) - 1 - appealed);
}

/**
 * Turn the incident into a finding, or nothing.
 *
 * Nothing is the right answer when the person is the only one who had a
 * problem — that is not a fact worth a line, it is the ordinary case, and a
 * brief that announces "nobody else complained" about every solo appeal is
 * quietly building a case against whoever speaks up first.
 */
export function incidentFinding(
  evidence: IncidentEvidence,
  claim: Claim
): AssistFinding | null {
  const sameClaim = evidence.siblings.filter((s) => s.claim === claim);
  if (sameClaim.length === 0) return null;

  const pending = sameClaim.filter((s) => !s.decided).length;

  return {
    kind: "same_incident",
    // Supports, because independent people describing the same morning the same
    // way is corroboration. It is not proof, and the detail says what it is.
    stance: "supports",
    headline: `${sameClaim.length} colleague${sameClaim.length === 1 ? "" : "s"} appealed the same day with the same claim`,
    detail:
      `${sameClaim.length} other penalt${sameClaim.length === 1 ? "y" : "ies"} from that site on that ` +
      `date ${sameClaim.length === 1 ? "was" : "were"} appealed on the same grounds` +
      (pending > 0 ? `, ${pending} still waiting on a decision` : "") +
      `. ${evidence.didNotAppeal} other staff member${evidence.didNotAppeal === 1 ? "" : "s"} at that site ` +
      `did not appeal. Independent accounts of the same morning are worth weighing together — ` +
      `deciding these one at a time is how the same event gets four different answers.`,
    evidence: {
      colleagues_same_claim: sameClaim.length,
      still_undecided: pending,
      did_not_appeal: evidence.didNotAppeal,
    },
    source: "appeals",
  };
}
