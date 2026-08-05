/**
 * Background jobs (BullMQ + Redis) for work that must not block the request or
 * cron cycle: locked payslip-PDF generation and bulk SMS sending.
 *
 * Deliberately minimal: two named queues (`pdf`, `sms`), one processor each,
 * one inline worker (started from index.ts). Redis is OPTIONAL — when
 * `REDIS_URL` is unset (local/dev), `enqueue()` runs the job inline, so the app
 * behaves exactly as before with no queue infrastructure.
 *
 * Idempotency / retry-safety (no double-pay, no double-send):
 *  - each job carries a deterministic jobId, so BullMQ won't run a duplicate;
 *  - the PDF processor is a no-op if the payslip already has a pdf_url;
 *  - the cron guards (one presence_check per prompt, payroll_last_period) stop
 *    duplicate work from being enqueued in the first place.
 */
import { Queue } from "bullmq";
import IORedis, { type RedisOptions } from "ioredis";
import { getServiceClient } from "../supabase";
import { payslipPdf } from "../pdf/templates";
import { uploadPdf } from "../pdf/render";
import { sendText } from "../messaging";
import { toNum } from "../money";

export type PdfJob = { payslipId: string };
export type SmsJob = { to: string; body: string };
export type JobData = { pdf: PdfJob; sms: SmsJob };
export type QueueName = keyof JobData;

const redisUrl = () => process.env.REDIS_URL;
export const redisEnabled = () => !!redisUrl();

// BullMQ requires maxRetriesPerRequest: null on its Redis connections.
const REDIS_OPTS: RedisOptions = { maxRetriesPerRequest: null };

let sharedConnection: IORedis | null = null;
/** Shared (non-blocking) connection for Queue producers. */
export function getConnection(): IORedis {
  if (!sharedConnection) sharedConnection = new IORedis(redisUrl()!, REDIS_OPTS);
  return sharedConnection;
}
/** A fresh connection — Workers need their own (blocking) connection. */
export function newConnection(): IORedis {
  return new IORedis(redisUrl()!, REDIS_OPTS);
}

/** The actual work. The SAME function runs in the worker AND the inline fallback. */
export const processors: { [Q in QueueName]: (data: JobData[Q]) => Promise<void> } = {
  // Generate + store one locked payslip PDF. No-op if already generated.
  pdf: async ({ payslipId }) => {
    const db = getServiceClient();
    const { data: slip } = await db
      .from("payslips")
      .select("id, gross, net, pdf_url, breakdown, employees!inner(name), cycle:pay_cycles(label)")
      .eq("id", payslipId)
      .maybeSingle();
    if (!slip || slip.pdf_url) return; // idempotent
    const emp = Array.isArray((slip as any).employees) ? (slip as any).employees[0] : (slip as any).employees;
    const cyc = Array.isArray((slip as any).cycle) ? (slip as any).cycle[0] : (slip as any).cycle;
    const bd = (slip.breakdown ?? {}) as any;
    const deductions = [
      ...((bd.deductions ?? []) as any[]).map((d) => ({ reason: d.label, amount: toNum(d.amount) })),
      ...((bd.manual_deductions ?? []) as any[]).map((d) => ({ reason: d.label, amount: toNum(d.amount) })),
    ];
    const pdf = await payslipPdf({
      employeeName: emp?.name ?? "Employee",
      cycleLabel: cyc?.label ?? "",
      gross: toNum(slip.gross),
      deductions,
      net: toNum(slip.net),
    });
    const { signedUrl } = await uploadPdf(`payslips/${payslipId}.pdf`, pdf);
    await db.from("payslips").update({ pdf_url: signedUrl }).eq("id", payslipId);
  },
  // Send one SMS.
  sms: async ({ to, body }) => {
    await sendText(to, body);
  },
};

const queues = new Map<QueueName, Queue>();
function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: getConnection() });
    queues.set(name, q);
  }
  return q;
}

/**
 * Enqueue a job (or run it inline when Redis isn't configured). `jobId` MUST be
 * deterministic for the unit of work so retries/re-enqueues never duplicate it.
 */
export async function enqueue<Q extends QueueName>(name: Q, data: JobData[Q], jobId: string): Promise<void> {
  if (!redisEnabled()) {
    await processors[name](data); // inline fallback — same behaviour as before
    return;
  }
  // BullMQ custom job ids cannot contain ':' — normalise to a safe, still-unique id.
  const safeId = jobId.replace(/[^A-Za-z0-9_-]/g, "_");
  await getQueue(name).add(name, data, {
    jobId: safeId,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 500,
  });
}
