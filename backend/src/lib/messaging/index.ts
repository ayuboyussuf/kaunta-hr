/**
 * Provider-agnostic messaging layer. Currently backed by Africa's Talking SMS.
 *
 * SMS cannot attach files, so documents (payslips, appeal outcomes, setup
 * summaries) are delivered as a secure download link in the message body — the
 * PDF itself is generated and stored exactly the same way.
 *
 * To switch to WhatsApp later, reimplement these three functions against the
 * dormant Meta client; call sites don't change.
 */
import { sendSms } from "../sms/africastalking";

/** Normalise a phone number to E.164 with a leading '+', assuming Kenya for local numbers. */
export function toMsisdn(phone: string): string {
  const d = phone.replace(/[^\d]/g, "");
  if (d.startsWith("0")) return `+254${d.slice(1)}`;
  if (d.startsWith("254")) return `+${d}`;
  if (phone.startsWith("+")) return `+${d}`;
  return `+${d}`;
}

/** Plain text message. */
export async function sendText(phone: string, body: string): Promise<void> {
  await sendSms(toMsisdn(phone), body);
}

/** OTP delivery. */
export async function sendOtp(phone: string, code: string): Promise<void> {
  await sendSms(
    toMsisdn(phone),
    `Your Kaunta HR verification code is ${code}. It expires in 5 minutes. Do not share it.`
  );
}

/**
 * "Document" delivery over SMS — sends the caption plus a secure link to the PDF.
 * @param link a signed download URL
 */
export async function sendDocument(
  phone: string,
  link: string,
  _filename: string,
  caption?: string
): Promise<void> {
  const label = caption ?? "Document";
  await sendSms(toMsisdn(phone), `${label}: ${link}`);
}
