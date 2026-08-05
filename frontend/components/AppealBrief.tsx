"use client";

/**
 * What Kaunta found, shown above the two buttons.
 *
 * The design constraint is that this must inform without deciding. So there is
 * no verdict line, no score, no colour that reads as "waive this one" — the
 * stance chips say which way each finding points relative to what the employee
 * claimed, and the evidence counts are printed beside every one so the owner
 * can go and check any of them rather than take it on trust.
 *
 * The employee's own words stay above this, not below it. If the routing was
 * wrong, the sentence they actually wrote is the thing that corrects it.
 */

import { useState } from "react";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

type Stance = "supports" | "contradicts" | "neutral" | "unverifiable";

export interface AssistFinding {
  kind: string;
  stance: Stance;
  headline: string;
  detail: string;
  evidence: Record<string, string | number>;
  source: string;
}

export interface Assist {
  claim: "system_not_working" | "sick" | "road_closed" | "unclear";
  confidence: "high" | "low";
  status: "ready" | "awaiting_employee" | "failed";
  findings: AssistFinding[];
  summary: string | null;
  missing: string[];
}

export interface InfoRequest {
  id: string;
  ask_code: string;
  question: string;
  asked_at: string;
  answered_at: string | null;
  answer: string | null;
  declined: boolean;
  document_path: string | null;
}

const CLAIM_LABEL: Record<Assist["claim"], string> = {
  system_not_working: "Says Kaunta wouldn't let them clock in",
  sick: "Says they were unwell",
  road_closed: "Says the road was blocked",
  unclear: "Reason couldn't be matched to a check",
};

/* Relative to the employee's claim — never to an outcome. */
const STANCE: Record<Stance, { label: string; chip: string }> = {
  supports: { label: "Fits their account", chip: "bg-kaunta-sage/15 text-kaunta-sage" },
  contradicts: { label: "Doesn't fit", chip: "bg-kaunta-amber/15 text-kaunta-amber" },
  neutral: { label: "Context", chip: "bg-kaunta-stone text-kaunta-slate/70" },
  unverifiable: { label: "Can't be checked", chip: "bg-kaunta-slate/10 text-kaunta-slate/70" },
};

const prettyKey = (k: string) => k.replace(/_/g, " ");

export function AppealBrief({
  assist,
  infoRequests = [],
}: {
  assist: Assist | null;
  infoRequests?: InfoRequest[];
}) {
  if (!assist) return null;

  return (
    <div className="mt-4 rounded-xl border border-kaunta-mist bg-kaunta-stone/50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-kaunta-slate/60">
          What the record shows
        </p>
        <span className="text-xs text-kaunta-slate/50">
          {CLAIM_LABEL[assist.claim]}
          {assist.confidence === "low" && " · read their words above, this reading is uncertain"}
        </span>
      </div>

      {assist.summary && (
        <p className="mt-2 text-sm leading-relaxed text-kaunta-ink">{assist.summary}</p>
      )}

      <ul className="mt-3 space-y-3">
        {assist.findings.map((f, i) => {
          const s = STANCE[f.stance];
          return (
            <li key={`${f.kind}-${i}`} className="border-t border-kaunta-mist pt-3 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-start gap-2">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-medium ${s.chip}`}>
                  {s.label}
                </span>
                <p className="min-w-0 flex-1 text-sm font-medium text-kaunta-ink">{f.headline}</p>
              </div>
              {f.detail && (
                <p className="mt-1 text-sm leading-relaxed text-kaunta-slate/75">{f.detail}</p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {Object.entries(f.evidence).map(([k, v]) => (
                  <span
                    key={k}
                    className="rounded-full bg-white px-2 py-0.5 font-mono text-[0.625rem] text-kaunta-slate/70"
                  >
                    {prettyKey(k)}: {String(v)}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {infoRequests.length > 0 && (
        <div className="mt-4 border-t border-kaunta-mist pt-3">
          <p className="text-xs font-medium uppercase tracking-wider text-kaunta-slate/60">
            Asked of the employee
          </p>
          {infoRequests.map((r, i) => (
            <div key={r.id ?? i} className="mt-2 text-sm">
              <p className="text-kaunta-slate/75">{r.question}</p>
              <p className="mt-0.5 text-kaunta-ink">
                {r.declined
                  ? "They said they can't provide this."
                  : r.answer
                    ? `“${r.answer}”`
                    : r.document_path
                      ? "They attached a document."
                      : "No answer yet."}
              </p>
              {r.document_path && <DocumentLink requestId={r.id} />}
            </div>
          ))}
        </div>
      )}

      {assist.missing.length > 0 && (
        <div className="mt-4 border-t border-kaunta-mist pt-3">
          <p className="text-xs font-medium uppercase tracking-wider text-kaunta-slate/60">
            Not in the record
          </p>
          <ul className="mt-1.5 space-y-1">
            {assist.missing.map((m, i) => (
              <li key={i} className="text-sm text-kaunta-slate/70">
                · {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 border-t border-kaunta-mist pt-3 text-xs text-kaunta-slate/50">
        Kaunta gathered and counted this. It has not formed a view, and the
        decision below is entirely yours.
      </p>
    </div>
  );
}

/**
 * A medical note is fetched only when the owner asks for it, on a link that
 * expires in two minutes. Not rendered inline and not preloaded: this is
 * somebody's health information, and it should appear because a decision is
 * being made, not because a page loaded.
 */
function DocumentLink({ requestId }: { requestId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function open() {
    setState("loading");
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const { url } = await api<{ url: string }>(`/api/appeals/info/${requestId}/document`, {
        token: data.session?.access_token ?? "",
      });
      window.open(url, "_blank", "noopener,noreferrer");
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      className="mt-1 text-sm text-kaunta-ultra underline underline-offset-2 disabled:opacity-60"
      disabled={state === "loading"}
    >
      {state === "loading"
        ? "Opening…"
        : state === "error"
          ? "Couldn't open it — try again"
          : "Open the document"}
    </button>
  );
}

export default AppealBrief;
