/**
 * Rules management (owner). Lets an owner add/edit/remove rulesets and their
 * penalty rules INCREMENTALLY, without re-running the onboarding wizard (which
 * replaces the whole configuration).
 *
 *   GET    /api/rules                       → rulesets + nested penalty rules
 *   POST   /api/rules/rulesets              → create a ruleset
 *   PATCH  /api/rules/rulesets/:id          → rename / retune a ruleset
 *   DELETE /api/rules/rulesets/:id          → delete a ruleset (+ its rules)
 *   POST   /api/rules/rulesets/:id/rules    → add a penalty rule
 *   PATCH  /api/rules/rules/:id             → edit a penalty rule
 *   DELETE /api/rules/rules/:id             → delete a penalty rule
 *
 * Everything is org-scoped: rulesets carry org_id directly; penalty rules are
 * verified through ruleset → org_id (same pattern as violations.route.ts).
 */
import { Router } from "express";
import { z } from "zod";
import { requireOwner } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";

const router = Router();

// ── GET: full rules config for the org ────────────────────────────────────────
router.get("/", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("rulesets")
    .select(
      "id, name, is_shared, deduction_logic, created_at, " +
        "penalty_rules(id, code, reason, amount, appeal_window_hours, created_at)"
    )
    .eq("org_id", req.owner!.orgId)
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ rulesets: data ?? [] });
});

// ── Rulesets ──────────────────────────────────────────────────────────────────
const rulesetInput = z.object({
  name: z.string().trim().min(1).max(120),
  is_shared: z.boolean().optional(),
  deduction_logic: z.record(z.unknown()).optional(),
});

router.post("/rulesets", requireOwner, async (req, res) => {
  const parsed = rulesetInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const db = getServiceClient();
  const { data, error } = await db
    .from("rulesets")
    .insert({
      org_id: req.owner!.orgId,
      name: parsed.data.name,
      is_shared: parsed.data.is_shared ?? false,
      deduction_logic: parsed.data.deduction_logic ?? {},
    })
    .select("id, name, is_shared, deduction_logic, created_at")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ ruleset: data });
});

router.patch("/rulesets/:id", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid id" });
  const parsed = rulesetInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const db = getServiceClient();
  const { data, error } = await db
    .from("rulesets")
    .update(parsed.data)
    .eq("id", idParse.data)
    .eq("org_id", req.owner!.orgId)
    .select("id, name, is_shared, deduction_logic, created_at")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "ruleset not found" });
  res.json({ ruleset: data });
});

router.delete("/rulesets/:id", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid id" });

  const db = getServiceClient();
  const { data, error } = await db
    .from("rulesets")
    .delete()
    .eq("id", idParse.data)
    .eq("org_id", req.owner!.orgId)
    .select("id")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "ruleset not found" });
  res.json({ ok: true });
});

// ── Penalty rules ─────────────────────────────────────────────────────────────
/** Confirm a ruleset belongs to the owner's org before touching its rules. */
async function ownsRuleset(
  db: ReturnType<typeof getServiceClient>,
  orgId: string,
  rulesetId: string
): Promise<boolean> {
  const { data } = await db
    .from("rulesets")
    .select("id")
    .eq("id", rulesetId)
    .eq("org_id", orgId)
    .maybeSingle();
  return !!data;
}

/** Resolve the ruleset that owns a penalty rule, and check org ownership. */
async function ruleOrgOk(
  db: ReturnType<typeof getServiceClient>,
  orgId: string,
  ruleId: string
): Promise<boolean> {
  const { data } = await db
    .from("penalty_rules")
    .select("id, rulesets!inner(org_id)")
    .eq("id", ruleId)
    .maybeSingle();
  const rs = data
    ? (Array.isArray((data as any).rulesets) ? (data as any).rulesets[0] : (data as any).rulesets)
    : null;
  return !!rs && rs.org_id === orgId;
}

const ruleInput = z.object({
  code: z.string().trim().min(1).max(60),
  reason: z.string().trim().min(1).max(200),
  amount: z.number().min(0).max(1e9),
  appeal_window_hours: z.number().int().min(0).max(720).optional(),
});

router.post("/rulesets/:id/rules", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid ruleset id" });
  const parsed = ruleInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const db = getServiceClient();
  if (!(await ownsRuleset(db, req.owner!.orgId, idParse.data))) {
    return res.status(404).json({ error: "ruleset not found" });
  }
  const { data, error } = await db
    .from("penalty_rules")
    .insert({
      ruleset_id: idParse.data,
      code: parsed.data.code,
      reason: parsed.data.reason,
      amount: parsed.data.amount,
      appeal_window_hours: parsed.data.appeal_window_hours ?? 24,
    })
    .select("id, code, reason, amount, appeal_window_hours, created_at")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ rule: data });
});

router.patch("/rules/:id", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid id" });
  const parsed = ruleInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const db = getServiceClient();
  if (!(await ruleOrgOk(db, req.owner!.orgId, idParse.data))) {
    return res.status(404).json({ error: "penalty rule not found" });
  }
  const { data, error } = await db
    .from("penalty_rules")
    .update(parsed.data)
    .eq("id", idParse.data)
    .select("id, code, reason, amount, appeal_window_hours, created_at")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ rule: data });
});

router.delete("/rules/:id", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid id" });

  const db = getServiceClient();
  if (!(await ruleOrgOk(db, req.owner!.orgId, idParse.data))) {
    return res.status(404).json({ error: "penalty rule not found" });
  }
  const { error } = await db.from("penalty_rules").delete().eq("id", idParse.data);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default { basePath: "/api/rules", router };
