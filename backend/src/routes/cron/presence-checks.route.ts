/**
 * POST /api/cron/presence-checks  (protected by x-cron-secret)
 *
 * Run every few minutes by an external scheduler. Two jobs:
 *   1) Close out pending checks whose window has passed → 'missed', and flag the
 *      employee's open clock-in entry so the owner sees it in the roster.
 *   2) For each currently clocked-in employee whose org has presence checks
 *      enabled, fire whichever of today's randomised check times has come due.
 *      Times are seeded per employee per day — see lib/presence/schedule.
 *
 * Delivery: Web Push AND SMS, plus the in-app banner
 * (GET /api/presence/pending). All three, because a missed check flags the
 * clock-in and can end in a deduction, so "the notification probably arrived"
 * is not good enough.
 *
 * The response reports why nothing fired as well as what did — `skipped` breaks
 * the silence down per reason, because "0 fired" and "switched off" used to
 * look identical.
 */
import { Router } from "express";
import { env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { pushToEmployee } from "../../lib/push";
import { enqueue } from "../../lib/queue";
import { approvedLeaveOn } from "../../lib/leave/cover";
import { checkTimes, dueNow } from "../../lib/presence/schedule";

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
    .select("id, session_entry_id, employee_id")
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

    // Tell the owner. A missed check that nobody hears about is the same as no
    // check at all — the whole point is that they find out on the day, not at
    // month end. Deterministic: the window passed with no scan, so it failed.
    try {
      const { data: emp } = await db
        .from("employees")
        .select("id, name, org_id, workplace_id, workplaces(name)")
        .eq("id", c.employee_id)
        .maybeSingle();
      if (emp) {
        const site =
          (emp.workplaces as unknown as { name: string } | null)?.name ?? "their site";
        await db.from("owner_notifications").insert({
          org_id: emp.org_id,
          kind: "presence",
          title: `${emp.name} missed a presence check`,
          body: `A random check at ${site} went unanswered inside the window. The clock-in has been flagged.`,
          link: "/dashboard",
          ref_id: c.session_entry_id,
        });

        const { data: org } = await db
          .from("orgs")
          .select("phone")
          .eq("id", emp.org_id)
          .maybeSingle();
        if (org?.phone) {
          // Deduped per missed check so a re-run of the sweep never re-sends.
          await enqueue(
            "sms",
            {
              to: org.phone as string,
              body: `Kaunta HR: ${emp.name} missed a random presence check at ${site}. The clock-in is flagged for your review.`,
            },
            `sms:presence-missed:${c.id}`
          );
        }
      }
    } catch (err) {
      // Never let a notification failure stop the sweep.
      console.error(`[cron] missed-check notice failed for ${c.id}:`, (err as Error).message);
    }
  }

  // ── 2) Fire new checks for clocked-in employees in enabled orgs. ─────────────
  const { data: orgs } = await db
    .from("orgs")
    .select("id, presence_checks_per_shift, presence_check_window_min, presence_sms_fallback")
    .gt("presence_checks_per_shift", 0);

  const dayStart = nairobiDayStartISO(now);
  let fired = 0;
  let deliveredByPush = 0;
  let deliveredBySms = 0;
  let orgsEnabled = (orgs ?? []).length;
  let employeesConsidered = 0;

  /* Why nothing fired, counted. "Is the random-check feature working?" used to
   * be unanswerable without reading the database by hand — the endpoint
   * returned two numbers and every reason for silence looked identical. */
  const skipped: Record<string, number> = {
    no_shift: 0,
    not_clocked_in: 0,
    outside_shift: 0,
    on_leave: 0,
    already_pending: 0,
    quota_met: 0,
    none_due_yet: 0,
  };

  for (const org of orgs ?? []) {
    const target = org.presence_checks_per_shift as number;
    const windowMin = (org.presence_check_window_min as number) || 10;
    const smsFallback = org.presence_sms_fallback !== false; // default on

    const { data: employees } = await db
      .from("employees")
      .select("id, name, phone, shift:shifts(start_time, end_time)")
      .eq("org_id", org.id)
      .eq("status", "active");

    employeesConsidered += (employees ?? []).length;

    for (const emp of employees ?? []) {
      const shift = (Array.isArray((emp as any).shift) ? (emp as any).shift[0] : (emp as any).shift) as ShiftRow | null;
      if (!shift) {
        skipped.no_shift++;
        continue;
      }

      // Currently clocked in? (last entry today is an 'in')
      const { data: last } = await db
        .from("attendance_entries")
        .select("id, direction, scanned_at")
        .eq("employee_id", emp.id)
        .gte("scanned_at", dayStart)
        .order("scanned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!last || last.direction !== "in") {
        skipped.not_clocked_in++;
        continue;
      }

      // Never chase someone whose day the owner already signed off. A missed
      // check flags the clock-in, and flagging an approved leave day is the
      // same mistake as fining one.
      if (await approvedLeaveOn(db, emp.id, nairobiYmd(now))) {
        skipped.on_leave++;
        continue;
      }

      // Shift window (handle overnight shifts by pushing end to the next day).
      const shiftStart = nairobiTimeToday(now, shift.start_time);
      let shiftEnd = nairobiTimeToday(now, shift.end_time);
      if (shiftEnd.getTime() <= shiftStart.getTime()) shiftEnd = new Date(shiftEnd.getTime() + 24 * 3600 * 1000);
      if (now < shiftStart || now > shiftEnd) {
        skipped.outside_shift++;
        continue;
      }

      // Already-fired today + any still-pending check.
      const { data: firedToday } = await db
        .from("presence_checks")
        .select("id, status, respond_by")
        .eq("employee_id", emp.id)
        .gte("created_at", dayStart);
      const firedCount = (firedToday ?? []).length;
      const hasPending = (firedToday ?? []).some((c) => c.status === "pending" && c.respond_by >= nowIso);
      if (hasPending) {
        skipped.already_pending++;
        continue;
      }
      if (firedCount >= target) {
        skipped.quota_met++;
        continue;
      }

      // Today's randomised times for this person. Seeded on employee + date +
      // the cron secret, so they are stable across ticks and unguessable to
      // staff — see lib/presence/schedule for why the old fraction rule meant
      // one-check-a-day businesses effectively got none.
      const times = checkTimes({
        employeeId: emp.id,
        ymd: nairobiYmd(now),
        shiftStart,
        shiftEnd,
        count: target,
        salt: env.cronSecret(),
      });
      if (!dueNow(times, now, firedCount)) {
        skipped.none_due_yet++;
        continue;
      }

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

      // Both channels. Push arrives instantly on a phone that has the app
      // open or installed; the SMS reaches the one in a pocket.
      const payload = {
        title: "Confirm you're at work",
        body: `Open Kaunta HR and scan within ${windowMin} minutes to confirm your presence.`,
        url: "/me/clock-in",
      };
      const delivered = await pushToEmployee(emp.id, payload).catch(() => 0);
      if (delivered > 0) deliveredByPush++;

      // The SMS goes either way. A browser notification on a locked phone is
      // not evidence anybody saw it, and this is the one message whose silence
      // flags a clock-in and can end in a deduction. Deduped per check, so
      // re-running the sweep never sends it twice.
      if (smsFallback && emp.phone) {
        try {
          await enqueue(
            "sms",
            {
              to: emp.phone,
              body: `Kaunta HR: please open the app and scan within ${windowMin} minutes to confirm you're at work.`,
            },
            `sms:presence:${check.id}`
          );
          deliveredBySms++;
        } catch (err) {
          console.warn(`[cron] presence SMS enqueue failed for ${emp.id}:`, (err as Error).message);
        }
      }
    }
  }

  res.json({
    missed,
    fired,
    delivered_by_push: deliveredByPush,
    delivered_by_sms: deliveredBySms,
    orgs_enabled: orgsEnabled,
    employees_considered: employeesConsidered,
    skipped,
    // Said plainly, because "0 fired" and "not switched on" look identical in a
    // pair of counters and the difference is the whole feature.
    note:
      orgsEnabled === 0
        ? "No org has presence_checks_per_shift above 0 — random checks are switched off everywhere."
        : fired === 0
          ? "Nothing was due this tick. `skipped` says why for each employee."
          : undefined,
  });
});

export default { basePath: "/api/cron/presence-checks", router };
