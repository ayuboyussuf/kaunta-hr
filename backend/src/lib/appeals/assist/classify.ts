/**
 * Working out what someone is claiming, so we know what to go and check.
 *
 * This is routing and nothing else. It decides which questions to ask the
 * record; it never decides anything about the appeal, and no finding is ever
 * derived from it. That is what makes it safe to do with keywords: the worst a
 * misroute can do is check the wrong things, which the owner sees immediately
 * because the brief says which claim it read and shows the sentence it read it
 * from. A wrong route costs a query. A wrong fact costs someone their wages.
 *
 * It reads Kenyan English and the Swahili people actually type — "gari
 * ilikwama", "sikuwa mzima", "app ilihang" — because an appeal written the way
 * staff talk should not fall through to "unclear".
 *
 * When it cannot tell, it says so. "unclear" produces a brief with the facts of
 * the penalty and no claim-specific checking, which is still more than the
 * owner had before, and it never guesses in order to look useful.
 */
import type { Claim } from "./types";

interface Rule {
  claim: Claim;
  /** Any one of these is a signal. Two distinct signals make it confident. */
  signals: RegExp[];
  /** An unambiguous phrase is confident on its own. */
  decisive?: RegExp[];
}

const RULES: Rule[] = [
  {
    claim: "system_not_working",
    signals: [
      /\bapp\b/i,
      /\bsystem\b/i,
      /\bqr\b/i,
      /\bscan(ner|ning|ned)?\b/i,
      /\bcamera\b/i,
      /\bnetwork\b/i,
      /\binternet\b/i,
      /\bphone\b/i,
      /\bhang(ing|ed|s)?\b/i,
      /\bfroze|frozen|freezing\b/i,
      /\bload(ing)?\b/i,
      /\bcrash(ed|ing)?\b/i,
      /\berror\b/i,
      /\bsignal\b/i,
      /\bmtandao\b/i, // network
      /\bhaikufanya\b/i, // it didn't work
      /\bhaiku(soma|scan)\b/i, // it didn't read/scan
    ],
    decisive: [
      /\b(app|system|qr|scanner|camera|phone)\b[^.!?]{0,40}\b(not work|wasn'?t work|would ?n'?t|failed|refus|hang|froze|crash|error)/i,
      /\b(not work|wasn'?t work|would ?n'?t|failed|hang|froze|crash)[^.!?]{0,40}\b(app|system|qr|scanner|camera)\b/i,
    ],
  },
  {
    claim: "sick",
    signals: [
      /\bsick\b/i,
      /\bill\b/i,
      /\bunwell\b/i,
      /\bhospital\b/i,
      /\bclinic\b/i,
      /\bdoctor\b/i,
      /\bdispensary\b/i,
      /\bchemist\b/i,
      /\bmalaria\b/i,
      /\bfever\b/i,
      /\bpain\b/i,
      /\bstomach\b/i,
      /\bmgonjwa\b/i, // sick person
      /\bnilikuwa mgonjwa\b/i,
      /\bsikuwa mzima\b/i, // I wasn't well
      /\bdawa\b/i, // medicine
      /\bhospitali\b/i,
    ],
    decisive: [/\b(sick ?note|medical (note|certificate|report)|admitted|emergency)\b/i],
  },
  {
    claim: "road_closed",
    signals: [
      /\broad\b/i,
      /\btraffic\b/i,
      /\bjam\b/i,
      /\bmatatu\b/i,
      /\bbus\b/i,
      /\bboda\b/i,
      /\bdiversion\b/i,
      /\bdetour\b/i,
      /\baccident\b/i,
      /\bclosed\b/i,
      /\bblocked?\b/i,
      /\bflood(ed|ing)?\b/i,
      /\bdemo(nstration)?s?\b/i,
      /\bprotest\b/i,
      /\bbarabara\b/i, // road
      /\bfoleni\b/i, // queue/jam
      /\bgari\b/i, // vehicle
      /\bilikwama\b/i, // it got stuck
    ],
    decisive: [
      /\b(road|barabara)\b[^.!?]{0,30}\b(clos|block|divert|flood)/i,
      /\b(heavy|bad|terrible)\b[^.!?]{0,15}\b(traffic|jam|foleni)\b/i,
    ],
  },
];

export interface Classification {
  claim: Claim;
  confidence: "high" | "low";
  /** The words that routed it, so the owner can see why. */
  matched: string[];
}

export function classify(message: string): Classification {
  const text = (message ?? "").trim();
  if (text.length < 3) return { claim: "unclear", confidence: "low", matched: [] };

  const scored = RULES.map((rule) => {
    const matched = new Set<string>();
    for (const re of rule.signals) {
      const m = text.match(re);
      if (m) matched.add(m[0].toLowerCase());
    }
    const decisive = (rule.decisive ?? []).some((re) => re.test(text));
    return { claim: rule.claim, hits: matched.size, decisive, matched: [...matched] };
  }).sort((a, b) => Number(b.decisive) - Number(a.decisive) || b.hits - a.hits);

  const top = scored[0];
  if (!top || top.hits === 0) return { claim: "unclear", confidence: "low", matched: [] };

  // Two claims arguing for the same sentence is exactly when to be unsure — and
  // it happens for real: "I was sick and the matatu jam was terrible" is both,
  // and routing to one silently drops the other. Unless the top claim has a
  // phrase that admits no other reading, any competing signal drops the
  // confidence, which puts the employee's own words in front of the owner
  // instead of a brief that answers half of what they said.
  const contested = scored.slice(1).some((s) => s.hits > 0);

  const confidence: "high" | "low" =
    top.decisive || (top.hits >= 2 && !contested) ? "high" : "low";

  return { claim: top.claim, confidence, matched: top.matched };
}
