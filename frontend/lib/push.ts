/**
 * Web Push subscription for the employee PWA (mid-shift presence prompts).
 * Best-effort and self-contained: does nothing where push is unsupported or the
 * backend has no VAPID key configured. The in-app banner is the always-on
 * fallback, so this never blocks the app.
 */
import { api } from "@/lib/api";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Register the service worker and subscribe this device to push. */
export async function registerPush(token: string): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;

    const reg = await navigator.serviceWorker.register("/sw.js");

    const { key } = await api<{ key: string | null }>("/api/presence/vapid-key", { token });
    if (!key) return; // push not configured server-side → rely on in-app banner + SMS

    // Only prompt if the user hasn't already decided.
    if (Notification.permission === "denied") return;
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return;

    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      }));

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

    await api("/api/presence/subscribe", {
      method: "POST",
      token,
      body: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
    });
  } catch {
    // best-effort — ignore
  }
}
