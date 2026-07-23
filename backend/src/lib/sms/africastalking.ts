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

/** Error carrying whether the failure is worth retrying (transient 5xx / network). */
class SmsError extends Error {
  retriable: boolean;
  constructor(message: string, retriable: boolean) {
    super(message);
    this.retriable = retriable;
  }
}

/**
 * Send a single SMS, retrying transient failures. AT's sandbox in particular
 * returns 503 ("try again in a short while") under load; one retry usually
 * clears it. Throws on a permanent failure (auth, rejected recipient).
 */
export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const maxAttempts = 3;
  let lastErr: Error = new Error("[sms] send failed");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await sendOnce(to, message);
    } catch (err) {
      lastErr = err as Error;
      const retriable = err instanceof SmsError && err.retriable;
      if (!retriable || attempt === maxAttempts) throw err;
      const waitMs = 600 * attempt;
      console.warn(`[sms] attempt ${attempt}/${maxAttempts} failed (retrying in ${waitMs}ms): ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

/** One send attempt. */
async function sendOnce(to: string, message: string): Promise<SmsResult> {
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
    // Could not even reach AT (DNS, network, proxy) — transient, worth a retry.
    console.error(`[sms] ✗ transport error reaching AT: ${(err as Error).message}`);
    throw new SmsError(`[sms] could not reach Africa's Talking: ${(err as Error).message}`, true);
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
    // 5xx = AT overloaded/timeout → retry; 4xx = auth/bad request → permanent.
    throw new SmsError(`[sms] send failed: ${res.status} ${raw}`, res.status >= 500 || res.status === 429);
  }
  // AT success statuses: "Success" (101 processed / queued). Anything else is a failure.
  if (!/success|sent|queued/i.test(recipient.status)) {
    console.error(`[sms] ✗ recipient ${recipient.number} rejected: ${recipient.status} (code ${recipient.statusCode})`);
    throw new SmsError(`[sms] rejected for ${recipient.number}: ${recipient.status}`, false);
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
