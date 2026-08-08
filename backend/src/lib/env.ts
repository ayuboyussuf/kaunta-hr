/**
 * Central env access with fail-fast validation. Every integration is REAL —
 * there is no mock mode — so a missing secret is a hard error at boot, not a
 * silent fallback.
 */
function req(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`[env] Missing required environment variable: ${name}`);
  }
  return v;
}

function opt(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : fallback;
}

export const env = {
  port: Number(opt("PORT", "4000")),
  frontendUrl: opt("FRONTEND_URL", "http://localhost:3000"),
  backendUrl: opt("BACKEND_URL", "http://localhost:4000"),
  appUrl: opt("APP_URL", "http://localhost:3000"),

  supabaseUrl: () => req("SUPABASE_URL"),
  supabaseServiceKey: () => req("SUPABASE_SERVICE_KEY"),

  qrTokenSecret: () => req("QR_TOKEN_SECRET"),
  employeeJwtSecret: () => req("EMPLOYEE_JWT_SECRET"),
  cronSecret: () => req("CRON_SECRET"),

  /**
   * Operator credential for /api/admin/*. Not an owner and not a staff member:
   * these endpoints read across every org, so they are gated on a secret that
   * only whoever runs Aproksi holds. Unset means the admin routes refuse
   * everything, which is the correct behaviour for a deploy that has not
   * deliberately turned them on.
   */
  adminToken: () => process.env.ADMIN_API_TOKEN ?? "",

  // Background jobs (BullMQ). Optional: when unset, jobs run inline at enqueue
  // time (no queue). Set to an Upstash Redis rediss:// URL to enable the worker.
  redisUrl: () => opt("REDIS_URL", ""),

  // Africa's Talking SMS — all messaging (OTP, invites, announcements, PDF links).
  at: {
    username: () => opt("AT_USERNAME", "sandbox"),
    apiKey: () => req("AT_API_KEY"),
    senderId: () => opt("AT_SENDER_ID", ""),
  },

  // Web Push (mid-shift presence prompts). Optional: when unset, presence checks
  // fall back to SMS + the in-app banner. Generate with `npx web-push generate-vapid-keys`.
  vapid: {
    publicKey: () => opt("VAPID_PUBLIC_KEY", ""),
    privateKey: () => opt("VAPID_PRIVATE_KEY", ""),
    subject: () => opt("VAPID_SUBJECT", "mailto:support@aproksi.app"),
    configured: () => !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY,
  },
};
