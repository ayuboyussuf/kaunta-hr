/**
 * Employee authentication (spec §2).
 *
 * Flow:
 *   1. request-otp  → OTP sent over WhatsApp directly to the employee's number.
 *   2. verify-otp   → validates code, trusts THIS device, issues a session.
 *                     First-ever login returns needsPinSetup=true.
 *   3. set-pin      → employee sets a PIN (hashed).
 *   4. login-pin    → on a TRUSTED device, PIN alone logs in (no OTP).
 *                     On a NEW device, PIN login is refused → must re-run OTP.
 *
 * Employees are not Supabase-auth users; sessions are our own signed JWTs and all
 * DB access uses the service client scoped to the resolved employee.
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getServiceClient } from "../../lib/supabase";
import { requestOtp, verifyOtp } from "../../lib/otp";
import {
  issueEmployeeSession,
  requireEmployee,
  hashFingerprint,
} from "../../lib/auth";

const router = Router();

const phoneSchema = z.string().min(7).max(20);

/** Normalise to E.164-ish digits with a leading '+'. */
function normPhone(raw: string): string {
  const d = raw.replace(/[^\d]/g, "");
  if (d.startsWith("0")) return `+254${d.slice(1)}`;
  if (d.startsWith("254")) return `+${d}`;
  return raw.startsWith("+") ? `+${d}` : `+${d}`;
}

async function findEmployeeByPhone(phone: string) {
  const db = getServiceClient();
  const { data } = await db
    .from("employees")
    .select("id, org_id, name, phone, pin_hash, status")
    .eq("phone", phone)
    .maybeSingle();
  return data;
}

// ── 1. Request OTP ────────────────────────────────────────────────────────────
router.post("/request-otp", async (req, res) => {
  const parse = phoneSchema.safeParse(req.body?.phone);
  if (!parse.success) return res.status(400).json({ error: "valid phone required" });
  const phone = normPhone(parse.data);

  const emp = await findEmployeeByPhone(phone);
  // Do not leak whether a number is registered; respond 200 either way, but only
  // actually send when the employee exists and is not suspended. These logs are
  // server-side only (never returned to the client) so they don't leak anything.
  if (!emp) {
    console.log(`[auth] request-otp: no employee for ${phone} → skipping send (client still gets 200)`);
  } else if (emp.status === "suspended") {
    console.log(`[auth] request-otp: employee ${phone} is suspended → skipping send`);
  } else {
    console.log(`[auth] request-otp: sending OTP to employee ${phone} (${emp.name})`);
    try {
      await requestOtp(phone);
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      if (status === 429) {
        console.log(`[auth] request-otp: cooldown active for ${phone} (429)`);
        return res.status(429).json({ error: (err as Error).message });
      }
      // A send failure (e.g. SMS provider 5xx) must NOT crash the server — report
      // it to the caller and move on.
      console.error(`[auth] request-otp: send failed for ${phone}:`, (err as Error).message);
      return res.status(502).json({
        error: "Couldn't send the code right now. Please try again in a moment.",
      });
    }
  }
  res.json({ ok: true });
});

// ── 2. Verify OTP → trust device + session ────────────────────────────────────
router.post("/verify-otp", async (req, res) => {
  const schema = z.object({
    phone: phoneSchema,
    code: z.string().length(6),
    fingerprint: z.string().min(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "phone, code, fingerprint required" });

  const phone = normPhone(parsed.data.phone);
  const emp = await findEmployeeByPhone(phone);
  if (!emp || emp.status === "suspended") return res.status(401).json({ error: "invalid" });

  const ok = await verifyOtp(phone, parsed.data.code);
  if (!ok) return res.status(401).json({ error: "invalid or expired code" });

  const db = getServiceClient();
  const fp = hashFingerprint(parsed.data.fingerprint);
  await db
    .from("devices")
    .upsert(
      { employee_id: emp.id, fingerprint: fp, last_seen_at: new Date().toISOString() },
      { onConflict: "employee_id,fingerprint" }
    );
  if (emp.status === "invited") {
    await db.from("employees").update({ status: "active" }).eq("id", emp.id);
  }

  const token = issueEmployeeSession(emp.id, emp.org_id);
  res.json({ token, needsPinSetup: !emp.pin_hash, name: emp.name });
});

// ── 3. Set PIN ────────────────────────────────────────────────────────────────
router.post("/set-pin", requireEmployee, async (req, res) => {
  const pin = String(req.body?.pin ?? "");
  if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: "PIN must be 4–6 digits" });

  const db = getServiceClient();
  const pin_hash = await bcrypt.hash(pin, 10);
  await db.from("employees").update({ pin_hash }).eq("id", req.employee!.employeeId);
  res.json({ ok: true });
});

// ── 4. PIN login (trusted device only) ────────────────────────────────────────
router.post("/login-pin", async (req, res) => {
  const schema = z.object({
    phone: phoneSchema,
    pin: z.string().min(4).max(6),
    fingerprint: z.string().min(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "phone, pin, fingerprint required" });

  const phone = normPhone(parsed.data.phone);
  const emp = await findEmployeeByPhone(phone);
  if (!emp || emp.status === "suspended" || !emp.pin_hash) {
    return res.status(401).json({ error: "invalid" });
  }

  const db = getServiceClient();
  const fp = hashFingerprint(parsed.data.fingerprint);
  const { data: device } = await db
    .from("devices")
    .select("id")
    .eq("employee_id", emp.id)
    .eq("fingerprint", fp)
    .maybeSingle();

  // New device → PIN alone is not enough; force OTP re-trigger.
  if (!device) return res.status(403).json({ error: "new_device", needsOtp: true });

  const pinOk = await bcrypt.compare(parsed.data.pin, emp.pin_hash);
  if (!pinOk) return res.status(401).json({ error: "invalid" });

  await db.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  const token = issueEmployeeSession(emp.id, emp.org_id);
  res.json({ token, name: emp.name });
});

export default { basePath: "/api/auth/employee", router };
