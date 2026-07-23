/**
 * Employee/team management for owners (spec §2, owner side).
 *
 * GET    /api/employees            → list employees (with workplace + shift labels).
 * POST   /api/employees            → add an employee (name + phone + optional
 *                                     workplace/shift/salary). Sends a WhatsApp
 *                                     invite with login instructions. status='invited'.
 * PATCH  /api/employees/:id        → update name / phone / salary / workplace / shift.
 * POST   /api/employees/:id/suspend  → suspend an employee.
 * POST   /api/employees/:id/activate → un-suspend (back to invited/active).
 *
 * All routes are org-scoped via req.owner.orgId; phones are stored E.164 (+2547…).
 */
import { Router } from "express";
import { z } from "zod";
import { requireOwner } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";
import { sendText } from "../../lib/whatsapp/meta";
import { env } from "../../lib/env";

const router = Router();

/** Normalise a raw phone to E.164 with a leading '+', Kenya-aware. */
function normPhone(raw: string): string {
  const d = raw.replace(/[^\d]/g, "");
  if (d.startsWith("0")) return `+254${d.slice(1)}`;
  if (d.startsWith("254")) return `+${d}`;
  if (raw.trim().startsWith("+")) return `+${d}`;
  return `+${d}`;
}

const createInput = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(7).max(20),
  workplace_id: z.string().uuid().nullable().optional(),
  shift_id: z.string().uuid().nullable().optional(),
  base_salary: z.number().min(0).max(1e9).default(0),
});

const updateInput = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(7).max(20).optional(),
  workplace_id: z.string().uuid().nullable().optional(),
  shift_id: z.string().uuid().nullable().optional(),
  base_salary: z.number().min(0).max(1e9).optional(),
});

/** Verify a workplace belongs to the org (when provided). */
async function assertOrgWorkplace(
  db: ReturnType<typeof getServiceClient>,
  orgId: string,
  workplaceId?: string | null
): Promise<boolean> {
  if (!workplaceId) return true;
  const { data } = await db
    .from("workplaces")
    .select("id")
    .eq("id", workplaceId)
    .eq("org_id", orgId)
    .maybeSingle();
  return !!data;
}

/** Verify a shift belongs to a workplace inside the org (when provided). */
async function assertOrgShift(
  db: ReturnType<typeof getServiceClient>,
  orgId: string,
  shiftId?: string | null
): Promise<boolean> {
  if (!shiftId) return true;
  const { data } = await db
    .from("shifts")
    .select("id, workplace:workplaces!inner(org_id)")
    .eq("id", shiftId)
    .maybeSingle();
  const wp = (data as { workplace?: { org_id?: string } } | null)?.workplace;
  return !!wp && wp.org_id === orgId;
}

const EMP_SELECT =
  "id, org_id, workplace_id, shift_id, name, phone, base_salary, status, created_at, " +
  "workplace:workplaces(id, name), shift:shifts(id, name, kind, start_time, end_time)";

// ── List ──────────────────────────────────────────────────────────────────────
router.get("/", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("employees")
    .select(EMP_SELECT)
    .eq("org_id", req.owner!.orgId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ employees: data ?? [] });
});

// ── Create + WhatsApp invite ──────────────────────────────────────────────────
router.post("/", requireOwner, async (req, res) => {
  const parsed = createInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const db = getServiceClient();
  const orgId = req.owner!.orgId;
  const phone = normPhone(parsed.data.phone);

  if (!(await assertOrgWorkplace(db, orgId, parsed.data.workplace_id))) {
    return res.status(400).json({ error: "workplace not found" });
  }
  if (!(await assertOrgShift(db, orgId, parsed.data.shift_id))) {
    return res.status(400).json({ error: "shift not found" });
  }

  // Guard the (org_id, phone) unique constraint with a friendly message.
  const { data: dup } = await db
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .eq("phone", phone)
    .maybeSingle();
  if (dup) return res.status(409).json({ error: "an employee with this phone already exists" });

  const { data: emp, error } = await db
    .from("employees")
    .insert({
      org_id: orgId,
      name: parsed.data.name,
      phone,
      workplace_id: parsed.data.workplace_id ?? null,
      shift_id: parsed.data.shift_id ?? null,
      base_salary: parsed.data.base_salary,
      status: "invited",
    })
    .select(EMP_SELECT)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Fetch the org name for a friendly invite message.
  const { data: org } = await db.from("orgs").select("name").eq("id", orgId).maybeSingle();
  const orgName = org?.name ?? "your workplace";
  const loginUrl = `${env.appUrl}/me/login`;

  // Real WhatsApp invite. If Meta rejects it (e.g. no open 24h session window and
  // no template), we still keep the employee — the owner can resend/share the link.
  let inviteSent = false;
  let inviteError: string | undefined;
  try {
    await sendText(
      phone,
      `Hi ${parsed.data.name}, you've been added to ${orgName} on Kaunta HR.\n\n` +
        `To clock in and view your pay, open ${loginUrl} and sign in with this phone number (${phone}).`
    );
    inviteSent = true;
  } catch (err) {
    inviteError = err instanceof Error ? err.message : String(err);
    console.warn(`[employees] invite to ${phone} failed:`, inviteError);
  }

  res.status(201).json({ employee: emp, inviteSent, ...(inviteError ? { inviteError } : {}) });
});

// ── Resend the WhatsApp invite ────────────────────────────────────────────────
router.post("/:id/resend-invite", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const orgId = req.owner!.orgId;

  const { data: emp } = await db
    .from("employees")
    .select("id, name, phone, status")
    .eq("id", req.params.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!emp) return res.status(404).json({ error: "employee not found" });
  if (emp.status === "suspended") return res.status(400).json({ error: "employee is suspended" });

  const { data: org } = await db.from("orgs").select("name").eq("id", orgId).maybeSingle();
  const orgName = org?.name ?? "your workplace";
  const loginUrl = `${env.appUrl}/me/login`;

  try {
    await sendText(
      emp.phone,
      `Hi ${emp.name}, here's your Kaunta HR invite for ${orgName} again.\n\n` +
        `Open ${loginUrl} and sign in with this phone number (${emp.phone}) to clock in and view your pay.`
    );
    return res.json({ inviteSent: true });
  } catch (err) {
    const inviteError = err instanceof Error ? err.message : String(err);
    console.warn(`[employees] resend invite to ${emp.phone} failed:`, inviteError);
    return res.status(502).json({ inviteSent: false, inviteError });
  }
});

// ── Update / reassign ─────────────────────────────────────────────────────────
router.patch("/:id", requireOwner, async (req, res) => {
  const parsed = updateInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const db = getServiceClient();
  const orgId = req.owner!.orgId;

  if (!(await assertOrgWorkplace(db, orgId, parsed.data.workplace_id))) {
    return res.status(400).json({ error: "workplace not found" });
  }
  if (!(await assertOrgShift(db, orgId, parsed.data.shift_id))) {
    return res.status(400).json({ error: "shift not found" });
  }

  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.phone) patch.phone = normPhone(parsed.data.phone);

  const { data, error } = await db
    .from("employees")
    .update(patch)
    .eq("id", req.params.id)
    .eq("org_id", orgId)
    .select(EMP_SELECT)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "employee not found" });
  res.json({ employee: data });
});

// ── Suspend / activate ────────────────────────────────────────────────────────
router.post("/:id/suspend", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("employees")
    .update({ status: "suspended" })
    .eq("id", req.params.id)
    .eq("org_id", req.owner!.orgId)
    .select("id, status")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "employee not found" });
  res.json({ employee: data });
});

router.post("/:id/activate", requireOwner, async (req, res) => {
  const db = getServiceClient();
  // If they've never logged in (no pin), they revert to 'invited'; otherwise 'active'.
  const { data: existing } = await db
    .from("employees")
    .select("id, pin_hash")
    .eq("id", req.params.id)
    .eq("org_id", req.owner!.orgId)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: "employee not found" });

  const nextStatus = existing.pin_hash ? "active" : "invited";
  const { data, error } = await db
    .from("employees")
    .update({ status: nextStatus })
    .eq("id", req.params.id)
    .eq("org_id", req.owner!.orgId)
    .select("id, status")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ employee: data });
});

export default { basePath: "/api/employees", router };
