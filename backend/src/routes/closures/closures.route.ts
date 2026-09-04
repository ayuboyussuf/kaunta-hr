/**
 * Days nobody came in, and days the owner knows nobody will.
 *
 *   GET  /api/closures/reviews          → questions waiting on the owner
 *   POST /api/closures/reviews/:id      → answer one
 *   GET  /api/closures/non-working      → declared closures
 *   POST /api/closures/non-working      → declare one (or a range)
 *   DELETE /api/closures/non-working/:id
 *
 * Owner-only throughout. Staff never see these: a pending question is the
 * system admitting it does not know something, and surfacing "we might charge
 * you for Monday, we are asking your boss" would be worse than useless to the
 * person waiting on the answer.
 */
import { Router } from "express";
import { z } from "zod";
import { requireOwner } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";
import { resolveClosureReview } from "../../lib/attendance/resolveClosure";
import { closureQuestion } from "../../lib/attendance/closure";
import { datesInRange } from "../../lib/time";

const router = Router();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const dayLabel = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/* ── Questions waiting on the owner ──────────────────────────────────── */

router.get("/reviews", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const status = typeof req.query.status === "string" ? req.query.status : "pending";

  let q = db
    .from("closure_reviews")
    .select(
      "id, workplace_id, on_date, rostered, scanned, failed_attempts, status, " +
        "resolution, note, resolved_at, created_at, workplaces(name)"
    )
    .eq("org_id", req.owner!.orgId)
    .order("on_date", { ascending: false })
    .limit(100);
  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  // The generated types do not know these tables yet, and the embedded select
  // defeats inference regardless. Every field is read defensively below.
  const reviews = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const wp = Array.isArray(r.workplaces) ? r.workplaces[0] : r.workplaces;
    const siteName = (wp as { name?: string } | null)?.name ?? null;
    return {
      id: r.id as string,
      workplace_id: (r.workplace_id as string | null) ?? null,
      site_name: siteName,
      on_date: String(r.on_date).slice(0, 10),
      rostered: Number(r.rostered ?? 0),
      scanned: Number(r.scanned ?? 0),
      failed_attempts: Number(r.failed_attempts ?? 0),
      status: r.status as string,
      resolution: (r.resolution as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      resolved_at: (r.resolved_at as string | null) ?? null,
      // Assembled here so the phone, the dashboard and the digest all say the
      // same sentence about the same day.
      question: closureQuestion({
        siteName,
        dateLabel: dayLabel(String(r.on_date).slice(0, 10)),
        rostered: Number(r.rostered ?? 0),
        failedAttempts: Number(r.failed_attempts ?? 0),
      }),
    };
  });

  res.json({ reviews });
});

const answerSchema = z.object({
  resolution: z.enum(["closed_holiday", "closed_other", "system_problem", "everyone_absent"]),
  note: z.string().trim().max(300).optional(),
  paid: z.boolean().optional(),
});

router.post("/reviews/:id", requireOwner, async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "invalid id" });

  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid answer" });
  }

  const db = getServiceClient();
  const result = await resolveClosureReview(db, {
    reviewId: id.data,
    orgId: req.owner!.orgId,
    resolution: parsed.data.resolution,
    note: parsed.data.note ?? null,
    paid: parsed.data.paid,
    resolvedByUserId: req.owner!.userId,
  });

  if (!result) return res.status(404).json({ error: "no pending question with that id" });
  res.json(result);
});

/* ── Declared non-working days ───────────────────────────────────────── */

router.get("/non-working", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const from = typeof req.query.from === "string" ? req.query.from : null;
  const to = typeof req.query.to === "string" ? req.query.to : null;

  let q = db
    .from("non_working_days")
    .select("id, workplace_id, on_date, label, paid, created_at, workplaces(name)")
    .eq("org_id", req.owner!.orgId)
    .order("on_date", { ascending: false })
    .limit(400);
  if (from) q = q.gte("on_date", from);
  if (to) q = q.lte("on_date", to);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ days: data ?? [] });
});

const declareSchema = z.object({
  start_date: isoDate,
  // A closure is often several days — Christmas, a renovation. One request.
  end_date: isoDate.optional(),
  label: z.string().trim().min(2).max(120),
  paid: z.boolean().default(true),
  /** Null or absent means the whole business. */
  workplace_id: z.string().uuid().nullable().optional(),
});

router.post("/non-working", requireOwner, async (req, res) => {
  const parsed = declareSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid request" });
  }
  const { start_date, label, paid } = parsed.data;
  const end_date = parsed.data.end_date ?? start_date;
  if (end_date < start_date) {
    return res.status(400).json({ error: "the last day cannot be before the first" });
  }

  const dates = datesInRange(start_date, end_date);
  if (dates.length > 90) {
    return res.status(400).json({ error: "declare at most 90 days at a time" });
  }

  const db = getServiceClient();
  const workplaceId = parsed.data.workplace_id ?? null;

  if (workplaceId) {
    const { data: wp } = await db
      .from("workplaces")
      .select("id")
      .eq("id", workplaceId)
      .eq("org_id", req.owner!.orgId)
      .maybeSingle();
    if (!wp) return res.status(404).json({ error: "workplace not found" });
  }

  // Re-declaring a day is not an error — it is somebody correcting a label.
  const rows = dates.map((on_date) => ({
    org_id: req.owner!.orgId,
    workplace_id: workplaceId,
    on_date,
    label,
    paid,
    created_by: req.owner!.userId,
  }));

  const { data, error } = await db
    .from("non_working_days")
    .upsert(rows, {
      onConflict: workplaceId ? "org_id,workplace_id,on_date" : "org_id,on_date",
    })
    .select("id, on_date, label, paid");

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ days: data ?? [], count: dates.length });
});

router.delete("/non-working/:id", requireOwner, async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "invalid id" });

  const db = getServiceClient();
  const { data, error } = await db
    .from("non_working_days")
    .delete()
    .eq("id", id.data)
    .eq("org_id", req.owner!.orgId)
    .select("id")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

export default { basePath: "/api/closures", router };
