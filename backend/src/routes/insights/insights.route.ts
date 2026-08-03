/**
 * GET /api/insights            → patterns across the trailing window (owner)
 * POST /api/cron/monthly-review is separate; see routes/cron.
 *
 * Read-only. Nothing here raises a violation, changes an amount or decides
 * anything — it reports what the records already say.
 */
import { Router } from "express";
import { z } from "zod";
import { requireOwner } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";
import { detect } from "../../lib/insights/detectors";

const router = Router();

router.get("/", requireOwner, async (req, res) => {
  const days = z.coerce
    .number()
    .int()
    .min(7)
    .max(90)
    .safeParse(req.query.days ?? 14);

  const db = getServiceClient();
  try {
    const findings = await detect(db, req.owner!.orgId, days.success ? days.data : 14);
    res.json({ window_days: days.success ? days.data : 14, findings });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default { basePath: "/api/insights", router };
