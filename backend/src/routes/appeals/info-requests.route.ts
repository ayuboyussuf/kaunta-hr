/**
 * The employee answering the one question they were asked.
 *
 *   GET  /api/appeal-info/mine        → anything outstanding
 *   POST /api/appeal-info/:id/answer  → answer it, or say you can't
 *
 * This is not a chat. There is one open question per appeal, it was asked once,
 * and answering it closes it. "I can't provide this" is a first-class answer
 * rather than a dead end — most people who were genuinely ill for a morning
 * never get paperwork for it, and a flow that only accepts documents would
 * quietly turn "poor" into "lying".
 *
 * Answering re-runs the assist so the employer sees one current brief rather
 * than a thread. The assist still decides nothing.
 */
import { Router } from "express";
import { z } from "zod";
import { requireEmployee } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";
import { runAssist } from "../../lib/appeals/assist";
import { uploadAppealDocument } from "../../lib/storage/appealDocs";

const router = Router();

// ── What is outstanding ──────────────────────────────────────────────────────
router.get("/mine", requireEmployee, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("appeal_info_requests")
    .select("id, appeal_id, ask_code, question, asked_at, answered_at, answer, declined")
    .eq("employee_id", req.employee!.employeeId)
    .is("answered_at", null)
    .order("asked_at", { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ requests: data ?? [] });
});

// ── Answering ────────────────────────────────────────────────────────────────
const answerSchema = z
  .object({
    // Either an answer, or an explicit "I can't provide this".
    answer: z.string().trim().max(1000).optional(),
    declined: z.boolean().optional(),
    /** Data URL or bare base64, for a sick note photo. */
    document: z.string().max(6_000_000).nullable().optional(),
  })
  .refine((v) => v.declined === true || Boolean(v.answer) || Boolean(v.document), {
    message: "Answer the question, attach something, or choose 'not available'.",
  });

router.post("/:id/answer", requireEmployee, async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "invalid id" });
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const db = getServiceClient();

  // Must be their own, and still open. Answering twice is not allowed: the
  // employer has already been shown the first answer, and quietly replacing it
  // would change a record they have relied on.
  const { data: reqRow } = await db
    .from("appeal_info_requests")
    .select("id, appeal_id, employee_id, ask_code, answered_at")
    .eq("id", id.data)
    .eq("employee_id", req.employee!.employeeId)
    .maybeSingle();
  if (!reqRow) return res.status(404).json({ error: "not found" });
  if (reqRow.answered_at) {
    return res.status(409).json({ error: "You have already answered this." });
  }

  // The document is stored privately and only ever reached through a signed,
  // expiring link issued to the owner. A failed upload must not lose the rest
  // of the answer — the employee has done their part either way.
  let documentPath: string | null = null;
  if (parsed.data.document && !parsed.data.declined) {
    try {
      documentPath = await uploadAppealDocument(
        req.employee!.employeeId,
        reqRow.appeal_id as string,
        parsed.data.document
      );
    } catch (err) {
      console.error("[appeal-info] document upload failed:", (err as Error).message);
    }
  }

  const { error } = await db
    .from("appeal_info_requests")
    .update({
      answered_at: new Date().toISOString(),
      answer: parsed.data.declined ? null : (parsed.data.answer ?? null),
      declined: parsed.data.declined === true,
      document_path: documentPath,
    })
    .eq("id", id.data);
  if (error) return res.status(500).json({ error: error.message });

  // Re-run so the employer's brief reflects the answer. Never fails the reply:
  // the answer is recorded whether or not the re-run works.
  try {
    const { data: appeal } = await db
      .from("appeals")
      .select("id, violation_id, message")
      .eq("id", reqRow.appeal_id)
      .maybeSingle();
    if (appeal) {
      await runAssist(
        db,
        {
          id: appeal.id as string,
          violation_id: appeal.violation_id as string,
          message: appeal.message as string,
        },
        req.employee!.orgId
      );
    }
  } catch (err) {
    console.error("[appeal-info] re-run failed:", (err as Error).message);
  }

  res.json({ recorded: true, document_stored: Boolean(documentPath) });
});

export default { basePath: "/api/appeal-info", router };
