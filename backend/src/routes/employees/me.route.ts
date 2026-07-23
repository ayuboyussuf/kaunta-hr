/**
 * Employee self-service reads (spec §8). All routes require the employee's own
 * session and are hard-scoped to req.employee.employeeId — never trust a body/
 * query id. Own violations + appeals live at GET /api/violations/mine (owned by
 * another module).
 */
import { Router } from "express";
import { requireEmployee } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";

const router = Router();

// ── GET /profile ────────────────────────────────────────────────────────────
router.get("/profile", requireEmployee, async (req, res) => {
  const db = getServiceClient();
  const { data: employee, error } = await db
    .from("employees")
    .select(
      "id, name, phone, status, base_salary, workplace:workplaces(id, name), shift:shifts(id, name, kind, start_time, end_time, days_of_week, grace_minutes)"
    )
    .eq("id", req.employee!.employeeId)
    .eq("org_id", req.employee!.orgId)
    .maybeSingle();

  if (error || !employee) return res.status(404).json({ error: "employee not found" });
  res.json({ employee });
});

// ── GET /attendance ──────────────────────────────────────────────────────────
router.get("/attendance", requireEmployee, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("attendance_entries")
    .select(
      "id, scanned_at, status, flags, distance_m, workplace_id, roster_expected, workplace:workplaces(name)"
    )
    .eq("employee_id", req.employee!.employeeId)
    .order("scanned_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ attendance: data ?? [] });
});

// ── GET /payslips ─────────────────────────────────────────────────────────────
router.get("/payslips", requireEmployee, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("payslips")
    .select(
      "id, cycle_id, gross, deductions, net, pdf_url, sent_at, created_at, pay_cycle:pay_cycles(label, start_date, end_date, pay_date)"
    )
    .eq("employee_id", req.employee!.employeeId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ payslips: data ?? [] });
});

// ── GET /announcements ───────────────────────────────────────────────────────
router.get("/announcements", requireEmployee, async (req, res) => {
  const db = getServiceClient();
  const { data: employee } = await db
    .from("employees")
    .select("workplace_id")
    .eq("id", req.employee!.employeeId)
    .maybeSingle();

  let query = db
    .from("announcements")
    .select("*, workplaces(name)")
    .eq("org_id", req.employee!.orgId)
    .order("posted_at", { ascending: false });

  query = employee?.workplace_id
    ? query.or(`scope.eq.all,workplace_id.eq.${employee.workplace_id}`)
    : query.eq("scope", "all");

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ announcements: data ?? [] });
});

export default { basePath: "/api/employees/me", router };
