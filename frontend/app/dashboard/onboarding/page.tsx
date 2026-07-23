"use client";

/**
 * Owner onboarding wizard (spec §1).
 * Multi-step: Business → Rules → Workplaces → Review. On finish it POSTs the whole
 * configuration to /api/owner/onboarding/complete and shows the PDF setup summary.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Building2,
  MapPin,
  Clock,
  Scale,
  Check,
  Plus,
  Trash2,
  Loader2,
  FileDown,
  LocateFixed,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type WorkplaceMode = "single" | "multiple";
type RulesMode = "shared" | "per_workplace";

interface Penalty {
  code: string;
  reason: string;
  amount: number;
  appeal_window_hours: number;
}
interface Ruleset {
  key: string;
  name: string;
  is_shared: boolean;
  deductionMode: "fixed" | "per_minute";
  perMinuteRate: number;
  penalties: Penalty[];
}
interface Shift {
  name: string;
  kind: "day" | "night" | "custom";
  start_time: string;
  end_time: string;
  days_of_week: number[];
  grace_minutes: number;
}
interface Workplace {
  name: string;
  lat: number | null;
  lng: number | null;
  geofence_radius_m: number;
  rulesetKey: string;
  shifts: Shift[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));

const newPenalty = (): Penalty => ({ code: "late", reason: "Late arrival", amount: 200, appeal_window_hours: 24 });
const newRuleset = (shared: boolean, name = "Default rules"): Ruleset => ({
  key: uid(),
  name,
  is_shared: shared,
  deductionMode: "fixed",
  perMinuteRate: 10,
  penalties: [newPenalty()],
});
const newShift = (): Shift => ({
  name: "Day shift",
  kind: "day",
  start_time: "08:00",
  end_time: "17:00",
  days_of_week: [1, 2, 3, 4, 5],
  grace_minutes: 5,
});
const newWorkplace = (rulesetKey: string): Workplace => ({
  name: "",
  lat: null,
  lng: null,
  geofence_radius_m: 100,
  rulesetKey,
  shifts: [newShift()],
});

// ── Small UI atoms ────────────────────────────────────────────────────────────
const cardCls = "rounded-[12px] border border-kaunta-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.08)]";
const inputCls =
  "w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper";
const labelCls = "block text-xs font-medium text-kaunta-slate mb-1";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

const STEPS = [
  { id: 0, label: "Business", icon: Building2 },
  { id: 1, label: "Rules", icon: Scale },
  { id: 2, label: "Workplaces", icon: MapPin },
  { id: 3, label: "Review", icon: Check },
];

export default function OnboardingWizard() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Wizard state
  const [name, setName] = useState("");
  const [workplaceMode, setWorkplaceMode] = useState<WorkplaceMode>("single");
  const [rulesMode, setRulesMode] = useState<RulesMode>("shared");
  const [rulesets, setRulesets] = useState<Ruleset[]>([newRuleset(true)]);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);

  // Auth gate + resume existing state
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const t = data.session?.access_token ?? null;
      if (!t) {
        router.replace("/login");
        return;
      }
      setToken(t);
      try {
        const state = await api<{
          org?: { name: string; workplace_mode: WorkplaceMode; rules_mode: RulesMode; onboarding_complete: boolean } | null;
        }>("/api/owner/onboarding", { token: t });
        if (state.org) {
          setName(state.org.name ?? "");
          setWorkplaceMode(state.org.workplace_mode);
          setRulesMode(state.org.rules_mode);
        }
      } catch {
        // No org yet — first run. That's fine.
      }
      setReady(true);
    })();
  }, [supabase, router]);

  // Keep at least one workplace once we enter the workplaces step.
  useEffect(() => {
    if (step === 2 && workplaces.length === 0) {
      setWorkplaces([newWorkplace(rulesets[0]?.key ?? "")]);
    }
  }, [step, workplaces.length, rulesets]);

  // When shared/single mode is chosen, collapse to a single shared ruleset.
  useEffect(() => {
    const shared = workplaceMode === "single" || rulesMode === "shared";
    if (shared) {
      setRulesets((rs) => {
        const first = rs[0] ?? newRuleset(true);
        return [{ ...first, is_shared: true }];
      });
    }
  }, [workplaceMode, rulesMode]);

  const sharedRules = workplaceMode === "single" || rulesMode === "shared";

  // ── Persistence helpers ─────────────────────────────────────────────────────
  async function bootstrap() {
    if (!token) return;
    await api("/api/owner/onboarding/bootstrap", {
      method: "POST",
      token,
      body: { name: name.trim(), workplace_mode: workplaceMode, rules_mode: rulesMode },
    });
  }

  async function next() {
    setError(null);
    if (step === 0) {
      if (!name.trim()) return setError("Business name is required.");
      setSaving(true);
      try {
        await bootstrap();
      } catch (e) {
        setSaving(false);
        return setError(e instanceof Error ? e.message : "Could not save.");
      }
      setSaving(false);
    }
    if (step === 1) {
      for (const rs of rulesets) {
        if (!rs.name.trim()) return setError("Every ruleset needs a name.");
      }
    }
    if (step === 2) {
      for (const w of workplaces) {
        if (!w.name.trim()) return setError("Every workplace needs a name.");
        if (!rulesets.some((r) => r.key === w.rulesetKey)) return setError("Assign a ruleset to each workplace.");
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function finish() {
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        workplace_mode: workplaceMode,
        rules_mode: sharedRules ? "shared" : rulesMode,
        rulesets: rulesets.map((r) => ({
          key: r.key,
          name: r.name.trim(),
          is_shared: r.is_shared,
          deduction_logic:
            r.deductionMode === "per_minute"
              ? { mode: "per_minute", rate: r.perMinuteRate }
              : { mode: "fixed" },
          penalties: r.penalties.map((p) => ({
            code: p.code.trim() || "penalty",
            reason: p.reason.trim() || "Penalty",
            amount: Number(p.amount) || 0,
            appeal_window_hours: Number(p.appeal_window_hours) || 0,
          })),
        })),
        workplaces: workplaces.map((w) => ({
          name: w.name.trim(),
          lat: w.lat,
          lng: w.lng,
          geofence_radius_m: Number(w.geofence_radius_m) || 100,
          rulesetKey: w.rulesetKey,
          shifts: w.shifts.map((s) => ({
            name: s.name.trim() || "Shift",
            kind: s.kind,
            start_time: s.start_time,
            end_time: s.end_time,
            days_of_week: s.days_of_week.length ? s.days_of_week : [1, 2, 3, 4, 5],
            grace_minutes: Number(s.grace_minutes) || 0,
          })),
        })),
      };
      const resp = await api<{ pdfUrl: string | null; pdfError?: string }>(
        "/api/owner/onboarding/complete",
        { method: "POST", token, body: payload }
      );
      setPdfUrl(resp.pdfUrl);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete setup.");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) {
    return (
      <main className="min-h-screen grid place-items-center bg-kaunta-stone">
        <Loader2 className="h-6 w-6 animate-spin text-kaunta-copper" />
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen bg-kaunta-stone grid place-items-center px-4">
        <div className={`${cardCls} max-w-md w-full p-8 text-center`}>
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-kaunta-sage-lt">
            <Check className="h-6 w-6 text-kaunta-sage" />
          </div>
          <h1 className="font-display text-3xl text-kaunta-ink mb-2">You&apos;re all set</h1>
          <p className="text-sm text-kaunta-slate/70 mb-6">
            {name} is configured. Download your setup summary below.
          </p>
          {pdfUrl ? (
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="block mb-3">
              <Button className="w-full">
                <FileDown className="h-4 w-4 mr-2" /> Download setup summary (PDF)
              </Button>
            </a>
          ) : (
            <p className="text-xs text-kaunta-amber mb-3">
              Setup saved, but the PDF could not be generated. You can regenerate it later.
            </p>
          )}
          <Link href="/dashboard">
            <Button variant="outline" className="w-full">
              Go to dashboard
            </Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-kaunta-stone">
      <header className="border-b border-kaunta-mist bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <span className="font-display text-2xl text-kaunta-ink">Kaunta HR</span>
          <span className="text-sm text-kaunta-slate/60 ml-3">Setup wizard</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Stepper */}
        <ol className="flex items-center justify-between mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const complete = i < step;
            return (
              <li key={s.id} className="flex-1 flex items-center">
                <div className="flex items-center gap-2">
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-full border ${
                      active
                        ? "border-kaunta-copper bg-kaunta-copper text-white"
                        : complete
                        ? "border-kaunta-sage bg-kaunta-sage-lt text-kaunta-sage"
                        : "border-kaunta-mist bg-white text-kaunta-slate/50"
                    }`}
                  >
                    {complete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span
                    className={`text-sm ${active ? "text-kaunta-ink font-medium" : "text-kaunta-slate/60"} hidden sm:inline`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && <span className="flex-1 h-px bg-kaunta-mist mx-3" />}
              </li>
            );
          })}
        </ol>

        {error && (
          <div className="mb-4 rounded-lg border border-kaunta-red/30 bg-kaunta-red/5 px-4 py-3 text-sm text-kaunta-red">
            {error}
          </div>
        )}

        {step === 0 && (
          <StepBusiness
            name={name}
            setName={setName}
            workplaceMode={workplaceMode}
            setWorkplaceMode={setWorkplaceMode}
            rulesMode={rulesMode}
            setRulesMode={setRulesMode}
          />
        )}
        {step === 1 && (
          <StepRules
            sharedRules={sharedRules}
            rulesets={rulesets}
            setRulesets={setRulesets}
          />
        )}
        {step === 2 && (
          <StepWorkplaces workplaces={workplaces} setWorkplaces={setWorkplaces} rulesets={rulesets} />
        )}
        {step === 3 && (
          <StepReview
            name={name}
            workplaceMode={workplaceMode}
            rulesMode={sharedRules ? "shared" : rulesMode}
            rulesets={rulesets}
            workplaces={workplaces}
          />
        )}

        <div className="flex items-center justify-between mt-8">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || saving}
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
            </Button>
          ) : (
            <Button onClick={finish} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Finish setup
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

// ── Step 1: Business ──────────────────────────────────────────────────────────
function StepBusiness(props: {
  name: string;
  setName: (v: string) => void;
  workplaceMode: WorkplaceMode;
  setWorkplaceMode: (v: WorkplaceMode) => void;
  rulesMode: RulesMode;
  setRulesMode: (v: RulesMode) => void;
}) {
  const { name, setName, workplaceMode, setWorkplaceMode, rulesMode, setRulesMode } = props;
  return (
    <div className={`${cardCls} p-6 space-y-6`}>
      <div>
        <h2 className="font-display text-2xl text-kaunta-ink mb-1">Tell us about your business</h2>
        <p className="text-sm text-kaunta-slate/60">This sets up your organisation on Kaunta HR.</p>
      </div>
      <Field label="Business name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Java House Westlands" />
      </Field>
      <Field label="How many workplaces do you run?">
        <div className="grid grid-cols-2 gap-3">
          <Choice active={workplaceMode === "single"} onClick={() => setWorkplaceMode("single")} title="One workplace" desc="A single location" />
          <Choice active={workplaceMode === "multiple"} onClick={() => setWorkplaceMode("multiple")} title="Several workplaces" desc="Multiple locations" />
        </div>
      </Field>
      {workplaceMode === "multiple" && (
        <Field label="Do the same rules apply everywhere?">
          <div className="grid grid-cols-2 gap-3">
            <Choice active={rulesMode === "shared"} onClick={() => setRulesMode("shared")} title="Shared rules" desc="One ruleset for all" />
            <Choice active={rulesMode === "per_workplace"} onClick={() => setRulesMode("per_workplace")} title="Per workplace" desc="Different rules each" />
          </div>
        </Field>
      )}
    </div>
  );
}

function Choice({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border px-4 py-3 transition-colors ${
        active ? "border-kaunta-copper bg-kaunta-copper-lt" : "border-kaunta-mist bg-white hover:bg-kaunta-stone"
      }`}
    >
      <span className="block text-sm font-medium text-kaunta-ink">{title}</span>
      <span className="block text-xs text-kaunta-slate/60">{desc}</span>
    </button>
  );
}

// ── Step 2: Rules ─────────────────────────────────────────────────────────────
function StepRules({
  sharedRules,
  rulesets,
  setRulesets,
}: {
  sharedRules: boolean;
  rulesets: Ruleset[];
  setRulesets: React.Dispatch<React.SetStateAction<Ruleset[]>>;
}) {
  const update = (i: number, patch: Partial<Ruleset>) =>
    setRulesets((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-6`}>
        <h2 className="font-display text-2xl text-kaunta-ink mb-1">Attendance rules & penalties</h2>
        <p className="text-sm text-kaunta-slate/60">
          {sharedRules
            ? "Define one ruleset that applies across your business."
            : "Define one or more rulesets. You'll assign one to each workplace next."}
        </p>
      </div>

      {rulesets.map((rs, i) => (
        <div key={rs.key} className={`${cardCls} p-6 space-y-5`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <Field label="Ruleset name">
                <input className={inputCls} value={rs.name} onChange={(e) => update(i, { name: e.target.value })} />
              </Field>
            </div>
            {!sharedRules && rulesets.length > 1 && (
              <button
                type="button"
                onClick={() => setRulesets((r) => r.filter((_, idx) => idx !== i))}
                className="mt-5 text-kaunta-red/70 hover:text-kaunta-red"
                aria-label="Remove ruleset"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Deduction logic">
              <select
                className={inputCls}
                value={rs.deductionMode}
                onChange={(e) => update(i, { deductionMode: e.target.value as Ruleset["deductionMode"] })}
              >
                <option value="fixed">Fixed amount per violation</option>
                <option value="per_minute">Per minute late</option>
              </select>
            </Field>
            {rs.deductionMode === "per_minute" && (
              <Field label="Rate (KES / minute)">
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={rs.perMinuteRate}
                  onChange={(e) => update(i, { perMinuteRate: Number(e.target.value) })}
                />
              </Field>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={labelCls}>Penalty rules</span>
              <button
                type="button"
                onClick={() => update(i, { penalties: [...rs.penalties, newPenalty()] })}
                className="text-xs text-kaunta-copper hover:underline inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add penalty
              </button>
            </div>
            <div className="space-y-2">
              {rs.penalties.map((p, pi) => (
                <div key={pi} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <label className="text-[10px] text-kaunta-slate/60">Code</label>
                    <input
                      className={inputCls}
                      value={p.code}
                      onChange={(e) =>
                        update(i, { penalties: rs.penalties.map((x, xi) => (xi === pi ? { ...x, code: e.target.value } : x)) })
                      }
                    />
                  </div>
                  <div className="col-span-4">
                    <label className="text-[10px] text-kaunta-slate/60">Reason</label>
                    <input
                      className={inputCls}
                      value={p.reason}
                      onChange={(e) =>
                        update(i, { penalties: rs.penalties.map((x, xi) => (xi === pi ? { ...x, reason: e.target.value } : x)) })
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-kaunta-slate/60">Amount</label>
                    <input
                      type="number"
                      min={0}
                      className={inputCls}
                      value={p.amount}
                      onChange={(e) =>
                        update(i, { penalties: rs.penalties.map((x, xi) => (xi === pi ? { ...x, amount: Number(e.target.value) } : x)) })
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-kaunta-slate/60">Appeal (h)</label>
                    <input
                      type="number"
                      min={0}
                      className={inputCls}
                      value={p.appeal_window_hours}
                      onChange={(e) =>
                        update(i, {
                          penalties: rs.penalties.map((x, xi) =>
                            xi === pi ? { ...x, appeal_window_hours: Number(e.target.value) } : x
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="col-span-1">
                    {rs.penalties.length > 1 && (
                      <button
                        type="button"
                        onClick={() => update(i, { penalties: rs.penalties.filter((_, xi) => xi !== pi) })}
                        className="text-kaunta-red/70 hover:text-kaunta-red pb-2"
                        aria-label="Remove penalty"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {!sharedRules && (
        <button
          type="button"
          onClick={() => setRulesets((rs) => [...rs, newRuleset(false, `Ruleset ${rs.length + 1}`)])}
          className={`${cardCls} w-full p-4 text-sm text-kaunta-copper hover:bg-kaunta-stone inline-flex items-center justify-center gap-2`}
        >
          <Plus className="h-4 w-4" /> Add another ruleset
        </button>
      )}
    </div>
  );
}

// ── Step 3: Workplaces ────────────────────────────────────────────────────────
function StepWorkplaces({
  workplaces,
  setWorkplaces,
  rulesets,
}: {
  workplaces: Workplace[];
  setWorkplaces: React.Dispatch<React.SetStateAction<Workplace[]>>;
  rulesets: Ruleset[];
}) {
  const [locating, setLocating] = useState<number | null>(null);

  const update = (i: number, patch: Partial<Workplace>) =>
    setWorkplaces((ws) => ws.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));

  function captureLocation(i: number) {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(i);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update(i, {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setLocating(null);
      },
      () => setLocating(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-6`}>
        <h2 className="font-display text-2xl text-kaunta-ink mb-1">Your workplaces</h2>
        <p className="text-sm text-kaunta-slate/60">
          Set each location, its geofence, ruleset, and shifts. Employees clock in inside the geofence.
        </p>
      </div>

      {workplaces.map((w, i) => (
        <div key={i} className={`${cardCls} p-6 space-y-5`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <Field label="Workplace name">
                <input className={inputCls} value={w.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="e.g. Westlands branch" />
              </Field>
            </div>
            {workplaces.length > 1 && (
              <button
                type="button"
                onClick={() => setWorkplaces((ws) => ws.filter((_, idx) => idx !== i))}
                className="mt-5 text-kaunta-red/70 hover:text-kaunta-red"
                aria-label="Remove workplace"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Latitude">
              <input
                type="number"
                step="any"
                className={inputCls}
                value={w.lat ?? ""}
                onChange={(e) => update(i, { lat: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
            <Field label="Longitude">
              <input
                type="number"
                step="any"
                className={inputCls}
                value={w.lng ?? ""}
                onChange={(e) => update(i, { lng: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
            <div className="flex items-end">
              <Button type="button" variant="outline" className="w-full" onClick={() => captureLocation(i)} disabled={locating === i}>
                {locating === i ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LocateFixed className="h-4 w-4 mr-2" />}
                Use current
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Geofence radius (metres)">
              <input
                type="number"
                min={10}
                max={5000}
                className={inputCls}
                value={w.geofence_radius_m}
                onChange={(e) => update(i, { geofence_radius_m: Number(e.target.value) })}
              />
            </Field>
            <Field label="Ruleset">
              <select className={inputCls} value={w.rulesetKey} onChange={(e) => update(i, { rulesetKey: e.target.value })}>
                {rulesets.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <ShiftEditor
            shifts={w.shifts}
            onChange={(shifts) => update(i, { shifts })}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={() => setWorkplaces((ws) => [...ws, newWorkplace(rulesets[0]?.key ?? "")])}
        className={`${cardCls} w-full p-4 text-sm text-kaunta-copper hover:bg-kaunta-stone inline-flex items-center justify-center gap-2`}
      >
        <Plus className="h-4 w-4" /> Add workplace
      </button>
    </div>
  );
}

// ── Shared shift editor (used in the wizard) ──────────────────────────────────
function ShiftEditor({ shifts, onChange }: { shifts: Shift[]; onChange: (s: Shift[]) => void }) {
  const update = (i: number, patch: Partial<Shift>) => onChange(shifts.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const toggleDay = (i: number, d: number) => {
    const s = shifts[i];
    const has = s.days_of_week.includes(d);
    update(i, { days_of_week: has ? s.days_of_week.filter((x) => x !== d) : [...s.days_of_week, d].sort() });
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className={labelCls}>Shifts</span>
        <button type="button" onClick={() => onChange([...shifts, newShift()])} className="text-xs text-kaunta-copper hover:underline inline-flex items-center gap-1">
          <Plus className="h-3 w-3" /> Add shift
        </button>
      </div>
      <div className="space-y-3">
        {shifts.map((s, i) => (
          <div key={i} className="rounded-lg border border-kaunta-mist p-3 space-y-3">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-5">
                <label className="text-[10px] text-kaunta-slate/60">Name</label>
                <input className={inputCls} value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
              </div>
              <div className="col-span-3">
                <label className="text-[10px] text-kaunta-slate/60">Kind</label>
                <select className={inputCls} value={s.kind} onChange={(e) => update(i, { kind: e.target.value as Shift["kind"] })}>
                  <option value="day">Day</option>
                  <option value="night">Night</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-kaunta-slate/60">Grace (m)</label>
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={s.grace_minutes}
                  onChange={(e) => update(i, { grace_minutes: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-2 flex items-end justify-end">
                {shifts.length > 1 && (
                  <button type="button" onClick={() => onChange(shifts.filter((_, idx) => idx !== i))} className="text-kaunta-red/70 hover:text-kaunta-red pb-2" aria-label="Remove shift">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-kaunta-slate/60">Start</label>
                <input type="time" className={inputCls} value={s.start_time} onChange={(e) => update(i, { start_time: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-kaunta-slate/60">End</label>
                <input type="time" className={inputCls} value={s.end_time} onChange={(e) => update(i, { end_time: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-kaunta-slate/60 block mb-1">Days</label>
              <div className="flex flex-wrap gap-1">
                {DAYS.map((d, di) => (
                  <button
                    key={di}
                    type="button"
                    onClick={() => toggleDay(i, di)}
                    className={`h-7 w-9 rounded-md text-xs ${
                      s.days_of_week.includes(di)
                        ? "bg-kaunta-copper text-white"
                        : "bg-kaunta-stone text-kaunta-slate/70 hover:bg-kaunta-mist"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 4: Review ────────────────────────────────────────────────────────────
function StepReview({
  name,
  workplaceMode,
  rulesMode,
  rulesets,
  workplaces,
}: {
  name: string;
  workplaceMode: WorkplaceMode;
  rulesMode: RulesMode;
  rulesets: Ruleset[];
  workplaces: Workplace[];
}) {
  const rsByKey = new Map(rulesets.map((r) => [r.key, r]));
  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-6`}>
        <h2 className="font-display text-2xl text-kaunta-ink mb-1">Review & finish</h2>
        <p className="text-sm text-kaunta-slate/60">
          {name} · {workplaceMode} workplace · {rulesMode} rules
        </p>
      </div>
      {workplaces.map((w, i) => {
        const rs = rsByKey.get(w.rulesetKey);
        return (
          <div key={i} className={`${cardCls} p-6`}>
            <h3 className="font-display text-xl text-kaunta-ink mb-2 inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-kaunta-copper" /> {w.name || "Untitled"}
            </h3>
            <p className="text-xs text-kaunta-slate/60 mb-3">
              {w.lat != null && w.lng != null ? `${w.lat}, ${w.lng}` : "No coordinates"} · {w.geofence_radius_m} m ·{" "}
              {rs?.name ?? "no ruleset"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-kaunta-sage mb-1 inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Shifts
                </p>
                <ul className="text-kaunta-slate/80 space-y-0.5">
                  {w.shifts.map((s, si) => (
                    <li key={si}>
                      {s.name} ({s.kind}) {s.start_time}–{s.end_time}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium text-kaunta-sage mb-1 inline-flex items-center gap-1">
                  <Scale className="h-3 w-3" /> Penalties
                </p>
                <ul className="text-kaunta-slate/80 space-y-0.5">
                  {(rs?.penalties ?? []).map((p, pi) => (
                    <li key={pi}>
                      {p.reason} — KES {p.amount}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
