"use client";

/**
 * Owner settings. Edit the business name and see account details without
 * re-running the wizard; deep-link back into setup to change rules/workplaces.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, Building2, SlidersHorizontal, Check, ShieldCheck, Wallet, MapPin, Scale, Clock } from "lucide-react";

interface OrgSettings {
  id: string;
  name: string;
  phone: string | null;
  workplace_mode: "single" | "multiple";
  rules_mode: "shared" | "per_workplace";
  onboarding_complete: boolean;
  created_at: string;
  presence_checks_per_shift: number;
  presence_check_window_min: number;
  presence_sms_fallback: boolean;
  payroll_cadence: "off" | "weekly" | "biweekly" | "monthly";
  payroll_pay_day: number | null;
  payroll_pay_month: "previous" | "current";
  absence_policy: "flat" | "prorate";
}

const cardCls = "rounded-[12px] border border-kaunta-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.08)]";
const inputCls =
  "w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-ultra";
const labelCls = "block text-xs font-medium text-kaunta-slate mb-1";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // Presence-check config
  const [checksPerShift, setChecksPerShift] = useState(0);
  const [windowMin, setWindowMin] = useState(10);
  const [smsFallback, setSmsFallback] = useState(true);
  const [savingPresence, setSavingPresence] = useState(false);
  // Payroll config
  const [cadence, setCadence] = useState<"off" | "weekly" | "biweekly" | "monthly">("off");
  const [payDay, setPayDay] = useState<number | null>(null);
  const [savingPayroll, setSavingPayroll] = useState(false);
  const [payMonth, setPayMonth] = useState<"previous" | "current">("previous");
  const [absencePolicy, setAbsencePolicy] = useState<"flat" | "prorate">("flat");
  const [payrollPin, setPayrollPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const t = data.session?.access_token ?? null;
      if (!t) return router.replace("/login");
      setToken(t);
      setEmail(data.session?.user.email ?? "");
      try {
        const r = await api<{ org: OrgSettings }>("/api/owner/settings", { token: t });
        setOrg(r.org);
        setName(r.org.name);
        setPhone(r.org.phone ?? "");
        setChecksPerShift(r.org.presence_checks_per_shift ?? 0);
        setWindowMin(r.org.presence_check_window_min ?? 10);
        setSmsFallback(r.org.presence_sms_fallback ?? true);
        setCadence(r.org.payroll_cadence ?? "off");
        setPayDay(r.org.payroll_pay_day ?? null);
        setPayMonth(r.org.payroll_pay_month ?? "previous");
        setAbsencePolicy(r.org.absence_policy ?? "flat");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, router]);

  async function save() {
    if (!token) return;
    if (!name.trim()) return setError("Business name is required.");
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api<{ org: OrgSettings }>("/api/owner/settings", {
        method: "PATCH",
        token,
        body: { name: name.trim(), phone: phone.trim() },
      });
      setOrg(r.org);
      setPhone(r.org.phone ?? "");
      setNotice("Settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function savePresence() {
    if (!token) return;
    setSavingPresence(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api<{ org: OrgSettings }>("/api/owner/settings", {
        method: "PATCH",
        token,
        body: {
          presence_checks_per_shift: Number(checksPerShift) || 0,
          presence_check_window_min: Number(windowMin) || 10,
          presence_sms_fallback: smsFallback,
        },
      });
      setOrg(r.org);
      setNotice("Presence-check settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingPresence(false);
    }
  }

  async function savePayroll() {
    if (!token) return;
    setSavingPayroll(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api<{ org: OrgSettings }>("/api/owner/settings", {
        method: "PATCH",
        token,
        body: {
          payroll_cadence: cadence,
          payroll_pay_day: cadence === "off" ? null : payDay,
          payroll_pay_month: payMonth,
          absence_policy: absencePolicy,
        },
      });
      setOrg(r.org);
      setNotice("Payroll settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingPayroll(false);
    }
  }

  async function savePin() {
    if (!token) return;
    if (!/^\d{4,6}$/.test(payrollPin)) return setError("Payroll PIN must be 4–6 digits.");
    setSavingPin(true);
    setError(null);
    setNotice(null);
    try {
      await api("/api/payroll/pin", { method: "POST", token, body: { pin: payrollPin } });
      setPayrollPin("");
      setNotice("Payroll PIN saved. You'll enter it to approve a payroll run.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingPin(false);
    }
  }

  const dirty = org ? name.trim() !== org.name || phone.trim() !== (org.phone ?? "") : false;
  const payrollDirty = org
    ? cadence !== org.payroll_cadence ||
      payDay !== org.payroll_pay_day ||
      payMonth !== org.payroll_pay_month ||
      absencePolicy !== org.absence_policy
    : false;

  // Plain-English preview of when/what a monthly run pays.
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const payPreview = (() => {
    if (cadence !== "monthly") return null;
    const now = new Date();
    const day = payDay ?? (payMonth === "previous" ? 1 : 0);
    if (payMonth === "previous") {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const payMon = MONTHS[now.getMonth()];
      return `You'll pay ${MONTHS[prev.getMonth()]}'s salary on ${day || 1} ${payMon}.`;
    }
    return `You'll pay ${MONTHS[now.getMonth()]}'s salary ${payDay ? `on the ${payDay}th` : "on the last day of the month"}.`;
  })();
  const presenceDirty = org
    ? checksPerShift !== org.presence_checks_per_shift ||
      windowMin !== org.presence_check_window_min ||
      smsFallback !== org.presence_sms_fallback
    : false;

  return (
    <main className="bg-kaunta-stone">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="font-display text-3xl text-kaunta-ink mb-1">Settings</h1>
        <p className="text-sm text-kaunta-slate/60 mb-6">Your business profile and account.</p>

        {error && (
          <div className="mb-4 rounded-lg border border-kaunta-red/30 bg-kaunta-red/5 px-4 py-3 text-sm text-kaunta-red">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-lg border border-kaunta-sage/30 bg-kaunta-sage-lt px-4 py-3 text-sm text-kaunta-sage inline-flex items-center gap-2">
            <Check className="h-4 w-4" /> {notice}
          </div>
        )}

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-kaunta-ultra" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Business profile */}
            <section className={`${cardCls} p-6 space-y-4`}>
              <h2 className="font-display text-xl text-kaunta-ink inline-flex items-center gap-2">
                <Building2 className="h-5 w-5 text-kaunta-ultra" /> Business
              </h2>
              <div>
                <label className={labelCls}>Business name</label>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Your phone (for SMS alerts)</label>
                <input
                  className={inputCls}
                  value={phone}
                  placeholder="07XX XXX XXX or +2547…"
                  onChange={(e) => setPhone(e.target.value)}
                />
                <p className="text-xs text-kaunta-slate/50 mt-1">
                  We&apos;ll text this number when an employee submits an appeal. Leave blank to turn off SMS alerts.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className={labelCls}>Workplaces</p>
                  <p className="text-kaunta-ink capitalize">{org?.workplace_mode ?? "—"}</p>
                </div>
                <div>
                  <p className={labelCls}>Rules</p>
                  <p className="text-kaunta-ink">
                    {org?.rules_mode === "per_workplace" ? "Per workplace" : "Shared"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button onClick={save} disabled={saving || !dirty}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save changes
                </Button>
                {dirty && <span className="text-xs text-kaunta-slate/50">Unsaved changes</span>}
              </div>
            </section>

            {/* Payroll cadence */}
            <section className={`${cardCls} p-6 space-y-4`}>
              <h2 className="font-display text-xl text-kaunta-ink inline-flex items-center gap-2">
                <Wallet className="h-5 w-5 text-kaunta-ultra" /> Payroll
              </h2>
              <p className="text-sm text-kaunta-slate/60">
                How often do you pay staff? When a period ends, Kaunta auto-calculates everyone&apos;s pay and
                deductions into a draft and messages you to review — nothing is final until you approve it with
                your PIN.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Pay schedule</label>
                  <select className={inputCls} value={cadence} onChange={(e) => setCadence(e.target.value as typeof cadence)}>
                    <option value="off">Manual (I run it myself)</option>
                    <option value="monthly">Monthly</option>
                    <option value="biweekly">Every 2 weeks</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                {cadence === "monthly" && (
                  <div>
                    <label className={labelCls}>Pay day of month</label>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      placeholder="blank = last day"
                      className={inputCls}
                      value={payDay ?? ""}
                      onChange={(e) => setPayDay(e.target.value === "" ? null : Math.max(1, Math.min(28, Number(e.target.value))))}
                    />
                    <p className="text-xs text-kaunta-slate/50 mt-1">Leave blank to run on the last day of the month.</p>
                  </div>
                )}
                {(cadence === "weekly" || cadence === "biweekly") && (
                  <div>
                    <label className={labelCls}>Pay day of week</label>
                    <select
                      className={inputCls}
                      value={payDay ?? 5}
                      onChange={(e) => setPayDay(Number(e.target.value))}
                    >
                      {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
                        <option key={i} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {cadence === "monthly" && (
                  <div>
                    <label className={labelCls}>Which work does this pay for?</label>
                    <select className={inputCls} value={payMonth} onChange={(e) => setPayMonth(e.target.value as "previous" | "current")}>
                      <option value="previous">Previous month (e.g. July&rsquo;s pay early August)</option>
                      <option value="current">This month (pay at month-end)</option>
                    </select>
                  </div>
                )}
              </div>
              {payPreview && (
                <p className="text-xs text-kaunta-sage bg-kaunta-sage/10 rounded-lg px-3 py-2">{payPreview}</p>
              )}

              <div>
                <label className={labelCls}>Monthly staff who miss scheduled days</label>
                <select className={inputCls} value={absencePolicy} onChange={(e) => setAbsencePolicy(e.target.value as "flat" | "prorate")}>
                  <option value="flat">Pay full salary (review absences before approving)</option>
                  <option value="prorate">Pro-rate by attendance (auto-deduct absent days)</option>
                </select>
                <p className="text-xs text-kaunta-slate/50 mt-1">
                  Either way the breakdown shows the absent days and the exact daily-equivalent amount. Daily/hourly
                  staff are always paid only for days/hours present.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button onClick={savePayroll} disabled={savingPayroll || !payrollDirty}>
                  {savingPayroll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save payroll settings
                </Button>
                {payrollDirty && <span className="text-xs text-kaunta-slate/50">Unsaved changes</span>}
              </div>

              <div className="border-t border-kaunta-mist pt-4">
                <label className={labelCls}>Approval PIN</label>
                <p className="text-xs text-kaunta-slate/60 mb-2">
                  A 4–6 digit PIN you enter to approve and lock a payroll run. Set it once; enter it at approval.
                </p>
                <div className="flex gap-2 max-w-xs">
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder="Set / change PIN"
                    className={inputCls}
                    value={payrollPin}
                    onChange={(e) => setPayrollPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <Button onClick={savePin} disabled={savingPin || payrollPin.length < 4}>
                    {savingPin ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save PIN"}
                  </Button>
                </div>
              </div>
            </section>

            {/* Presence checks */}
            <section className={`${cardCls} p-6 space-y-4`}>
              <h2 className="font-display text-xl text-kaunta-ink inline-flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-kaunta-ultra" /> Presence checks
              </h2>
              <p className="text-sm text-kaunta-slate/60">
                Randomly prompt clocked-in staff to re-scan during a shift, so someone can&apos;t clock in and
                leave. A missed check is flagged for your review (not an automatic penalty).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Random checks per shift</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    className={inputCls}
                    value={checksPerShift}
                    onChange={(e) => setChecksPerShift(Math.max(0, Math.min(10, Number(e.target.value))))}
                  />
                  <p className="text-xs text-kaunta-slate/50 mt-1">0 turns presence checks off.</p>
                </div>
                <div>
                  <label className={labelCls}>Response window (minutes)</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    className={inputCls}
                    value={windowMin}
                    onChange={(e) => setWindowMin(Math.max(1, Math.min(120, Number(e.target.value))))}
                  />
                  <p className="text-xs text-kaunta-slate/50 mt-1">
                    How long staff have to scan after a prompt. Longer is friendlier; shorter is harder to fake.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-kaunta-ink">
                <input
                  type="checkbox"
                  checked={smsFallback}
                  onChange={(e) => setSmsFallback(e.target.checked)}
                  className="h-4 w-4 accent-kaunta-ultra"
                />
                Also send an SMS to staff without push notifications
                <span className="text-xs text-kaunta-slate/50">(costs money per check)</span>
              </label>
              <div className="flex items-center gap-2 pt-1">
                <Button onClick={savePresence} disabled={savingPresence || !presenceDirty}>
                  {savingPresence ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save presence settings
                </Button>
                {presenceDirty && <span className="text-xs text-kaunta-slate/50">Unsaved changes</span>}
              </div>
            </section>

            {/* Attendance configuration */}
            <section className={`${cardCls} p-6`}>
              <h2 className="font-display text-xl text-kaunta-ink inline-flex items-center gap-2 mb-2">
                <SlidersHorizontal className="h-5 w-5 text-kaunta-ultra" /> Attendance rules &amp; workplaces
              </h2>
              <p className="text-sm text-kaunta-slate/60 mb-4">
                Add or edit these any time — no need to re-run setup. To add a new workplace, open
                <span className="text-kaunta-ink"> Workplaces</span> and tap “Add workplace.”
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Link href="/dashboard/workplaces">
                  <Button variant="outline" className="w-full justify-start">
                    <MapPin className="h-4 w-4 mr-2" /> Workplaces
                  </Button>
                </Link>
                <Link href="/dashboard/rules">
                  <Button variant="outline" className="w-full justify-start">
                    <Scale className="h-4 w-4 mr-2" /> Rules
                  </Button>
                </Link>
                <Link href="/dashboard/shifts">
                  <Button variant="outline" className="w-full justify-start">
                    <Clock className="h-4 w-4 mr-2" /> Shifts
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-kaunta-slate/50 mt-3">
                Prefer the guided flow?{" "}
                <Link href="/dashboard/onboarding" className="text-kaunta-ultra hover:underline">
                  Re-run the setup wizard
                </Link>
                .
              </p>
            </section>

            {/* Account */}
            <section className={`${cardCls} p-6`}>
              <h2 className="font-display text-xl text-kaunta-ink mb-2">Account</h2>
              <div className="text-sm">
                <p className={labelCls}>Signed in as</p>
                <p className="text-kaunta-ink">{email || "—"}</p>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
