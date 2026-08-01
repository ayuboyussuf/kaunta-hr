/**
 * Web Push wrapper (mid-shift presence prompts). Optional: when VAPID keys are
 * not configured, every call is a no-op and callers fall back to SMS + the
 * in-app banner. Subscriptions live in `push_subscriptions`.
 */
import webpush from "web-push";
import { env } from "../env";
import { getServiceClient } from "../supabase";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!env.vapid.configured()) return false;
  webpush.setVapidDetails(env.vapid.subject(), env.vapid.publicKey(), env.vapid.privateKey());
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Push a notification to all of an employee's subscribed devices. Prunes
 * subscriptions the browser has expired (410/404). Returns how many were
 * delivered — 0 when push isn't configured or the employee has no devices.
 */
export async function pushToEmployee(employeeId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;

  const db = getServiceClient();
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("employee_id", employeeId);
  if (!subs || subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body
      );
      delivered++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // Subscription is dead — drop it so we stop trying.
        await db.from("push_subscriptions").delete().eq("id", s.id);
      } else {
        console.warn(`[push] send failed for employee ${employeeId}:`, (err as Error).message);
      }
    }
  }
  return delivered;
}
