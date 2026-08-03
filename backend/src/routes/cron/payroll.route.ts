/**
 * POST /api/cron/payroll  (protected by x-cron-secret)
 *
 * Run DAILY. For each org with a payroll cadence, if today is its pay-run day and
 * it hasn't already run this period, auto-create the period's pay cycle, compute
 * a DRAFT payroll (payslips generated but NOT sent to employees), and alert the
 * owner (inbox + SMS + the per-workplace summary PDF). The owner reviews and
 * releases from the payroll page. Idempotent per period via orgs.payroll_last_period.
 */
import { Router } from "express";
import { env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { runPayrollDraft } from "../../lib/payroll/run";
import { enqueue } from "../../lib/queue";
import { lastDayOfMonth, ymdMinus, nairobiTodayParts } from "../../lib/time";

const router = Router();
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Trigger {
  period: string; // guard key, unique per pay period
  label: string;
  start: string; // YYYY-MM-DD
  end: string;
  payDate: string;
}

/** Decide whether an org's cadence fires today, and for which period. */
function triggerFor(
  cadence: string,
  payDay: number | null,
  payMonth: string,
  p: { ymd: string; y: number; m: number; d: number; weekday: number; lastDay: number; daysSinceEpoch: number }
): Trigger | null {
  if (cadence === "monthly") {
    if (payMonth === "previous") {
      // Pay LAST month's work on `payDay` of this month (e.g. July's pay on 5 Aug).
      const effective = payDay && payDay >= 1 && payDay <= 28 ? payDay : 1;
      if (p.d !== effective) return null;
      const py = p.m === 1 ? p.y - 1 : p.y;
      const pm = p.m === 1 ? 12 : p.m - 1; // previous month (1-based)
      const mm = String(pm).padStart(2, "0");
      const lastD = lastDayOfMonth(py, pm);
      return {
        period: `${py}-${mm}`,
        label: `${MONTHS[pm - 1]} ${py}`,
        start: `${py}-${mm}-01`,
        end: `${py}-${mm}-${String(lastD).padStart(2, "0")}`,
        payDate: p.ymd,
      };
    }
    // "current": pay THIS month's work at month-end (or on the chosen day).
    const effective = payDay && payDay >= 1 && payDay <= 28 ? Math.min(payDay, p.lastDay) : p.lastDay;
    if (p.d !== effective) return null;
    const mm = String(p.m).padStart(2, "0");
    return {
      period: `${p.y}-${mm}`,
      label: `${MONTHS[p.m - 1]} ${p.y}`,
      start: `${p.y}-${mm}-01`,
      end: p.ymd,
      payDate: p.ymd,
    };
  }
  const payWeekday = payDay != null && payDay >= 0 && payDay <= 6 ? payDay : 5; // default Friday
  if (p.weekday !== payWeekday) return null;

  if (cadence === "weekly") {
    const start = ymdMinus(p.ymd, 6);
    return { period: `W:${start}`, label: `Week ending ${p.ymd}`, start, end: p.ymd, payDate: p.ymd };
  }
  if (cadence === "biweekly") {
    // Fire on the target weekday only every other week.
    if (Math.floor(p.daysSinceEpoch / 7) % 2 !== 0) return null;
    const start = ymdMinus(p.ymd, 13);
    return { period: `F:${start}`, label: `Fortnight ending ${p.ymd}`, start, end: p.ymd, payDate: p.ymd };
  }
  return null;
}

router.post("/", async (req, res) => {
  if (req.headers["x-cron-secret"] !== env.cronSecret()) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const db = getServiceClient();

  // Today's Nairobi date parts (weekday 0=Sun..6=Sat) for cadence scheduling.
  const parts = nairobiTodayParts();

  const { data: orgs } = await db
    .from("orgs")
    .select("id, name, phone, payroll_cadence, payroll_pay_day, payroll_pay_month, payroll_last_period")
    .neq("payroll_cadence", "off");

  const ran: { org_id: string; period: string; total: number }[] = [];

  for (const org of orgs ?? []) {
    const trig = triggerFor(org.payroll_cadence, org.payroll_pay_day ?? null, org.payroll_pay_month ?? "previous", parts);
    if (!trig) continue;
    if (org.payroll_last_period === trig.period) continue; // already ran this period

    try {
      const { data: cycle, error } = await db
        .from("pay_cycles")
        .insert({
          org_id: org.id,
          label: trig.label,
          start_date: trig.start,
          end_date: trig.end,
          pay_date: trig.payDate,
          auto: true,
          status: "open",
        })
        .select("id")
        .single();
      if (error || !cycle) throw new Error(error?.message ?? "cycle insert failed");

      await runPayrollDraft(cycle.id);

      // Mark the period done so we don't re-run it.
      await db.from("orgs").update({ payroll_last_period: trig.period }).eq("id", org.id);

      // Read the rolled-up totals the draft just produced.
      const { data: done } = await db
        .from("pay_cycles")
        .select("total_net, employee_count, flagged_count")
        .eq("id", cycle.id)
        .single();
      const total = Number(done?.total_net ?? 0);
      const totalStr = `KES ${Math.round(total).toLocaleString("en-KE")}`;
      const flagged = Number(done?.flagged_count ?? 0);
      const flaggedNote = flagged > 0 ? ` ${flagged} item(s) need attention before approval.` : "";

      // Notify the owner: inbox + SMS. Human-gated — they must review and approve.
      await db.from("owner_notifications").insert({
        org_id: org.id,
        kind: "payroll",
        title: `Payroll draft ready — ${trig.label}`,
        body:
          `Draft payroll is ready: ${totalStr} across ${done?.employee_count ?? 0} staff.${flaggedNote}` +
          ` Review, resolve any flags, and approve.`,
        link: "/dashboard/payroll",
        ref_id: cycle.id,
      });

      if (org.phone) {
        try {
          // Deduped per (org, period): re-running the cron won't re-send.
          await enqueue(
            "sms",
            { to: org.phone, body: `Kaunta HR: draft payroll for ${trig.label} is ready (${totalStr}).${flaggedNote} Review and approve at ${env.appUrl}/dashboard/payroll` },
            `sms:payroll:${org.id}:${trig.period}`
          );
        } catch (err) {
          console.warn(`[cron][payroll] SMS enqueue to owner failed for org ${org.id}:`, (err as Error).message);
        }
      }

      ran.push({ org_id: org.id, period: trig.period, total });
    } catch (err) {
      console.error(`[cron][payroll] run failed for org ${org.id}:`, (err as Error).message);
    }
  }

  res.json({ processed: ran.length, ran });
});

export default { basePath: "/api/cron/payroll", router };
