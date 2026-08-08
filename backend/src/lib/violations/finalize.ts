/**
 * Finalize a violation: lock it, generate the outcome PDF, store it, and deliver
 * the PDF over WhatsApp to the employee (and the owner). Shared by the cron
 * (auto-lock of un-appealed violations) and the appeals route (owner decision).
 */
import { getServiceClient } from "../supabase";
import { violationOutcomePdf } from "../pdf/templates";
import { uploadPdf } from "../pdf/render";
import { sendDocument } from "../whatsapp/meta";

export type FinalOutcome = "upheld" | "waived";

export async function finalizeViolation(
  violationId: string,
  outcome: FinalOutcome
): Promise<{ pdfUrl: string }> {
  const db = getServiceClient();

  interface ViolationRow {
    id: string;
    reason: string;
    amount: number;
    status: string;
    created_at: string;
    employee_id: string;
    workplace_id: string | null;
    employees: { name: string; phone: string; org_id: string } | { name: string; phone: string; org_id: string }[] | null;
    workplaces: { name: string } | { name: string }[] | null;
    appeals: { message: string; decided_at: string | null } | { message: string; decided_at: string | null }[] | null;
  }

  const { data, error } = await db
    .from("violations")
    .select(
      "id, reason, amount, status, created_at, employee_id, workplace_id, " +
        "employees(name, phone, org_id), " +
        "workplaces(name), appeals(message, decided_at)"
    )
    .eq("id", violationId)
    .single();
  if (error || !data) throw new Error(`[finalize] violation not found: ${error?.message}`);
  const v = data as unknown as ViolationRow;

  // Joined rows come back as an object or a single-element array depending on the
  // FK cardinality; normalise defensively.
  const emp = (Array.isArray(v.employees) ? v.employees[0] : v.employees) ?? null;
  const wp = (Array.isArray(v.workplaces) ? v.workplaces[0] : v.workplaces) ?? null;
  const appeal = Array.isArray(v.appeals) ? v.appeals[0] : v.appeals;

  const outcomeText = outcome === "waived" ? "Penalty waived" : "Penalty upheld";
  const finalStatus = "locked";
  const effectiveAmount = outcome === "waived" ? 0 : Number(v.amount);

  const pdf = await violationOutcomePdf({
    employeeName: emp?.name ?? "Employee",
    workplaceName: wp?.name,
    reason: v.reason,
    amount: Number(v.amount),
    status: outcome === "waived" ? "waived" : "upheld",
    outcome: outcomeText,
    createdAt: v.created_at,
    appealMessage: appeal?.message ?? null,
    decidedAt: appeal?.decided_at ?? null,
  });

  const { path, signedUrl } = await uploadPdf(`violations/${violationId}.pdf`, pdf);

  // The PATH is what gets stored. `pdf_url` held a signed link with a seven-day
  // expiry, written into the row permanently — so the document that exists
  // precisely so a decision can be produced months later stopped opening after
  // a week, with a dead link as the only symptom. It is still written for the
  // rows and clients that already read it, but the path is the durable one and
  // GET /api/violations/:id/document signs from it on demand.
  await db
    .from("violations")
    .update({
      status: finalStatus,
      outcome: outcomeText,
      amount: effectiveAmount,
      pdf_path: path,
      pdf_url: signedUrl,
    })
    .eq("id", violationId);

  // Deliver to the employee, and record whether it actually went. A notice that
  // silently failed is how someone first learns of a deduction from their
  // payslip — so the failure belongs on the row, where the owner will see it,
  // not in a console nobody reads.
  if (emp?.phone) {
    try {
      await sendDocument(emp.phone, signedUrl, `violation-${violationId.slice(0, 8)}.pdf`, outcomeText);
      await db
        .from("violations")
        .update({ notified_at: new Date().toISOString(), notify_error: null })
        .eq("id", violationId);
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[finalize] outcome delivery failed for ${violationId}:`, message);
      await db
        .from("violations")
        .update({ notify_error: message.slice(0, 300) })
        .eq("id", violationId);
    }
  } else {
    await db
      .from("violations")
      .update({ notify_error: "No phone number on file for this employee." })
      .eq("id", violationId);
  }

  return { pdfUrl: signedUrl };
}

/**
 * A fresh link to a stored outcome document.
 *
 * Falls back to the legacy `pdf_url` for rows finalised before the path was
 * stored — those links may already have expired, which is exactly the bug, but
 * returning a dead link is still better than pretending no document exists.
 */
export async function signViolationDocument(
  pdfPath: string | null,
  legacyUrl: string | null,
  ttlSec = 300
): Promise<string | null> {
  if (pdfPath) {
    const db = getServiceClient();
    const { data } = await db.storage.from("documents").createSignedUrl(pdfPath, ttlSec);
    if (data?.signedUrl) return data.signedUrl;
  }
  return legacyUrl;
}
