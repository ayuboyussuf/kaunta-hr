"use client";

/**
 * Workplace management (spec §1 / §4). List workplaces with their shifts + ruleset,
 * add / edit location & geofence, delete. Uses the owner Supabase token.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Plus, Trash2, Loader2, Pencil } from "lucide-react";
import dynamic from "next/dynamic";

// Leaflet reads `window` on import, so the picker can only exist in the browser.
const WorkplaceMapPicker = dynamic(() => import("@/components/WorkplaceMapPicker"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[300px] place-items-center rounded-xl border border-aproksi-mist bg-white sm:h-[380px]">
      <Loader2 className="h-5 w-5 animate-spin text-aproksi-ultra" />
    </div>
  ),
});

interface Shift {
  id: string;
  name: string;
  kind: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  grace_minutes: number;
}
interface Ruleset {
  id: string;
  name: string;
  is_shared: boolean;
}
interface Workplace {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  geofence_radius_m: number;
  ruleset_id: string | null;
  ruleset: Ruleset | null;
  shifts: Shift[];
}

const cardCls = "rounded-[12px] border border-aproksi-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.08)]";
const inputCls =
  "w-full rounded-lg border border-aproksi-mist bg-white px-3 py-2 text-sm outline-none focus:border-aproksi-ultra";
const labelCls = "block text-xs font-medium text-aproksi-slate mb-1";

interface Draft {
  id?: string;
  name: string;
  lat: number | null;
  lng: number | null;
  geofence_radius_m: number;
  ruleset_id: string | null;
}
const emptyDraft = (): Draft => ({ name: "", lat: null, lng: null, geofence_radius_m: 100, ruleset_id: null });

export default function WorkplacesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [rulesets, setRulesets] = useState<Ruleset[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const [wp, ob] = await Promise.all([
        api<{ workplaces: Workplace[] }>("/api/workplaces", { token: t }),
        api<{ rulesets: Ruleset[] }>("/api/owner/onboarding", { token: t }).catch(() => ({ rulesets: [] })),
      ]);
      setWorkplaces(wp.workplaces);
      setRulesets(ob.rulesets ?? []);
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

  async function save() {
    if (!token || !draft) return;
    if (!draft.name.trim()) return setError("Name is required.");
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: draft.name.trim(),
        lat: draft.lat,
        lng: draft.lng,
        geofence_radius_m: Number(draft.geofence_radius_m) || 100,
        ruleset_id: draft.ruleset_id,
      };
      if (draft.id) {
        await api(`/api/workplaces/${draft.id}`, { method: "PATCH", token, body });
      } else {
        await api("/api/workplaces", { method: "POST", token, body });
      }
      setDraft(null);
      await load(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!token) return;
    if (!confirm("Delete this workplace and its shifts?")) return;
    try {
      await api(`/api/workplaces/${id}`, { method: "DELETE", token });
      await load(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <main className="min-h-screen bg-aproksi-stone">
      <header className="border-b border-aproksi-mist bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <span className="font-display text-2xl text-aproksi-ink">Workplaces</span>
            <Link href="/dashboard" className="text-sm text-aproksi-ultra hover:underline ml-3">
              ← Dashboard
            </Link>
          </div>
          <Button onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4 mr-2" /> Add workplace
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 rounded-lg border border-aproksi-red/30 bg-aproksi-red/5 px-4 py-3 text-sm text-aproksi-red">
            {error}
          </div>
        )}

        {draft && (
          <div className={`${cardCls} p-6 mb-6 space-y-4`}>
            <h2 className="font-display text-xl text-aproksi-ink">{draft.id ? "Edit workplace" : "New workplace"}</h2>
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            {/* Where it is, and how far around it counts — chosen on a map.
                Coordinates are an output of this, never a question. */}
            <div>
              <label className={labelCls}>Where is it?</label>
              {token && (
                <WorkplaceMapPicker
                  token={token}
                  lat={draft.lat}
                  lng={draft.lng}
                  radiusM={draft.geofence_radius_m}
                  onChange={({ lat, lng }) => setDraft((d) => (d ? { ...d, lat, lng } : d))}
                  onRadiusChange={(m) => setDraft((d) => (d ? { ...d, geofence_radius_m: m } : d))}
                />
              )}
            </div>

            <div>
              <label className={labelCls}>Ruleset</label>
              <select
                className={inputCls}
                value={draft.ruleset_id ?? ""}
                onChange={(e) => setDraft({ ...draft, ruleset_id: e.target.value || null })}
              >
                <option value="">None</option>
                {rulesets.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-aproksi-ultra" />
          </div>
        ) : workplaces.length === 0 && !draft ? (
          <div className={`${cardCls} p-10 text-center`}>
            <MapPin className="h-8 w-8 text-aproksi-slate/30 mx-auto mb-3" />
            <p className="text-aproksi-slate/70">No workplaces yet.</p>
            <p className="text-sm text-aproksi-slate/50 mt-1">
              Run the{" "}
              <Link href="/dashboard/onboarding" className="text-aproksi-ultra hover:underline">
                setup wizard
              </Link>{" "}
              or add one directly.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workplaces.map((w) => (
              <div key={w.id} className={`${cardCls} p-5`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-xl text-aproksi-ink inline-flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-aproksi-ultra" /> {w.name}
                    </h3>
                    <p className="text-xs text-aproksi-slate/60 mt-1">
                      {w.lat != null && w.lng != null ? `${w.lat}, ${w.lng}` : "No coordinates"} · {w.geofence_radius_m} m
                    </p>
                    {w.ruleset && <p className="text-xs text-aproksi-sage mt-0.5">Ruleset: {w.ruleset.name}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() =>
                        setDraft({
                          id: w.id,
                          name: w.name,
                          lat: w.lat,
                          lng: w.lng,
                          geofence_radius_m: w.geofence_radius_m,
                          ruleset_id: w.ruleset_id,
                        })
                      }
                      className="text-aproksi-slate/60 hover:text-aproksi-ultra p-1"
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(w.id)} className="text-aproksi-red/60 hover:text-aproksi-red p-1" aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 border-t border-aproksi-mist pt-3">
                  <p className="text-xs font-medium text-aproksi-slate inline-flex items-center gap-1 mb-1">
                    <Clock className="h-3 w-3" /> {w.shifts.length} shift{w.shifts.length === 1 ? "" : "s"}
                  </p>
                  <ul className="text-xs text-aproksi-slate/70 space-y-0.5">
                    {w.shifts.map((s) => (
                      <li key={s.id}>
                        {s.name} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                      </li>
                    ))}
                    {w.shifts.length === 0 && <li className="text-aproksi-slate/40">No shifts defined</li>}
                  </ul>
                  <Link href="/dashboard/shifts" className="text-xs text-aproksi-ultra hover:underline mt-2 inline-block">
                    Manage shifts →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
