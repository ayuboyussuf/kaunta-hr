/**
 * Kaunta-HR PDF templates. Each returns a Buffer; callers upload + deliver.
 * Shared by the wizard (setup summary), appeals (outcome), and payroll (payslip).
 */
import { renderToBuffer, drawHeader, drawFooter, BRAND, fmtKes } from "./render";

// ── Owner setup summary (spec §1) ─────────────────────────────────────────────
export interface SetupSummaryData {
  orgName: string;
  workplaceMode: string;
  rulesMode: string;
  workplaces: {
    name: string;
    radiusM: number;
    lat?: number | null;
    lng?: number | null;
    shifts: { name: string; kind: string; start: string; end: string }[];
    penalties: { reason: string; amount: number }[];
  }[];
}

export function setupSummaryPdf(d: SetupSummaryData): Promise<Buffer> {
  return renderToBuffer((doc) => {
    drawHeader(doc, "Workplace Setup Summary", d.orgName);
    doc.fillColor(BRAND.slate).fontSize(10).font("Helvetica");
    doc.text(`Configuration: ${d.workplaceMode} workplace · ${d.rulesMode} rules`);
    doc.moveDown(0.8);

    d.workplaces.forEach((w, i) => {
      doc.fillColor(BRAND.copper).fontSize(13).font("Helvetica-Bold").text(`${i + 1}. ${w.name}`);
      doc.fillColor(BRAND.ink).fontSize(10).font("Helvetica");
      const loc = w.lat != null && w.lng != null ? `${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}` : "—";
      doc.text(`Location: ${loc}   ·   Geofence radius: ${w.radiusM} m`);
      doc.moveDown(0.3);

      doc.fillColor(BRAND.sage).font("Helvetica-Bold").text("Shifts");
      doc.fillColor(BRAND.ink).font("Helvetica");
      w.shifts.forEach((s) => doc.text(`  • ${s.name} (${s.kind}): ${s.start}–${s.end}`));
      if (!w.shifts.length) doc.text("  • none configured");
      doc.moveDown(0.2);

      doc.fillColor(BRAND.sage).font("Helvetica-Bold").text("Penalties");
      doc.fillColor(BRAND.ink).font("Helvetica");
      w.penalties.forEach((p) => doc.text(`  • ${p.reason}: ${fmtKes(p.amount)}`));
      if (!w.penalties.length) doc.text("  • none configured");
      doc.moveDown(0.8);
    });

    drawFooter(doc);
  });
}

// ── Violation / appeal outcome (spec §5) ──────────────────────────────────────
export interface OutcomeData {
  employeeName: string;
  workplaceName?: string;
  reason: string;
  amount: number;
  status: string;
  outcome: string;
  createdAt: string;
  appealMessage?: string | null;
  decidedAt?: string | null;
}

export function violationOutcomePdf(d: OutcomeData): Promise<Buffer> {
  return renderToBuffer((doc) => {
    drawHeader(doc, "Violation Outcome", `${d.employeeName}${d.workplaceName ? " · " + d.workplaceName : ""}`);
    const row = (label: string, value: string, color = BRAND.ink) => {
      doc.fillColor(BRAND.muted).fontSize(9).font("Helvetica").text(label);
      doc.fillColor(color).fontSize(12).font("Helvetica-Bold").text(value);
      doc.moveDown(0.5);
    };
    row("Reason", d.reason);
    row("Deduction", fmtKes(d.amount), BRAND.red);
    row("Status", d.status.toUpperCase());
    row("Outcome", d.outcome, d.outcome.toLowerCase().includes("waiv") ? BRAND.sage : BRAND.ink);
    row("Logged", new Date(d.createdAt).toLocaleString("en-KE"));
    if (d.appealMessage) {
      doc.moveDown(0.4);
      doc.fillColor(BRAND.sage).fontSize(10).font("Helvetica-Bold").text("Appeal");
      doc.fillColor(BRAND.ink).fontSize(10).font("Helvetica").text(d.appealMessage);
    }
    drawFooter(doc);
  });
}

// ── Payslip (spec §6) ─────────────────────────────────────────────────────────
export interface PayslipData {
  employeeName: string;
  cycleLabel: string;
  gross: number;
  deductions: { reason: string; amount: number }[];
  net: number;
}

export function payslipPdf(d: PayslipData): Promise<Buffer> {
  return renderToBuffer((doc) => {
    drawHeader(doc, "Payslip", `${d.employeeName} · ${d.cycleLabel}`);
    doc.fillColor(BRAND.muted).fontSize(9).font("Helvetica").text("Gross pay");
    doc.fillColor(BRAND.ink).fontSize(14).font("Helvetica-Bold").text(fmtKes(d.gross));
    doc.moveDown(0.6);

    doc.fillColor(BRAND.sage).fontSize(11).font("Helvetica-Bold").text("Deductions");
    doc.fontSize(10).font("Helvetica");
    let total = 0;
    d.deductions.forEach((ded) => {
      total += ded.amount;
      doc.fillColor(BRAND.ink).text(ded.reason, { continued: true });
      doc.fillColor(BRAND.red).text(`   -${fmtKes(ded.amount)}`, { align: "right" });
    });
    if (!d.deductions.length) doc.fillColor(BRAND.muted).text("None");
    doc.moveDown(0.4);
    doc
      .strokeColor(BRAND.mist)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(0.4);
    doc.fillColor(BRAND.muted).fontSize(9).font("Helvetica").text("Net pay");
    doc.fillColor(BRAND.copper).fontSize(16).font("Helvetica-Bold").text(fmtKes(d.net));
    drawFooter(doc);
  });
}
