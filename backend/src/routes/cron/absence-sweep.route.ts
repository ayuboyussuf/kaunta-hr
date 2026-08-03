/**
 * POST /api/cron/absence-sweep  (protected by x-cron-secret)
 *
 * Once a day, after the latest shift has ended: every active employee with a
 * rostered shift who produced no clock-in that day is evaluated for the
 * owner's `absent` rule.
 *
 * Approved leave is checked inside the engine, so a day the owner signed off
 * is never an absence and never attracts a deduction.
 *
 * Deterministic throughout — it asks "was there a scan?" and "is there an
 * absent rule?", nothing more.
 */
import { Router } from "express";
import { env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { evaluateAbsence } from "../../lib/rules/engine";

const router = Router();
const TZ = "Africa/Nairobi";

function nairobiYmd(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

router.post("/", async (req, res) => {
  if (req.headers["x-cron-secret"] !== env.cronSecret()) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const db = getServiceClient();
  const now = new Date();

  // Sweep the day that has just finished. Running at 21:30 Nairobi means the
  // date being swept is today; an explicit ?date= lets a missed run be
  // replayed without waiting another 24 hours.
  const target =
    typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : nairobiYmd(now);

  const dayStart = new Date(`${target}T00:00:00+03:00`).toISOString();
  const dayEnd = new Date(`${target}T23:59:59+03:00`).toISOString();

  // Only employees who were actually rostered — no shift, no expectation.
  const { data: employees, error } = await db
    .from("employees")
    .select("id, org_id, workplace_id, shift_id")
    .eq("status", "active")
    .not("shift_id", "is", null);
  if (error) return res.status(500).json({ error: error.message });

  let checked = 0;
  let raised = 0;

  for (const emp of employees ?? []) {
    checked++;
    const { data: scan } = await db
      .from("attendance_entries")
      .select("id")
      .eq("employee_id", emp.id)
      .gte("scanned_at", dayStart)
      .lte("scanned_at", dayEnd)
      .limit(1)
      .maybeSingle();
    if (scan) continue; // they turned up

    try {
      const applied = await evaluateAbsence(db, {
        orgId: emp.org_id as string,
        employeeId: emp.id as string,
        workplaceId: (emp.workplace_id as string | null) ?? null,
        onDate: target,
      });
      if (applied) raised++;
    } catch (err) {
      console.error(`[cron] absence eval failed for ${emp.id}:`, (err as Error).message);
    }
  }

  res.json({ date: target, checked, raised });
});

export default { basePath: "/api/cron/absence-sweep", router };
