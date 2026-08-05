/**
 * Recording the scans that didn't work.
 *
 * This exists so that "the system wasn't working" is a question with an answer.
 * Today it is a claim nobody can check: the employee cannot show they tried,
 * and the owner cannot show they didn't. Both sides end up arguing about a
 * deduction on the strength of who sounds more convincing.
 *
 * Two things make an answer possible, and they are different in kind:
 *   - what WE observed (a rejected token, a rotated QR, an error we threw)
 *   - what the DEVICE reported (camera blocked, no signal, GPS refused)
 * The second is a claim, not proof. `source` keeps that honest, and nothing
 * downstream is allowed to blur the two.
 *
 * Writing here must never break a scan. Every call is best-effort: if the log
 * fails, the employee still gets the outcome they were going to get.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Rejections the server issued itself, and can therefore vouch for. */
export type ServerOutcome =
  | "invalid_token"
  | "wrong_workplace"
  | "rotated_qr"
  | "employee_not_found"
  | "server_error";

/** Failures only the device saw. Reported, not witnessed. */
export type ClientOutcome =
  | "camera_blocked"
  | "camera_failed"
  | "network_error"
  | "location_denied"
  | "unreadable_qr";

export const CLIENT_OUTCOMES: ClientOutcome[] = [
  "camera_blocked",
  "camera_failed",
  "network_error",
  "location_denied",
  "unreadable_qr",
];

/** Plain-English versions, for the owner and for appeal summaries. */
export const OUTCOME_LABEL: Record<ServerOutcome | ClientOutcome, string> = {
  invalid_token: "QR code could not be read as a valid workplace code",
  wrong_workplace: "scanned a QR belonging to another workplace",
  rotated_qr: "scanned a QR that had since been replaced",
  employee_not_found: "the staff record could not be loaded",
  server_error: "Kaunta failed to record the scan",
  camera_blocked: "camera permission was refused on the phone",
  camera_failed: "the camera would not open",
  network_error: "the phone could not reach Kaunta",
  location_denied: "location permission was refused on the phone",
  unreadable_qr: "the code would not scan",
};

export interface AttemptInput {
  orgId: string;
  employeeId?: string | null;
  workplaceId?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  occurredAt?: string | null;
}

/** Record a rejection the server made. `detail` is ours, never the device's. */
export async function recordServerAttempt(
  db: SupabaseClient,
  outcome: ServerOutcome,
  input: AttemptInput,
  detail?: string
): Promise<void> {
  await write(db, "server", outcome, input, detail ?? null);
}

/** Record a failure the device reported. No free text is accepted from it. */
export async function recordClientAttempt(
  db: SupabaseClient,
  outcome: ClientOutcome,
  input: AttemptInput
): Promise<void> {
  await write(db, "client", outcome, input, null);
}

async function write(
  db: SupabaseClient,
  source: "server" | "client",
  outcome: string,
  input: AttemptInput,
  detail: string | null
): Promise<void> {
  try {
    await db.from("scan_attempts").insert({
      org_id: input.orgId,
      employee_id: input.employeeId ?? null,
      workplace_id: input.workplaceId ?? null,
      source,
      outcome,
      detail,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      accuracy_m: input.accuracyM ?? null,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[attempts] could not record ${source}/${outcome}:`, (err as Error).message);
  }
}

/* ── Reading it back ──────────────────────────────────────────────────── */

export interface Attempt {
  id: string;
  employee_id: string | null;
  workplace_id: string | null;
  source: "server" | "client";
  outcome: string;
  detail: string | null;
  occurred_at: string;
}

/**
 * One employee's failed attempts inside a window.
 *
 * This is the "did they try" half of an appeal. It says nothing about whether
 * the site was working — that needs the other half, below.
 */
export async function attemptsByEmployee(
  db: SupabaseClient,
  employeeId: string,
  fromISO: string,
  toISO: string
): Promise<Attempt[]> {
  const { data } = await db
    .from("scan_attempts")
    .select("id, employee_id, workplace_id, source, outcome, detail, occurred_at")
    .eq("employee_id", employeeId)
    .gte("occurred_at", fromISO)
    .lte("occurred_at", toISO)
    .order("occurred_at", { ascending: true })
    .limit(200);
  return (data ?? []) as Attempt[];
}

/**
 * Whether the site was working for everyone else in the same window.
 *
 * The counts are the finding: N other people clocked in successfully while
 * this person's scans were failing, or nobody did. Both are facts, and both
 * are more use to an owner than an opinion about them.
 */
export async function siteHealthAround(
  db: SupabaseClient,
  workplaceId: string,
  fromISO: string,
  toISO: string,
  excludeEmployeeId?: string
): Promise<{
  successful_scans_by_others: number;
  distinct_others_who_scanned: number;
  failed_attempts_by_others: number;
  server_side_failures: number;
}> {
  const [{ data: entries }, { data: fails }] = await Promise.all([
    db
      .from("attendance_entries")
      .select("employee_id")
      .eq("workplace_id", workplaceId)
      .gte("scanned_at", fromISO)
      .lte("scanned_at", toISO)
      .limit(500),
    db
      .from("scan_attempts")
      .select("employee_id, source")
      .eq("workplace_id", workplaceId)
      .gte("occurred_at", fromISO)
      .lte("occurred_at", toISO)
      .limit(500),
  ]);

  const others = (entries ?? []).filter((e) => e.employee_id !== excludeEmployeeId);
  const otherFails = (fails ?? []).filter((f) => f.employee_id !== excludeEmployeeId);

  return {
    successful_scans_by_others: others.length,
    distinct_others_who_scanned: new Set(others.map((e) => e.employee_id as string)).size,
    failed_attempts_by_others: otherFails.length,
    server_side_failures: otherFails.filter((f) => f.source === "server").length,
  };
}
