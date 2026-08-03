"use client";

/**
 * Payroll — human-gated review, approval, and payment preparation. Kaunta
 * calculates and prepares; it never moves money. The owner reviews every figure
 * (each traceable to its source), resolves flags, overrides with a logged reason,
 * approves with a PIN (which locks the run immutably), then exports a payment list
 * (CSV) to pay manually and tracks Paid/Not-yet/Failed by hand.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Wallet, ShieldCheck, AlertTriangle, Lock, FileDown, X, ChevronRight } from "lucide-react";

const fmtKes = (n: number) => `KES ${Number(n ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
const cardCls = "rounded-[12px] border border-kaunta-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.08)]";
const inputCls = "w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-ultra";
const labelCls = "block text-xs font-medium text-kaunta-slate mb-1";

interface Cycle {
  id: string; label: string; start_date: string; end_date: string; pay_date: string;
  status: string; locked: boolean; flagged_count: number; total_net: number | null;
  employee_count: number | null; approved_at: string | null; auto: boolean;
}
interface Flag { code: string; message: string; resolved: boolean; blocking?: boolean; resolution_note?: string }
interface Breakdown {
  pay_type?: string; days_present?: number; expected_days?: number; absent_days?: number; present_dates?: string[];
  missing_dates?: string[]; hours_worked?: number; gross_basis?: string; gross?: number;
  deductions?: { source?: string; label: string; amount: number; violation_id?: string }[];
  additions?: { label: string; amount: number; adjustment_id?: string }[];
  manual_deductions?: { label: string; amount: number; adjustment_id?: string }[];
  absence_suggestion?: number | null;
  override_net?: number | null; override_adjustment_id?: string | null; net_computed?: number; workplace_name?: string;
}
interface Line {
  id: string; employee_name: string | null; phone: string | null; workplace_name: string;
  gross: number; net: number; override_net: number | null; held: boolean;
  payment_status: "not_yet" | "paid" | "failed"; payment_ref: string | null; pdf_url: string | null;
  breakdown: Breakdown; flags: Flag[]; has_unresolved_flag: boolean;
}

export default function PayrollPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [openLine, setOpenLine] = useState<Line | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ label: "", start_date: "", end_date: "", pay_date: "" });
  const [showApprove, setShowApprove] = useState(false);
  const [pin, setPin] = useState("");
  const [action, setAction] = useState<null | { kind: string; code?: string }>(null);
  const [actAmount, setActAmount] = useState("");
  const [actNote, setActNote] = useState("");

  const loadCycles = useCallback(async (t: string) => {
    const { cycles } = await api<{ cycles: Cycle[] }>("/api/payroll/cycles", { token: t });
    setCycles(cycles);
    return cycles;
  }, []);

  const loadLines = useCallback(async (t: string, id: string) => {
    const r = await api<{ cycle: Cycle; payslips: Line[] }>(`/api/payroll/cycles/${id}/payslips`, { token: t });
    setCycle(r.cycle);
    setLines(r.payslips);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.replace("/login");
      const t = session.access_token;
      setToken(t);
      try {
        const cs = await loadCycles(t);
        if (cs.length) { setSelId(cs[0].id); await loadLines(t, cs[0].id); }
        else setShowCreate(true);
      } catch (e) { setError((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, [supabase, router, loadCycles, loadLines]);

  async function select(id: string) {
    if (!token) return;
    setSelId(id); setError(null); setOpenLine(null);
    try { await loadLines(token, id); } catch (e) { setError((e as Error).message); }
  }

  async function refresh() {
    if (!token || !selId) return;
    await loadCycles(token);
    await loadLines(token, selId);
    // keep the open drawer in sync
    setOpenLine((prev) => (prev ? lines.find((l) => l.id === prev.id) ?? prev : prev));
  }

  async function createCycle(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true); setError(null);
    try {
      await api("/api/payroll/cycles", { method: "POST", token, body: form });
      setForm({ label: "", start_date: "", end_date: "", pay_date: "" });
      setShowCreate(false);
      const cs = await loadCycles(token);
      if (cs.length) await select(cs[0].id);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function run() {
    if (!token || !selId) return;
    setBusy(true); setError(null);
    try { await api(`/api/payroll/cycles/${selId}/run`, { method: "POST", token }); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function submitAction() {
    if (!token || !selId || !openLine || !action) return;
    if (!actNote.trim()) return setError("A note is required.");
    setBusy(true); setError(null);
    try {
      const base = `/api/payroll/cycles/${selId}/lines/${openLine.id}`;
      if (action.kind === "override") await api(`${base}/override`, { method: "POST", token, body: { net: Number(actAmount) || 0, note: actNote.trim() } });
      else if (action.kind === "bonus") await api(`${base}/bonus`, { method: "POST", token, body: { amount: Number(actAmount) || 0, note: actNote.trim() } });
      else if (action.kind === "deduction") await api(`${base}/deduction`, { method: "POST", token, body: { amount: Number(actAmount) || 0, note: actNote.trim() } });
      else if (action.kind === "hold") await api(`${base}/hold`, { method: "POST", token, body: { held: !openLine.held, note: actNote.trim() } });
      else if (action.kind === "resolve") await api(`${base}/resolve-flag`, { method: "POST", token, body: { code: action.code, note: actNote.trim() } });
      setAction(null); setActAmount(""); setActNote("");
      await loadLines(token, selId);
      await loadCycles(token);
      setOpenLine((prev) => (prev ? null : prev)); // close drawer to force fresh reopen
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function approve() {
    if (!token || !selId) return;
    setBusy(true); setError(null);
    try {
      await api(`/api/payroll/cycles/${selId}/approve`, { method: "POST", token, body: { pin } });
      setShowApprove(false); setPin("");
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function removeAdjustment(line: Line, adjId: string) {
    if (!token || !selId) return;
    setBusy(true); setError(null);
    try {
      await api(`/api/payroll/cycles/${selId}/lines/${line.id}/adjustments/${adjId}`, { method: "DELETE", token });
      await loadLines(token, selId);
      await loadCycles(token);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function setPaymentStatus(line: Line, status: string) {
    if (!token || !selId) return;
    try {
      await api(`/api/payroll/cycles/${selId}/lines/${line.id}/payment-status`, { method: "PATCH", token, body: { status } });
      await loadLines(token, selId);
    } catch (e) { setError((e as Error).message); }
  }

  async function downloadCsv() {
    if (!token || !selId) return;
    try {
      const res = await fetch(`/gateway/api/payroll/cycles/${selId}/payment-list.csv`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError("Could not export. Approve the run first."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `payment-list-${cycle?.label ?? "run"}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { setError("Export failed."); }
  }

  const groups = useMemo(() => {
    const m = new Map<string, { name: string; lines: Line[]; subtotal: number }>();
    for (const l of lines) {
      const g = m.get(l.workplace_name) ?? { name: l.workplace_name, lines: [], subtotal: 0 };
      g.lines.push(l);
      if (!l.held) g.subtotal += l.net;
      m.set(l.workplace_name, g);
    }
    return [...m.values()];
  }, [lines]);

  if (loading) return <main className="bg-kaunta-stone grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-kaunta-ultra" /></main>;

  const locked = !!cycle?.locked;
  const flaggedCount = cycle?.flagged_count ?? 0;
  const canApprove = cycle && !locked && cycle.status !== "open" && flaggedCount === 0;

  return (
    <main className="bg-kaunta-stone min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display text-3xl text-kaunta-ink">Payroll</h1>
          <Button variant="outline" onClick={() => setShowCreate((s) => !s)}><Plus className="h-4 w-4 mr-1" /> New run</Button>
        </div>
        <p className="text-sm text-kaunta-slate/60 mb-4">Calculated from attendance + rules. Nothing is paid — you approve, then pay manually.</p>

        {error && <div className="mb-4 rounded-lg border border-kaunta-red/30 bg-kaunta-red/5 px-4 py-3 text-sm text-kaunta-red">{error}</div>}

        {showCreate && (
          <form onSubmit={createCycle} className={`${cardCls} p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3`}>
            <div className="sm:col-span-2"><label className={labelCls}>Label</label><input className={inputCls} placeholder="e.g. August 2026" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
            <div><label className={labelCls}>Start</label><input type="date" className={inputCls} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><label className={labelCls}>End</label><input type="date" className={inputCls} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            <div><label className={labelCls}>Pay date</label><input type="date" className={inputCls} value={form.pay_date} onChange={(e) => setForm({ ...form, pay_date: e.target.value })} /></div>
            <div className="flex items-end"><Button type="submit" className="w-full" disabled={busy || !form.label || !form.start_date || !form.end_date || !form.pay_date}>Create run</Button></div>
          </form>
        )}

        {/* Run chips */}
        {cycles.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
            {cycles.map((c) => (
              <button key={c.id} onClick={() => select(c.id)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm border ${selId === c.id ? "border-kaunta-ultra bg-white text-kaunta-ink" : "border-kaunta-mist bg-white/60 text-kaunta-slate/70"}`}>
                {c.label}{c.locked && <Lock className="inline h-3 w-3 ml-1 text-kaunta-sage" />}
              </button>
            ))}
          </div>
        )}

        {!cycle ? (
          <div className={`${cardCls} p-10 text-center`}><Wallet className="h-8 w-8 text-kaunta-slate/30 mx-auto mb-3" /><p className="text-kaunta-slate/70">Create a run to begin.</p></div>
        ) : (
          <>
            {/* Status banner */}
            {locked ? (
              <div className="mb-4 rounded-lg border border-kaunta-sage/30 bg-kaunta-sage/10 px-4 py-3 text-sm text-kaunta-sage inline-flex items-center gap-2 w-full">
                <ShieldCheck className="h-4 w-4" /> Approved &amp; locked{cycle.approved_at ? ` on ${new Date(cycle.approved_at).toLocaleDateString("en-KE")}` : ""} — figures are final.
              </div>
            ) : flaggedCount > 0 ? (
              <div className="mb-4 rounded-lg border border-kaunta-red/30 bg-kaunta-red/5 px-4 py-3 text-sm text-kaunta-red inline-flex items-center gap-2 w-full">
                <AlertTriangle className="h-4 w-4" /> {flaggedCount} item(s) need attention before you can approve.
              </div>
            ) : cycle.status === "open" ? (
              <div className="mb-4 rounded-lg border border-kaunta-mist bg-white px-4 py-3 text-sm text-kaunta-slate/70">Not run yet — press “Calculate draft”.</div>
            ) : (
              <div className="mb-4 rounded-lg border border-kaunta-amber/30 bg-kaunta-amber/10 px-4 py-3 text-sm text-kaunta-amber">Draft ready — review each person, then approve.</div>
            )}

            {/* Totals + actions */}
            <div className={`${cardCls} p-4 mb-4`}>
              <div className="flex flex-wrap items-center gap-4">
                <div><p className={labelCls}>Total to pay</p><p className="font-display text-2xl text-kaunta-ultra tabular-nums">{fmtKes(cycle.total_net ?? 0)}</p></div>
                <div><p className={labelCls}>Staff</p><p className="text-kaunta-ink text-lg">{cycle.employee_count ?? 0}</p></div>
                <div className="ml-auto flex flex-wrap gap-2">
                  {!locked && <Button variant={cycle.status === "open" ? "default" : "outline"} onClick={run} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : cycle.status === "open" ? "Calculate draft" : "Recalculate"}</Button>}
                  {!locked && <Button onClick={() => setShowApprove(true)} disabled={!canApprove}>Approve…</Button>}
                  {locked && <Button onClick={downloadCsv}><FileDown className="h-4 w-4 mr-1" /> Export CSV</Button>}
                </div>
              </div>
            </div>

            {/* Lines grouped by site */}
            {lines.length === 0 ? (
              <div className={`${cardCls} p-8 text-center text-sm text-kaunta-slate/50`}>No lines yet — calculate the draft.</div>
            ) : (
              groups.map((g) => (
                <div key={g.name} className={`${cardCls} overflow-hidden mb-4`}>
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-kaunta-mist bg-kaunta-stone/50">
                    <span className="font-medium text-kaunta-ink text-sm">{g.name}</span>
                    <span className="text-sm tabular-nums text-kaunta-slate">{fmtKes(g.subtotal)}</span>
                  </div>
                  <div className="divide-y divide-kaunta-mist/60">
                    {g.lines.map((l) => {
                      // "Needs attention" (red) is only for unresolved BLOCKING flags —
                      // informational flags (absence, flagged scans) get a subtle grey hint.
                      const blocking = (l.flags ?? []).some((f) => !f.resolved && f.blocking !== false);
                      const info = !blocking && (l.flags ?? []).some((f) => !f.resolved);
                      return (
                      <button key={l.id} onClick={() => setOpenLine(l)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left min-h-[52px] active:bg-kaunta-stone/40">
                        <div className="min-w-0">
                          <p className="text-sm text-kaunta-ink truncate">{l.employee_name}{l.held && <span className="ml-1 text-xs text-kaunta-amber">(held)</span>}</p>
                          <p className="text-xs text-kaunta-slate/60">
                            {l.breakdown.days_present ?? 0}/{l.breakdown.expected_days ?? 0} days
                            {blocking && <span className="text-kaunta-red"> · needs attention</span>}
                            {info && !locked && <span className="text-kaunta-slate/50"> · review</span>}
                            {locked && <span className={l.payment_status === "paid" ? "text-kaunta-sage" : l.payment_status === "failed" ? "text-kaunta-red" : "text-kaunta-slate/50"}> · {l.payment_status === "not_yet" ? "not paid" : l.payment_status}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {blocking && <AlertTriangle className="h-4 w-4 text-kaunta-red" />}
                          <span className="text-sm font-medium tabular-nums text-kaunta-ink">{fmtKes(l.net)}</span>
                          <ChevronRight className="h-4 w-4 text-kaunta-slate/40" />
                        </div>
                      </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* Breakdown drawer */}
      {openLine && (
        <LineDrawer
          line={lines.find((l) => l.id === openLine.id) ?? openLine}
          locked={locked}
          onClose={() => setOpenLine(null)}
          onAction={(kind, code) => { setAction({ kind, code }); setActAmount(""); setActNote(""); }}
          onStatus={setPaymentStatus}
          onRemove={removeAdjustment}
        />
      )}

      {/* Action modal (note required) */}
      {action && openLine && (
        <Modal onClose={() => setAction(null)} title={
          action.kind === "override" ? "Override net pay"
          : action.kind === "bonus" ? "Add a bonus"
          : action.kind === "deduction" ? "Add a deduction"
          : action.kind === "hold" ? (openLine.held ? "Release hold" : "Hold this payment")
          : "Resolve flag"
        }>
          {(action.kind === "override" || action.kind === "bonus" || action.kind === "deduction") && (
            <div className="mb-3">
              <label className={labelCls}>{action.kind === "override" ? "New net pay (KES)" : "Amount (KES)"}</label>
              <input type="number" min={0} className={inputCls} value={actAmount} onChange={(e) => setActAmount(e.target.value)} autoFocus />
            </div>
          )}
          <div className="mb-3">
            <label className={labelCls}>Reason (required)</label>
            <textarea rows={2} className={inputCls} value={actNote} onChange={(e) => setActNote(e.target.value)} placeholder="Why?" />
          </div>
          <div className="flex gap-2">
            <Button onClick={submitAction} disabled={busy || !actNote.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {/* Approve modal (total + count → PIN) */}
      {showApprove && cycle && (
        <Modal onClose={() => setShowApprove(false)} title="Approve payroll">
          <p className="text-sm text-kaunta-slate/70 mb-3">You&rsquo;re about to lock this run. Figures become final and cannot be edited.</p>
          <div className="rounded-lg bg-kaunta-stone p-3 mb-3 text-sm">
            <div className="flex justify-between"><span className="text-kaunta-slate/60">Total to pay</span><span className="font-medium text-kaunta-ink">{fmtKes(cycle.total_net ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-kaunta-slate/60">Employees</span><span className="font-medium text-kaunta-ink">{cycle.employee_count ?? 0}</span></div>
          </div>
          <label className={labelCls}>Enter your payroll PIN</label>
          <input type="password" inputMode="numeric" className={`${inputCls} mb-3`} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus />
          <div className="flex gap-2">
            <Button onClick={approve} disabled={busy || pin.length < 4}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve & lock"}</Button>
            <Button variant="outline" onClick={() => setShowApprove(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
    </main>
  );
}

// ── Bottom-sheet breakdown for one employee ──────────────────────────────────
function LineDrawer({ line, locked, onClose, onAction, onStatus, onRemove }: {
  line: Line; locked: boolean; onClose: () => void;
  onAction: (kind: string, code?: string) => void;
  onStatus: (line: Line, status: string) => void;
  onRemove: (line: Line, adjId: string) => void;
}) {
  const b = line.breakdown ?? {};
  const all = b.deductions ?? [];
  const penalties = all.filter((d) => d.source !== "absence");
  const absence = all.filter((d) => d.source === "absence");
  const bonuses = b.additions ?? [];
  const manual = b.manual_deductions ?? [];
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className={`${cardCls} w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-b-none sm:rounded-b-[12px]`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-kaunta-mist sticky top-0 bg-white">
          <div><p className="font-display text-lg text-kaunta-ink">{line.employee_name}</p><p className="text-xs text-kaunta-slate/60">{line.workplace_name}</p></div>
          <button onClick={onClose} className="p-1 text-kaunta-slate/50"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4 space-y-4 text-sm">
          {/* Flags — red if they block approval, amber if informational */}
          {line.flags?.filter((f) => !f.resolved).map((f) => {
            const blocks = f.blocking !== false;
            return (
              <div key={f.code} className={`rounded-lg border px-3 py-2 ${blocks ? "border-kaunta-red/30 bg-kaunta-red/5" : "border-kaunta-amber/30 bg-kaunta-amber/10"}`}>
                <p className={`font-medium flex items-center gap-1 ${blocks ? "text-kaunta-red" : "text-kaunta-amber"}`}>
                  <AlertTriangle className="h-4 w-4" /> {blocks ? "Needs attention" : "For your info"}
                </p>
                <p className="text-kaunta-slate/80 mt-0.5">{f.message}</p>
                {/* Blocking flags (can't compute a number) can be acknowledged with a note. */}
                {!locked && blocks && (
                  <button onClick={() => onAction("resolve", f.code)} className="mt-1 text-xs text-kaunta-ultra hover:underline">Mark resolved (with a note)</button>
                )}
              </div>
            );
          })}

          {/* Days present — every day cited */}
          <div>
            <p className={labelCls}>Days present</p>
            <p className="text-kaunta-ink">{b.days_present ?? 0} of {b.expected_days ?? 0} expected</p>
            {(b.present_dates?.length ?? 0) > 0 && <p className="text-xs text-kaunta-slate/60 mt-0.5">Present: {b.present_dates!.join(", ")}</p>}
            {(b.missing_dates?.length ?? 0) > 0 && <p className="text-xs text-kaunta-red mt-0.5">Missing: {b.missing_dates!.join(", ")}</p>}
          </div>

          {/* Gross */}
          <div className="flex justify-between"><span className="text-kaunta-slate/60">Gross · {b.gross_basis}</span><span className="text-kaunta-ink tabular-nums">{fmtKes(b.gross ?? 0)}</span></div>

          {/* Penalties */}
          {penalties.length > 0 && (
            <div>
              <p className={labelCls}>Penalties (from rules)</p>
              {penalties.map((d, i) => <div key={i} className="flex justify-between text-kaunta-slate/80"><span>{d.label}</span><span className="text-kaunta-red tabular-nums">−{fmtKes(d.amount)}</span></div>)}
            </div>
          )}
          {/* Absence (pro-rated) */}
          {absence.map((d, i) => <div key={`a${i}`} className="flex justify-between"><span className="text-kaunta-slate/80">{d.label}</span><span className="text-kaunta-red tabular-nums">−{fmtKes(d.amount)}</span></div>)}
          {/* Owner adjustments — each removable while unlocked */}
          {bonuses.map((d, i) => (
            <div key={`b${i}`} className="flex items-center justify-between gap-2">
              <span className="text-kaunta-slate/80">Bonus · {d.label}</span>
              <span className="flex items-center gap-2">
                <span className="text-kaunta-sage tabular-nums">+{fmtKes(d.amount)}</span>
                {!locked && d.adjustment_id && <button onClick={() => onRemove(line, d.adjustment_id!)} aria-label="Remove" className="text-kaunta-slate/40 hover:text-kaunta-red"><X className="h-3.5 w-3.5" /></button>}
              </span>
            </div>
          ))}
          {manual.map((d, i) => (
            <div key={`m${i}`} className="flex items-center justify-between gap-2">
              <span className="text-kaunta-slate/80">Deduction · {d.label}</span>
              <span className="flex items-center gap-2">
                <span className="text-kaunta-red tabular-nums">−{fmtKes(d.amount)}</span>
                {!locked && d.adjustment_id && <button onClick={() => onRemove(line, d.adjustment_id!)} aria-label="Remove" className="text-kaunta-slate/40 hover:text-kaunta-red"><X className="h-3.5 w-3.5" /></button>}
              </span>
            </div>
          ))}
          {b.override_net != null && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-kaunta-amber">Net overridden</span>
              <span className="flex items-center gap-2">
                <span className="text-kaunta-amber tabular-nums">{fmtKes(b.override_net)}</span>
                {!locked && b.override_adjustment_id && <button onClick={() => onRemove(line, b.override_adjustment_id!)} aria-label="Remove override" className="text-kaunta-slate/40 hover:text-kaunta-red"><X className="h-3.5 w-3.5" /></button>}
              </span>
            </div>
          )}

          {/* Net */}
          <div className="flex justify-between border-t border-kaunta-mist pt-2"><span className="font-medium text-kaunta-ink">Net pay</span><span className="font-display text-lg text-kaunta-ultra tabular-nums">{fmtKes(line.net)}</span></div>

          {/* Actions */}
          {!locked ? (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" onClick={() => onAction("override")}>Override net</Button>
              <Button variant="outline" onClick={() => onAction("bonus")}>Add bonus</Button>
              <Button variant="outline" onClick={() => onAction("deduction")}>Add deduction</Button>
              <Button variant="outline" onClick={() => onAction("hold")}>{line.held ? "Release hold" : "Hold payment"}</Button>
            </div>
          ) : (
            <div className="pt-1 space-y-2">
              {line.payment_ref && <p className="text-xs text-kaunta-slate/60">Payment ref: <span className="text-kaunta-ink">{line.payment_ref}</span></p>}
              <p className={labelCls}>Payment status</p>
              <div className="grid grid-cols-3 gap-2">
                {(["paid", "not_yet", "failed"] as const).map((s) => (
                  <Button key={s} variant={line.payment_status === s ? "default" : "outline"} onClick={() => onStatus(line, s)}>
                    {s === "not_yet" ? "Not yet" : s === "paid" ? "Paid" : "Failed"}
                  </Button>
                ))}
              </div>
              {line.pdf_url && <a href={line.pdf_url} target="_blank" rel="noreferrer" className="inline-block text-sm text-kaunta-ultra hover:underline pt-1">Download payslip PDF</a>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className={`${cardCls} w-full sm:max-w-sm p-4 rounded-b-none sm:rounded-[12px]`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="font-display text-lg text-kaunta-ink">{title}</h2><button onClick={onClose} className="p-1 text-kaunta-slate/50"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}
