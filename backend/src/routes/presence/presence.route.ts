/**
 * Presence checks (mid-shift).
 *
 *   GET  /api/presence/vapid-key         → the public VAPID key (push subscribe)
 *   POST /api/presence/subscribe         → store this device's push subscription
 *   GET  /api/presence/pending           → any pending check for the caller
 *   POST /api/presence/check/:employeeId → owner asks for one now
 *
 * The first three are employee-scoped via req.employee.employeeId; the last is
 * the owner's, and is the only way a check gets created outside the schedule.
 */
import { Router } from "express";
import { z } from "zod";
import { requireEmployee, requireOwner } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";
import { env } from "../../lib/env";
import { pushToEmployee } from "../../lib/push";
import { enqueue } from "../../lib/queue";
import { nairobiDayStartISO } from "../../lib/time";

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

/**
 * POST /api/presence/check/:employeeId  (owner) — check on someone now.
 *
 * The schedule decides the random ones. This is the other half: an owner has a
 * specific reason to want a specific person to prove where they are, right now,
 * and until this existed there was nothing for that.
 *
 * Three things it deliberately does not do:
 *
 *   - It does not count against the random quota. Asking for a check must not
 *     spend the day's unpredictable one, or an owner would be choosing between
 *     the check they want and the check that keeps everyone honest.
 *   - It does not pretend to be random. The row records who asked, because a
 *     targeted check and a drawn one are different events, and if a pattern of
 *     targeting one person is ever questioned the record has to show it.
 *   - It does not fire at somebody who is not clocked in. "Confirm you are at
 *     work" sent to a person who is not on shift is not a check, it is a
 *     nuisance — and a missed one would flag a clock-in that does not exist.
 */
router.post("/check/:employeeId", requireOwner, async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.employeeId);
  if (!id.success) return res.status(400).json({ error: "invalid employee id" });

  const db = getServiceClient();
  const { data: emp } = await db
    .from("employees")
    .select("id, name, phone, org_id, status")
    .eq("id", id.data)
    .eq("org_id", req.owner!.orgId)
    .maybeSingle();
  if (!emp) return res.status(404).json({ error: "employee not found" });
  if (emp.status !== "active") {
    return res.status(400).json({ error: "This employee is not active." });
  }

  const now = new Date();
  const dayStart = nairobiDayStartISO(now);

  // They must be on shift right now — last entry today is a clock-IN.
  const { data: last } = await db
    .from("attendance_entries")
    .select("id, direction")
    .eq("employee_id", emp.id)
    // Clock scans only — see the note in the cron. `session_entry_id` must also
    // point at the clock-IN this check belongs to, not at a previous answer.
    .in("direction", ["in", "out"])
    .gte("scanned_at", dayStart)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last || last.direction !== "in") {
    return res.status(400).json({
      error: `${emp.name} is not clocked in right now, so there is nothing to confirm.`,
    });
  }

  // One at a time. A second check while the first is still open would flag the
  // same clock-in twice for one failure to answer.
  const { data: pending } = await db
    .from("presence_checks")
    .select("id, respond_by")
    .eq("employee_id", emp.id)
    .eq("status", "pending")
    .gte("respond_by", now.toISOString())
    .limit(1)
    .maybeSingle();
  if (pending) {
    return res.status(409).json({ error: "A check is already open for this person." });
  }

  const { data: org } = await db
    .from("orgs")
    .select("presence_check_window_min, presence_sms_fallback")
    .eq("id", req.owner!.orgId)
    .maybeSingle();
  const windowMin = (org?.presence_check_window_min as number) || 10;
  const smsFallback = org?.presence_sms_fallback !== false;

  const { data: check, error } = await db
    .from("presence_checks")
    .insert({
      employee_id: emp.id,
      session_entry_id: last.id,
      due_at: now.toISOString(),
      respond_by: new Date(now.getTime() + windowMin * 60_000).toISOString(),
      status: "pending",
      source: "owner",
      requested_by: req.owner!.userId,
    })
    .select("id, respond_by")
    .single();
  if (error || !check) return res.status(500).json({ error: error?.message ?? "could not create" });

  // Same delivery as a scheduled check: push and SMS, plus the in-app banner.
  let pushed = 0;
  try {
    pushed = await pushToEmployee(emp.id, {
      title: "Confirm you're at work",
      body: `Open Aproksi HR and scan within ${windowMin} minutes to confirm your presence.`,
      url: "/me/clock-in",
    });
  } catch {
    /* push is best-effort; the SMS below is the one that has to land */
  }
  if (smsFallback && emp.phone) {
    try {
      await enqueue(
        "sms",
        {
          to: emp.phone as string,
          body: `Aproksi HR: please open the app and scan within ${windowMin} minutes to confirm you're at work.`,
        },
        `sms:presence:${check.id}`
      );
    } catch (err) {
      console.warn(`[presence] owner-check SMS failed for ${emp.id}:`, (err as Error).message);
    }
  }

  res.status(201).json({
    check: { id: check.id, respond_by: check.respond_by },
    employee: { id: emp.id, name: emp.name },
    delivered_by_push: pushed,
    window_min: windowMin,
  });
});

export default { basePath: "/api/presence", router };
