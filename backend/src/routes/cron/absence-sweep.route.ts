/**
 * POST /api/cron/absence-sweep  (protected by x-cron-secret)
 *
 * Once a day, after the latest shift has ended: every active employee with a
 * rostered shift who produced no clock-in that day is evaluated for the
 * owner's `absent` rule.
 *
 * ── Why this is grouped by site ──────────────────────────────────────────────
 *
 * It used to iterate employees. That is the right shape for the question "was
 * this person absent?" and the wrong shape for the question that actually
 * matters first: "did anything happen at this site today?"
 *
 * Asked one employee at a time, a public holiday looks like eleven independent
 * absences, and the sweep charged for all eleven and texted all eleven at 21:30
 * to say so. Asked per site, the same data is unmistakable — six of six missing
 * is one event, not six decisions — and the honest response is to hold the
 * penalties and ask someone what happened.
 *
 * So there are now three outcomes for a site-day rather than one:
 *
 *   declared closed   → nothing happens at all; the owner told us in advance
 *   nobody scanned    → penalties HELD, a question raised for the owner
 *   somebody scanned  → normal per-employee evaluation, as before
 *
 * Approved leave is still checked inside the engine, so a day the owner signed
 * off is never an absence regardless of which branch it took.
 */
import { Router } from "express";
import { env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { evaluateAbsence } from "../../lib/rules/engine";
import { assessSiteDay } from "../../lib/attendance/closure";
import { expireStaleReviews } from "../../lib/attendance/resolveClosure";
import { dayWindowUtc, nairobiDate, weekdayOf } from "../../lib/time";

const router = Router();

interface EmployeeRow {
  id: string;
  org_id: string;
  workplace_id: string | null;
  shift_id: string | null;
  shift: { days_of_week: number[] } | { days_of_week: number[] }[] | null;
}

/** Joined rows arrive as an object or a one-element array depending on cardinality. */
const one = <T>(x: unknown): T | null =>
  Array.isArray(x) ? ((x[0] as T) ?? null) : ((x as T) ?? null);

/**
 * The job itself. Called directly by the in-process scheduler and, via the
 * route below, by any external scheduler. No HTTP in the direct path.
 *
 * `db` and `now` are injectable so the holiday case can be tested — the whole
 * point of this change is a branch that only fires on days nobody works, which
 * is precisely the branch you cannot wait around to observe.
 */
export async function runAbsenceSweep(
  opts: { dateOverride?: string; db?: ReturnType<typeof getServiceClient>; now?: Date } = {}
) {
  const db = opts.db ?? getServiceClient();
  const now = opts.now ?? new Date();

  // Sweep the day that has just finished. Running at 21:30 Nairobi means the
  // date being swept is today; an explicit date lets a missed run be replayed
  // without waiting another 24 hours.
  const target =
    opts.dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(opts.dateOverride)
      ? opts.dateOverride
      : nairobiDate(now);

  const { startISO, endISO } = dayWindowUtc(target, target);
  const weekday = weekdayOf(target);

  // Only employees who were actually rostered — no shift, no expectation.
  const { data: employees, error } = await db
    .from("employees")
    .select("id, org_id, workplace_id, shift_id, shift:shifts(days_of_week)")
    .eq("status", "active")
    .not("shift_id", "is", null);
  if (error) throw new Error(String(error.message));

  // Rostered for THIS weekday. The old sweep skipped this check entirely, so a
  // Monday-to-Friday employee was evaluated for absence on Sunday and saved
  // only by the absence rule happening to be configured sanely.
  const rostered = (employees ?? []).filter((e) => {
    const shift = one<{ days_of_week: number[] }>((e as EmployeeRow).shift);
    return !shift || (shift.days_of_week ?? []).includes(weekday);
  }) as EmployeeRow[];

  // Questions nobody answered inside the window are discarded here rather than
  // in a job of their own. They were raised by this sweep; they should die by
  // it, and a held penalty must never outlive the question that held it.
  const { expired } = await expireStaleReviews(db, now);

  const result = {
    date: target,
    checked: 0,
    raised: 0,
    held: 0,
    sites_reviewed: 0,
    skipped_declared_closed: 0,
    reviews_expired: expired,
  };
  if (rostered.length === 0) return result;

  // Everything below is per (org, site). A business with four sites can have
  // one shut for stock-take and three trading normally, and each is its own
  // question.
  const groups = new Map<string, { orgId: string; workplaceId: string | null; emps: EmployeeRow[] }>();
  for (const e of rostered) {
    const key = `${e.org_id}::${e.workplace_id ?? "-"}`;
    const g = groups.get(key) ?? { orgId: e.org_id, workplaceId: e.workplace_id, emps: [] };
    g.emps.push(e);
    groups.set(key, g);
  }

  for (const group of groups.values()) {
    const ids = group.emps.map((e) => e.id);
    result.checked += ids.length;

    // Declared closed in advance? Then there is nothing to evaluate and nothing
    // to ask — the owner already told us.
    if (await isDeclaredClosed(db, group.orgId, group.workplaceId, target)) {
      result.skipped_declared_closed += ids.length;
      continue;
    }

    const { data: scans } = await db
      .from("attendance_entries")
      .select("employee_id")
      .in("employee_id", ids)
      .gte("scanned_at", startISO)
      .lt("scanned_at", endISO);

    const scannedIds = new Set((scans ?? []).map((s) => s.employee_id as string));

    const failedAttempts = await countFailedAttempts(db, ids, startISO, endISO);
    const verdict = assessSiteDay({
      workplaceId: group.workplaceId,
      rostered: ids.length,
      scanned: scannedIds.size,
      failedAttempts,
    });

    if (verdict.hold) {
      // Hold, do not charge. Nobody is told they were absent, because nobody
      // yet knows that they were.
      await openClosureReview(db, {
        orgId: group.orgId,
        workplaceId: group.workplaceId,
        onDate: target,
        rostered: ids.length,
        scanned: 0,
        failedAttempts,
      });
      result.held += ids.length;
      result.sites_reviewed += 1;
      continue;
    }

    // The site worked. Evaluate the people who did not turn up, as before.
    for (const emp of group.emps) {
      if (scannedIds.has(emp.id)) continue;
      try {
        const applied = await evaluateAbsence(db, {
          orgId: emp.org_id,
          employeeId: emp.id,
          workplaceId: emp.workplace_id,
          onDate: target,
        });
        if (applied) result.raised++;
      } catch (err) {
        console.error(`[cron] absence eval failed for ${emp.id}:`, (err as Error).message);
      }
    }
  }

  return result;
}

/** Did the owner declare this day closed, for this site or the whole business? */
async function isDeclaredClosed(
  db: ReturnType<typeof getServiceClient>,
  orgId: string,
  workplaceId: string | null,
  onDate: string
): Promise<boolean> {
  const { data } = await db
    .from("non_working_days")
    .select("id, workplace_id")
    .eq("org_id", orgId)
    .eq("on_date", onDate);

  return (data ?? []).some(
    (d) => d.workplace_id === null || d.workplace_id === workplaceId
  );
}

async function countFailedAttempts(
  db: ReturnType<typeof getServiceClient>,
  employeeIds: string[],
  startISO: string,
  endISO: string
): Promise<number> {
  const { data } = await db
    .from("scan_attempts")
    .select("id")
    .in("employee_id", employeeIds)
    .gte("occurred_at", startISO)
    .lt("occurred_at", endISO);
  return (data ?? []).length;
}

/**
 * Raise the question once. Re-running the sweep for the same day must not
 * produce a second copy — the unique index enforces that, and hitting it is a
 * no-op rather than an error.
 */
async function openClosureReview(
  db: ReturnType<typeof getServiceClient>,
  row: {
    orgId: string;
    workplaceId: string | null;
    onDate: string;
    rostered: number;
    scanned: number;
    failedAttempts: number;
  }
): Promise<void> {
  // The unique index is partial — a NULL workplace_id needs its own — so the
  // duplicate check is done here rather than leaned on as an upsert conflict.
  const { data: existing } = await db
    .from("closure_reviews")
    .select("id, workplace_id")
    .eq("org_id", row.orgId)
    .eq("on_date", row.onDate);
  if ((existing ?? []).some((r) => r.workplace_id === row.workplaceId)) return;

  const { error } = await db.from("closure_reviews").insert({
    org_id: row.orgId,
    workplace_id: row.workplaceId,
    on_date: row.onDate,
    rostered: row.rostered,
    scanned: row.scanned,
    failed_attempts: row.failedAttempts,
    status: "pending",
  });
  if (error) console.error("[cron] could not open closure review:", error.message);
}

router.post("/", async (req, res) => {
  if (req.headers["x-cron-secret"] !== env.cronSecret()) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    res.json(
      await runAbsenceSweep({
        dateOverride: typeof req.query.date === "string" ? req.query.date : undefined,
      })
    );
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default { basePath: "/api/cron/absence-sweep", router };
