/**
 * POST /api/cron/daily-digest  (protected by x-cron-secret)
 *
 * Runs each morning and tells every owner what happened yesterday — one SMS,
 * one segment, a short link to the full report.
 *
 * It runs AFTER the absence sweep (21:30 the night before), so by the time this
 * fires the day is fully resolved: absences raised or held, closures asked
 * about, checks expired. Sending it the same evening would report a day that
 * was still being written.
 *
 * Sends nothing on a clean day. See lib/digest/daily for why silence matters
 * more than completeness in a message people receive every morning.
 */
import { Router } from "express";
import { env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { buildAttendanceReport } from "../../lib/reports/attendance";
import { buildDailyDigest, type PendingClosure } from "../../lib/digest/daily";
import { sendText } from "../../lib/messaging";
import { nairobiDate, TZ } from "../../lib/time";

const router = Router();

/** "Tue 18 Aug" — the budget is 160 characters, so the date is three words. */
function shortDay(ymd: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

/**
 * The short link. `/r/260818` rather than
 * `/dashboard/reports?from=2026-08-18&to=2026-08-18` — about 35 characters
 * back, on every message, forever.
 */
function shortLink(ymd: string): string {
  const compact = ymd.slice(2).replace(/-/g, "");
  return `${env.appUrl.replace(/^https?:\/\//, "")}/r/${compact}`;
}

export async function runDailyDigest(
  opts: { db?: ReturnType<typeof getServiceClient>; now?: Date; dateOverride?: string } = {}
) {
  const db = opts.db ?? getServiceClient();
  const now = opts.now ?? new Date();

  // Yesterday, in Nairobi terms.
  const target =
    opts.dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(opts.dateOverride)
      ? opts.dateOverride
      : nairobiDate(new Date(now.getTime() - 86400000));

  const { data: orgs } = await db.from("orgs").select("id, name, phone");

  const result = {
    date: target,
    orgs: (orgs ?? []).length,
    sent: 0,
    skipped_clean: 0,
    skipped_no_phone: 0,
    failed: 0,
  };

  for (const org of orgs ?? []) {
    const phone = (org.phone as string | null) ?? null;
    if (!phone) {
      result.skipped_no_phone++;
      continue;
    }

    try {
      const report = await buildAttendanceReport(db, {
        orgId: org.id as string,
        range: { from: target, to: target },
        periodComplete: true,
        now,
      });

      const closures = await pendingClosures(db, org.id as string, target);

      const digest = buildDailyDigest({
        report,
        closures,
        dayLabel: shortDay(target),
        link: shortLink(target),
      });

      if (!digest.text) {
        result.skipped_clean++;
        continue;
      }

      await sendText(phone, digest.text);
      result.sent++;
    } catch (err) {
      result.failed++;
      console.error(`[cron] digest failed for org ${org.id}:`, (err as Error).message);
    }
  }

  return result;
}

async function pendingClosures(
  db: ReturnType<typeof getServiceClient>,
  orgId: string,
  onDate: string
): Promise<PendingClosure[]> {
  const { data } = await db
    .from("closure_reviews")
    .select("rostered, workplaces(name)")
    .eq("org_id", orgId)
    .eq("on_date", onDate)
    .eq("status", "pending");

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const wp = Array.isArray(r.workplaces) ? r.workplaces[0] : r.workplaces;
    return {
      siteName: (wp as { name?: string } | null)?.name ?? null,
      rostered: Number(r.rostered ?? 0),
    };
  });
}

router.post("/", async (req, res) => {
  if (req.headers["x-cron-secret"] !== env.cronSecret()) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    res.json(
      await runDailyDigest({
        dateOverride: typeof req.query.date === "string" ? req.query.date : undefined,
      })
    );
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default { basePath: "/api/cron/daily-digest", router };
