/**
 * Owner onboarding wizard (spec §1).
 *
 * POST /api/owner/onboarding/bootstrap → create (or return) the owner's org on
 *      first load. This is the ONLY route here that does NOT use requireOwner,
 *      because requireOwner 403s when no org exists yet — the wizard needs to
 *      create it. It verifies the Supabase owner token directly.
 * GET  /api/owner/onboarding           → current wizard state (org + rulesets +
 *      workplaces w/ shifts + penalties) so a half-finished wizard can resume.
 * POST /api/owner/onboarding/complete  → persist the full configuration
 *      (rulesets, penalty rules, workplaces, shifts), mark onboarding_complete,
 *      generate the PDF setup summary, and return its signed download URL.
 *
 * Org-scoped via req.owner.orgId; uses the service client (owner_user_id set
 * explicitly since the service client bypasses RLS).
 */
import { Router } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import { requireOwner } from "../../lib/auth";
import { getServiceClient, extractToken } from "../../lib/supabase";
import { setupSummaryPdf, SetupSummaryData } from "../../lib/pdf/templates";
import { uploadPdf } from "../../lib/pdf/render";
import { signWorkplaceToken } from "../../lib/qr";
import { env } from "../../lib/env";

const router = Router();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// ── Bootstrap: create/return the org (no requireOwner — see file header) ───────
const bootstrapInput = z.object({
  name: z.string().min(1).max(120),
  workplace_mode: z.enum(["single", "multiple"]).default("single"),
  rules_mode: z.enum(["shared", "per_workplace"]).default("shared"),
});

router.post("/bootstrap", async (req, res) => {
  const token = extractToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "unauthorized" });

  const db = getServiceClient();
  const { data: auth, error: authErr } = await db.auth.getUser(token);
  if (authErr || !auth.user) return res.status(401).json({ error: "unauthorized" });

  const parsed = bootstrapInput.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const userId = auth.user.id;

  // Already have an org? Return it (idempotent first-load).
  const { data: existing } = await db
    .from("orgs")
    .select("id, name, workplace_mode, rules_mode, onboarding_complete")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (existing) {
    // Let the owner update mode selections while still onboarding.
    if (!existing.onboarding_complete) {
      const { data: upd } = await db
        .from("orgs")
        .update({
          name: parsed.data.name,
          workplace_mode: parsed.data.workplace_mode,
          rules_mode: parsed.data.rules_mode,
        })
        .eq("id", existing.id)
        .select("id, name, workplace_mode, rules_mode, onboarding_complete")
        .single();
      return res.json({ org: upd ?? existing, created: false });
    }
    return res.json({ org: existing, created: false });
  }

  const { data: org, error } = await db
    .from("orgs")
    .insert({
      name: parsed.data.name,
      owner_user_id: userId, // explicit — service client bypasses RLS
      workplace_mode: parsed.data.workplace_mode,
      rules_mode: parsed.data.rules_mode,
    })
    .select("id, name, workplace_mode, rules_mode, onboarding_complete")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ org, created: true });
});

// ── Current wizard state (for resume) ─────────────────────────────────────────
router.get("/", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const orgId = req.owner!.orgId;

  const [{ data: org }, { data: rulesets }, { data: workplaces }] = await Promise.all([
    db
      .from("orgs")
      .select("id, name, workplace_mode, rules_mode, onboarding_complete")
      .eq("id", orgId)
      .single(),
    db
      .from("rulesets")
      .select("id, name, is_shared, deduction_logic, penalty_rules(id, code, reason, amount, appeal_window_hours)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    db
      .from("workplaces")
      .select(
        "id, name, lat, lng, geofence_radius_m, ruleset_id, " +
          "shifts(id, name, kind, start_time, end_time, days_of_week, grace_minutes)"
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
  ]);

  res.json({ org, rulesets: rulesets ?? [], workplaces: workplaces ?? [] });
});

// ── Complete: persist the whole configuration + generate the PDF ──────────────
const penaltySchema = z.object({
  id: z.string().uuid().optional(), // present → update in place; absent → insert
  code: z.string().min(1).max(60),
  reason: z.string().min(1).max(200),
  amount: z.number().min(0).max(1e9).default(0),
  appeal_window_hours: z.number().int().min(0).max(720).default(24),
});

const rulesetSchema = z.object({
  id: z.string().uuid().optional(), // present → update existing ruleset (preserves links)
  key: z.string().min(1), // client-side reference id, mapped to a real uuid
  name: z.string().min(1).max(120),
  is_shared: z.boolean().default(false),
  deduction_logic: z.record(z.unknown()).default({}),
  penalties: z.array(penaltySchema).default([]),
});

const shiftSchema = z.object({
  id: z.string().uuid().optional(), // present → update existing shift
  name: z.string().min(1).max(120),
  kind: z.enum(["day", "night", "custom"]).default("day"),
  start_time: z.string().regex(TIME_RE, "start_time must be HH:MM"),
  end_time: z.string().regex(TIME_RE, "end_time must be HH:MM"),
  days_of_week: z.array(z.number().int().min(0).max(6)).min(1).default([1, 2, 3, 4, 5]),
  grace_minutes: z.number().int().min(0).max(240).default(5),
});

const wpSchema = z.object({
  id: z.string().uuid().optional(), // present → update existing workplace (keeps employee links)
  name: z.string().min(1).max(120),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  geofence_radius_m: z.number().int().min(10).max(5000).default(100),
  rulesetKey: z.string().min(1), // references one of `rulesets[].key`
  shifts: z.array(shiftSchema).default([]),
});

const completeInput = z.object({
  name: z.string().min(1).max(120),
  workplace_mode: z.enum(["single", "multiple"]),
  rules_mode: z.enum(["shared", "per_workplace"]),
  rulesets: z.array(rulesetSchema).min(1),
  workplaces: z.array(wpSchema).min(1),
});

router.post("/complete", requireOwner, async (req, res) => {
  const parsed = completeInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const cfg = parsed.data;

  // Every workplace must reference a declared ruleset key.
  const keys = new Set(cfg.rulesets.map((r) => r.key));
  for (const w of cfg.workplaces) {
    if (!keys.has(w.rulesetKey)) {
      return res.status(400).json({ error: `workplace "${w.name}" references unknown ruleset` });
    }
  }

  const db = getServiceClient();
  const orgId = req.owner!.orgId;

  // Non-destructive reconcile: update rows the owner kept (by id), insert new
  // ones, and delete only what they actually removed. Preserving ids keeps
  // employees linked to their workplace/shift instead of silently unassigning
  // everyone on every save (the old delete-all behaviour).

  // 1) Rulesets → map client keys to real ids (update existing, insert new).
  const keyToId = new Map<string, string>();
  const keptRulesetIds: string[] = [];
  for (const rs of cfg.rulesets) {
    const fields = { org_id: orgId, name: rs.name, is_shared: rs.is_shared, deduction_logic: rs.deduction_logic };
    let rulesetId: string;
    if (rs.id) {
      const { data: updated, error } = await db
        .from("rulesets")
        .update(fields)
        .eq("id", rs.id)
        .eq("org_id", orgId)
        .select("id")
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!updated) return res.status(400).json({ error: "ruleset not found for this org" });
      rulesetId = updated.id;
    } else {
      const { data: created, error } = await db.from("rulesets").insert(fields).select("id").single();
      if (error || !created) return res.status(500).json({ error: error?.message ?? "ruleset insert failed" });
      rulesetId = created.id;
    }
    keyToId.set(rs.key, rulesetId);
    keptRulesetIds.push(rulesetId);

    // Penalty rules for this ruleset: upsert by id, delete removed.
    const keptRuleIds: string[] = [];
    for (const p of rs.penalties) {
      const pf = { code: p.code, reason: p.reason, amount: p.amount, appeal_window_hours: p.appeal_window_hours };
      if (p.id) {
        const { data: upd, error } = await db
          .from("penalty_rules")
          .update(pf)
          .eq("id", p.id)
          .eq("ruleset_id", rulesetId)
          .select("id")
          .maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        if (upd) keptRuleIds.push(upd.id);
      } else {
        const { data: ins, error } = await db
          .from("penalty_rules")
          .insert({ ruleset_id: rulesetId, ...pf })
          .select("id")
          .single();
        if (error || !ins) return res.status(500).json({ error: error?.message ?? "penalty insert failed" });
        keptRuleIds.push(ins.id);
      }
    }
    let delRules = db.from("penalty_rules").delete().eq("ruleset_id", rulesetId);
    if (keptRuleIds.length) delRules = delRules.not("id", "in", `(${keptRuleIds.join(",")})`);
    const { error: delRuleErr } = await delRules;
    if (delRuleErr) return res.status(500).json({ error: delRuleErr.message });
  }

  // 2) Workplaces + their shifts (upsert by id). Collect a clock-in QR (PNG) per
  // workplace, in cfg order, so the setup summary PDF can embed a printable code.
  const wpQrs: (Buffer | null)[] = [];
  const keptWorkplaceIds: string[] = [];
  for (const w of cfg.workplaces) {
    const fields = {
      org_id: orgId,
      name: w.name,
      lat: w.lat ?? null,
      lng: w.lng ?? null,
      geofence_radius_m: w.geofence_radius_m,
      ruleset_id: keyToId.get(w.rulesetKey)!,
    };
    let wp: { id: string; qr_nonce: string } | null;
    if (w.id) {
      const { data, error } = await db
        .from("workplaces")
        .update(fields)
        .eq("id", w.id)
        .eq("org_id", orgId)
        .select("id, qr_nonce")
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      wp = data;
    } else {
      const { data, error } = await db.from("workplaces").insert(fields).select("id, qr_nonce").single();
      if (error || !data) return res.status(500).json({ error: error?.message ?? "workplace insert failed" });
      wp = data;
    }
    if (!wp) return res.status(400).json({ error: "workplace not found for this org" });
    keptWorkplaceIds.push(wp.id);

    // Same deep link the QR page prints: <app>/scan?w=<signed token>.
    try {
      const token = signWorkplaceToken(wp.id, wp.qr_nonce);
      const scanUrl = `${env.appUrl}/scan?w=${token}`;
      wpQrs.push(await QRCode.toBuffer(scanUrl, { width: 320, margin: 1 }));
    } catch (err) {
      console.warn(`[onboarding] QR generation failed for workplace ${wp.id}:`, err);
      wpQrs.push(null);
    }

    // Shifts for this workplace: upsert by id, delete removed.
    const keptShiftIds: string[] = [];
    for (const s of w.shifts) {
      const sf = {
        name: s.name,
        kind: s.kind,
        start_time: s.start_time,
        end_time: s.end_time,
        days_of_week: s.days_of_week,
        grace_minutes: s.grace_minutes,
      };
      if (s.id) {
        const { data: upd, error } = await db
          .from("shifts")
          .update(sf)
          .eq("id", s.id)
          .eq("workplace_id", wp.id)
          .select("id")
          .maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        if (upd) keptShiftIds.push(upd.id);
      } else {
        const { data: ins, error } = await db
          .from("shifts")
          .insert({ workplace_id: wp.id, ...sf })
          .select("id")
          .single();
        if (error || !ins) return res.status(500).json({ error: error?.message ?? "shift insert failed" });
        keptShiftIds.push(ins.id);
      }
    }
    let delShifts = db.from("shifts").delete().eq("workplace_id", wp.id);
    if (keptShiftIds.length) delShifts = delShifts.not("id", "in", `(${keptShiftIds.join(",")})`);
    const { error: delShiftErr } = await delShifts;
    if (delShiftErr) return res.status(500).json({ error: delShiftErr.message });
  }

  // 3) Delete workplaces and rulesets the owner removed (employees on a removed
  // workplace are unassigned via the FK — expected; kept ones are untouched).
  let delWps = db.from("workplaces").delete().eq("org_id", orgId);
  if (keptWorkplaceIds.length) delWps = delWps.not("id", "in", `(${keptWorkplaceIds.join(",")})`);
  const { error: delWpErr } = await delWps;
  if (delWpErr) return res.status(500).json({ error: delWpErr.message });

  let delRs = db.from("rulesets").delete().eq("org_id", orgId);
  if (keptRulesetIds.length) delRs = delRs.not("id", "in", `(${keptRulesetIds.join(",")})`);
  const { error: delRsErr } = await delRs;
  if (delRsErr) return res.status(500).json({ error: delRsErr.message });

  // 4) Mark org complete + persist mode selections + name.
  await db
    .from("orgs")
    .update({
      name: cfg.name,
      workplace_mode: cfg.workplace_mode,
      rules_mode: cfg.rules_mode,
      onboarding_complete: true,
    })
    .eq("id", orgId);

  // 5) PDF summary. Build from the config (penalties resolved per workplace ruleset).
  const rulesetByKey = new Map(cfg.rulesets.map((r) => [r.key, r]));
  const summary: SetupSummaryData = {
    orgName: cfg.name,
    workplaceMode: cfg.workplace_mode,
    rulesMode: cfg.rules_mode,
    workplaces: cfg.workplaces.map((w, i) => ({
      name: w.name,
      radiusM: w.geofence_radius_m,
      lat: w.lat ?? null,
      lng: w.lng ?? null,
      shifts: w.shifts.map((s) => ({
        name: s.name,
        kind: s.kind,
        start: s.start_time,
        end: s.end_time,
      })),
      penalties: (rulesetByKey.get(w.rulesetKey)?.penalties ?? []).map((p) => ({
        reason: p.reason,
        amount: p.amount,
      })),
      qr: wpQrs[i] ?? null,
    })),
  };

  let pdfUrl: string | null = null;
  try {
    const buf = await setupSummaryPdf(summary);
    const { signedUrl } = await uploadPdf(`setup/${orgId}.pdf`, buf);
    pdfUrl = signedUrl;
  } catch (err) {
    console.error("[onboarding] PDF generation failed:", err);
    // Config is saved; surface the failure but don't roll back onboarding.
    return res.status(207).json({ ok: true, pdfUrl: null, pdfError: (err as Error).message });
  }

  res.json({ ok: true, pdfUrl });
});

export default { basePath: "/api/owner/onboarding", router };
