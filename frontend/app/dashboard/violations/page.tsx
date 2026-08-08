"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppealBrief, type Assist, type InfoRequest } from "@/components/AppealBrief";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Employee {
  id: string;
  name: string;
}
interface PenaltyRule {
  id: string;
  reason: string;
  amount: number;
  appeal_window_hours: number;
}
type Stage = "open" | "appealed" | "closed_no_appeal" | "settled";

interface Violation {
  id: string;
  employee_id: string;
  employee_name: string | null;
  reason: string;
  amount: number;
  status: string;
  /** Derived from the deadline server-side, not from whether the sweep ran. */
  stage: Stage;
  stage_label: string;
  appeal_window_end: string;
  outcome: string | null;
  has_document: boolean;
  notified_at: string | null;
  notify_error: string | null;
  acknowledged_at: string | null;
  created_at: string;
  appeal: { decision: string; message: string; submitted_at: string } | null;
}
interface PendingAppeal {
  id: string;
  message: string;
  submitted_at: string;
  assist: Assist | null;
  info_requests: InfoRequest[];
  violation: {
    id: string;
    reason: string;
    amount: number;
    employee_name: string | null;
  } | null;
}

const fmtKes = (n: number) =>
  `KES ${Number(n ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
const fmtDate = (s: string) => new Date(s).toLocaleString("en-KE");

const STAGE_STYLE: Record<Stage, string> = {
  open: "bg-kaunta-amber/15 text-kaunta-amber",
  appealed: "bg-kaunta-ultra/15 text-kaunta-ultra",
  closed_no_appeal: "bg-kaunta-slate/10 text-kaunta-slate",
  settled: "bg-kaunta-ink/10 text-kaunta-ink",
};

export default function OwnerViolationsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rules, setRules] = useState<PenaltyRule[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [appeals, setAppeals] = useState<PendingAppeal[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [employeeId, setEmployeeId] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [freeReason, setFreeReason] = useState("");
  const [freeAmount, setFreeAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [deciding, setDeciding] = useState<string | null>(null);

  const loadData = useCallback(
    async (bearer: string, filter: string) => {
      const qs = filter ? `?status=${encodeURIComponent(filter)}` : "";
      const [v, a] = await Promise.all([
        api<{ violations: Violation[] }>(`/api/violations${qs}`, { token: bearer }),
        api<{ appeals: PendingAppeal[] }>(`/api/appeals`, { token: bearer }),
      ]);
      setViolations(v.violations);
      setAppeals(a.appeals);
    },
    []
  );

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
        const [{ data: emps }, { data: rls }] = await Promise.all([
          supabase.from("employees").select("id, name").order("name"),
          supabase.from("penalty_rules").select("id, reason, amount, appeal_window_hours").order("reason"),
        ]);
        setEmployees(emps ?? []);
        setRules(rls ?? []);
        await loadData(bearer, "");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, router, loadData]);

  async function refresh(filter = statusFilter) {
    if (!token) return;
    try {
      await loadData(token, filter);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function logViolation(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !employeeId) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { employee_id: employeeId };
      if (ruleId) {
        body.rule_id = ruleId;
      } else {
        body.reason = freeReason;
        body.amount = Number(freeAmount);
      }
      if (note.trim()) body.note = note.trim();
      await api("/api/violations", { method: "POST", token, body });
      setRuleId("");
      setFreeReason("");
      setFreeAmount("");
      setNote("");
      await refresh();
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(appealId: string, decision: "accept" | "reject") {
    if (!token) return;
    setDeciding(appealId);
    setError(null);
    try {
      await api(`/api/appeals/${appealId}/decide`, { method: "POST", token, body: { decision } });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeciding(null);
    }
  }

  /** Signed for five minutes, on demand — a stored link would expire. */
  async function openDocument(violationId: string) {
    if (!token) return;
    try {
      const { url } = await api<{ url: string }>(`/api/violations/${violationId}/document`, { token });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const usingRule = !!ruleId;

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
          <span className="font-display text-2xl text-kaunta-ink">Penalties &amp; Appeals</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="rounded-lg border border-kaunta-red/30 bg-kaunta-red/5 px-4 py-3 text-sm text-kaunta-red">
            {error}
          </div>
        )}

        {/* Log a violation */}
        <Card className="p-6">
          <h2 className="font-display text-xl text-kaunta-ink mb-4">Log a violation</h2>
          <form onSubmit={logViolation} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-kaunta-slate mb-1">Employee</label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-ultra"
              >
                <option value="">Select employee…</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-kaunta-slate mb-1">
                Penalty rule (optional)
              </label>
              <select
                value={ruleId}
                onChange={(e) => setRuleId(e.target.value)}
                className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-ultra"
              >
                <option value="">Free reason + amount…</option>
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reason} — {fmtKes(r.amount)} ({r.appeal_window_hours}h appeal)
                  </option>
                ))}
              </select>
            </div>

            {!usingRule && (
              <>
                <div>
                  <label className="block text-xs font-medium text-kaunta-slate mb-1">Reason</label>
                  <input
                    value={freeReason}
                    onChange={(e) => setFreeReason(e.target.value)}
                    placeholder="e.g. Late arrival"
                    className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-ultra"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-kaunta-slate mb-1">
                    Amount (KES)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={freeAmount}
                    onChange={(e) => setFreeAmount(e.target.value)}
                    className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-ultra tabular-nums"
                  />
                </div>
              </>
            )}

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-kaunta-slate mb-1">
                Evidence / note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-ultra"
              />
            </div>

            <div className="md:col-span-2">
              <Button
                type="submit"
                disabled={
                  submitting ||
                  !employeeId ||
                  (!usingRule && (!freeReason.trim() || freeAmount === ""))
                }
              >
                {submitting ? "Logging…" : "Log violation"}
              </Button>
            </div>
          </form>
        </Card>

        {/* Pending appeals */}
        <section>
          <h2 className="font-display text-xl text-kaunta-ink mb-3">
            Pending appeals{" "}
            <span className="text-sm text-kaunta-slate/60 tabular-nums">({appeals.length})</span>
          </h2>
          {appeals.length === 0 ? (
            <Card className="p-6 text-sm text-kaunta-slate/60">No appeals awaiting a decision.</Card>
          ) : (
            <div className="space-y-3">
              {appeals.map((a) => (
                <Card key={a.id} className="p-5">
                  {/* Their own words first. If the brief below read the claim
                      wrongly, this is the thing that corrects it. */}
                  <div className="min-w-0">
                    <p className="font-medium text-kaunta-ink">
                      {a.violation?.employee_name ?? "Employee"} ·{" "}
                      <span className="text-kaunta-slate">{a.violation?.reason}</span>
                    </p>
                    <p className="text-sm text-kaunta-red tabular-nums mt-0.5">
                      {fmtKes(a.violation?.amount ?? 0)}
                    </p>
                    <p className="text-sm text-kaunta-slate/80 mt-2 italic">“{a.message}”</p>
                    <p className="text-xs text-kaunta-slate/50 mt-1">
                      Appealed {fmtDate(a.submitted_at)}
                    </p>
                  </div>

                  <AppealBrief assist={a.assist} infoRequests={a.info_requests ?? []} />

                  <div className="mt-4 flex flex-col gap-2 border-t border-kaunta-mist pt-4 sm:flex-row">
                    <Button
                      variant="secondary"
                      disabled={deciding === a.id}
                      onClick={() => decide(a.id, "accept")}
                      className="sm:flex-1"
                    >
                      Accept (waive)
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={deciding === a.id}
                      onClick={() => decide(a.id, "reject")}
                      className="sm:flex-1"
                    >
                      Reject (uphold)
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* All violations */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-xl text-kaunta-ink">Violations</h2>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                refresh(e.target.value);
              }}
              className="rounded-lg border border-kaunta-mist bg-white px-3 py-1.5 text-sm outline-none focus:border-kaunta-ultra"
            >
              <option value="">All statuses</option>
              <option value="open">Window open / elapsed</option>
              <option value="appealed">Appealed</option>
              <option value="locked">Closed</option>
            </select>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-kaunta-mist text-left text-xs text-kaunta-slate/60">
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 py-3 font-medium">Stage</th>
                    <th className="px-4 py-3 font-medium">Told?</th>
                    <th className="px-4 py-3 font-medium">Logged</th>
                    <th className="px-4 py-3 font-medium">Document</th>
                  </tr>
                </thead>
                <tbody>
                  {violations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-kaunta-slate/50">
                        No violations.
                      </td>
                    </tr>
                  ) : (
                    violations.map((v) => (
                      <tr key={v.id} className="border-b border-kaunta-mist/60 last:border-0">
                        <td className="px-4 py-3 text-kaunta-ink">{v.employee_name}</td>
                        <td className="px-4 py-3 text-kaunta-slate">{v.reason}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-kaunta-ink">
                          {fmtKes(v.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              STAGE_STYLE[v.stage] ?? "bg-kaunta-mist text-kaunta-slate"
                            }`}
                          >
                            {v.stage_label}
                          </span>
                        </td>
                        {/* Whether the employee actually heard. A deduction
                            nobody received is the one you will be argued with
                            about, so it belongs in the table, not a log. */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {v.acknowledged_at ? (
                            <span className="text-kaunta-sage">Opened it</span>
                          ) : v.notified_at ? (
                            <span className="text-kaunta-slate/70">Texted</span>
                          ) : (
                            <span className="text-kaunta-red" title={v.notify_error ?? undefined}>
                              Not delivered
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-kaunta-slate/70 whitespace-nowrap">
                          {fmtDate(v.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          {v.has_document ? (
                            <button
                              type="button"
                              onClick={() => openDocument(v.id)}
                              className="text-kaunta-ultra hover:underline"
                            >
                              Open
                            </button>
                          ) : v.stage === "closed_no_appeal" ? (
                            <span className="text-kaunta-slate/50">Closing — due shortly</span>
                          ) : v.stage === "open" ? (
                            <span className="text-kaunta-slate/50">After the window</span>
                          ) : (
                            <span className="text-kaunta-slate/40">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
