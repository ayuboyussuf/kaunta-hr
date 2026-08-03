"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";

/**
 * Patterns across the record.
 *
 * Every line here is computed from rows and carries the counts it was derived
 * from — the evidence chips are not decoration, they are the finding. If a
 * number looks wrong you can go and check it, which is the whole point.
 */

type Severity = "info" | "watch" | "act";

interface Finding {
  kind: string;
  severity: Severity;
  employeeId: string;
  employeeName: string;
  headline: string;
  detail: string;
  evidence: Record<string, string | number>;
  sourceIds: string[];
}

const SEVERITY: Record<Severity, { dot: string; label: string; text: string }> = {
  act: { dot: "bg-kaunta-red", label: "Worth acting on", text: "text-kaunta-red" },
  watch: { dot: "bg-kaunta-amber", label: "Worth watching", text: "text-kaunta-amber" },
  info: { dot: "bg-kaunta-sage", label: "Good news", text: "text-kaunta-sage" },
};

const prettyKey = (k: string) => k.replace(/_/g, " ");

export function InsightsPanel({ token }: { token: string }) {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<{ findings: Finding[]; window_days: number }>("/api/insights?days=14", { token })
      .then((r) => setFindings(r.findings ?? []))
      .catch((e) => setError((e as Error).message));
  }, [token]);

  if (error) return null;
  if (findings === null) return null;
  if (findings.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="font-display text-lg text-kaunta-ink">Patterns</h2>
        <p className="mt-2 text-sm text-kaunta-slate/70">
          Nothing standing out across the last two weeks. Single incidents are
          handled by the rules and appear under Penalties.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-kaunta-ink">Patterns</h2>
        <span className="text-xs text-kaunta-slate/50">last 14 days</span>
      </div>
      <p className="mt-1 text-xs text-kaunta-slate/60">
        Counted from the record, not guessed. Every figure below is shown so you
        can check it.
      </p>

      <ul className="mt-4 divide-y divide-kaunta-mist">
        {findings.map((f, i) => {
          const s = SEVERITY[f.severity];
          return (
            <li key={`${f.kind}-${f.employeeId}-${i}`} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-kaunta-ink">{f.headline}</p>
                  <p className="mt-1 text-sm leading-relaxed text-kaunta-slate/70">
                    {f.detail}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {Object.entries(f.evidence).map(([k, v]) => (
                      <span
                        key={k}
                        className="rounded-full bg-kaunta-stone px-2 py-0.5 font-mono text-[0.625rem] text-kaunta-slate/70"
                      >
                        {prettyKey(k)}: {String(v)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default InsightsPanel;
