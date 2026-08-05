/**
 * The scheduled jobs, run inside the web service.
 *
 * They used to be five Render `type: cron` services. That does not work on the
 * plan this runs on — Render cron is a paid service type — so the schedules
 * never fired, and the presence checks the owner had switched on simply never
 * happened. Nobody found out from an error; they found out from nothing
 * arriving for two days.
 *
 * So the schedule lives in code. It costs nothing, it deploys with the app that
 * defines it, and a job that stops running is visible in the same logs as
 * everything else.
 *
 * On randomness, since it comes up: the presence check is not random at the
 * tick. The job computes how many checks SHOULD have fired by this point in an
 * employee's shift and fires at most one to catch up — so the unpredictability
 * comes from where the employee is in their shift, not from when the scheduler
 * happened to wake. A less punctual tick does not make it more random; it just
 * makes the catch-up later. Which is why moving off Render cron changes nothing
 * about how unpredictable a check feels, and why a five-minute tick is fine.
 *
 * Two things this must never do:
 *
 *   - Run twice. With more than one web instance every instance would fire the
 *     same job, and a job that sends SMS must not send it twice. A Redis lock
 *     is taken when Redis is configured; without Redis, a single instance is
 *     assumed and the lock is a no-op. That assumption is stated in the log at
 *     boot rather than left implicit.
 *   - Overlap itself. A slow run must not have a second copy started on top of
 *     it, so each job holds a local in-flight flag as well.
 */
import cron from "node-cron";
import { env } from "../env";
import { getConnection, redisEnabled } from "../queue";

/** Nairobi, so a "03:00" job runs at 03:00 where the business is. */
const TZ = "Africa/Nairobi";

interface Job {
  name: string;
  /** Standard 5-field cron, in Nairobi time. */
  schedule: string;
  /** The cron endpoint to call, relative to the backend. */
  path: string;
  /** Roughly how long a run may take; the distributed lock lives this long. */
  ttlSec: number;
}

const JOBS: Job[] = [
  // Appeal windows close and outcomes lock. Quarter-hourly is close enough to
  // "when the window ends" without being noisy.
  { name: "close-appeals", schedule: "*/15 * * * *", path: "/api/cron/close-appeals", ttlSec: 120 },

  // Mid-shift presence checks: fire what is due, expire what was missed.
  { name: "presence-checks", schedule: "*/5 * * * *", path: "/api/cron/presence-checks", ttlSec: 240 },

  // After the last shift of the day, price the days nobody scanned against.
  { name: "absence-sweep", schedule: "30 21 * * *", path: "/api/cron/absence-sweep", ttlSec: 600 },

  // Overnight, so a payroll draft is waiting rather than being computed while
  // somebody stares at a spinner.
  { name: "payroll", schedule: "0 3 * * *", path: "/api/cron/payroll", ttlSec: 900 },

  // The 1st: clean months become bonus suggestions while there is still time to
  // act on them before payroll.
  { name: "monthly-review", schedule: "0 6 1 * *", path: "/api/cron/monthly-review", ttlSec: 900 },
];

/**
 * Take a cluster-wide lock for this run, if Redis is available.
 *
 * Returns true when this instance should do the work. With no Redis we return
 * true — a single instance is the only sane reading of "no shared state", and
 * the boot log says so.
 */
async function claim(job: Job): Promise<boolean> {
  if (!redisEnabled()) return true;
  const redis = getConnection();
  try {
    // One key per job per minute: two instances waking in the same minute
    // contend for it, and exactly one wins.
    const minute = Math.floor(Date.now() / 60_000);
    const key = `kaunta:cron:${job.name}:${minute}`;
    const won = await redis.set(key, "1", "EX", job.ttlSec, "NX");
    return won === "OK";
  } catch (err) {
    // A lock we cannot take is not a reason to skip the work on a single-instance
    // deploy, and a duplicate SMS is better than a presence check that never
    // fires. Say so loudly.
    console.warn(`[cron] lock unavailable for ${job.name}, running anyway:`, (err as Error).message);
    return true;
  }
}

/** Guards against a slow run being started on top of itself. */
const inFlight = new Set<string>();

async function run(job: Job): Promise<void> {
  if (inFlight.has(job.name)) {
    console.warn(`[cron] ${job.name} still running from the last tick — skipping this one`);
    return;
  }
  if (!(await claim(job))) return;

  inFlight.add(job.name);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${env.backendUrl}${job.path}`, {
      method: "POST",
      headers: { "x-cron-secret": env.cronSecret() },
    });
    const body = await res.json().catch(() => ({}));
    const ms = Date.now() - startedAt;
    if (!res.ok) {
      console.error(`[cron] ${job.name} failed (${res.status}) in ${ms}ms:`, body);
    } else {
      console.log(`[cron] ${job.name} ok in ${ms}ms:`, JSON.stringify(body));
    }
  } catch (err) {
    console.error(`[cron] ${job.name} threw:`, (err as Error).message);
  } finally {
    inFlight.delete(job.name);
  }
}

/**
 * Start the schedule. Call once at boot.
 *
 * Disabled by setting RUN_SCHEDULER=false — for a deploy that drives these
 * externally (GitHub Actions, a real cron box) and does not want both.
 */
export function startScheduler(): void {
  if (process.env.RUN_SCHEDULER === "false") {
    console.log("[cron] scheduler disabled by RUN_SCHEDULER=false");
    return;
  }
  if (!process.env.CRON_SECRET) {
    console.warn("[cron] CRON_SECRET is not set — scheduler not started");
    return;
  }

  for (const job of JOBS) {
    cron.schedule(job.schedule, () => void run(job), { timezone: TZ });
  }

  console.log(
    `[cron] scheduler started (${JOBS.length} jobs, ${TZ})` +
      (redisEnabled()
        ? " with a Redis lock — safe on multiple instances"
        : " with no Redis — assumes a single instance, jobs would double up on more")
  );
}
