/**
 * Africa's Talking SMS client — real integration (no mock).
 * Docs: https://developers.africastalking.com/docs/sms/sending/bulk
 *
 * Sandbox: set AT_USERNAME=sandbox (free, for testing) — base URL switches
 * automatically. Live: your real username + a funded account.
 */
import { env } from "../env";

function baseUrl(): string {
  return env.at.username() === "sandbox"
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
}

export interface SmsResult {
  messageId: string;
  status: string;
  number: string;
  cost: string;
}

/** Send a single SMS. Throws on transport failure or a rejected recipient. */
export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const params = new URLSearchParams({
    username: env.at.username(),
    to,
    message,
  });
  const senderId = env.at.senderId();
  if (senderId) params.set("from", senderId);

  const res = await fetch(baseUrl(), {
    method: "POST",
    headers: {
      apiKey: env.at.apiKey(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  const data = (await res.json().catch(() => ({}))) as {
    SMSMessageData?: {
      Recipients?: { status: string; statusCode: number; number: string; cost: string; messageId: string }[];
    };
  };

  const recipient = data.SMSMessageData?.Recipients?.[0];
  if (!res.ok || !recipient) {
    throw new Error(`[sms] send failed: ${res.status} ${JSON.stringify(data)}`);
  }
  // AT success statuses: "Success" (101 processed / queued). Anything else is a failure.
  if (!/success|sent|queued/i.test(recipient.status)) {
    throw new Error(`[sms] rejected for ${recipient.number}: ${recipient.status}`);
  }

  return {
    messageId: recipient.messageId,
    status: recipient.status,
    number: recipient.number,
    cost: recipient.cost,
  };
}
