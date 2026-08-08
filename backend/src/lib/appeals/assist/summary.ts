/**
 * Turning findings into a paragraph an owner can read in ten seconds.
 *
 * Assembled from the findings by template — not written. This is the whole
 * answer to "make sure it never hallucinates": a sentence that can only be
 * built out of counts that already exist cannot contain a fact that does not.
 * There is no prose model anywhere in this path, so there is nothing to prompt
 * carefully and nothing to go wrong under load.
 *
 * The summary reports the shape of the evidence and stops. It never says what
 * to do, never says whether the claim is true, and never says how likely it is.
 * An owner reading this should end up better informed and still holding the
 * decision.
 */
import type { AssistFinding, Claim } from "./types";
import type { PenaltyFacts } from "./facts";

/** Words that would turn a summary into a verdict. Enforced by test. */
export const FORBIDDEN = [
  "recommend",
  "should waive",
  "should uphold",
  "should reject",
  "likely true",
  "probably true",
  "we suggest",
  "i suggest",
  "verdict",
  "guilty",
  "innocent",
  "deserves",
];

const CLAIM_PHRASE: Record<Claim, string> = {
  system_not_working: "that Aproksi would not let them clock in",
  sick: "that they were unwell",
  road_closed: "that the road was blocked",
  unclear: "something the record could not be matched to",
};

export function summarise(claim: Claim, facts: PenaltyFacts, findings: AssistFinding[]): string {
  const supports = findings.filter((f) => f.stance === "supports");
  const contradicts = findings.filter((f) => f.stance === "contradicts");
  const unverifiable = findings.filter((f) => f.stance === "unverifiable");

  const opening =
    facts.lateByMin != null && facts.expectedStart
      ? `${facts.employeeName} was ${facts.lateByMin} minutes late against a ${facts.expectedStart} start and is appealing ${CLAIM_PHRASE[claim]}.`
      : `${facts.employeeName} is appealing ${CLAIM_PHRASE[claim]}.`;

  const parts: string[] = [opening];

  if (supports.length === 0 && contradicts.length === 0) {
    parts.push("The record holds nothing either way.");
  } else if (supports.length > 0 && contradicts.length === 0) {
    parts.push(
      `The record is consistent with that: ${joinLower(supports.map((f) => f.headline))}.`
    );
  } else if (contradicts.length > 0 && supports.length === 0) {
    parts.push(`The record does not fit that account: ${joinLower(contradicts.map((f) => f.headline))}.`);
  } else {
    parts.push(
      `The record points both ways. For: ${joinLower(supports.map((f) => f.headline))}. Against: ${joinLower(
        contradicts.map((f) => f.headline)
      )}.`
    );
  }

  if (unverifiable.length > 0) {
    parts.push(`Cannot be checked: ${joinLower(unverifiable.map((f) => f.headline))}.`);
  }

  parts.push("Every figure above comes from the records and can be opened and read. The decision is yours.");
  return parts.join(" ");
}

/** "a, b and c", with each headline de-capitalised so it reads mid-sentence. */
function joinLower(items: string[]): string {
  const lowered = items.map((s) => (s.length > 1 ? s[0].toLowerCase() + s.slice(1) : s));
  if (lowered.length === 1) return lowered[0];
  return `${lowered.slice(0, -1).join(", ")} and ${lowered[lowered.length - 1]}`;
}
