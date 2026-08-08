"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getEmployeeToken } from "@/lib/api";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppealQuestion } from "@/components/AppealQuestion";

type Stage = "open" | "appealed" | "closed_no_appeal" | "settled";

interface MyViolation {
  id: string;
  reason: string;
  evidence: string | null;
  amount: number;
  status: string;
  /** Derived from the deadline server-side — never from whether a job has run. */
  stage: Stage;
  stage_label: string;
  ms_left: number | null;
  workplace_name: string | null;
  appeal_window_end: string;
  can_appeal: boolean;
  outcome: string | null;
  has_document: boolean;
  notified_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  appeal: {
    message: string;
    decision: string;
    submitted_at: string;
    decided_at: string | null;
  } | null;
}

const fmtKes = (n: number) =>
  `KES ${Number(n ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
const fmtDate = (s: string) => new Date(s).toLocaleString("en-KE");

function windowLeft(ms: number | null): string {
  if (ms == null || ms <= 0) return "closed";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left to appeal` : `${m}m left to appeal`;
}

/* Keyed on the derived stage, not on the database status — a row still sitting
 * at "open" whose window shut a fortnight ago must not look actionable. */
const STAGE_STYLE: Record<Stage, string> = {
  open: "bg-aproksi-amber/15 text-aproksi-amber",
  appealed: "bg-aproksi-ultra/15 text-aproksi-ultra",
  closed_no_appeal: "bg-aproksi-slate/10 text-aproksi-slate",
  settled: "bg-aproksi-ink/10 text-aproksi-ink",
};

export default function MyViolationsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [violations, setViolations] = useState<MyViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [appealFor, setAppealFor] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (bearer: string) => {
    const { violations } = await api<{ violations: MyViolation[] }>("/api/violations/mine", {
      token: bearer,
    });
    setViolations(violations);
  }, []);

  useEffect(() => {
    const t = getEmployeeToken();
    if (!t) {
      router.replace("/me/login");
      return;
    }
    setToken(t);
    (async () => {
      try {
        await load(t);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, load]);

  async function submitAppeal(violationId: string) {
    if (!token || !message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api("/api/appeals", {
        method: "POST",
        token,
        body: { violation_id: violationId, message: message.trim() },
      });
      setAppealFor(null);
      setMessage("");
      await load(token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Record that they have seen it. Optimistic — the button vanishing is the
   * feedback, and a failed write leaves the penalty exactly as it was.
   */
  async function acknowledge(violationId: string) {
    if (!token) return;
    const at = new Date().toISOString();
    setViolations((vs) =>
      vs.map((v) => (v.id === violationId ? { ...v, acknowledged_at: at } : v))
    );
    try {
      await api(`/api/violations/${violationId}/acknowledge`, { method: "POST", token });
    } catch {
      await load(token).catch(() => {});
    }
  }

  /** Signed for five minutes, on demand — stored links expire. */
  async function openDocument(violationId: string) {
    if (!token) return;
    try {
      const { url } = await api<{ url: string }>(`/api/violations/${violationId}/document`, {
        token,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-aproksi-stone grid place-items-center">
        <p className="text-aproksi-slate/60">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-aproksi-stone">
      <header className="border-b border-aproksi-mist bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-display text-2xl text-aproksi-ink">My penalties</span>
          <button
            onClick={() => router.push("/me")}
            className="text-sm text-aproksi-ultra hover:underline"
          >
            Back
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {/* Anything Aproksi needs from them about an appeal already filed. Sits
            at the top because it is the only thing on this page waiting on
            them; it renders nothing when there is nothing outstanding. */}
        <AppealQuestion />

        {error && (
          <div className="rounded-lg border border-aproksi-red/30 bg-aproksi-red/5 px-4 py-3 text-sm text-aproksi-red">
            {error}
          </div>
        )}

        {violations.length === 0 ? (
          <Card className="p-8 text-center text-sm text-aproksi-slate/60">
            You have no penalties. Keep it up.
          </Card>
        ) : (
          violations.map((v) => (
            <Card key={v.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-aproksi-ink">{v.reason}</p>
                  {v.workplace_name && (
                    <p className="text-xs text-aproksi-slate/60">{v.workplace_name}</p>
                  )}
                  <p className="text-lg text-aproksi-red tabular-nums mt-1">{fmtKes(v.amount)}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    STAGE_STYLE[v.stage] ?? "bg-aproksi-mist text-aproksi-slate"
                  }`}
                >
                  {v.stage_label}
                </span>
              </div>

              {v.evidence && (
                <p className="text-sm text-aproksi-slate/80 mt-3 whitespace-pre-line">{v.evidence}</p>
              )}
              <p className="text-xs text-aproksi-slate/50 mt-2">
                Logged {fmtDate(v.created_at)}
                {v.notified_at
                  ? ` · you were texted ${fmtDate(v.notified_at)}`
                  : " · we could not reach your phone about this"}
              </p>

              {/* ── What happens next, spelled out for every state ── */}
              {v.appeal ? (
                <div className="mt-3 rounded-lg bg-aproksi-stone px-3 py-2">
                  <p className="text-xs font-medium text-aproksi-slate">
                    {v.appeal.decision === "pending"
                      ? "You appealed. Your employer has not decided yet."
                      : v.appeal.decision === "accepted"
                        ? "You appealed and it was waived."
                        : "You appealed and the penalty was upheld."}
                  </p>
                  <p className="text-sm text-aproksi-slate/80 mt-0.5 italic">“{v.appeal.message}”</p>
                  {v.outcome && <p className="text-xs text-aproksi-ink mt-1">Outcome: {v.outcome}</p>}
                </div>
              ) : v.can_appeal ? (
                appealFor === v.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      placeholder="Say what happened, in your own words…"
                      className="w-full rounded-lg border border-aproksi-mist bg-white px-3 py-2 text-sm outline-none focus:border-aproksi-ultra"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={submitting || !message.trim()}
                        onClick={() => submitAppeal(v.id)}
                      >
                        {submitting ? "Sending…" : "Send appeal"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAppealFor(null);
                          setMessage("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAppealFor(v.id);
                        setMessage("");
                      }}
                    >
                      Appeal this
                    </Button>
                    <span className="text-xs text-aproksi-amber">{windowLeft(v.ms_left)}</span>
                  </div>
                )
              ) : (
                /* The state that used to be a blank card. It stands, it says
                   why, and it says what could still be done about it. */
                <div className="mt-3 rounded-lg bg-aproksi-stone px-3 py-2">
                  <p className="text-sm text-aproksi-ink">
                    {v.stage === "closed_no_appeal"
                      ? "The time to appeal has passed, so this penalty stands."
                      : "This is closed and cannot be changed here."}
                  </p>
                  <p className="mt-0.5 text-xs text-aproksi-slate/70">
                    {v.stage === "closed_no_appeal"
                      ? `Appeals closed ${fmtDate(v.appeal_window_end)}. If you think it is wrong, speak to your employer — they can still waive it.`
                      : "It will appear on your payslip as recorded."}
                  </p>
                </div>
              )}

              {/* Acknowledgement. Not a confession and not an appeal — it is the
                  employee putting on the record that they saw this, which is the
                  one thing that makes "nobody told me" answerable either way. */}
              {!v.acknowledged_at ? (
                <button
                  type="button"
                  onClick={() => acknowledge(v.id)}
                  className="mt-3 inline-flex min-h-[40px] items-center rounded-lg border border-aproksi-mist bg-white px-4 text-sm text-aproksi-slate hover:border-aproksi-ultra/40"
                >
                  I&apos;ve seen this
                </button>
              ) : (
                <p className="mt-3 text-xs text-aproksi-sage">
                  You confirmed you saw this on {fmtDate(v.acknowledged_at)}.
                </p>
              )}

              {v.has_document && (
                <button
                  type="button"
                  onClick={() => openDocument(v.id)}
                  className="mt-3 block text-sm text-aproksi-ultra hover:underline"
                >
                  Open the outcome document
                </button>
              )}
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
