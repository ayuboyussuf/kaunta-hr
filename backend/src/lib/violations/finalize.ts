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

  const { signedUrl } = await uploadPdf(`violations/${violationId}.pdf`, pdf);

  await db
    .from("violations")
    .update({ status: finalStatus, outcome: outcomeText, amount: effectiveAmount, pdf_url: signedUrl })
    .eq("id", violationId);

  // Deliver to the employee. (Owner delivery handled via dashboard; a WhatsApp
  // copy to the owner can be added once the owner's number is on the org.)
  if (emp?.phone) {
    try {
      await sendDocument(emp.phone, signedUrl, `violation-${violationId.slice(0, 8)}.pdf`, outcomeText);
    } catch (err) {
      console.error(`[finalize] WhatsApp delivery failed for ${violationId}:`, err);
    }
  }

  return { pdfUrl: signedUrl };
}
