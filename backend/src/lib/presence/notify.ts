/**
 * Telling somebody a presence check is waiting on them.
 *
 * There are two ways a check gets created — the random schedule and an owner
 * asking for one — and until now each wrote its own message. Both said exactly
 * this:
 *
 *     "Aproksi HR: please open the app and scan within 10 minutes to confirm
 *      you're at work."
 *
 * Which names no site, no deadline, and no way to get there. A staff member
 * working two sites this week cannot tell which one it means. "Within 10
 * minutes" is measured from a moment they did not see, so the only safe reading
 * is "drop everything now". And the app is a link they have to go and find,
 * from a phone that is already open on a text message.
 *
 * It also used 85 of the 160 characters available. There was room for all of
 * that and nobody had spent it.
 *
 * ── The gap ─────────────────────────────────────────────────────────────────
 *
 * The 45-minute spacing in `checkTimes` only ever applied to DRAWN times, and
 * an owner-requested check does not count toward the drawn quota. So the
 * schedule could fire two minutes after an owner asked, and the employee got
 * two identical texts in the same minute — which is what production showed.
 * A cooldown across ALL checks, whoever created them, lives here so both paths
 * cannot disagree about it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { pushToEmployee } from "../push";
import { enqueue } from "../queue";
import { fitSegments } from "../sms/gsm7";
import { env } from "../env";
import { TZ } from "../time";

/**
 * No two checks within this of each other, from any source.
 *
 * Shorter than the 45-minute spacing between drawn times, deliberately: this is
 * the floor that stops a check arriving on top of another one, not the rhythm
 * of the day. An owner with a real reason to ask again after half an hour
 * should be able to.
 */
export const CHECK_COOLDOWN_MS = 25 * 60 * 1000;

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

/**
 * When was this employee last asked to confirm, by anyone?
 *
 * Returns null when they have never been checked. Callers treat null as "go
 * ahead" — the first check of a shift has nothing to be too close to.
 */
export async function lastCheckAt(
  db: SupabaseClient,
  employeeId: string
): Promise<Date | null> {
  const { data } = await db
    .from("presence_checks")
    .select("due_at")
    .eq("employee_id", employeeId)
    .order("due_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.due_at ? new Date(data.due_at as string) : null;
}

/** True when another check now would land on top of the last one. */
export function tooSoon(last: Date | null, now: Date): boolean {
  if (!last) return false;
  return now.getTime() - last.getTime() < CHECK_COOLDOWN_MS;
}

/**
 * The message.
 *
 * A real deadline instead of a duration, because "by 15:45" survives being read
 * ten minutes late and "within 10 minutes" does not. The site by name, because
 * somebody who worked two sites this week needs to know which. And a link
 * straight to the scanner, because the phone is already open on the text.
 *
 * `fitSegments` reserves the link before trimming, so a very long site name
 * costs the sentence rather than the only part that leads anywhere.
 */
export function checkMessage(params: {
  siteName: string | null;
  respondBy: string;
}): string {
  // Two shapes rather than one with a hole in it. "confirm you are at work at
  // Ruiru Station" reads badly, and the site-less version cannot say "the code
  // there" when it has not named a there.
  const sentence = params.siteName
    ? `Aproksi HR: confirm you are at ${params.siteName} - scan the QR code there by ${hhmm(params.respondBy)}.`
    : `Aproksi HR: confirm you are at work - scan your site's QR code by ${hhmm(params.respondBy)}.`;

  return fitSegments(sentence, ` ${env.appUrl.replace(/^https?:\/\//, "")}/me/clock-in`, 1);
}

export interface CheckNotice {
  employeeId: string;
  checkId: string;
  siteName: string | null;
  respondBy: string;
  smsFallback: boolean;
  phone: string | null;
}

/**
 * Push first, SMS regardless.
 *
 * A browser notification on a locked phone is not evidence anybody saw it, and
 * this is the one message whose silence flags a clock-in and can end in a
 * deduction. So the SMS goes either way when the org has it switched on.
 */
export async function notifyCheck(
  notice: CheckNotice
): Promise<{ pushed: number; smsQueued: boolean }> {
  const body = checkMessage({ siteName: notice.siteName, respondBy: notice.respondBy });

  let pushed = 0;
  try {
    pushed = await pushToEmployee(notice.employeeId, {
      title: notice.siteName ? `Confirm you're at ${notice.siteName}` : "Confirm you're at work",
      body: `Scan the QR code by ${hhmm(notice.respondBy)}.`,
      url: "/me/clock-in",
    });
  } catch {
    /* push is best-effort; the SMS below is the one that has to land */
  }

  let smsQueued = false;
  if (notice.smsFallback && notice.phone) {
    try {
      await enqueue("sms", { to: notice.phone, body }, `sms:presence:${notice.checkId}`);
      smsQueued = true;
    } catch (err) {
      console.warn(`[presence] SMS enqueue failed for ${notice.employeeId}:`, (err as Error).message);
    }
  }

  return { pushed, smsQueued };
}
