/**
 * OTP service — channel-agnostic core.
 *
 * `OtpChannel` is the seam that lets us ship WhatsApp OTP now and drop in
 * Africa's Talking SMS later without touching the auth routes. Codes are stored
 * HASHED (never plaintext) in `otp_codes`, rate-limited, single-use, and expiring.
 */
import crypto from "crypto";
import { getServiceClient } from "../supabase";
import { smsChannel } from "./sms";

export interface OtpChannel {
  readonly name: "whatsapp" | "sms";
  send(phone: string, code: string): Promise<void>;
}

/** Active channel — Africa's Talking SMS. Swap here to use WhatsApp later. */
export const activeChannel: OtpChannel = smsChannel;

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 60s between sends per phone

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  // 6-digit numeric, cryptographically random, zero-padded.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Issue and send a fresh OTP. Enforces a per-phone resend cooldown. */
export async function requestOtp(phone: string): Promise<{ sent: true; channel: string }> {
  const db = getServiceClient();

  const { data: recent } = await db
    .from("otp_codes")
    .select("created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent && Date.now() - new Date(recent.created_at).getTime() < RESEND_COOLDOWN_MS) {
    throw Object.assign(new Error("Please wait before requesting another code."), {
      status: 429,
    });
  }

  const code = generateCode();
  const { error } = await db.from("otp_codes").insert({
    phone,
    code_hash: hashCode(code),
    channel: activeChannel.name,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`[otp] persist failed: ${error.message}`);

  await activeChannel.send(phone, code);
  return { sent: true, channel: activeChannel.name };
}

/** Verify a submitted code. Consumes it on success; counts attempts otherwise. */
export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const db = getServiceClient();

  const { data: row } = await db
    .from("otp_codes")
    .select("id, code_hash, expires_at, consumed, attempts")
    .eq("phone", phone)
    .eq("consumed", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) return false;
  if (row.attempts >= MAX_ATTEMPTS) return false;

  if (hashCode(code) !== row.code_hash) {
    await db.from("otp_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return false;
  }

  await db.from("otp_codes").update({ consumed: true }).eq("id", row.id);
  return true;
}
