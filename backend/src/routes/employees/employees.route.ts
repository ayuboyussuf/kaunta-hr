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
import { renderToBuffer, drawHeader, drawFooter, BRAND } from "../../lib/pdf/render";
import { DateTime } from "luxon";
import { monthWindowUtc, nairobiDate } from "../../lib/time";

const router = Router();
const TZ = "Africa/Nairobi";

/** Normalise a raw phone to E.164 with a leading '+', Kenya-aware. */
function normPhone(raw: string): string {
  const d = raw.replace(/[^\d]/g, "");
  if (d.startsWith("0")) return `+254${d.slice(1)}`;
  if (d.startsWith("254")) return `+${d}`;
  if (raw.trim().startsWith("+")) return `+${d}`;
  return `+${d}`;
}

const payType = z.enum(["monthly", "daily", "hourly"]);
const createInput = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(7).max(20),
  workplace_id: z.string().uuid().nullable().optional(),
  shift_id: z.string().uuid().nullable().optional(),
  base_salary: z.number().min(0).max(1e9).default(0),
  pay_type: payType.default("monthly"),
  pay_rate: z.number().min(0).max(1e9).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const updateInput = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(7).max(20).optional(),
  workplace_id: z.string().uuid().nullable().optional(),
  shift_id: z.string().uuid().nullable().optional(),
  base_salary: z.number().min(0).max(1e9).optional(),
  pay_type: payType.optional(),
  pay_rate: z.number().min(0).max(1e9).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
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
  "id, org_id, workplace_id, shift_id, name, phone, base_salary, pay_type, pay_rate, start_date, status, created_at, " +
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

// ── Attendance overview (absence radar) ───────────────────────────────────────
// Per active employee: when they last clocked in, how many days ago, and their
// presence-check pass/miss counts over the last 7 days. Lets the owner spot
// someone who hasn't shown up in days.
router.get("/attendance-overview", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const orgId = req.owner!.orgId;

  const { data: emps } = await db
    .from("employees")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("status", "active");
  const ids = (emps ?? []).map((e) => e.id);
  if (ids.length === 0) return res.json({ overview: [] });

  const nowDt = DateTime.utc();
  const since60 = nowDt.minus({ days: 60 }).toISO()!;
  const since7 = nowDt.minus({ days: 7 }).toISO()!;

  const [{ data: ins }, { data: checks }] = await Promise.all([
    db
      .from("attendance_entries")
      .select("employee_id, scanned_at")
      .in("employee_id", ids)
      .eq("direction", "in")
      .gte("scanned_at", since60)
      .order("scanned_at", { ascending: false }),
    db
      .from("presence_checks")
      .select("employee_id, status")
      .in("employee_id", ids)
      .gte("created_at", since7),
  ]);

  const lastIn = new Map<string, string>(); // first (latest) wins
  for (const r of ins ?? []) if (!lastIn.has(r.employee_id)) lastIn.set(r.employee_id, r.scanned_at);

  const checkAgg = new Map<string, { confirmed: number; missed: number }>();
  for (const c of checks ?? []) {
    const a = checkAgg.get(c.employee_id) ?? { confirmed: 0, missed: 0 };
    if (c.status === "confirmed") a.confirmed++;
    else if (c.status === "missed") a.missed++;
    checkAgg.set(c.employee_id, a);
  }

  const overview = (emps ?? []).map((e) => {
    const last = lastIn.get(e.id) ?? null;
    const daysSince = last ? Math.floor(nowDt.diff(DateTime.fromISO(last), "days").days) : null;
    const agg = checkAgg.get(e.id) ?? { confirmed: 0, missed: 0 };
    return {
      employee_id: e.id,
      name: e.name,
      last_in: last,
      days_since_seen: daysSince,
      checks_confirmed_7d: agg.confirmed,
      checks_missed_7d: agg.missed,
    };
  });

  res.json({ overview });
});

// ── One employee's recent attendance history + presence checks ────────────────
router.get("/:id/history", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid id" });

  const db = getServiceClient();
  const orgId = req.owner!.orgId;

  const { data: emp } = await db
    .from("employees")
    .select("id, start_date, created_at, shift:shifts(days_of_week)")
    .eq("id", idParse.data)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!emp) return res.status(404).json({ error: "employee not found" });
  const shift = Array.isArray((emp as any).shift) ? (emp as any).shift[0] : (emp as any).shift;

  // ~6 months back for the calendar to page through, bounded for memory/size.
  const since = DateTime.utc().minus({ days: 186 }).toISO()!;
  const [{ data: entries }, { data: checks }] = await Promise.all([
    db
      .from("attendance_entries")
      .select("id, scanned_at, direction, status, flags, selfie_path, workplace:workplaces(name)")
      .eq("employee_id", idParse.data)
      .gte("scanned_at", since)
      .order("scanned_at", { ascending: false })
      .limit(600),
    db
      .from("presence_checks")
      .select("id, due_at, respond_by, status")
      .eq("employee_id", idParse.data)
      .gte("created_at", since)
      .order("due_at", { ascending: false })
      .limit(300),
  ]);

  res.json({
    entries: entries ?? [],
    checks: checks ?? [],
    scheduled_days: shift?.days_of_week ?? [],
    employment_start: (emp as any).start_date ?? ((emp as any).created_at ? String((emp as any).created_at).slice(0, 10) : null),
  });
});

// ── Downloadable attendance report PDF (owner only; includes selfies) ─────────
// One month per request, images fetched sequentially and capped, to stay within
// the backend's memory budget. Employees cannot reach this route.
router.get("/:id/attendance-report.pdf", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid id" });
  const month = typeof req.query.month === "string" ? req.query.month : "";
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month must be YYYY-MM" });

  const db = getServiceClient();
  const orgId = req.owner!.orgId;
  const { data: emp } = await db
    .from("employees")
    .select("id, name, workplace:workplaces(name)")
    .eq("id", idParse.data)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!emp) return res.status(404).json({ error: "employee not found" });

  // Month window in Nairobi (UTC+3, no DST) → UTC instant bounds.
  const { startISO, endISO } = monthWindowUtc(month);

  const { data: entries } = await db
    .from("attendance_entries")
    .select("id, scanned_at, direction, status, flags, selfie_path")
    .eq("employee_id", idParse.data)
    .gte("scanned_at", startISO)
    .lt("scanned_at", endISO)
    .order("scanned_at", { ascending: true })
    .limit(400);

  // Pre-fetch selfie image buffers sequentially (bounded) so drawing stays sync.
  const MAX_IMAGES = 80;
  const imgByEntry = new Map<string, Buffer>();
  let fetched = 0;
  for (const e of entries ?? []) {
    if (fetched >= MAX_IMAGES) break;
    if (!e.selfie_path) continue;
    try {
      const { data: blob } = await db.storage.from("selfies").download(e.selfie_path);
      if (blob) {
        imgByEntry.set(e.id, Buffer.from(await blob.arrayBuffer()));
        fetched++;
      }
    } catch {
      /* skip a missing/unreadable image */
    }
  }

  const rows = entries ?? [];
  const present = new Set(rows.filter((e) => e.direction === "in").map((e) => nairobiDate(e.scanned_at))).size;
  const late = rows.filter((e) => e.status === "late").length;
  const flagged = rows.filter((e) => e.status === "flagged").length;
  const empName = (emp as any).name as string;
  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-KE", { month: "long", year: "numeric" });

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  const dayLabel = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "2-digit", month: "short" }).format(new Date(iso));
  const nairDay = (iso: string) => nairobiDate(iso);

  try {
    const buf = await renderToBuffer((doc) => {
      drawHeader(doc, "Attendance report", `${empName} · ${monthLabel}`);
      doc.fillColor(BRAND.muted).fontSize(10).font("Helvetica")
        .text(`Days present: ${present}    Late: ${late}    Flagged: ${flagged}    Scans: ${rows.length}`);
      doc.moveDown(0.8);

      let lastDay = "";
      for (const e of rows) {
        const d = nairDay(e.scanned_at);
        if (d !== lastDay) {
          if (doc.y > doc.page.height - 120) doc.addPage();
          doc.moveDown(0.4).fillColor(BRAND.ink).fontSize(11).font("Helvetica-Bold").text(dayLabel(e.scanned_at));
          lastDay = d;
        }
        const statusColor = e.status === "flagged" ? BRAND.red : e.status === "late" ? BRAND.copper : BRAND.sage;
        doc.fillColor(BRAND.slate).fontSize(10).font("Helvetica")
          .text(`${fmtTime(e.scanned_at)}  ·  ${e.direction}  ·  `, { continued: true })
          .fillColor(statusColor).text(e.status);
        const img = imgByEntry.get(e.id);
        if (img) {
          if (doc.y > doc.page.height - 110) doc.addPage();
          try { doc.image(img, { width: 70 }); } catch { /* bad image */ }
          doc.moveDown(0.3);
        }
      }
      if (rows.length === 0) doc.fillColor(BRAND.muted).text("No scans recorded this month.");
      drawFooter(doc);
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="attendance-${empName.replace(/[^a-z0-9]+/gi, "-")}-${month}.pdf"`);
    res.send(buf);
  } catch (err) {
    console.error("[attendance-report] pdf failed:", err);
    res.status(500).json({ error: "could not generate the report" });
  }
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
      pay_type: parsed.data.pay_type,
      pay_rate: parsed.data.pay_rate ?? null,
      start_date: parsed.data.start_date ?? null,
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

  console.log(`[employees] resend-invite → sending to ${emp.phone} (${emp.name})`);
  try {
    await sendText(
      emp.phone,
      `Hi ${emp.name}, here's your Kaunta HR invite for ${orgName} again.\n\n` +
        `Open ${loginUrl} and sign in with this phone number (${emp.phone}) to clock in and view your pay.`
    );
    console.log(`[employees] resend-invite ✓ accepted by SMS provider for ${emp.phone}`);
    return res.json({ inviteSent: true });
  } catch (err) {
    const inviteError = err instanceof Error ? err.message : String(err);
    console.warn(`[employees] resend-invite ✗ to ${emp.phone} failed:`, inviteError);
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
