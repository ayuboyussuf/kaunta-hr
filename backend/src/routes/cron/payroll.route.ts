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
import { sendText } from "../../lib/messaging";

const router = Router();
const TZ = "Africa/Nairobi";
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
  p: { ymd: string; y: number; m: number; d: number; weekday: number; lastDay: number; daysSinceEpoch: number }
): Trigger | null {
  if (cadence === "monthly") {
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

function ymdMinus(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

router.post("/", async (req, res) => {
  if (req.headers["x-cron-secret"] !== env.cronSecret()) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const db = getServiceClient();
  const now = new Date();

  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = ymd.split("-").map(Number);
  const weekday = new Date(`${ymd}T12:00:00+03:00`).getUTCDay();
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysSinceEpoch = Math.floor(new Date(`${ymd}T00:00:00Z`).getTime() / 86_400_000);
  const parts = { ymd, y, m, d, weekday, lastDay, daysSinceEpoch };

  const { data: orgs } = await db
    .from("orgs")
    .select("id, name, phone, payroll_cadence, payroll_pay_day, payroll_last_period")
    .neq("payroll_cadence", "off");

  const ran: { org_id: string; period: string; total: number }[] = [];

  for (const org of orgs ?? []) {
    const trig = triggerFor(org.payroll_cadence, org.payroll_pay_day ?? null, parts);
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
          await sendText(
            org.phone,
            `Kaunta HR: draft payroll for ${trig.label} is ready (${totalStr}).${flaggedNote} Review and approve at ${env.appUrl}/dashboard/payroll`
          );
        } catch (err) {
          console.warn(`[cron][payroll] SMS to owner failed for org ${org.id}:`, (err as Error).message);
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
