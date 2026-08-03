"use client";

/**
 * Rules management. Add / edit / remove rulesets and their penalty rules
 * INCREMENTALLY — no need to re-run the setup wizard just to add a rule.
 * Uses the owner Supabase token against /api/rules.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Scale, Plus, Trash2, Loader2, Pencil } from "lucide-react";

interface Rule {
  id: string;
  code: string;
  reason: string;
  amount: number;
  appeal_window_hours: number;
}
interface Ruleset {
  id: string;
  name: string;
  is_shared: boolean;
  penalty_rules: Rule[];
}

const cardCls = "rounded-[12px] border border-kaunta-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.08)]";
const inputCls =
  "w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-ultra";
const labelCls = "block text-xs font-medium text-kaunta-slate mb-1";

interface RuleDraft {
  id?: string;
  rulesetId: string;
  code: string;
  reason: string;
  amount: number;
  appeal_window_hours: number;
}

export default function RulesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rulesets, setRulesets] = useState<Ruleset[]>([]);
  const [newRulesetName, setNewRulesetName] = useState("");
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const res = await api<{ rulesets: Ruleset[] }>("/api/rules", { token: t });
      setRulesets(res.rulesets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const t = data.session?.access_token ?? null;
      if (!t) return router.replace("/login");
      setToken(t);
      await load(t);
    })();
  }, [supabase, router, load]);

  async function addRuleset() {
    if (!token || !newRulesetName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api("/api/rules/rulesets", { method: "POST", token, body: { name: newRulesetName.trim() } });
      setNewRulesetName("");
      await load(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add ruleset");
    } finally {
      setSaving(false);
    }
  }

  async function removeRuleset(id: string) {
    if (!token) return;
    if (!confirm("Delete this ruleset and all its rules?")) return;
    try {
      await api(`/api/rules/rulesets/${id}`, { method: "DELETE", token });
      await load(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function saveRule() {
    if (!token || !ruleDraft) return;
    if (!ruleDraft.reason.trim()) return setError("A reason is required.");
    setSaving(true);
    setError(null);
    try {
      const body = {
        code: ruleDraft.code.trim() || "penalty",
        reason: ruleDraft.reason.trim(),
        amount: Number(ruleDraft.amount) || 0,
        appeal_window_hours: Number(ruleDraft.appeal_window_hours) || 0,
      };
      if (ruleDraft.id) {
        await api(`/api/rules/rules/${ruleDraft.id}`, { method: "PATCH", token, body });
      } else {
        await api(`/api/rules/rulesets/${ruleDraft.rulesetId}/rules`, { method: "POST", token, body });
      }
      setRuleDraft(null);
      await load(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeRule(id: string) {
    if (!token) return;
    if (!confirm("Delete this rule?")) return;
    try {
      await api(`/api/rules/rules/${id}`, { method: "DELETE", token });
      await load(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const blankRule = (rulesetId: string): RuleDraft => ({
    rulesetId,
    code: "late",
    reason: "",
    amount: 200,
    appeal_window_hours: 24,
  });

  return (
    <main className="min-h-screen bg-kaunta-stone">
      <header className="border-b border-kaunta-mist bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <span className="font-display text-2xl text-kaunta-ink">Rules</span>
            <Link href="/dashboard" className="text-sm text-kaunta-ultra hover:underline ml-3">
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="rounded-lg border border-kaunta-red/30 bg-kaunta-red/5 px-4 py-3 text-sm text-kaunta-red">
            {error}
          </div>
        )}

        <div className={`${cardCls} p-5`}>
          <label className={labelCls}>Add a ruleset</label>
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="e.g. Warehouse rules"
              value={newRulesetName}
              onChange={(e) => setNewRulesetName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRuleset()}
            />
            <Button onClick={addRuleset} disabled={saving || !newRulesetName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-kaunta-ultra" />
          </div>
        ) : rulesets.length === 0 ? (
          <div className={`${cardCls} p-10 text-center`}>
            <Scale className="h-8 w-8 text-kaunta-slate/30 mx-auto mb-3" />
            <p className="text-kaunta-slate/70">No rulesets yet.</p>
            <p className="text-sm text-kaunta-slate/50 mt-1">Add one above, then attach penalty rules to it.</p>
          </div>
        ) : (
          rulesets.map((rs) => (
            <div key={rs.id} className={`${cardCls} p-5`}>
              <div className="flex items-start justify-between">
                <h3 className="font-display text-xl text-kaunta-ink inline-flex items-center gap-2">
                  <Scale className="h-4 w-4 text-kaunta-ultra" /> {rs.name}
                  {rs.is_shared && <span className="text-xs text-kaunta-sage">(shared)</span>}
                </h3>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setRuleDraft(blankRule(rs.id))}>
                    <Plus className="h-4 w-4 mr-1" /> Rule
                  </Button>
                  <button
                    onClick={() => removeRuleset(rs.id)}
                    className="text-kaunta-red/60 hover:text-kaunta-red p-1"
                    aria-label="Delete ruleset"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 divide-y divide-kaunta-mist">
                {rs.penalty_rules.length === 0 && (
                  <p className="text-sm text-kaunta-slate/50 py-2">No rules yet — add one.</p>
                )}
                {rs.penalty_rules.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm text-kaunta-ink">{r.reason}</p>
                      <p className="text-xs text-kaunta-slate/60">
                        {r.code} · KES {Number(r.amount).toLocaleString()} · appeal window {r.appeal_window_hours}h
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          setRuleDraft({
                            id: r.id,
                            rulesetId: rs.id,
                            code: r.code,
                            reason: r.reason,
                            amount: Number(r.amount),
                            appeal_window_hours: r.appeal_window_hours,
                          })
                        }
                        className="text-kaunta-slate/60 hover:text-kaunta-ultra p-1"
                        aria-label="Edit rule"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removeRule(r.id)}
                        className="text-kaunta-red/60 hover:text-kaunta-red p-1"
                        aria-label="Delete rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Rule editor modal */}
      {ruleDraft && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4" onClick={() => setRuleDraft(null)}>
          <div className={`${cardCls} p-6 w-full max-w-md space-y-4`} onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl text-kaunta-ink">{ruleDraft.id ? "Edit rule" : "New rule"}</h2>
            <div>
              <label className={labelCls}>Reason (shown to the employee)</label>
              <input
                className={inputCls}
                value={ruleDraft.reason}
                onChange={(e) => setRuleDraft({ ...ruleDraft, reason: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Code</label>
                <input
                  className={inputCls}
                  value={ruleDraft.code}
                  onChange={(e) => setRuleDraft({ ...ruleDraft, code: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Amount (KES)</label>
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={ruleDraft.amount}
                  onChange={(e) => setRuleDraft({ ...ruleDraft, amount: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Appeal window (hours)</label>
              <input
                type="number"
                min={0}
                max={720}
                className={inputCls}
                value={ruleDraft.appeal_window_hours}
                onChange={(e) => setRuleDraft({ ...ruleDraft, appeal_window_hours: Number(e.target.value) })}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveRule} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setRuleDraft(null)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
