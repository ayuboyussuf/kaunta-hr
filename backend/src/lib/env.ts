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

  // Africa's Talking SMS — all messaging (OTP, invites, announcements, PDF links).
  at: {
    username: () => opt("AT_USERNAME", "sandbox"),
    apiKey: () => req("AT_API_KEY"),
    senderId: () => opt("AT_SENDER_ID", ""),
  },
};
