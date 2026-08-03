/**
 * POST /api/cron/presence-checks  (protected by x-cron-secret)
 *
 * Run every few minutes by an external scheduler. Two jobs:
 *   1) Close out pending checks whose window has passed → 'missed', and flag the
 *      employee's open clock-in entry so the owner sees it in the roster.
 *   2) For each currently clocked-in employee whose org has presence checks
 *      enabled, fire a new random check when they're "behind schedule" for the
 *      shift (checks are spread across the shift, not all at once).
 *
 * Delivery: Web Push when the employee has a subscription; otherwise an SMS
 * fallback. Either way the in-app banner (GET /api/presence/pending) shows it.
 */
import { Router } from "express";
import { env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { pushToEmployee } from "../../lib/push";
import { enqueue } from "../../lib/queue";

const router = Router();
const TZ = "Africa/Nairobi";

/** "YYYY-MM-DD" for now in Nairobi. */
function nairobiYmd(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function nairobiDayStartISO(now: Date): string {
  return new Date(`${nairobiYmd(now)}T00:00:00+03:00`).toISOString();
}
/** A Date for today's HH:MM in Nairobi. */
function nairobiTimeToday(now: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":");
  return new Date(`${nairobiYmd(now)}T${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}:00+03:00`);
}

interface ShiftRow {
  start_time: string;
  end_time: string;
}

router.post("/", async (req, res) => {
  if (req.headers["x-cron-secret"] !== env.cronSecret()) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const db = getServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // ── 1) Expire overdue pending checks → missed, and flag the open session. ────
  const { data: overdue } = await db
    .from("presence_checks")
    .select("id, session_entry_id")
    .eq("status", "pending")
    .lt("respond_by", nowIso);

  let missed = 0;
  for (const c of overdue ?? []) {
    await db.from("presence_checks").update({ status: "missed" }).eq("id", c.id);
    missed++;
    if (c.session_entry_id) {
      // Append a flag to the clock-in entry so it surfaces in the owner roster.
      const { data: entry } = await db
        .from("attendance_entries")
        .select("flags")
        .eq("id", c.session_entry_id)
        .maybeSingle();
      const flags = Array.isArray(entry?.flags) ? (entry!.flags as string[]) : [];
      if (!flags.includes("missed_presence_check")) flags.push("missed_presence_check");
      await db
        .from("attendance_entries")
        .update({ flags, status: "flagged" })
        .eq("id", c.session_entry_id);
    }
  }

  // ── 2) Fire new checks for clocked-in employees in enabled orgs. ─────────────
  const { data: orgs } = await db
    .from("orgs")
    .select("id, presence_checks_per_shift, presence_check_window_min, presence_sms_fallback")
    .gt("presence_checks_per_shift", 0);

  const dayStart = nairobiDayStartISO(now);
  let fired = 0;

  for (const org of orgs ?? []) {
    const target = org.presence_checks_per_shift as number;
    const windowMin = (org.presence_check_window_min as number) || 10;
    const smsFallback = org.presence_sms_fallback !== false; // default on

    const { data: employees } = await db
      .from("employees")
      .select("id, name, phone, shift:shifts(start_time, end_time)")
      .eq("org_id", org.id)
      .eq("status", "active");

    for (const emp of employees ?? []) {
      const shift = (Array.isArray((emp as any).shift) ? (emp as any).shift[0] : (emp as any).shift) as ShiftRow | null;
      if (!shift) continue;

      // Currently clocked in? (last entry today is an 'in')
      const { data: last } = await db
        .from("attendance_entries")
        .select("id, direction, scanned_at")
        .eq("employee_id", emp.id)
        .gte("scanned_at", dayStart)
        .order("scanned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!last || last.direction !== "in") continue;

      // Shift window (handle overnight shifts by pushing end to the next day).
      const shiftStart = nairobiTimeToday(now, shift.start_time);
      let shiftEnd = nairobiTimeToday(now, shift.end_time);
      if (shiftEnd.getTime() <= shiftStart.getTime()) shiftEnd = new Date(shiftEnd.getTime() + 24 * 3600 * 1000);
      if (now < shiftStart || now > shiftEnd) continue;

      // How many checks should have fired by now, given elapsed shift fraction.
      const frac = (now.getTime() - shiftStart.getTime()) / (shiftEnd.getTime() - shiftStart.getTime());
      const expected = Math.floor(target * Math.min(1, Math.max(0, frac)));
      if (expected < 1) continue;

      // Already-fired today + any still-pending check.
      const { data: firedToday } = await db
        .from("presence_checks")
        .select("id, status, respond_by")
        .eq("employee_id", emp.id)
        .gte("created_at", dayStart);
      const firedCount = (firedToday ?? []).length;
      const hasPending = (firedToday ?? []).some((c) => c.status === "pending" && c.respond_by >= nowIso);
      if (hasPending || firedCount >= expected || firedCount >= target) continue;

      // Fire one.
      const respondBy = new Date(now.getTime() + windowMin * 60 * 1000).toISOString();
      const { data: check, error: insErr } = await db
        .from("presence_checks")
        .insert({
          employee_id: emp.id,
          session_entry_id: last.id,
          due_at: nowIso,
          respond_by: respondBy,
          status: "pending",
        })
        .select("id")
        .single();
      if (insErr || !check) {
        console.error(`[cron] presence insert failed for ${emp.id}:`, insErr?.message);
        continue;
      }
      fired++;

      // Notify: push first; SMS only if no push device (avoid needless SMS cost).
      const payload = {
        title: "Confirm you're at work",
        body: `Open Kaunta HR and scan within ${windowMin} minutes to confirm your presence.`,
        url: "/me/clock-in",
      };
      const delivered = await pushToEmployee(emp.id, payload).catch(() => 0);
      if (delivered === 0 && smsFallback && emp.phone) {
        try {
          // Background job, deduped per presence check so a re-run never re-sends.
          await enqueue(
            "sms",
            { to: emp.phone, body: `Kaunta HR: please open the app and scan within ${windowMin} minutes to confirm you're at work.` },
            `sms:presence:${check.id}`
          );
        } catch (err) {
          console.warn(`[cron] presence SMS enqueue failed for ${emp.id}:`, (err as Error).message);
        }
      }
    }
  }

  res.json({ missed, fired });
});

export default { basePath: "/api/cron/presence-checks", router };
