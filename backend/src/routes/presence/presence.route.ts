/**
 * Employee-facing presence endpoints (mid-shift checks).
 *
 *   GET  /api/presence/vapid-key   → the public VAPID key (for push subscribe)
 *   POST /api/presence/subscribe   → store this device's push subscription
 *   GET  /api/presence/pending     → any pending presence check for the caller
 *
 * All employee-scoped via req.employee.employeeId (service client).
 */
import { Router } from "express";
import { z } from "zod";
import { requireEmployee } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";
import { env } from "../../lib/env";

const router = Router();

router.get("/vapid-key", requireEmployee, (_req, res) => {
  res.json({ key: env.vapid.configured() ? env.vapid.publicKey() : null });
});

const subInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

router.post("/subscribe", requireEmployee, async (req, res) => {
  const parsed = subInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid subscription" });

  const db = getServiceClient();
  const { error } = await db.from("push_subscriptions").upsert(
    {
      employee_id: req.employee!.employeeId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
    { onConflict: "employee_id,endpoint" }
  );
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.get("/pending", requireEmployee, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("presence_checks")
    .select("id, due_at, respond_by")
    .eq("employee_id", req.employee!.employeeId)
    .eq("status", "pending")
    .gte("respond_by", new Date().toISOString())
    .order("due_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ check: data ?? null });
});

export default { basePath: "/api/presence", router };
