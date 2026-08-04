/**
 * Shared Sentry PII scrub for the frontend (client + server + edge). This app
 * shows wages and personal data, so no salary figure, phone number, PIN, selfie,
 * token, or other PII may leave in an error payload. Used as `beforeSend`.
 */
import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const SENSITIVE =
  /phone|salary|base_salary|pay_rate|gross|\bnet\b|amount|total_net|selfie|\bpin\b|otp|token|authorization|cookie|secret|password|api[_-]?key|msisdn/i;
const REDACTED = "[redacted]";

function deepRedact(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => deepRedact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? REDACTED : deepRedact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    const h = event.request.headers as Record<string, unknown> | undefined;
    if (h) {
      delete h.authorization;
      delete h.Authorization;
      delete h.cookie;
    }
  }
  if (event.user) {
    delete event.user.ip_address;
    delete (event.user as Record<string, unknown>).email;
  }
  event.extra = deepRedact(event.extra) as typeof event.extra;
  event.contexts = deepRedact(event.contexts) as typeof event.contexts;
  return event;
}

/** True when a Sentry DSN is configured for the frontend. */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || "";
