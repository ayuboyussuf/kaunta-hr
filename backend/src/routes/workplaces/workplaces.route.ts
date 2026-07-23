/**
 * Workplace CRUD for owners (spec §1 / §4 support).
 *
 * GET  /api/workplaces         → all workplaces for the owner's org, each with its
 *                                shifts and ruleset (consumed by the wizard, the live
 *                                dashboard, shifts, and attendance modules).
 * POST /api/workplaces         → create a workplace.
 * PATCH  /api/workplaces/:id   → update name / location / geofence / ruleset.
 * DELETE /api/workplaces/:id   → delete a workplace (cascades to its shifts).
 *
 * All routes are org-scoped via req.owner.orgId and use the service client.
 */
import { Router } from "express";
import { z } from "zod";
import { requireOwner } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";

const router = Router();

const workplaceInput = z.object({
  name: z.string().min(1).max(120),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  geofence_radius_m: z.number().int().min(10).max(5000).default(100),
  ruleset_id: z.string().uuid().nullable().optional(),
});

// ── List (with shifts + ruleset) ──────────────────────────────────────────────
router.get("/", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("workplaces")
    .select(
      "id, org_id, name, lat, lng, geofence_radius_m, ruleset_id, qr_nonce, qr_issued_at, created_at, " +
        "ruleset:rulesets(id, name, is_shared, deduction_logic), " +
        "shifts(id, name, kind, start_time, end_time, days_of_week, grace_minutes)"
    )
    .eq("org_id", req.owner!.orgId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ workplaces: data ?? [] });
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post("/", requireOwner, async (req, res) => {
  const parsed = workplaceInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const db = getServiceClient();

  // If a ruleset is provided, ensure it belongs to this org.
  if (parsed.data.ruleset_id) {
    const { data: rs } = await db
      .from("rulesets")
      .select("id")
      .eq("id", parsed.data.ruleset_id)
      .eq("org_id", req.owner!.orgId)
      .maybeSingle();
    if (!rs) return res.status(400).json({ error: "ruleset not found" });
  }

  const { data, error } = await db
    .from("workplaces")
    .insert({ ...parsed.data, org_id: req.owner!.orgId })
    .select("id, org_id, name, lat, lng, geofence_radius_m, ruleset_id, created_at")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ workplace: data });
});

// ── Update ────────────────────────────────────────────────────────────────────
router.patch("/:id", requireOwner, async (req, res) => {
  const parsed = workplaceInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const db = getServiceClient();

  if (parsed.data.ruleset_id) {
    const { data: rs } = await db
      .from("rulesets")
      .select("id")
      .eq("id", parsed.data.ruleset_id)
      .eq("org_id", req.owner!.orgId)
      .maybeSingle();
    if (!rs) return res.status(400).json({ error: "ruleset not found" });
  }

  const { data, error } = await db
    .from("workplaces")
    .update(parsed.data)
    .eq("id", req.params.id)
    .eq("org_id", req.owner!.orgId)
    .select("id, org_id, name, lat, lng, geofence_radius_m, ruleset_id, created_at")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "workplace not found" });
  res.json({ workplace: data });
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete("/:id", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("workplaces")
    .delete()
    .eq("id", req.params.id)
    .eq("org_id", req.owner!.orgId)
    .select("id")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "workplace not found" });
  res.json({ ok: true });
});

export default { basePath: "/api/workplaces", router };
