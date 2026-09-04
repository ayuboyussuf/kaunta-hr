/**
 * Operator endpoints. Not owner endpoints, and never staff endpoints.
 *
 *   GET   /api/admin/logs             → what the assist has been doing
 *   GET   /api/admin/logs/:id         → one run, with its trace
 *   PATCH /api/admin/logs/:id         → mark golden / attach a note
 *   GET   /api/admin/messaging/health → whether notices are actually arriving
 *   GET   /api/admin/sites/health     → whether clocking in is working, per site
 *
 * These read across every org, which is exactly why they are gated on an
 * operator secret rather than on a session. An owner authenticating here would
 * be able to see another business's operations; a staff member would be able to
 * see the workings of the thing that penalises them. Neither can reach these
 * routes at all.
 *
 * Everything returned has already been scrubbed — on the way IN, when it was
 * written. This layer does not redact; it reads rows that never held a name, a
 * phone number or a wage in the first place. That ordering is the guarantee:
 * if redaction lived here, a bug here would be a leak, and the rows would
 * already be sitting in storage and in backups.
 *
 * With ADMIN_API_TOKEN unset every route below returns 404. A deploy that has
 * not deliberately turned these on does not have them.
 */
import crypto from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { nairobiDayStartISO } from "../../lib/time";
import { sendText } from "../../lib/messaging";

const router = Router();

/** Constant-time compare, so the token cannot be discovered a byte at a time. */
function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = env.adminToken();
  // Unconfigured means absent, not open. 404 rather than 401 so an unconfigured
  // deploy does not advertise that these routes exist.
  if (!expected) return res.status(404).json({ error: "not found" });

  const given = String(req.headers["x-admin-token"] ?? "");
  if (!given || !tokenMatches(given, expected)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

router.use(requireAdmin);

/* ── GET /logs ────────────────────────────────────────────────────────── */

const listQuery = z.object({
  kind: z.string().max(60).optional(),
  outcome: z.enum(["ready", "awaiting_employee", "empty", "no_subject", "failed"]).optional(),
  claim: z.string().max(40).optional(),
  golden: z.enum(["true", "false"]).optional(),
  org_id: z.string().uuid().optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get("/logs", async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const q = parsed.data;

  const db = getServiceClient();
  let query = db
    .from("conversation_logs")
    .select(
      "id, org_id, kind, subject_ref, input_redacted, output_redacted, claim, confidence, " +
        "tool_calls, findings, duration_ms, outcome, asked_employee, error_redacted, " +
        "is_golden, note, engine_version, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(q.limit);

  if (q.kind) query = query.eq("kind", q.kind);
  if (q.outcome) query = query.eq("outcome", q.outcome);
  if (q.claim) query = query.eq("claim", q.claim);
  if (q.golden) query = query.eq("is_golden", q.golden === "true");
  if (q.org_id) query = query.eq("org_id", q.org_id);
  if (q.since) query = query.gte("created_at", q.since);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // These tables postdate the generated Supabase types; the shape is the
  // migration's, and every field is read defensively.
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  // A rollup over what came back, because the numbers that matter here are
  // rates, not rows: how often the claim could not be routed, how often a brief
  // came back with nothing in it, how often an employee had to be chased.
  const n = rows.length || 1;
  const count = (fn: (r: Record<string, unknown>) => boolean) => rows.filter(fn).length;
  const durations = rows.map((r) => Number(r.duration_ms ?? 0)).sort((a, b) => a - b);

  res.json({
    logs: rows,
    rollup: {
      total: rows.length,
      failed: count((r) => r.outcome === "failed"),
      empty: count((r) => r.outcome === "empty"),
      unroutable: count((r) => r.claim === "unclear"),
      low_confidence: count((r) => r.confidence === "low"),
      asked_employee: count((r) => r.asked_employee === true),
      golden: count((r) => r.is_golden === true),
      unroutable_rate: Number((count((r) => r.claim === "unclear") / n).toFixed(3)),
      p50_ms: durations[Math.floor(durations.length * 0.5)] ?? null,
      p95_ms: durations[Math.floor(durations.length * 0.95)] ?? null,
    },
  });
});

/* ── GET /logs/:id ────────────────────────────────────────────────────── */

router.get("/logs/:id", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "invalid id" });

  const db = getServiceClient();
  const [{ data: log }, { data: trace }] = await Promise.all([
    db.from("conversation_logs").select("*").eq("id", id.data).maybeSingle(),
    db
      .from("conversation_traces")
      .select("seq, step, detail, duration_ms")
      .eq("log_id", id.data)
      .order("seq", { ascending: true }),
  ]);

  if (!log) return res.status(404).json({ error: "not found" });
  res.json({ log, trace: trace ?? [] });
});

/* ── PATCH /logs/:id ──────────────────────────────────────────────────── */

const patchBody = z.object({
  is_golden: z.boolean().optional(),
  note: z.string().max(2000).nullable().optional(),
});

/**
 * Marking a run golden is how a change to the fact-finding gets checked: these
 * are the runs a human has read and confirmed. The note is written by an
 * operator about our own behaviour, so it is the one field here that is not
 * scrubbed — but it is still operator text about a run, never about a person,
 * and it is stored where only operators can read it.
 */
router.patch("/logs/:id", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "invalid id" });
  const parsed = patchBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: "nothing to change" });
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from("conversation_logs")
    .update(parsed.data)
    .eq("id", id.data)
    .select("id, is_golden, note")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "not found" });
  res.json({ log: data });
});

/* ── GET /messaging/health ────────────────────────────────────────────── */

/**
 * Whether messages are actually arriving.
 *
 * Every notice in Aproksi goes out over one SMS provider and every send is
 * best-effort — so a wrong API key, an empty balance or an unapproved sender ID
 * produces a system that looks completely healthy and silently tells nobody
 * anything. The first symptom is an employee saying they never heard about a
 * deduction, weeks later, and being right.
 *
 * This answers it from the record: how many penalty notices were accepted by
 * the provider, how many failed, and what the failures said. `?to=+2547…` also
 * sends one real test message, which is the only way to prove the credentials
 * work end to end.
 */
router.get("/messaging/health", async (req, res) => {
  const db = getServiceClient();
  const since = new Date(Date.now() - 14 * 864e5).toISOString();

  const { data } = await db
    .from("violations")
    .select("notified_at, notify_error, created_at")
    .gte("created_at", since)
    .limit(1000);

  const rows = (data ?? []) as { notified_at: string | null; notify_error: string | null }[];
  const delivered = rows.filter((r) => r.notified_at).length;
  const failed = rows.filter((r) => !r.notified_at && r.notify_error).length;
  const pending = rows.length - delivered - failed;

  // The distinct reasons, not every occurrence — one misconfiguration produces
  // hundreds of identical failures and the point is which fault it is.
  const reasons = [...new Set(rows.map((r) => r.notify_error).filter(Boolean))].slice(0, 10);

  const config = {
    provider: "africastalking",
    username: process.env.AT_USERNAME || "sandbox",
    sandbox: (process.env.AT_USERNAME || "sandbox") === "sandbox",
    api_key_set: Boolean(process.env.AT_API_KEY),
    sender_id: process.env.AT_SENDER_ID || null,
  };

  // A live send, only when explicitly asked for. Costs money and reaches a real
  // handset, so it is never part of the plain health read.
  let testSend: { ok: boolean; detail: string } | null = null;
  const to = typeof req.query.to === "string" ? req.query.to : "";
  if (to) {
    try {
      await sendText(to, "Aproksi HR: test message. Messaging is working - no action needed.");
      testSend = { ok: true, detail: "accepted by the provider" };
    } catch (err) {
      testSend = { ok: false, detail: (err as Error).message.slice(0, 300) };
    }
  }

  res.json({
    config,
    window_days: 14,
    penalty_notices: {
      total: rows.length,
      delivered,
      failed,
      pending,
      delivery_rate: rows.length === 0 ? null : Number((delivered / rows.length).toFixed(3)),
      distinct_failures: reasons,
    },
    test_send: testSend,
    // Stated rather than inferred: with no penalties raised there is no
    // evidence either way, and a green light on no data is a lie.
    verdict:
      rows.length === 0
        ? "No notices sent in this window — nothing to judge. Use ?to=+2547… to prove it end to end."
        : failed === 0
          ? "Every notice was accepted by the provider."
          : `${failed} of ${rows.length} notices never went out.`,
  });
});

/* ── GET /sites/health ────────────────────────────────────────────────── */

const healthQuery = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
  org_id: z.string().uuid().optional(),
});

/**
 * Whether clocking in is actually working, per site.
 *
 * This is the operational counterpart to an appeal: the same failures that an
 * employee argues about one at a time show up here as a site that has been
 * quietly broken for three days. A site with a high failure rate is a printed
 * QR that has been replaced, or a camera-shy phone model, or a geofence set too
 * tight — all of which are fixable, and none of which anybody notices from the
 * penalty side.
 *
 * Site names are operational, not personal, so they stay. No employee is named.
 */
router.get("/sites/health", async (req, res) => {
  const parsed = healthQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const db = getServiceClient();
  const since = new Date(Date.now() - parsed.data.days * 864e5).toISOString();

  let wpQuery = db.from("workplaces").select("id, name, org_id");
  if (parsed.data.org_id) wpQuery = wpQuery.eq("org_id", parsed.data.org_id);
  const { data: workplaces, error } = await wpQuery;
  if (error) return res.status(500).json({ error: error.message });

  const ids = (workplaces ?? []).map((w) => w.id as string);
  if (ids.length === 0) return res.json({ since, sites: [] });

  const [{ data: entries }, { data: attempts }, { data: checks }] = await Promise.all([
    db
      .from("attendance_entries")
      .select("workplace_id, scanned_at")
      .in("workplace_id", ids)
      .gte("scanned_at", since),
    db
      .from("scan_attempts")
      .select("workplace_id, source, outcome")
      .in("workplace_id", ids)
      .gte("occurred_at", since),
    db
      .from("presence_checks")
      .select("status, session_entry_id, created_at")
      .gte("created_at", since),
  ]);

  const byId = <T extends { workplace_id?: unknown }>(rows: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) {
      const k = String(r.workplace_id ?? "");
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };
  const entriesBy = byId(entries as { workplace_id?: unknown; scanned_at?: string }[] | null);
  const attemptsBy = byId(attempts as { workplace_id?: unknown; source?: string; outcome?: string }[] | null);

  const todayStart = nairobiDayStartISO(new Date());
  const missedChecks = (checks ?? []).filter((c) => c.status === "missed").length;

  const sites = (workplaces ?? []).map((w) => {
    const id = w.id as string;
    const scans = entriesBy.get(id) ?? [];
    const fails = attemptsBy.get(id) ?? [];
    const serverFails = fails.filter((f) => f.source === "server").length;
    const total = scans.length + fails.length;

    // Which failure dominates — the difference between "the printed code is
    // stale" and "these phones cannot open a camera".
    const tally = new Map<string, number>();
    for (const f of fails) tally.set(String(f.outcome), (tally.get(String(f.outcome)) ?? 0) + 1);
    const commonest = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

    const lastScan = scans
      .map((s) => String(s.scanned_at ?? ""))
      .sort()
      .pop();

    return {
      workplace_id: id,
      name: w.name,
      org_id: w.org_id,
      successful_scans: scans.length,
      failed_attempts: fails.length,
      server_side_failures: serverFails,
      failure_rate: total === 0 ? 0 : Number((fails.length / total).toFixed(3)),
      commonest_failure: commonest ? { outcome: commonest[0], count: commonest[1] } : null,
      last_successful_scan: lastScan ?? null,
      scanned_today: scans.some((s) => String(s.scanned_at ?? "") >= todayStart),
    };
  });

  // Worst first — this is a triage list, not a directory.
  sites.sort((a, b) => b.failure_rate - a.failure_rate || b.failed_attempts - a.failed_attempts);

  res.json({
    since,
    days: parsed.data.days,
    missed_presence_checks: missedChecks,
    sites,
  });
});

export default { basePath: "/api/admin", router };
