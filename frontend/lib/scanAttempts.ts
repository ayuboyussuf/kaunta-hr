/**
 * Telling Aproksi about a clock-in that never happened.
 *
 * The failures that matter most to an employee are the ones the server never
 * sees: the camera won't open, the signal drops, GPS is refused. From the
 * backend's point of view the person simply didn't turn up, which is precisely
 * the thing they will later be arguing about.
 *
 * So the phone keeps its own note. If the report itself can't be sent — which
 * is likely, since "no signal" is one of the things being reported — it queues
 * in local storage and goes out on the next screen that loads with a working
 * connection.
 *
 * A report is a claim, not proof, and the backend records it as one. Nothing
 * here decides anything; it exists so the question has evidence on both sides.
 */
import { api, getEmployeeToken } from "@/lib/api";

export type ScanFailure =
  | "camera_blocked"
  | "camera_failed"
  | "network_error"
  | "location_denied"
  | "unreadable_qr";

interface QueuedReport {
  outcome: ScanFailure;
  occurred_at: string;
  workplace_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
}

const QUEUE_KEY = "aproksi_hr_scan_attempts";
const MAX_QUEUED = 40;

function readQueue(): QueuedReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedReport[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedReport[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUED)));
  } catch {
    /* storage full or blocked — the report is not worth breaking the app for */
  }
}

async function send(r: QueuedReport): Promise<boolean> {
  const token = getEmployeeToken();
  if (!token) return false;
  try {
    await api("/api/attendance/attempts", { method: "POST", token, body: r });
    return true;
  } catch {
    return false;
  }
}

/**
 * Record a failed clock-in attempt. Sends now if it can, queues if it can't.
 * Never throws: reporting a failure must not itself become one.
 */
export async function reportScanFailure(
  outcome: ScanFailure,
  extra: Omit<QueuedReport, "outcome" | "occurred_at"> = {}
): Promise<void> {
  const report: QueuedReport = { outcome, occurred_at: new Date().toISOString(), ...extra };
  if (await send(report)) return;
  writeQueue([...readQueue(), report]);
}

/**
 * Flush anything the phone couldn't send earlier. Safe to call on any screen;
 * it does nothing when the queue is empty.
 */
export async function flushScanFailures(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;

  const stillQueued: QueuedReport[] = [];
  for (const r of queue) {
    if (!(await send(r))) stillQueued.push(r);
  }
  writeQueue(stillQueued);
}
