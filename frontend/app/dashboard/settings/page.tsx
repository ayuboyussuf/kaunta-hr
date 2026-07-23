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
import { Loader2, Building2, SlidersHorizontal, Check } from "lucide-react";

interface OrgSettings {
  id: string;
  name: string;
  workplace_mode: "single" | "multiple";
  rules_mode: "shared" | "per_workplace";
  onboarding_complete: boolean;
  created_at: string;
}

const cardCls = "rounded-[12px] border border-kaunta-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.08)]";
const inputCls =
  "w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper";
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
  const [email, setEmail] = useState("");

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
        body: { name: name.trim() },
      });
      setOrg(r.org);
      setNotice("Settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const dirty = org ? name.trim() !== org.name : false;

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
            <Loader2 className="h-6 w-6 animate-spin text-kaunta-copper" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Business profile */}
            <section className={`${cardCls} p-6 space-y-4`}>
              <h2 className="font-display text-xl text-kaunta-ink inline-flex items-center gap-2">
                <Building2 className="h-5 w-5 text-kaunta-copper" /> Business
              </h2>
              <div>
                <label className={labelCls}>Business name</label>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
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

            {/* Attendance configuration */}
            <section className={`${cardCls} p-6`}>
              <h2 className="font-display text-xl text-kaunta-ink inline-flex items-center gap-2 mb-2">
                <SlidersHorizontal className="h-5 w-5 text-kaunta-copper" /> Attendance rules & workplaces
              </h2>
              <p className="text-sm text-kaunta-slate/60 mb-4">
                Rulesets, penalties, workplaces and shifts are managed through the setup wizard.
              </p>
              <Link href="/dashboard/onboarding">
                <Button variant="outline">Open setup wizard</Button>
              </Link>
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
