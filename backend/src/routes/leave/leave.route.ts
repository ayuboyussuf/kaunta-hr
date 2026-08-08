/**
 * Leave requests.
 *
 * Staff file ahead of time with a reason; the owner approves or declines and
 * says whether the day is paid. An approved day is excluded from absence
 * enforcement, so the rules engine never penalises a day that was signed off.
 */
import { Router } from "express";
import { z } from "zod";
import { requireOwner, requireEmployee } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";
import { sendText } from "../../lib/messaging";

const router = Router();

const DAY = 24 * 60 * 60 * 1000;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/** Whole days between today and the first day of leave, in the org's terms. */
function clearDaysUntil(startDate: string): number {
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const [y, m, d] = startDate.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - todayUtc) / DAY);
}

function countDays(start: string, end: string): number {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  return Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / DAY) + 1;
}

/* ── Staff: file a request ───────────────────────────────────────── */

const createSchema = z.object({
  start_date: isoDate,
  end_date: isoDate,
  reason: z.string().trim().min(3, "give a reason").max(500),
  // Half a day only makes sense for a single day — "the afternoon" of a
  // four-day range is not something anyone means.
  half_day: z.enum(["morning", "afternoon"]).nullable().optional(),
});

router.post("/", requireEmployee, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid request" });
  }
  const { start_date, end_date, reason } = parsed.data;
  const half_day = parsed.data.half_day ?? null;
  if (end_date < start_date) {
    return res.status(400).json({ error: "the last day cannot be before the first" });
  }
  if (half_day && start_date !== end_date) {
    return res.status(400).json({ error: "Half a day can only be asked for on a single day." });
  }

  const db = getServiceClient();
  const { orgId, employeeId } = req.employee!;

  const { data: org } = await db
    .from("orgs")
    .select("leave_notice_days")
    .eq("id", orgId)
    .maybeSingle();
  const noticeDays = org?.leave_notice_days ?? 1;

  const notice = clearDaysUntil(start_date);
  if (notice < noticeDays) {
    return res.status(400).json({
      error:
        noticeDays === 1
          ? "Leave has to be filed at least a day before it starts."
          : `Leave has to be filed at least ${noticeDays} days before it starts.`,
      notice_days: noticeDays,
    });
  }

  // Overlapping a request that is already pending or approved would leave two
  // answers for the same day.
  const { data: clash } = await db
    .from("leave_requests")
    .select("id, start_date, end_date, status")
    .eq("employee_id", employeeId)
    .in("status", ["pending", "approved"])
    .lte("start_date", end_date)
    .gte("end_date", start_date)
    .limit(1)
    .maybeSingle();
  if (clash) {
    return res
      .status(409)
      .json({ error: "You already have a request covering some of those days." });
  }

  const { data, error } = await db
    .from("leave_requests")
    .insert({ org_id: orgId, employee_id: employeeId, start_date, end_date, reason, half_day })
    .select("id, start_date, end_date, half_day, reason, status, created_at")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json({ request: data, days: countDays(start_date, end_date) });
});

/** Staff: their own requests. */
router.get("/mine", requireEmployee, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("leave_requests")
    .select("id, start_date, end_date, half_day, reason, status, paid, decision_note, decided_at, created_at")
    .eq("employee_id", req.employee!.employeeId)
    .order("start_date", { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ requests: data ?? [] });
});

/** Staff: withdraw a request that has not been decided. */
router.post("/:id/cancel", requireEmployee, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", req.params.id)
    .eq("employee_id", req.employee!.employeeId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "no pending request to cancel" });
  res.json({ ok: true });
});

/* ── Owner: the queue and the decision ───────────────────────────── */

router.get("/", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const status = typeof req.query.status === "string" ? req.query.status : "pending";

  let q = db
    .from("leave_requests")
    .select(
      "id, start_date, end_date, half_day, reason, status, paid, decided_at, created_at, employees(id, name, phone, workplace_id)"
    )
    .eq("org_id", req.owner!.orgId)
    .order("start_date", { ascending: true })
    .limit(200);
  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ requests: data ?? [] });
});

const decideSchema = z.object({
  paid: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/approve", requireOwner, async (req, res) => {
  const parsed = decideSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "say whether the leave is paid" });
  }
  const db = getServiceClient();

  const { data, error } = await db
    .from("leave_requests")
    .update({
      status: "approved",
      paid: parsed.data.paid,
      decision_note: parsed.data.note ?? null,
      decided_by: req.owner!.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", req.params.id)
    .eq("org_id", req.owner!.orgId)
    .eq("status", "pending")
    .select("id, start_date, end_date, half_day, paid, employees(name, phone)")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "no pending request with that id" });

  const emp = data.employees as unknown as { name: string; phone: string } | null;
  if (emp?.phone) {
    const span = data.half_day
      ? `the ${data.half_day} of ${data.start_date}`
      : data.start_date === data.end_date
        ? `${data.start_date}`
        : `${data.start_date} to ${data.end_date}`;
    try {
      await sendText(
        emp.phone,
        `Aproksi HR: your leave for ${span} is approved (${data.paid ? "paid" : "unpaid"}). You will not be marked absent on those days.`
      );
    } catch (err) {
      console.error("[leave] approval notice failed:", (err as Error).message);
    }
  }

  res.json({ request: data });
});

router.post("/:id/decline", requireOwner, async (req, res) => {
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : null;
  const db = getServiceClient();

  const { data, error } = await db
    .from("leave_requests")
    .update({
      status: "declined",
      decision_note: note,
      decided_by: req.owner!.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", req.params.id)
    .eq("org_id", req.owner!.orgId)
    .eq("status", "pending")
    .select("id, start_date, end_date, employees(name, phone)")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "no pending request with that id" });

  const emp = data.employees as unknown as { name: string; phone: string } | null;
  if (emp?.phone) {
    try {
      await sendText(
        emp.phone,
        `Aproksi HR: your leave request for ${data.start_date} was not approved.${note ? ` Reason: ${note}` : ""} Normal attendance rules apply on those days.`
      );
    } catch (err) {
      console.error("[leave] decline notice failed:", (err as Error).message);
    }
  }

  res.json({ request: data });
});

export default { basePath: "/api/leave", router };
