/**
 * What an SMS costs, and how not to pay double for punctuation.
 *
 * Africa's Talking bills per segment, and the segment size depends entirely on
 * which characters are in the body:
 *
 *   GSM-7  — 160 characters in one segment, 153 each when concatenated
 *   UCS-2  —  70 characters in one segment,  67 each when concatenated
 *
 * The trap is that this is decided for the WHOLE message by a SINGLE character.
 * One em dash, one curly apostrophe, one smart quote — anywhere in the body —
 * and capacity drops by more than half. This was not theoretical: the penalty
 * notice, the most frequently sent message in the product, read
 *
 *     "Aproksi HR: Late arrival — KES 200. ..."
 *
 * and that one dash made every penalty notice ever sent cost two segments
 * instead of one. Nothing reported it, because the send path logged
 * `msgLen=106` — characters, which is the number that does not matter.
 *
 * So: sanitise on the way out, and count in segments rather than characters.
 * Sanitising is deliberately lossy in the safe direction — an em dash becomes a
 * hyphen and a curly apostrophe becomes a straight one, which nobody reading an
 * SMS on a feature phone will notice, and which halves the bill.
 */

/**
 * The GSM 03.38 basic set. Characters here cost one unit.
 * Note the deliberate inclusion of \n and \r.
 */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** The extension table. Still GSM-7, but each costs TWO units. */
const GSM7_EXTENDED = "^{}\\[~]|€";

/**
 * Replacements for the characters that quietly double the bill.
 *
 * Every one of these is a typographic nicety that costs real money and buys
 * nothing on a phone that renders SMS in a single weight.
 */
const SUBSTITUTIONS: [RegExp, string][] = [
  [/[‘’‚‛′]/g, "'"], // curly singles, prime
  [/[“”„‟″]/g, '"'], // curly doubles
  [/[–—―]/g, "-"], // en dash, em dash, horizontal bar
  [/[…]/g, "..."], // ellipsis
  [/[    ]/g, " "], // non-breaking and thin spaces
  [/[•]/g, "*"], // bullet
  [/[×]/g, "x"], // multiplication sign
  [/[−]/g, "-"], // minus sign
  [/[°]/g, " deg"], // degree
  [/[€]/g, "EUR"], // euro is GSM-7 extended (2 units); the word is clearer
];

export type SmsEncoding = "GSM-7" | "UCS-2";

export interface SmsCost {
  encoding: SmsEncoding;
  /** Billable units — not the same as characters, because of the extension table. */
  units: number;
  segments: number;
  /** The character that forced UCS-2, when one did. For diagnosing regressions. */
  offender: string | null;
}

/**
 * GSM-7 unit count, or the first character that is not in the alphabet — in
 * which case the whole message is UCS-2 and the count does not apply.
 */
function gsm7Units(text: string): { units: number } | { offender: string } {
  let units = 0;
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) units += 1;
    else if (GSM7_EXTENDED.includes(ch)) units += 2;
    else return { offender: ch };
  }
  return { units };
}

/** What this body will actually cost to send. */
export function smsCost(text: string): SmsCost {
  const gsm = gsm7Units(text);
  if ("units" in gsm) {
    return {
      encoding: "GSM-7",
      units: gsm.units,
      segments: gsm.units === 0 ? 0 : gsm.units <= 160 ? 1 : Math.ceil(gsm.units / 153),
      offender: null,
    };
  }
  // UCS-2 counts UTF-16 code units, so anything outside the BMP costs two.
  let units = 0;
  for (const ch of text) units += (ch.codePointAt(0) ?? 0) > 0xffff ? 2 : 1;
  return {
    encoding: "UCS-2",
    units,
    segments: units === 0 ? 0 : units <= 70 ? 1 : Math.ceil(units / 67),
    offender: gsm.offender,
  };
}

/**
 * Rewrite a message so it fits GSM-7 wherever that is possible without changing
 * what it says.
 *
 * Anything still outside the alphabet after substitution is left alone. Swahili
 * and English both fit; a name with an unusual diacritic does not, and mangling
 * somebody's name to save a shilling is not a trade worth making. Those
 * messages simply cost more, and `smsCost` will say so.
 */
export function toGsm7(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SUBSTITUTIONS) out = out.replace(pattern, replacement);
  return out;
}

/**
 * Trim to a segment budget on a word boundary, keeping a suffix intact.
 *
 * The suffix is the link. A digest truncated to the character limit loses the
 * URL, which is the only part of it that leads anywhere — so the link is
 * reserved first and the body gets whatever is left.
 */
export function fitSegments(body: string, suffix: string, segments = 1): string {
  const limit = segments === 1 ? 160 : segments * 153;
  const clean = toGsm7(body);
  const tail = toGsm7(suffix);
  const room = limit - smsCost(tail).units;
  if (smsCost(clean).units <= room) return `${clean}${tail}`;

  let cut = clean.slice(0, Math.max(0, room - 1));
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > room * 0.6) cut = cut.slice(0, lastSpace);
  return `${cut.trimEnd()}${tail}`;
}
