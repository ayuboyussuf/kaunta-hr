"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Cycle {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  pay_date: string;
  status: string;
}
interface Payslip {
  id: string;
  employee_id: string;
  employee_name: string | null;
  cycle_id: string | null;
  cycle_label: string | null;
  gross: number;
  deductions: { reason: string; amount: number }[];
  net: number;
  pdf_url: string | null;
  sent_at: string | null;
}

const fmtKes = (n: number) =>
  `KES ${Number(n ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

const CYCLE_STATUS: Record<string, string> = {
  open: "bg-kaunta-amber/15 text-kaunta-amber",
  processing: "bg-kaunta-copper/15 text-kaunta-copper",
  paid: "bg-kaunta-sage/15 text-kaunta-sage",
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

  // Create-cycle form
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
    const { payslips } = await api<{ payslips: Payslip[] }>(
      `/api/payroll/cycles/${cycleId}/payslips`,
      { token: bearer }
    );
    setPayslips(payslips);
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const bearer = session.access_token;
      setToken(bearer);
      try {
        const cs = await loadCycles(bearer);
        if (cs.length) {
          setSelected(cs[0].id);
          await loadPayslips(bearer, cs[0].id);
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

  const selectedCycle = cycles.find((c) => c.id === selected) ?? null;

  if (loading) {
    return (
      <main className="min-h-screen bg-kaunta-stone grid place-items-center">
        <p className="text-kaunta-slate/60">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-kaunta-stone">
      <header className="border-b border-kaunta-mist bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <span className="font-display text-2xl text-kaunta-ink">Payroll</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 grid gap-8 lg:grid-cols-[320px_1fr]">
        {error && (
          <div className="lg:col-span-2 rounded-lg border border-kaunta-red/30 bg-kaunta-red/5 px-4 py-3 text-sm text-kaunta-red">
            {error}
          </div>
        )}

        {/* Left: create + list cycles */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-display text-lg text-kaunta-ink mb-4">New pay cycle</h2>
            <form onSubmit={createCycle} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-kaunta-slate mb-1">Label</label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. July 2026"
                  className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-kaunta-slate mb-1">Start date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-kaunta-slate mb-1">End date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-kaunta-slate mb-1">Pay date</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={creating || !label || !startDate || !endDate || !payDate}
              >
                {creating ? "Creating…" : "Create cycle"}
              </Button>
            </form>
          </Card>

          <div className="space-y-2">
            <h2 className="font-display text-lg text-kaunta-ink px-1">Cycles</h2>
            {cycles.length === 0 ? (
              <p className="text-sm text-kaunta-slate/60 px-1">No cycles yet.</p>
            ) : (
              cycles.map((c) => (
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        CYCLE_STATUS[c.status] ?? "bg-kaunta-mist text-kaunta-slate"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-kaunta-slate/60 mt-1">
                    {c.start_date} → {c.end_date} · pay {c.pay_date}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: run + payslips */}
        <div className="space-y-4">
          {selectedCycle ? (
            <>
              <Card className="p-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl text-kaunta-ink">{selectedCycle.label}</h2>
                  <p className="text-sm text-kaunta-slate/60">
                    {selectedCycle.start_date} → {selectedCycle.end_date} · pay date{" "}
                    {selectedCycle.pay_date}
                  </p>
                </div>
                <Button onClick={runPayroll} disabled={running}>
                  {running
                    ? "Running…"
                    : selectedCycle.status === "paid"
                    ? "Re-run payroll"
                    : "Run payroll"}
                </Button>
              </Card>

              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-kaunta-mist text-left text-xs text-kaunta-slate/60">
                        <th className="px-4 py-3 font-medium">Employee</th>
                        <th className="px-4 py-3 font-medium text-right">Gross</th>
                        <th className="px-4 py-3 font-medium text-right">Deductions</th>
                        <th className="px-4 py-3 font-medium text-right">Net</th>
                        <th className="px-4 py-3 font-medium">Sent</th>
                        <th className="px-4 py-3 font-medium">PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslips.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-kaunta-slate/50">
                            No payslips yet. Run payroll to generate them.
                          </td>
                        </tr>
                      ) : (
                        payslips.map((p) => {
                          const dedTotal = p.deductions.reduce((s, d) => s + d.amount, 0);
                          return (
                            <tr key={p.id} className="border-b border-kaunta-mist/60 last:border-0">
                              <td className="px-4 py-3 text-kaunta-ink">{p.employee_name}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-kaunta-slate">
                                {fmtKes(p.gross)}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-kaunta-red">
                                {dedTotal > 0 ? `-${fmtKes(dedTotal)}` : "—"}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums font-medium text-kaunta-ink">
                                {fmtKes(p.net)}
                              </td>
                              <td className="px-4 py-3">
                                {p.sent_at ? (
                                  <span className="text-kaunta-sage text-xs">Sent</span>
                                ) : (
                                  <span className="text-kaunta-slate/40 text-xs">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {p.pdf_url ? (
                                  <a
                                    href={p.pdf_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-kaunta-copper hover:underline"
                                  >
                                    Download
                                  </a>
                                ) : (
                                  <span className="text-kaunta-slate/40">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : (
            <Card className="p-8 text-sm text-kaunta-slate/60">
              Create a pay cycle to run payroll.
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
