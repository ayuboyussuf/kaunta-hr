"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getEmployeeToken } from "@/lib/api";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface MyViolation {
  id: string;
  reason: string;
  evidence: string | null;
  amount: number;
  status: string;
  workplace_name: string | null;
  appeal_window_end: string;
  can_appeal: boolean;
  outcome: string | null;
  pdf_url: string | null;
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

function windowLeft(end: string): string {
  const ms = new Date(end).getTime() - Date.now();
  if (ms <= 0) return "closed";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

const STATUS_STYLE: Record<string, string> = {
  open: "bg-kaunta-amber/15 text-kaunta-amber",
  appealed: "bg-kaunta-copper/15 text-kaunta-copper",
  locked: "bg-kaunta-ink/10 text-kaunta-ink",
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
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-display text-2xl text-kaunta-ink">My penalties</span>
          <button
            onClick={() => router.push("/me")}
            className="text-sm text-kaunta-copper hover:underline"
          >
            Back
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {error && (
          <div className="rounded-lg border border-kaunta-red/30 bg-kaunta-red/5 px-4 py-3 text-sm text-kaunta-red">
            {error}
          </div>
        )}

        {violations.length === 0 ? (
          <Card className="p-8 text-center text-sm text-kaunta-slate/60">
            You have no penalties. Keep it up.
          </Card>
        ) : (
          violations.map((v) => (
            <Card key={v.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-kaunta-ink">{v.reason}</p>
                  {v.workplace_name && (
                    <p className="text-xs text-kaunta-slate/60">{v.workplace_name}</p>
                  )}
                  <p className="text-lg text-kaunta-red tabular-nums mt-1">{fmtKes(v.amount)}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    STATUS_STYLE[v.status] ?? "bg-kaunta-mist text-kaunta-slate"
                  }`}
                >
                  {v.status}
                </span>
              </div>

              {v.evidence && (
                <p className="text-sm text-kaunta-slate/80 mt-3 whitespace-pre-line">{v.evidence}</p>
              )}
              <p className="text-xs text-kaunta-slate/50 mt-2">Logged {fmtDate(v.created_at)}</p>

              {/* Appeal state */}
              {v.appeal ? (
                <div className="mt-3 rounded-lg bg-kaunta-stone px-3 py-2">
                  <p className="text-xs font-medium text-kaunta-slate">
                    Appeal · {v.appeal.decision}
                  </p>
                  <p className="text-sm text-kaunta-slate/80 mt-0.5 italic">“{v.appeal.message}”</p>
                  {v.outcome && v.status === "locked" && (
                    <p className="text-xs text-kaunta-ink mt-1">Outcome: {v.outcome}</p>
                  )}
                </div>
              ) : v.can_appeal ? (
                appealFor === v.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      placeholder="Explain why this penalty should be waived…"
                      className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={submitting || !message.trim()}
                        onClick={() => submitAppeal(v.id)}
                      >
                        {submitting ? "Submitting…" : "Submit appeal"}
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
                  <div className="mt-3 flex items-center gap-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAppealFor(v.id);
                        setMessage("");
                      }}
                    >
                      Appeal
                    </Button>
                    <span className="text-xs text-kaunta-amber">
                      {windowLeft(v.appeal_window_end)}
                    </span>
                  </div>
                )
              ) : (
                v.status !== "locked" && (
                  <p className="text-xs text-kaunta-slate/50 mt-3">Appeal window closed.</p>
                )
              )}

              {v.pdf_url && (
                <a
                  href={v.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm text-kaunta-copper hover:underline mt-3"
                >
                  Download outcome PDF
                </a>
              )}
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
