"use client";

/**
 * Payroll. Create a pay cycle, "Run" to compute a DRAFT (payslips + deductions,
 * grouped by workplace, nothing sent yet), review the per-workplace payout, then
 * "Release" to text employees their payslips. Auto-run cycles (from the cron)
 * land here as drafts for the owner to review.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, FileDown, Plus, Wallet, Send } from "lucide-react";

interface Cycle {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  pay_date: string;
  status: string;
  summary_pdf_url: string | null;
  released_at: string | null;
  auto: boolean;
}
interface Payslip {
  id: string;
  employee_id: string;
  employee_name: string | null;
  workplace_name: string;
  gross: number;
  deductions: { reason: string; amount: number }[];
  net: number;
  pdf_url: string | null;
  sent_at: string | null;
}

const fmtKes = (n: number) => `KES ${Number(n ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

const cardCls = "rounded-[12px] border border-kaunta-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.08)]";
const inputCls =
  "w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper";
const labelCls = "block text-xs font-medium text-kaunta-slate mb-1";

const CYCLE_STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Not run", cls: "bg-kaunta-mist text-kaunta-slate" },
  processing: { label: "Running…", cls: "bg-kaunta-copper/15 text-kaunta-copper" },
  draft: { label: "Draft — review", cls: "bg-kaunta-amber/15 text-kaunta-amber" },
  paid: { label: "Released", cls: "bg-kaunta-sage/15 text-kaunta-sage" },
};

export default function PayrollPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [running, setRunning] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [payDate, setPayDate] = useState("");
  const [creating, setCreating] = useState(false);

  const loadCycles = useCallback(async (bearer: string) => {
    const { cycles } = await api<{ cycles: Cycle[] }>("/api/payroll/cycles", { token: bearer });
    setCycles(cycles);
    return cycles;
  }, []);

  const loadPayslips = useCallback(async (bearer: string, cycleId: string) => {
    const { payslips } = await api<{ payslips: Payslip[] }>(`/api/payroll/cycles/${cycleId}/payslips`, {
      token: bearer,
    });
    setPayslips(payslips);
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return router.replace("/login");
      const bearer = session.access_token;
      setToken(bearer);
      try {
        const cs = await loadCycles(bearer);
        if (cs.length) {
          setSelected(cs[0].id);
          await loadPayslips(bearer, cs[0].id);
        } else {
          setShowForm(true);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, router, loadCycles, loadPayslips]);

  async function selectCycle(id: string) {
    if (!token) return;
    setSelected(id);
    setError(null);
    try {
      await loadPayslips(token, id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createCycle(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCreating(true);
    setError(null);
    try {
      await api("/api/payroll/cycles", {
        method: "POST",
        token,
        body: { label, start_date: startDate, end_date: endDate, pay_date: payDate },
      });
      setLabel("");
      setStartDate("");
      setEndDate("");
      setPayDate("");
      setShowForm(false);
      const cs = await loadCycles(token);
      if (cs.length) await selectCycle(cs[0].id);
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function runPayroll() {
    if (!token || !selected) return;
    setRunning(true);
    setError(null);
    try {
      await api(`/api/payroll/cycles/${selected}/run`, { method: "POST", token });
      await loadCycles(token);
      await loadPayslips(token, selected);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function releasePayroll() {
    if (!token || !selected) return;
    if (!confirm("Send each employee their payslip by SMS? Do this once you've reviewed the amounts.")) return;
    setReleasing(true);
    setError(null);
    try {
      await api(`/api/payroll/cycles/${selected}/release`, { method: "POST", token });
      await loadCycles(token);
      await loadPayslips(token, selected);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReleasing(false);
    }
  }

  const selectedCycle = cycles.find((c) => c.id === selected) ?? null;

  // Group payslips by workplace for the payout view.
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; slips: Payslip[]; subtotal: number }>();
    for (const p of payslips) {
      const g = m.get(p.workplace_name) ?? { name: p.workplace_name, slips: [], subtotal: 0 };
      g.slips.push(p);
      g.subtotal += p.net;
      m.set(p.workplace_name, g);
    }
    return [...m.values()];
  }, [payslips]);
  const grandTotal = payslips.reduce((s, p) => s + p.net, 0);

  if (loading) {
    return (
      <main className="bg-kaunta-stone grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-kaunta-copper" />
      </main>
    );
  }

  return (
    <main className="bg-kaunta-stone">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display text-3xl text-kaunta-ink">Payroll</h1>
          <Button variant="outline" onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4 mr-1" /> New cycle
          </Button>
        </div>
        <p className="text-sm text-kaunta-slate/60 mb-6">
          Run a cycle to draft everyone&rsquo;s pay, review the payout by workplace, then release payslips.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-kaunta-red/30 bg-kaunta-red/5 px-4 py-3 text-sm text-kaunta-red">
            {error}
          </div>
        )}

        {showForm && (
          <div className={`${cardCls} p-5 mb-6`}>
            <h2 className="font-display text-lg text-kaunta-ink mb-3">New pay cycle</h2>
            <form onSubmit={createCycle} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Label</label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. August 2026" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Start date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>End date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Pay date</label>
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputCls} />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={creating || !label || !startDate || !endDate || !payDate}>
                  {creating ? "Creating…" : "Create cycle"}
                </Button>
              </div>
            </form>
          </div>
        )}

        {cycles.length === 0 ? (
          <div className={`${cardCls} p-10 text-center`}>
            <Wallet className="h-8 w-8 text-kaunta-slate/30 mx-auto mb-3" />
            <p className="text-kaunta-slate/70">No pay cycles yet.</p>
            <p className="text-sm text-kaunta-slate/50 mt-1">Create one above to run payroll.</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            {/* Cycle list */}
            <div className="space-y-2">
              {cycles.map((c) => {
                const st = CYCLE_STATUS[c.status] ?? CYCLE_STATUS.open;
                return (
                  <button
                    key={c.id}
                    onClick={() => selectCycle(c.id)}
                    className={`w-full text-left rounded-[12px] border px-4 py-3 transition-colors ${
                      selected === c.id
                        ? "border-kaunta-copper bg-white shadow-[0_2px_16px_rgba(15,25,35,0.08)]"
                        : "border-kaunta-mist bg-white/60 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-kaunta-ink">{c.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="text-xs text-kaunta-slate/60 mt-1">
                      {c.start_date} → {c.end_date}
                      {c.auto && <span className="ml-1 text-kaunta-copper">· auto</span>}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Selected cycle detail */}
            <div className="space-y-4">
              {selectedCycle && (
                <>
                  <div className={`${cardCls} p-5`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-display text-xl text-kaunta-ink">{selectedCycle.label}</h2>
                        <p className="text-sm text-kaunta-slate/60">
                          {selectedCycle.start_date} → {selectedCycle.end_date} · pay {selectedCycle.pay_date}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={runPayroll} disabled={running} variant={selectedCycle.status === "open" ? "default" : "outline"}>
                          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : selectedCycle.status === "open" ? "Run payroll" : "Re-run"}
                        </Button>
                        {(selectedCycle.status === "draft" || selectedCycle.status === "paid") && (
                          <Button onClick={releasePayroll} disabled={releasing}>
                            {releasing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                            {selectedCycle.status === "paid" ? "Re-send payslips" : "Release payslips"}
                          </Button>
                        )}
                      </div>
                    </div>

                    {payslips.length > 0 && (
                      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-kaunta-mist pt-3">
                        <div>
                          <p className={labelCls}>Total payout</p>
                          <p className="font-display text-2xl text-kaunta-copper tabular-nums">{fmtKes(grandTotal)}</p>
                        </div>
                        <div>
                          <p className={labelCls}>Staff</p>
                          <p className="text-kaunta-ink">{payslips.length}</p>
                        </div>
                        {selectedCycle.summary_pdf_url && (
                          <a
                            href={selectedCycle.summary_pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto inline-flex items-center gap-1 text-sm text-kaunta-copper hover:underline"
                          >
                            <FileDown className="h-4 w-4" /> Payout summary PDF
                          </a>
                        )}
                      </div>
                    )}
                    {selectedCycle.status === "draft" && (
                      <p className="mt-3 text-xs text-kaunta-amber">
                        Draft — payslips have NOT been sent. Review the amounts below, then Release.
                      </p>
                    )}
                  </div>

                  {payslips.length === 0 ? (
                    <div className={`${cardCls} p-8 text-center text-sm text-kaunta-slate/50`}>
                      No payslips yet. Press “Run payroll” to compute them.
                    </div>
                  ) : (
                    groups.map((g) => (
                      <div key={g.name} className={`${cardCls} overflow-hidden`}>
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-kaunta-mist bg-kaunta-stone/50">
                          <span className="font-medium text-kaunta-ink text-sm">{g.name}</span>
                          <span className="text-sm tabular-nums text-kaunta-slate">{fmtKes(g.subtotal)}</span>
                        </div>
                        <div className="divide-y divide-kaunta-mist/60">
                          {g.slips.map((p) => {
                            const ded = p.deductions.reduce((s, d) => s + d.amount, 0);
                            return (
                              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                <div className="min-w-0">
                                  <p className="text-sm text-kaunta-ink truncate">{p.employee_name}</p>
                                  <p className="text-xs text-kaunta-slate/60">
                                    Gross {fmtKes(p.gross)}
                                    {ded > 0 && <span className="text-kaunta-red"> · −{fmtKes(ded)}</span>}
                                    {p.sent_at && <span className="text-kaunta-sage"> · sent</span>}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="text-sm font-medium tabular-nums text-kaunta-ink">{fmtKes(p.net)}</span>
                                  {p.pdf_url && (
                                    <a href={p.pdf_url} target="_blank" rel="noreferrer" className="text-kaunta-copper hover:underline text-xs">
                                      PDF
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
