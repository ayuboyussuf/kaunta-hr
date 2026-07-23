/**
 * Shift/roster CRUD for owners (spec §4).
 *
 * GET    /api/shifts?workplace_id=…  → shifts (optionally for one workplace).
 * POST   /api/shifts                 → create a shift under a workplace.
 * PATCH  /api/shifts/:id             → update a shift.
 * DELETE /api/shifts/:id             → delete a shift.
 *
 * Employee↔shift assignment lives in employees.route.ts (employees.shift_id).
 * All routes are org-scoped: every shift is reached through a workplace that must
 * belong to req.owner.orgId.
 */
import { Router } from "express";
import { z } from "zod";
import { requireOwner } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";

const router = Router();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const shiftInput = z.object({
  workplace_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  kind: z.enum(["day", "night", "custom"]).default("day"),
  start_time: z.string().regex(TIME_RE, "start_time must be HH:MM"),
  end_time: z.string().regex(TIME_RE, "end_time must be HH:MM"),
  days_of_week: z.array(z.number().int().min(0).max(6)).min(1).default([1, 2, 3, 4, 5]),
  grace_minutes: z.number().int().min(0).max(240).default(5),
});

/** Confirm a workplace belongs to the owner's org. */
async function ownsWorkplace(db: ReturnType<typeof getServiceClient>, orgId: string, workplaceId: string) {
  const { data } = await db
    .from("workplaces")
    .select("id")
    .eq("id", workplaceId)
    .eq("org_id", orgId)
    .maybeSingle();
  return !!data;
}

// ── List ──────────────────────────────────────────────────────────────────────
router.get("/", requireOwner, async (req, res) => {
  const db = getServiceClient();

  // Resolve the org's workplace ids so we never leak other orgs' shifts.
  const { data: wps } = await db
    .from("workplaces")
    .select("id")
    .eq("org_id", req.owner!.orgId);
  const ids = (wps ?? []).map((w) => w.id);
  if (!ids.length) return res.json({ shifts: [] });

  let q = db
    .from("shifts")
    .select("id, workplace_id, name, kind, start_time, end_time, days_of_week, grace_minutes, created_at")
    .in("workplace_id", ids)
    .order("start_time", { ascending: true });

  const wpFilter = req.query.workplace_id;
  if (typeof wpFilter === "string" && wpFilter) {
    if (!ids.includes(wpFilter)) return res.json({ shifts: [] });
    q = q.eq("workplace_id", wpFilter);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ shifts: data ?? [] });
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post("/", requireOwner, async (req, res) => {
  const parsed = shiftInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const db = getServiceClient();
  if (!(await ownsWorkplace(db, req.owner!.orgId, parsed.data.workplace_id))) {
    return res.status(400).json({ error: "workplace not found" });
  }

  const { data, error } = await db
    .from("shifts")
    .insert(parsed.data)
    .select("id, workplace_id, name, kind, start_time, end_time, days_of_week, grace_minutes, created_at")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ shift: data });
});

// ── Update ────────────────────────────────────────────────────────────────────
router.patch("/:id", requireOwner, async (req, res) => {
  const parsed = shiftInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const db = getServiceClient();

  // Verify the shift's current workplace is in this org.
  const { data: existing } = await db
    .from("shifts")
    .select("id, workplace_id")
    .eq("id", req.params.id)
    .maybeSingle();
  if (!existing || !(await ownsWorkplace(db, req.owner!.orgId, existing.workplace_id))) {
    return res.status(404).json({ error: "shift not found" });
  }
  // If moving to another workplace, it too must belong to the org.
  if (parsed.data.workplace_id && !(await ownsWorkplace(db, req.owner!.orgId, parsed.data.workplace_id))) {
    return res.status(400).json({ error: "workplace not found" });
  }

  const { data, error } = await db
    .from("shifts")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select("id, workplace_id, name, kind, start_time, end_time, days_of_week, grace_minutes, created_at")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ shift: data });
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete("/:id", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { data: existing } = await db
    .from("shifts")
    .select("id, workplace_id")
    .eq("id", req.params.id)
    .maybeSingle();
  if (!existing || !(await ownsWorkplace(db, req.owner!.orgId, existing.workplace_id))) {
    return res.status(404).json({ error: "shift not found" });
  }

  const { error } = await db.from("shifts").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default { basePath: "/api/shifts", router };
