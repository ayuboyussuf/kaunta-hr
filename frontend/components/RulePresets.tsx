"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * The preset menu.
 *
 * A first-time owner should be choosing a policy, not inventing one on an
 * empty screen. Applying a preset writes ordinary penalty rules — afterwards
 * there is nothing special about them, and every one can be edited or deleted
 * like any other.
 */

interface PresetRule {
  code: string;
  reason: string;
  amount: number;
  appeal_window_hours: number;
  calc?: Record<string, number>;
  automatic: boolean;
  note: string;
}

interface Preset {
  key: string;
  name: string;
  blurb: string;
  suits: string;
  rules: PresetRule[];
}

const fmtKes = (n: number) =>
  `KES ${Number(n ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

function ruleSummary(r: PresetRule) {
  if (r.calc?.per_minute) {
    const cap = r.calc.max ? `, up to ${fmtKes(r.calc.max)}` : "";
    return `${fmtKes(r.calc.per_minute)} a minute${cap}`;
  }
  return r.amount > 0 ? fmtKes(r.amount) : "recorded, no deduction";
}

export function RulePresets({
  token,
  rulesetId,
  rulesetName,
  hasRules,
  onApplied,
}: {
  token: string;
  rulesetId: string;
  rulesetName: string;
  hasRules: boolean;
  onApplied: () => void;
}) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || presets.length) return;
    api<{ presets: Preset[] }>("/api/rules/presets", { token })
      .then((r) => setPresets(r.presets ?? []))
      .catch((e) => setError((e as Error).message));
  }, [open, presets.length, token]);

  async function apply(key: string, replace: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/rules/rulesets/${rulesetId}/apply-preset`, {
        method: "POST",
        token,
        body: { preset: key, replace },
      });
      setOpen(false);
      setChosen(null);
      onApplied();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[40px] items-center rounded-lg border border-dashed border-aproksi-mist px-3.5 text-sm text-aproksi-slate transition-colors hover:border-aproksi-ultra/50 hover:text-aproksi-ink"
      >
        Start from a preset
      </button>
    );
  }

  const selected = presets.find((p) => p.key === chosen) ?? null;

  return (
    <div className="rounded-xl border border-aproksi-mist bg-aproksi-stone/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-aproksi-ink">
            Presets for &ldquo;{rulesetName}&rdquo;
          </p>
          <p className="mt-1 text-xs text-aproksi-slate/70">
            These write normal rules you can edit afterwards. Nothing is applied
            until you choose.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setChosen(null);
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-aproksi-slate hover:bg-white"
          aria-label="Close presets"
        >
          ✕
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-aproksi-red">{error}</p>}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setChosen(p.key === chosen ? null : p.key)}
            className={[
              "rounded-lg border p-3 text-left transition-colors",
              chosen === p.key
                ? "border-aproksi-ultra bg-white"
                : "border-aproksi-mist bg-white/70 hover:border-aproksi-ultra/40",
            ].join(" ")}
          >
            <p className="text-sm font-medium text-aproksi-ink">{p.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-aproksi-slate/70">
              {p.blurb}
            </p>
            <p className="mt-2 text-[0.6875rem] uppercase tracking-wider text-aproksi-slate/50">
              {p.suits}
            </p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="mt-4 rounded-lg border border-aproksi-mist bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-aproksi-slate/50">
            What this adds
          </p>
          <ul className="mt-3 space-y-2.5">
            {selected.rules.map((r) => (
              <li key={r.code} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm text-aproksi-ink">{r.reason}</span>
                <span className="text-sm text-aproksi-slate">
                  — {ruleSummary(r)}
                </span>
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-[0.625rem] font-medium",
                    r.automatic
                      ? "bg-aproksi-ultra/10 text-aproksi-ultra"
                      : "bg-aproksi-stone text-aproksi-slate/70",
                  ].join(" ")}
                >
                  {r.automatic ? "automatic" : "you raise it"}
                </span>
                <span className="w-full text-xs text-aproksi-slate/60">{r.note}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => apply(selected.key, false)}
              disabled={busy}
              className="sm:flex-1"
            >
              {busy ? "Applying…" : hasRules ? "Add these rules" : "Use this preset"}
            </Button>
            {hasRules && (
              <Button
                variant="outline"
                onClick={() => apply(selected.key, true)}
                disabled={busy}
              >
                Replace what is there
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RulePresets;
