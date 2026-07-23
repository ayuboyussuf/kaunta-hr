/**
 * Announcements (spec §7).
 *
 * Owner posts an announcement scoped to the whole org ('all') or to a single
 * workplace ('workplace'). It's persisted, then fanned out over WhatsApp to
 * every active employee in scope using the real Meta Cloud API client.
 */
import { Router } from "express";
import { z } from "zod";
import { requireOwner } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";
import { sendText } from "../../lib/whatsapp/meta";

const router = Router();

const ANNOUNCEMENT_TYPES = ["meeting", "policy_update", "schedule_change", "other"] as const;

const createSchema = z
  .object({
    scope: z.enum(["all", "workplace"]),
    workplace_id: z.string().uuid().optional(),
    type: z.enum(ANNOUNCEMENT_TYPES).default("other"),
    title: z.string().min(1, "title required").max(200),
    body: z.string().min(1, "body required").max(4000),
  })
  .refine((d) => d.scope !== "workplace" || !!d.workplace_id, {
    message: "workplace_id required when scope is 'workplace'",
    path: ["workplace_id"],
  });

// ── Create + fan out ──────────────────────────────────────────────────────────
router.post("/", requireOwner, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const { scope, workplace_id, type, title, body } = parsed.data;
  const db = getServiceClient();

  if (scope === "workplace") {
    const { data: wp } = await db
      .from("workplaces")
      .select("id")
      .eq("id", workplace_id)
      .eq("org_id", req.owner!.orgId)
      .maybeSingle();
    if (!wp) return res.status(404).json({ error: "workplace not found" });
  }

  const { data: announcement, error } = await db
    .from("announcements")
    .insert({
      org_id: req.owner!.orgId,
      scope,
      workplace_id: scope === "workplace" ? workplace_id : null,
      type,
      title,
      body,
      created_by: req.owner!.userId,
    })
    .select("*, workplaces(name)")
    .single();

  if (error || !announcement) {
    return res.status(500).json({ error: error?.message ?? "failed to create announcement" });
  }

  // Fan out over WhatsApp to the relevant active employees.
  let empQuery = db
    .from("employees")
    .select("id, phone")
    .eq("org_id", req.owner!.orgId)
    .eq("status", "active");
  if (scope === "workplace") empQuery = empQuery.eq("workplace_id", workplace_id!);
  const { data: employees } = await empQuery;

  const message = `*${title}*\n\n${body}`;
  const results = await Promise.allSettled(
    (employees ?? []).map((e) => sendText(e.phone as string, message))
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;
  if (failed > 0) {
    for (const r of results) {
      if (r.status === "rejected") console.error("[announcements] whatsapp send failed:", r.reason);
    }
  }

  res.status(201).json({
    announcement,
    notified: { total: results.length, sent, failed },
  });
});

// ── List (owner) ───────────────────────────────────────────────────────────────
router.get("/", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("announcements")
    .select("*, workplaces(name)")
    .eq("org_id", req.owner!.orgId)
    .order("posted_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ announcements: data ?? [] });
});

export default { basePath: "/api/announcements", router };
