// Sentry (browser). Env-gated: no DSN → no-op. Loaded by Next on the client.
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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
