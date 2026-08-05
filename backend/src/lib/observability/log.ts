/**
 * Recording what the assist did, without recording what it was about.
 *
 * Two rules shape every line of this file.
 *
 * The first is that logging is observational. It wraps; it does not
 * participate. Nothing here can change a brief, delay a reply, or fail a
 * request — a recorder that alters the thing it records is not a recorder. So
 * every write is best-effort, every failure is swallowed after a console line,
 * and the wrapped function's result is returned untouched whether the log
 * succeeded or not.
 *
 * The second is that redaction happens before the write, never after. Not "we
 * clean it up on the way out", not "we redact when displaying" — before. A row
 * that has held a wage for one second has held it, and backups do not forget.
 * Everything that leaves this module for storage has been through
 * lib/privacy/scrub with the org's roster loaded, so names become references
 * and figures become tokens while the structure survives.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { scrub, scrubContextForOrg, type ScrubContext } from "../privacy/scrub";

export type Outcome = "ready" | "awaiting_employee" | "empty" | "no_subject" | "failed";

export interface TraceStep {
  step: string;
  detail?: Record<string, unknown>;
  durationMs?: number;
}

/**
 * Collects steps as the work happens. Handed to the wrapped function so it can
 * mark what it did — deliberately a plain object with no database in it, so a
 * step can never be the thing that makes an assist slow.
 */
export class Trace {
  readonly steps: TraceStep[] = [];
  private startedAt = Date.now();

  step(step: string, detail?: Record<string, unknown>): void {
    this.steps.push({ step, detail, durationMs: Date.now() - this.startedAt });
  }

  get toolCalls(): number {
    return this.steps.filter((s) => s.step.startsWith("tool:")).length;
  }

  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }
}

export interface LogRecord {
  orgId: string | null;
  kind: string;
  subjectRef?: string | null;
  /** Raw. Scrubbed here, before it goes anywhere. */
  input?: string | null;
  /** Raw. Same. */
  output?: string | null;
  claim?: string | null;
  confidence?: string | null;
  findings?: number;
  outcome: Outcome;
  askedEmployee?: boolean;
  error?: string | null;
  engineVersion?: string | null;
}

/**
 * Write one log and its trace. Never throws.
 *
 * The roster is loaded once per write so free text can be matched against real
 * names. If that lookup fails we still scrub — the pattern pass alone catches
 * phones, money, IDs and images, and a failed lookup is not a reason to write
 * raw text.
 */
export async function writeLog(
  db: SupabaseClient,
  record: LogRecord,
  trace: Trace
): Promise<void> {
  try {
    const ctx: ScrubContext = record.orgId
      ? await scrubContextForOrg(db, record.orgId)
      : { subjects: [] };

    const { data, error } = await db
      .from("conversation_logs")
      .insert({
        org_id: record.orgId,
        kind: record.kind,
        subject_ref: record.subjectRef ?? null,
        input_redacted: record.input ? scrub(record.input, ctx) : null,
        output_redacted: record.output ? scrub(record.output, ctx) : null,
        claim: record.claim ?? null,
        confidence: record.confidence ?? null,
        tool_calls: trace.toolCalls,
        findings: record.findings ?? 0,
        duration_ms: trace.elapsedMs,
        outcome: record.outcome,
        asked_employee: record.askedEmployee ?? false,
        error_redacted: record.error ? scrub(record.error, ctx) : null,
        engine_version: record.engineVersion ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[observability] log write failed:", error?.message);
      return;
    }

    if (trace.steps.length === 0) return;
    await db.from("conversation_traces").insert(
      trace.steps.map((s, i) => ({
        log_id: data.id,
        seq: i,
        step: s.step,
        // Step details are counts and shapes, but they are written by hand at
        // call sites and call sites drift, so they are scrubbed like anything
        // else rather than trusted to be clean.
        detail: scrub(s.detail ?? {}, ctx),
        duration_ms: s.durationMs ?? null,
      }))
    );
  } catch (err) {
    console.error("[observability] log write threw:", (err as Error).message);
  }
}

/**
 * Run something and log it, returning exactly what it returned.
 *
 * If the work throws, the log records the failure and the error is rethrown
 * unchanged — observing a failure must not swallow it.
 */
export async function observed<T>(
  db: SupabaseClient,
  base: Omit<LogRecord, "outcome">,
  work: (trace: Trace) => Promise<{ result: T; record: Partial<LogRecord> & { outcome: Outcome } }>
): Promise<T> {
  const trace = new Trace();
  try {
    const { result, record } = await work(trace);
    await writeLog(db, { ...base, ...record }, trace);
    return result;
  } catch (err) {
    await writeLog(
      db,
      { ...base, outcome: "failed", error: (err as Error).message },
      trace
    );
    throw err;
  }
}
