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
import { scrub } from "./lib/privacy/scrub";

/*
 * Redaction is the shared scrubber, not a second one written here.
 *
 * It started as a key-name regex, which catches `salary: 45000` but not the
 * error message "could not pay Grace Wanjiru KES 45,000" — and an exception
 * message is exactly where a value like that ends up. lib/privacy/scrub runs
 * over the text as well as the keys, so both are caught, and there is one
 * implementation to keep correct instead of two that drift.
 *
 * No roster is available in this path, so names are only caught where they
 * appear beside something with a shape. That is a floor, not a ceiling: nothing
 * user-facing relies on Sentry, and everything that writes to our own storage
 * passes the roster in.
 *
 * Safe to import here despite the load-order rule — the module has no runtime
 * imports of its own.
 */

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
      event.extra = scrub(event.extra);
      event.contexts = scrub(event.contexts);
      // The message and the exception text are where a wage or a phone number
      // most often escapes — they are prose, and prose is what the key-based
      // pass cannot see.
      if (event.message) event.message = scrub(event.message);
      for (const ex of event.exception?.values ?? []) {
        if (ex.value) ex.value = scrub(ex.value);
      }
      for (const b of event.breadcrumbs ?? []) {
        if (b.message) b.message = scrub(b.message);
        if (b.data) b.data = scrub(b.data);
      }
      return event;
    },
  });
  console.log("[sentry] backend error tracking enabled");
}

export { Sentry };
