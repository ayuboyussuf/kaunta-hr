/**
 * Sentry initialisation — MUST be imported before any other app module so its
 * instrumentation is in place. Env-gated: with no SENTRY_DSN this is a complete
 * no-op (nothing initialised, zero overhead), so local/dev and un-configured
 * deploys are unaffected.
 *
 * Privacy: this app handles wages and personal data. We never let salary
 * figures, phone numbers, PINs, selfies, tokens, or other PII leave in an error
 * payload — sendDefaultPii is off and `beforeSend` scrubs request bodies,
 * headers, and any sensitive-looking keys before the event is sent.
 */
import * as Sentry from "@sentry/node";

// Keys whose values must never be reported. Matches substrings, case-insensitive.
const SENSITIVE = /phone|salary|base_salary|pay_rate|gross|\bnet\b|amount|total_net|selfie|\bpin\b|otp|token|authorization|cookie|secret|password|api[_-]?key|msisdn/i;
const REDACTED = "[redacted]";

/** Recursively redact sensitive keys in place (bounded depth to stay cheap). */
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

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "production",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
      // Drop request body / cookies / auth + IP; scrub anything sensitive left.
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        const h = event.request.headers;
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
    },
  });
  console.log("[sentry] backend error tracking enabled");
}

export { Sentry };
