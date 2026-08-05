/**
 * Attendance capture (spec §3).
 *
 *  POST /api/attendance/scan            (employee) — clock in by scanning the
 *      workplace QR. Body: { token, lat, lng, accuracy }. The server stamps the
 *      time (never the device clock), validates the signed workplace token +
 *      nonce, runs geofence + integrity heuristics, compares against the
 *      employee's assigned shift for auto-lateness, and assigns a status of
 *      normal | late | flagged | on_leave. A day covered by approved leave is
 *      never late: the owner already signed it off.
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
import { uploadSelfie, signSelfie } from "../../lib/storage/selfies";
import { evaluateScan as enforceRules } from "../../lib/rules/engine";
import { confirmPendingCheck } from "../../lib/presence";
import { approvedLeaveOn } from "../../lib/leave/cover";
import { CLIENT_OUTCOMES, recordClientAttempt, recordServerAttempt } from "../../lib/attendance/attempts";
import { nairobiDate, nairobiDayStartISO, nairobiMinutes } from "../../lib/time";

const router = Router();

/** "08:30[:00]" → minutes since midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

const scanInput = z.object({
  token: z.string().min(1),
  // Location is best-effort: the QR scan is the primary gate. When present we run
  // the geofence check (flag only, never block); when absent we still allow it.
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().nonnegative().nullable().optional(),
  // Live front-camera selfie (data URL or bare base64). Best-effort proof of WHO
  // scanned; owner-reviewed. `faceDetected` is the on-device gate result.
  selfie: z.string().max(3_000_000).nullable().optional(),
  faceDetected: z.boolean().nullable().optional(),
});

// ── POST /scan ────────────────────────────────────────────────────────────────
router.post("/scan", requireEmployee, async (req, res) => {
  const parsed = scanInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { token, lat, lng, accuracy, selfie, faceDetected } = parsed.data;

  const db = getServiceClient();

  // Every rejection below is logged before it is returned. A scan that does not
  // become attendance is exactly the thing an employee later says they tried,
  // so it has to leave a trace on our side too — see lib/attendance/attempts.
  const who = {
    orgId: req.employee!.orgId,
    employeeId: req.employee!.employeeId,
    lat: lat ?? null,
    lng: lng ?? null,
    accuracyM: accuracy ?? null,
  };

  const payload = verifyWorkplaceToken(token);
  if (!payload) {
    await recordServerAttempt(db, "invalid_token", who, "Token failed signature or expiry check.");
    return res.status(400).json({ error: "Invalid or expired QR code." });
  }

  // Workplace referenced by the token, scoped to the employee's org.
  const { data: workplace } = await db
    .from("workplaces")
    .select("id, org_id, name, lat, lng, geofence_radius_m, qr_nonce")
    .eq("id", payload.wid)
    .maybeSingle();

  if (!workplace || workplace.org_id !== req.employee!.orgId) {
    await recordServerAttempt(db, "wrong_workplace", who, "QR belongs to a workplace outside this org.");
    return res.status(403).json({ error: "This QR code is not for your workplace." });
  }
  if (workplace.qr_nonce !== payload.nonce) {
    await recordServerAttempt(
      db,
      "rotated_qr",
      { ...who, workplaceId: workplace.id },
      "QR was printed before the code was last rotated."
    );
    return res.status(400).json({ error: "This QR code has been replaced. Ask for the new one." });
  }

  // Employee + assigned shift.
  const { data: employee } = await db
    .from("employees")
    .select("id, shift:shifts(id, start_time, grace_minutes, days_of_week)")
    .eq("id", req.employee!.employeeId)
    .eq("org_id", req.employee!.orgId)
    .maybeSingle();
  if (!employee) {
    await recordServerAttempt(db, "employee_not_found", { ...who, workplaceId: workplace.id });
    return res.status(404).json({ error: "employee not found" });
  }

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

  // Leave the owner already approved for today. Someone who is signed off and
  // comes in anyway is doing us a favour — the day must not be priced as late.
  const onDate = nairobiDate(now);
  const leave = await approvedLeaveOn(db, req.employee!.employeeId, onDate);

  // Roster comparison → auto-lateness. Only clock-INs can be "late".
  let rosterExpected: { shift_id: string; expected_start: string; late_by_min: number } | null = null;
  let late = false;
  if (shift && direction === "in" && !leave) {
    const startMin = timeToMinutes(shift.start_time);
    const nowMin = nairobiMinutes(now);
    let lateBy = nowMin - (startMin + (shift.grace_minutes ?? 0));
    // Guard against midnight wrap for overnight shifts: only treat as late within a 12h window.
    if (lateBy > 0 && lateBy < 12 * 60) {
      late = true;
    } else {
      lateBy = Math.max(0, lateBy);
    }
    rosterExpected = { shift_id: shift.id, expected_start: shift.start_time, late_by_min: late ? lateBy : 0 };
  }

  // Identity gate: a scan without a verified live face is flagged for owner
  // review — this is the anti-buddy-punching signal (someone's phone left at
  // work). Consistent with the geofence: we flag, never block.
  const flags = [...geo.flags];
  if (faceDetected !== true) flags.push("no_face");

  // Status precedence: integrity flags → flagged (a signed-off day is still no
  // excuse for a scan nobody can identify); else an approved leave day →
  // on_leave; else shift lateness → late; else normal.
  const status = flags.length > 0 ? "flagged" : leave ? "on_leave" : late ? "late" : "normal";

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
      flags,
      roster_expected: rosterExpected,
    })
    .select("id, scanned_at, status, direction, distance_m, flags")
    .single();

  if (error) {
    await recordServerAttempt(
      db,
      "server_error",
      { ...who, workplaceId: workplace.id },
      "The attendance row could not be written."
    );
    return res.status(500).json({ error: error.message });
  }

  // Store the selfie (best-effort) and stamp its path on the entry. A failed
  // upload must never fail the clock-in — the attendance record already exists.
  if (selfie) {
    try {
      const path = await uploadSelfie(req.employee!.employeeId, entry.id, selfie);
      await db.from("attendance_entries").update({ selfie_path: path }).eq("id", entry.id);
    } catch (err) {
      console.error(`[scan] selfie upload failed for entry ${entry.id}:`, (err as Error).message);
    }
  }

  // A scan answers any pending mid-shift presence check — but only when the
  // employee is verifiably at the workplace. If the workplace has coordinates,
  // the scan must be inside the geofence (so a photographed QR scanned from
  // outside, or with GPS off, does NOT confirm); a workplace without coordinates
  // can't be geofenced, so the QR + selfie stands.
  const workplaceHasCoords = workplace.lat != null && workplace.lng != null;
  const locationOk = !workplaceHasCoords || (hasCoords && geo.insideGeofence);
  try {
    await confirmPendingCheck(db, req.employee!.employeeId, entry.id, locationOk);
  } catch (err) {
    console.error(`[scan] presence confirm failed for entry ${entry.id}:`, (err as Error).message);
  }

  // Automatic enforcement. The owner's rules are evaluated against this scan
  // the moment it lands, so a late arrival becomes a notified violation
  // without anyone having to watch the dashboard. Deterministic, and it only
  // ever applies a rule the owner configured — see lib/rules/engine.
  let applied = null as Awaited<ReturnType<typeof enforceRules>>;
  try {
    applied = await enforceRules(db, {
      orgId: req.employee!.orgId,
      employeeId: req.employee!.employeeId,
      workplaceId: workplace.id,
      attendanceId: entry.id,
      status,
      lateByMin: rosterExpected?.late_by_min ?? 0,
      scannedAt: entry.scanned_at,
      onDate,
    });
  } catch (err) {
    // Enforcement must never cost the employee their clock-in.
    console.error(`[scan] rule evaluation failed for entry ${entry.id}:`, (err as Error).message);
  }

  res.status(201).json({
    entry,
    workplace: { id: workplace.id, name: workplace.name },
    distance_m: geo.distanceM == null ? null : Math.round(geo.distanceM),
    status,
    direction,
    flags,
    on_leave: leave ? { id: leave.id, start_date: leave.start_date, end_date: leave.end_date } : null,
    penalty: applied
      ? { id: applied.violationId, reason: applied.reason, amount: applied.amount }
      : null,
  });
});

// ── POST /attempts (employee) — the phone reports a scan it couldn't complete ─
//
// When the camera won't open or the signal drops, the server never hears about
// it, so the employee's side of "I tried" has no record. The app reports it
// here — queued on the device and sent when it can reach us, which is why the
// device supplies the time it happened.
//
// The device sends a code from a fixed list and nothing else. No free text is
// accepted: there is no field here for a name, a number or an amount to end up
// in, and a client-written row is marked as a claim, not as something we saw.
const attemptInput = z.object({
  outcome: z.enum(CLIENT_OUTCOMES as [string, ...string[]]),
  workplace_id: z.string().uuid().nullable().optional(),
  occurred_at: z.string().datetime().nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().nonnegative().nullable().optional(),
});

router.post("/attempts", requireEmployee, async (req, res) => {
  const parsed = attemptInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const db = getServiceClient();
  const now = new Date();

  // A device that reports in a loop would fill the table and drown the real
  // signal, so the day is capped. The cap is generous — a genuinely broken
  // phone at a genuinely broken site will retry a lot, and we want that.
  const { count } = await db
    .from("scan_attempts")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", req.employee!.employeeId)
    .eq("source", "client")
    .gte("created_at", nairobiDayStartISO(now));
  if ((count ?? 0) >= 60) return res.status(429).json({ error: "too many reports today" });

  // Never trust a device clock beyond today, and never let it write the future.
  const claimed = parsed.data.occurred_at ? new Date(parsed.data.occurred_at) : now;
  const occurredAt =
    claimed > now || claimed.getTime() < now.getTime() - 3 * 864e5 ? now : claimed;

  await recordClientAttempt(db, parsed.data.outcome as never, {
    orgId: req.employee!.orgId,
    employeeId: req.employee!.employeeId,
    workplaceId: parsed.data.workplace_id ?? null,
    lat: parsed.data.lat ?? null,
    lng: parsed.data.lng ?? null,
    accuracyM: parsed.data.accuracy ?? null,
    occurredAt: occurredAt.toISOString(),
  });

  res.status(201).json({ recorded: true });
});

// ── GET /selfie/:entryId (owner) — short-lived signed URL for a scan selfie ───
router.get("/selfie/:entryId", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.entryId);
  if (!idParse.success) return res.status(400).json({ error: "invalid id" });

  const db = getServiceClient();
  // The entry must belong to an employee in the owner's org.
  const { data: entry } = await db
    .from("attendance_entries")
    .select("selfie_path, employees!inner(org_id)")
    .eq("id", idParse.data)
    .maybeSingle();
  const emp = entry
    ? (Array.isArray((entry as any).employees) ? (entry as any).employees[0] : (entry as any).employees)
    : null;
  if (!entry || !emp || emp.org_id !== req.owner!.orgId) {
    return res.status(404).json({ error: "not found" });
  }
  if (!entry.selfie_path) return res.status(404).json({ error: "no selfie" });

  const url = await signSelfie(entry.selfie_path);
  if (!url) return res.status(502).json({ error: "could not sign selfie" });
  res.json({ url });
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
