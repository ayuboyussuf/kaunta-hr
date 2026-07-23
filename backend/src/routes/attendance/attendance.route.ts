/**
 * Attendance capture (spec §3).
 *
 *  POST /api/attendance/scan            (employee) — clock in by scanning the
 *      workplace QR. Body: { token, lat, lng, accuracy }. The server stamps the
 *      time (never the device clock), validates the signed workplace token +
 *      nonce, runs geofence + integrity heuristics, compares against the
 *      employee's assigned shift for auto-lateness, and assigns a status of
 *      normal | late | flagged.
 *
 *  GET  /api/attendance/qr/:workplaceId (owner) — issue the signed token to
 *      print as the static QR (valid ~3 months).
 *  POST /api/attendance/qr/:workplaceId/rotate (owner) — rotate the nonce to
 *      invalidate previously printed QR codes.
 */
import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { requireEmployee, requireOwner } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";
import { signWorkplaceToken, verifyWorkplaceToken } from "../../lib/qr";
import { evaluateScan } from "../../lib/attendance/geofence";

const router = Router();

const TZ = "Africa/Nairobi";

/** Minutes since local midnight for a Date, in the given IANA timezone. */
function minutesSinceMidnight(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/** "08:30[:00]" → minutes since midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Start of "today" in Nairobi (UTC+3, no DST) as an ISO instant. */
function nairobiDayStartISO(now: Date): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${ymd}T00:00:00+03:00`).toISOString();
}

const scanInput = z.object({
  token: z.string().min(1),
  // Location is best-effort: the QR scan is the primary gate. When present we run
  // the geofence check (flag only, never block); when absent we still allow it.
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().nonnegative().nullable().optional(),
});

// ── POST /scan ────────────────────────────────────────────────────────────────
router.post("/scan", requireEmployee, async (req, res) => {
  const parsed = scanInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { token, lat, lng, accuracy } = parsed.data;

  const payload = verifyWorkplaceToken(token);
  if (!payload) return res.status(400).json({ error: "Invalid or expired QR code." });

  const db = getServiceClient();

  // Workplace referenced by the token, scoped to the employee's org.
  const { data: workplace } = await db
    .from("workplaces")
    .select("id, org_id, name, lat, lng, geofence_radius_m, qr_nonce")
    .eq("id", payload.wid)
    .maybeSingle();

  if (!workplace || workplace.org_id !== req.employee!.orgId) {
    return res.status(403).json({ error: "This QR code is not for your workplace." });
  }
  if (workplace.qr_nonce !== payload.nonce) {
    return res.status(400).json({ error: "This QR code has been replaced. Ask for the new one." });
  }

  // Employee + assigned shift.
  const { data: employee } = await db
    .from("employees")
    .select("id, shift:shifts(id, start_time, grace_minutes, days_of_week)")
    .eq("id", req.employee!.employeeId)
    .eq("org_id", req.employee!.orgId)
    .maybeSingle();
  if (!employee) return res.status(404).json({ error: "employee not found" });

  // Supabase types a to-one embed as an array; normalise to a single row.
  const shiftRaw = employee.shift as unknown;
  const shift = (Array.isArray(shiftRaw) ? shiftRaw[0] : shiftRaw) as {
    id: string;
    start_time: string;
    grace_minutes: number;
    days_of_week: number[];
  } | null;

  // Prior fix for impossible-jump detection.
  const { data: prior } = await db
    .from("attendance_entries")
    .select("lat, lng, scanned_at")
    .eq("employee_id", req.employee!.employeeId)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date();

  // Clock in vs out: the first scan of the Nairobi day is a clock-IN; the next
  // toggles to OUT, and so on. This lets the owner see in→out per employee.
  const { data: lastToday } = await db
    .from("attendance_entries")
    .select("direction")
    .eq("employee_id", req.employee!.employeeId)
    .gte("scanned_at", nairobiDayStartISO(now))
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const direction: "in" | "out" = lastToday?.direction === "in" ? "out" : "in";

  // Geofence only when both the workplace and this scan have coordinates. If
  // either is missing, the QR scan alone stands — no geofence flags, no block.
  const hasCoords = workplace.lat != null && workplace.lng != null && lat != null && lng != null;
  const geo = hasCoords
    ? evaluateScan({
        workplaceLat: workplace.lat,
        workplaceLng: workplace.lng,
        radiusM: workplace.geofence_radius_m,
        lat: lat!,
        lng: lng!,
        accuracyM: accuracy ?? null,
        now,
        prior:
          prior && prior.lat != null && prior.lng != null
            ? { lat: prior.lat, lng: prior.lng, scanned_at: prior.scanned_at }
            : null,
      })
    : { distanceM: null as number | null, flags: [] as string[], insideGeofence: true };

  // Roster comparison → auto-lateness. Only clock-INs can be "late".
  let rosterExpected: { shift_id: string; expected_start: string; late_by_min: number } | null = null;
  let late = false;
  if (shift && direction === "in") {
    const startMin = timeToMinutes(shift.start_time);
    const nowMin = minutesSinceMidnight(now, TZ);
    let lateBy = nowMin - (startMin + (shift.grace_minutes ?? 0));
    // Guard against midnight wrap for overnight shifts: only treat as late within a 12h window.
    if (lateBy > 0 && lateBy < 12 * 60) {
      late = true;
    } else {
      lateBy = Math.max(0, lateBy);
    }
    rosterExpected = { shift_id: shift.id, expected_start: shift.start_time, late_by_min: late ? lateBy : 0 };
  }

  // Status precedence: integrity flags → flagged; else shift lateness → late; else normal.
  const status = geo.flags.length > 0 ? "flagged" : late ? "late" : "normal";

  const { data: entry, error } = await db
    .from("attendance_entries")
    .insert({
      employee_id: req.employee!.employeeId,
      workplace_id: workplace.id,
      lat: lat ?? null,
      lng: lng ?? null,
      accuracy_m: accuracy ?? null,
      distance_m: geo.distanceM,
      status,
      direction,
      flags: geo.flags,
      roster_expected: rosterExpected,
    })
    .select("id, scanned_at, status, direction, distance_m, flags")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json({
    entry,
    workplace: { id: workplace.id, name: workplace.name },
    distance_m: geo.distanceM == null ? null : Math.round(geo.distanceM),
    status,
    direction,
    flags: geo.flags,
  });
});

// ── GET /qr/:workplaceId (owner) — issue printable token ─────────────────────
router.get("/qr/:workplaceId", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { data: wp } = await db
    .from("workplaces")
    .select("id, name, qr_nonce")
    .eq("id", req.params.workplaceId)
    .eq("org_id", req.owner!.orgId)
    .maybeSingle();
  if (!wp) return res.status(404).json({ error: "workplace not found" });

  const token = signWorkplaceToken(wp.id, wp.qr_nonce);
  res.json({ token, workplace: { id: wp.id, name: wp.name } });
});

// ── POST /qr/:workplaceId/rotate (owner) — invalidate old prints ─────────────
router.post("/qr/:workplaceId/rotate", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { data: wp, error } = await db
    .from("workplaces")
    .update({ qr_nonce: crypto.randomUUID(), qr_issued_at: new Date().toISOString() })
    .eq("id", req.params.workplaceId)
    .eq("org_id", req.owner!.orgId)
    .select("id, name, qr_nonce")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!wp) return res.status(404).json({ error: "workplace not found" });

  const token = signWorkplaceToken(wp.id, wp.qr_nonce);
  res.json({ token, workplace: { id: wp.id, name: wp.name } });
});

export default { basePath: "/api/attendance", router };
