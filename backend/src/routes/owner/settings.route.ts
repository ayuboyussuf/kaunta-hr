/**
 * Owner settings (post-onboarding).
 *
 * GET   /api/owner/settings → the org's current profile.
 * PATCH /api/owner/settings → update the business name.
 *
 * Org-scoped via req.owner.orgId. The wizard still owns the full attendance
 * configuration (rulesets, workplaces, shifts); this is for the account profile
 * the owner needs to reach without re-running setup.
 */
import { Router } from "express";
import { z } from "zod";
import { requireOwner } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";

const router = Router();

const ORG_SELECT = "id, name, phone, workplace_mode, rules_mode, onboarding_complete, created_at";

/** Normalise a raw phone to E.164 with a leading '+', Kenya-aware. */
function normPhone(raw: string): string {
  const d = raw.replace(/[^\d]/g, "");
  if (d.startsWith("0")) return `+254${d.slice(1)}`;
  if (d.startsWith("254")) return `+${d}`;
  if (raw.trim().startsWith("+")) return `+${d}`;
  return `+${d}`;
}

router.get("/", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("orgs")
    .select(ORG_SELECT)
    .eq("id", req.owner!.orgId)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ org: data });
});

const patchInput = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(20).nullable().optional(), // "" / null clears it
});

router.patch("/", requireOwner, async (req, res) => {
  const parsed = patchInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim();
  if (parsed.data.phone !== undefined) {
    const p = (parsed.data.phone ?? "").trim();
    patch.phone = p ? normPhone(p) : null;
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "nothing to update" });
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from("orgs")
    .update(patch)
    .eq("id", req.owner!.orgId)
    .select(ORG_SELECT)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ org: data });
});

export default { basePath: "/api/owner/settings", router };
