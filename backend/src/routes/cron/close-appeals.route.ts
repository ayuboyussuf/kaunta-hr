/**
 * POST /api/cron/close-appeals  (protected by x-cron-secret)
 * Auto-locks violations whose appeal window has passed WITHOUT an appeal:
 * penalty stands, outcome logged, PDF generated + sent. Appealed violations wait
 * for the owner's decision (handled in the appeals route).
 */
import { Router } from "express";
import { env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { finalizeViolation } from "../../lib/violations/finalize";

const router = Router();

/**
 * The job itself. Called directly by the in-process scheduler and, via the
 * route below, by any external scheduler. No HTTP in the direct path.
 */
export async function runCloseAppeals() {

  const db = getServiceClient();
  const { data: due } = await db
    .from("violations")
    .select("id")
    .eq("status", "open")
    .lt("appeal_window_end", new Date().toISOString());

  const results: { id: string; ok: boolean }[] = [];
  for (const v of due ?? []) {
    try {
      await finalizeViolation(v.id, "upheld");
      results.push({ id: v.id, ok: true });
    } catch (err) {
      console.error(`[cron] finalize ${v.id} failed:`, err);
      results.push({ id: v.id, ok: false });
    }
  }

  return { processed: results.length, results };
}

router.post("/", async (req, res) => {
  if (req.headers["x-cron-secret"] !== env.cronSecret()) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    res.json(await runCloseAppeals());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default { basePath: "/api/cron/close-appeals", router };
