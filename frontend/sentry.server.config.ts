// Sentry (Node server runtime). Env-gated: no DSN → no-op.
import * as Sentry from "@sentry/nextjs";
import { scrubEvent, SENTRY_DSN } from "./lib/sentryScrub";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}
