/**
 * The tools. Each one answers a single question from Kaunta's own records.
 *
 * They live here rather than being expressed as prompts because every one of
 * them is a counting problem, and counting is the thing a model is worst at and
 * a query is best at. Nothing in this file infers, weighs or concludes; each
 * function returns numbers and the ids they came from, so any line in a brief
 * can be traced back to rows an owner could go and read themselves.
 *
 * Nothing here needs anything outside Kaunta. Two later checks will — reading a
 * sick note, asking whether a road was actually closed — and those are the only
 * two places anything external belongs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { attemptsByEmployee, siteHealthAround, OUTCOME_LABEL } from "../../attendance/attempts";
import { approvedLeaveOn } from "../../leave/cover";
import { nairobiDate, TZ } from "../../time";

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

/* ── What the penalty actually was ────────────────────────────────────── */

export interface PenaltyFacts {
  violationId: string;
  employeeId: string;
  employeeName: string;
  workplaceId: string | null;
  workplaceName: string | null;
  reason: string;
  amount: number;
  raisedBy: string;
  createdAt: string;
  /** The scan that triggered it, if there was one. */
  attendanceId: string | null;
  scannedAt: string | null;
  scannedAtLocal: string | null;
  expectedStart: string | null;
  graceMinutes: number | null;
  lateByMin: number | null;
  onDate: string | null;
}

export async function penaltyFacts(
  db: SupabaseClient,
  violationId: string
): Promise<PenaltyFacts | null> {
  const { data: row } = await db
    .from("violations")
    .select(
      "id, employee_id, workplace_id, reason, amount, raised_by, created_at, attendance_id, " +
        "employees(name), workplaces(name)"
    )
    .eq("id", violationId)
    .maybeSingle();
  if (!row) return null;
  // The embedded selects defeat the generated types; every field below is
  // read defensively anyway.
  const v = row as unknown as Record<string, unknown>;

  const one = <T>(x: unknown): T | null => (Array.isArray(x) ? (x[0] as T) ?? null : (x as T) ?? null);
  const emp = one<{ name: string }>(v.employees);
  const wp = one<{ name: string }>(v.workplaces);

  type Roster = { expected_start?: string; late_by_min?: number };
  let scannedAt: string | null = null;
  let roster: Roster | null = null;
  if (v.attendance_id) {
    const { data: entry } = await db
      .from("attendance_entries")
      .select("scanned_at, roster_expected")
      .eq("id", v.attendance_id as string)
      .maybeSingle();
    const e = entry as unknown as Record<string, unknown> | null;
    scannedAt = (e?.scanned_at as string) ?? null;
    roster = (e?.roster_expected as Roster | null) ?? null;
  }

  // The grace period is part of the arithmetic, so it belongs in the brief.
  const { data: empRow } = await db
    .from("employees")
    .select("shift:shifts(grace_minutes)")
    .eq("id", v.employee_id)
    .maybeSingle();
  const shift = one<{ grace_minutes: number }>((empRow as Record<string, unknown> | null)?.shift);

  return {
    violationId: v.id as string,
    employeeId: v.employee_id as string,
    employeeName: emp?.name ?? "the employee",
    workplaceId: (v.workplace_id as string | null) ?? null,
    workplaceName: wp?.name ?? null,
    reason: v.reason as string,
    amount: Number(v.amount),
    raisedBy: (v.raised_by as string) ?? "owner",
    createdAt: v.created_at as string,
    attendanceId: (v.attendance_id as string | null) ?? null,
    scannedAt,
    scannedAtLocal: scannedAt ? fmtTime(scannedAt) : null,
    expectedStart: roster?.expected_start ?? null,
    graceMinutes: shift?.grace_minutes ?? null,
    lateByMin: roster?.late_by_min ?? null,
    onDate: scannedAt ? nairobiDate(new Date(scannedAt)) : null,
  };
}

/* ── The window the morning happened in ───────────────────────────────── */

/**
 * From an hour before the shift started to the moment they finally scanned.
 *
 * Wide enough to catch someone who started trying early, bounded by the scan
 * so it cannot sweep in the rest of the day. If there is no scan we take the
 * two hours around the expected start, because that is the period in dispute.
 */
export function disputeWindow(facts: PenaltyFacts): { fromISO: string; toISO: string } {
  const anchor = facts.scannedAt ? new Date(facts.scannedAt) : new Date(facts.createdAt);
  const from = new Date(anchor.getTime() - 90 * 60 * 1000);
  const to = facts.scannedAt ? anchor : new Date(anchor.getTime() + 30 * 60 * 1000);
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

/* ── Did they try? ────────────────────────────────────────────────────── */

export interface AttemptEvidence {
  total: number;
  serverWitnessed: number;
  deviceReported: number;
  firstAt: string | null;
  lastAt: string | null;
  outcomes: string[];
  ids: string[];
}

export async function attemptEvidence(
  db: SupabaseClient,
  employeeId: string,
  fromISO: string,
  toISO: string
): Promise<AttemptEvidence> {
  const rows = await attemptsByEmployee(db, employeeId, fromISO, toISO);
  const outcomes = [...new Set(rows.map((r) => OUTCOME_LABEL[r.outcome as never] ?? r.outcome))];
  return {
    total: rows.length,
    serverWitnessed: rows.filter((r) => r.source === "server").length,
    deviceReported: rows.filter((r) => r.source === "client").length,
    firstAt: rows[0] ? fmtTime(rows[0].occurred_at) : null,
    lastAt: rows.length ? fmtTime(rows[rows.length - 1].occurred_at) : null,
    outcomes,
    ids: rows.map((r) => r.id),
  };
}

/* ── Was the site working for everyone else? ──────────────────────────── */

export interface SiteEvidence {
  successfulScansByOthers: number;
  distinctOthersWhoScanned: number;
  failedAttemptsByOthers: number;
  serverSideFailures: number;
  /** How many other people were even rostered — with nobody else, there is nothing to compare to. */
  colleaguesOnSite: number;
}

export async function siteEvidence(
  db: SupabaseClient,
  workplaceId: string,
  employeeId: string,
  fromISO: string,
  toISO: string
): Promise<SiteEvidence> {
  const [health, { count }] = await Promise.all([
    siteHealthAround(db, workplaceId, fromISO, toISO, employeeId),
    db
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("workplace_id", workplaceId)
      .eq("status", "active")
      .neq("id", employeeId),
  ]);

  return {
    successfulScansByOthers: health.successful_scans_by_others,
    distinctOthersWhoScanned: health.distinct_others_who_scanned,
    failedAttemptsByOthers: health.failed_attempts_by_others,
    serverSideFailures: health.server_side_failures,
    colleaguesOnSite: count ?? 0,
  };
}

/* ── Have they said this before, and what happened? ───────────────────── */

export interface ClaimHistory {
  appealsInNinetyDays: number;
  upheld: number;
  waived: number;
  pending: number;
  /** Prior appeals routed to the same claim. Adversarial drift shows up here. */
  sameClaimBefore: number;
}

export async function claimHistory(
  db: SupabaseClient,
  employeeId: string,
  claim: string,
  excludeAppealId: string
): Promise<ClaimHistory> {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const { data } = await db
    .from("appeals")
    .select("id, decision, submitted_at, violations!inner(employee_id), appeal_assists(claim)")
    .eq("violations.employee_id", employeeId)
    .gte("submitted_at", since);

  const rows = (data ?? []).filter((a) => a.id !== excludeAppealId);
  const claimOf = (a: unknown) => {
    const x = (a as { appeal_assists?: unknown }).appeal_assists;
    const first = Array.isArray(x) ? x[0] : x;
    return (first as { claim?: string } | null)?.claim ?? null;
  };

  return {
    appealsInNinetyDays: rows.length,
    upheld: rows.filter((a) => a.decision === "rejected").length,
    waived: rows.filter((a) => a.decision === "accepted").length,
    pending: rows.filter((a) => a.decision === "pending").length,
    sameClaimBefore: rows.filter((a) => claimOf(a) === claim).length,
  };
}

/* ── Was the day covered anyway? ──────────────────────────────────────── */

export async function leaveEvidence(
  db: SupabaseClient,
  employeeId: string,
  onDate: string | null
): Promise<{ covered: boolean; paid: boolean | null; halfDay: string | null }> {
  if (!onDate) return { covered: false, paid: null, halfDay: null };
  const cover = await approvedLeaveOn(db, employeeId, onDate);
  return {
    covered: Boolean(cover),
    paid: cover?.paid ?? null,
    halfDay: cover?.half_day ?? null,
  };
}
