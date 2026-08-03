/**
 * POST /api/cron/monthly-review  (protected by x-cron-secret)
 *
 * Runs on the 1st. For the month that just closed it finds everyone with a
 * clean record — scans, no lateness, no missed checks, no penalties — and puts
 * a bonus suggestion in the owner's inbox while there is still time to act on
 * it before payroll.
 *
 * It suggests. It never awards anything, and never touches a payslip.
 */
import { Router } from "express";
import { env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { perfectMonth, detect } from "../../lib/insights/detectors";

const router = Router();
const TZ = "Africa/Nairobi";

/** First and last day of the calendar month before `now`, in Nairobi terms. */
function lastMonth(now: Date) {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m] = ymd.split("-").map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const lastDay = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  const mm = String(prevM).padStart(2, "0");
  return {
    start: `${prevY}-${mm}-01`,
    end: `${prevY}-${mm}-${String(lastDay).padStart(2, "0")}`,
    label: new Date(Date.UTC(prevY, prevM - 1, 1)).toLocaleDateString("en-KE", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

router.post("/", async (req, res) => {
  if (req.headers["x-cron-secret"] !== env.cronSecret()) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const db = getServiceClient();
  const month = lastMonth(new Date());

  const { data: orgs, error } = await db.from("orgs").select("id");
  if (error) return res.status(500).json({ error: error.message });

  let suggested = 0;
  let flagged = 0;

  for (const org of orgs ?? []) {
    const orgId = org.id as string;

    // ── Clean months → bonus suggestions ──
    try {
      const clean = await perfectMonth(db, orgId, month);
      for (const f of clean) {
        await db.from("owner_notifications").insert({
          org_id: orgId,
          kind: "bonus_suggestion",
          title: f.headline,
          body: `${f.detail} Nothing has been paid — this is a suggestion, and payroll is untouched until you act on it.`,
          link: "/dashboard/payroll",
          ref_id: f.employeeId,
        });
        suggested++;
      }
    } catch (err) {
      console.error(`[cron] perfect-month failed for org ${orgId}:`, (err as Error).message);
    }

    // ── Patterns worth acting on, over the month just closed ──
    try {
      const findings = await detect(db, orgId, 30);
      for (const f of findings.filter((x) => x.severity === "act")) {
        await db.from("owner_notifications").insert({
          org_id: orgId,
          kind: "pattern",
          title: f.headline,
          body: f.detail,
          link: "/dashboard/violations",
          ref_id: f.employeeId,
        });
        flagged++;
      }
    } catch (err) {
      console.error(`[cron] pattern review failed for org ${orgId}:`, (err as Error).message);
    }
  }

  res.json({ month: month.label, bonus_suggestions: suggested, patterns_flagged: flagged });
});

export default { basePath: "/api/cron/monthly-review", router };
