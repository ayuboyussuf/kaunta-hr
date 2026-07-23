/**
 * Compatibility shim.
 *
 * Kaunta-HR delivers all messaging over Africa's Talking SMS (see
 * ../messaging). This module keeps the original function names so existing call
 * sites continue to work; each maps onto the SMS messaging layer:
 *   • sendText        → SMS text
 *   • sendTemplate    → SMS text (params joined)
 *   • sendOtpTemplate → SMS OTP
 *   • sendDocument    → SMS with a secure download link (SMS can't attach files)
 *   • toWaNumber      → E.164 normaliser
 *
 * If WhatsApp is adopted later, reimplement the messaging layer against the Meta
 * Cloud API — these signatures don't change.
 */
import { sendText as _sendText, sendOtp, sendDocument as _sendDocument, toMsisdn } from "../messaging";

export const toWaNumber = toMsisdn;

export async function sendText(phone: string, body: string): Promise<{ id: string }> {
  await _sendText(phone, body);
  return { id: "" };
}

export async function sendOtpTemplate(phone: string, code: string): Promise<{ id: string }> {
  await sendOtp(phone, code);
  return { id: "" };
}

export async function sendTemplate(
  phone: string,
  _templateName: string,
  bodyParams: string[]
): Promise<{ id: string }> {
  await _sendText(phone, bodyParams.join(" "));
  return { id: "" };
}

export async function sendDocument(
  phone: string,
  link: string,
  filename: string,
  caption?: string
): Promise<{ id: string }> {
  await _sendDocument(phone, link, filename, caption);
  return { id: "" };
}
