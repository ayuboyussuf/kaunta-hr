"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { api, getEmployeeToken } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatKES, formatDate } from "@/lib/utils";

interface Payslip {
  id: string;
  gross: number;
  net: number;
  deductions: { reason: string; amount: number }[];
  pdf_url: string | null;
  sent_at: string | null;
  created_at: string;
  pay_cycle: {
    label: string;
    start_date: string;
    end_date: string;
    pay_date: string;
  } | null;
}

export default function PayslipsPage() {
  const [payslips, setPayslips] = useState<Payslip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getEmployeeToken();
    if (!token) return;
    api<{ payslips: Payslip[] }>("/api/employees/me/payslips", { token })
      .then((r) => setPayslips(r.payslips))
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-kaunta-ink mb-1">Payslips</h1>
        <p className="text-kaunta-slate/70 text-sm">Your pay history, newest first.</p>
      </div>

      {error && <p className="text-sm text-kaunta-red">{error}</p>}
      {!payslips && !error && <p className="text-sm text-kaunta-slate/60">Loading…</p>}

      {payslips && payslips.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-kaunta-slate/60">
            No payslips yet.
          </CardContent>
        </Card>
      )}

      {payslips && payslips.length > 0 && (
        <div className="space-y-3">
          {payslips.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-kaunta-ink">
                    {p.pay_cycle?.label ?? "Pay cycle"}
                  </p>
                  <p className="text-xs text-kaunta-slate/60 mt-0.5">
                    {p.pay_cycle
                      ? `${formatDate(p.pay_cycle.start_date)} – ${formatDate(p.pay_cycle.end_date)} · paid ${formatDate(p.pay_cycle.pay_date)}`
                      : formatDate(p.created_at)}
                  </p>
                  <p className="text-sm text-kaunta-ink mt-2 tabular-nums">
                    Net {formatKES(p.net)}
                    <span className="text-kaunta-slate/50">
                      {" "}
                      (gross {formatKES(p.gross)}
                      {p.deductions?.length ? `, ${p.deductions.length} deduction${p.deductions.length === 1 ? "" : "s"}` : ""})
                    </span>
                  </p>
                </div>
                {p.pdf_url ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={p.pdf_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs text-kaunta-slate/50 shrink-0">Not ready</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
