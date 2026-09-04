/**
 * Attendance reports.
 *
 *   GET /api/reports/range?from=&to=       any range, always available
 *   GET /api/reports/periods                which months and years are closed
 *   GET /api/reports/month/:key             a closed month  (2026-07)
 *   GET /api/reports/year/:key              a closed year   (2026)
 *
 * Owner only. The period routes refuse an unfinished period with a 409 and a
 * sentence explaining why, rather than a 400 — the request is well formed, the
 * period simply is not over, and that difference is worth keeping in the status
 * code as well as the message.
 */
import { Router } from "express";
import { z } from "zod";
import { requireOwner } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";
import { buildAttendanceReport } from "../../lib/reports/attendance";
import {
  parseMonth,
  parseYear,
  periodAvailable,
  closedMonths,
  closedYears,
  monthsOfYear,
} from "../../lib/reports/periods";
import { nairobiDate } from "../../lib/time";

const router = Router();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const rangeSchema = z.object({ from: isoDate, to: isoDate });

/** A year of days is the most anybody can read; beyond that use the periods. */
const MAX_RANGE_DAYS = 366;

router.get("/range", requireOwner, async (req, res) => {
  const parsed = rangeSchema.safeParse({ from: req.query.from, to: req.query.to });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid range" });
  }
  const { from, to } = parsed.data;
  if (to < from) return res.status(400).json({ error: "the last day cannot be before the first" });

  const days = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000
  );
  if (days > MAX_RANGE_DAYS) {
    return res.status(400).json({ error: `ranges are limited to ${MAX_RANGE_DAYS} days` });
  }

  try {
    const report = await buildAttendanceReport(getServiceClient(), {
      orgId: req.owner!.orgId,
      range: { from, to },
    });
    res.json({ report });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * What can be reported on. Deliberately returns only CLOSED periods — the
 * picker should not offer a month it will then refuse.
 */
router.get("/periods", requireOwner, (_req, res) => {
  const now = new Date();
  res.json({
    today: nairobiDate(now),
    months: closedMonths(now),
    years: closedYears(now),
  });
});

router.get("/month/:key", requireOwner, async (req, res) => {
  const period = parseMonth(req.params.key);
  if (!period) return res.status(400).json({ error: "month must be YYYY-MM" });

  const availability = periodAvailable(period);
  if (!availability.available) {
    return res.status(409).json({ error: availability.reason, ready_on: availability.readyOn });
  }

  try {
    const report = await buildAttendanceReport(getServiceClient(), {
      orgId: req.owner!.orgId,
      range: { from: period.from, to: period.to },
      periodComplete: true,
    });
    res.json({ period, report });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * A year is a comparison across its twelve closed months, not one enormous
 * month. Twelve rows an owner can scan beats a single total nobody acts on.
 */
router.get("/year/:key", requireOwner, async (req, res) => {
  const period = parseYear(req.params.key);
  if (!period) return res.status(400).json({ error: "year must be YYYY" });

  const availability = periodAvailable(period);
  if (!availability.available) {
    return res.status(409).json({ error: availability.reason, ready_on: availability.readyOn });
  }

  const db = getServiceClient();
  try {
    const [whole, ...months] = await Promise.all([
      buildAttendanceReport(db, {
        orgId: req.owner!.orgId,
        range: { from: period.from, to: period.to },
        periodComplete: true,
      }),
      ...monthsOfYear(period.key).map((m) =>
        buildAttendanceReport(db, {
          orgId: req.owner!.orgId,
          range: { from: m.from, to: m.to },
          periodComplete: true,
        })
      ),
    ]);

    res.json({
      period,
      report: whole,
      months: monthsOfYear(period.key).map((m, i) => ({
        key: m.key,
        label: m.label,
        totals: months[i].totals,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default { basePath: "/api/reports", router };
