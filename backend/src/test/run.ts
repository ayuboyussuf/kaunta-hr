/**
 * Test entry point: `npm test`.
 *
 * node:test registers and runs anything imported here, so a new suite is one
 * import line. Run with ts-node so the tests are the same TypeScript as the
 * code, with no build step to forget.
 */
import "../lib/rules/engine.test";
import "../lib/attendance/attempts.test";
import "../lib/privacy/scrub.test";
import "../lib/leave/cover.test";
import "../lib/appeals/assist/assist.test";
import "../lib/observability/log.test";
import "../lib/appeals/assist/claims.test";
import "../lib/violations/stage.test";
