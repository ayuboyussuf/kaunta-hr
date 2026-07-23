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
  const username = env.at.username();
  const senderId = env.at.senderId();
  const url = baseUrl();

  const params = new URLSearchParams({ username, to, message });
  if (senderId) params.set("from", senderId);

  // Log the outgoing request (never the API key or message body — the body may
  // contain an OTP). This shows *that* we called AT and with what config.
  console.log(
    `[sms] → POST ${url} to=${to} from=${senderId || "(none)"} username=${username} msgLen=${message.length}`
  );

  let res: Response;
  let raw: string;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        apiKey: env.at.apiKey(),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });
    raw = await res.text();
  } catch (err) {
    // Could not even reach AT (DNS, network, proxy). This is a transport failure.
    console.error(`[sms] ✗ transport error reaching AT: ${(err as Error).message}`);
    throw new Error(`[sms] could not reach Africa's Talking: ${(err as Error).message}`);
  }

  // Log AT's raw HTTP status + body so you can see exactly what they answered.
  console.log(`[sms] ← ${res.status} ${raw}`);

  let data: {
    SMSMessageData?: {
      Message?: string;
      Recipients?: { status: string; statusCode: number; number: string; cost: string; messageId: string }[];
    };
  };
  try {
    data = JSON.parse(raw);
  } catch {
    data = {};
  }

  const recipient = data.SMSMessageData?.Recipients?.[0];
  if (!res.ok || !recipient) {
    // AT answered but with no recipient — usually auth/sender-id/account issues.
    // The summary line (e.g. "Sent to 0/1 ...") explains why.
    const summary = data.SMSMessageData?.Message ?? "(no message)";
    console.error(`[sms] ✗ no recipient accepted. AT says: ${summary}`);
    throw new Error(`[sms] send failed: ${res.status} ${raw}`);
  }
  // AT success statuses: "Success" (101 processed / queued). Anything else is a failure.
  if (!/success|sent|queued/i.test(recipient.status)) {
    console.error(`[sms] ✗ recipient ${recipient.number} rejected: ${recipient.status} (code ${recipient.statusCode})`);
    throw new Error(`[sms] rejected for ${recipient.number}: ${recipient.status}`);
  }

  console.log(
    `[sms] ✓ accepted for ${recipient.number} status=${recipient.status} code=${recipient.statusCode} cost=${recipient.cost} id=${recipient.messageId}`
  );
  return {
    messageId: recipient.messageId,
    status: recipient.status,
    number: recipient.number,
    cost: recipient.cost,
  };
}
