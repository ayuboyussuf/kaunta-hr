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
import { MapPin, Clock, Plus, Trash2, Loader2, LocateFixed, Pencil } from "lucide-react";

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

const cardCls = "rounded-[12px] border border-kaunta-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.08)]";
const inputCls =
  "w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper";
const labelCls = "block text-xs font-medium text-kaunta-slate mb-1";

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
  const [locating, setLocating] = useState(false);

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

  function captureLocation() {
    if (!draft || typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setDraft((d) =>
          d ? { ...d, lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) } : d
        ),
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
    // clear locating once state updates
    setTimeout(() => setLocating(false), 1200);
  }

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
    <main className="min-h-screen bg-kaunta-stone">
      <header className="border-b border-kaunta-mist bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <span className="font-display text-2xl text-kaunta-ink">Workplaces</span>
            <Link href="/dashboard" className="text-sm text-kaunta-copper hover:underline ml-3">
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
          <div className="mb-4 rounded-lg border border-kaunta-red/30 bg-kaunta-red/5 px-4 py-3 text-sm text-kaunta-red">
            {error}
          </div>
        )}

        {draft && (
          <div className={`${cardCls} p-6 mb-6 space-y-4`}>
            <h2 className="font-display text-xl text-kaunta-ink">{draft.id ? "Edit workplace" : "New workplace"}</h2>
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Latitude</label>
                <input
                  type="number"
                  step="any"
                  className={inputCls}
                  value={draft.lat ?? ""}
                  onChange={(e) => setDraft({ ...draft, lat: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>Longitude</label>
                <input
                  type="number"
                  step="any"
                  className={inputCls}
                  value={draft.lng ?? ""}
                  onChange={(e) => setDraft({ ...draft, lng: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" className="w-full" onClick={captureLocation} disabled={locating}>
                  {locating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LocateFixed className="h-4 w-4 mr-2" />}
                  Use current
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Geofence radius (m)</label>
                <input
                  type="number"
                  min={10}
                  max={5000}
                  className={inputCls}
                  value={draft.geofence_radius_m}
                  onChange={(e) => setDraft({ ...draft, geofence_radius_m: Number(e.target.value) })}
                />
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
            <Loader2 className="h-6 w-6 animate-spin text-kaunta-copper" />
          </div>
        ) : workplaces.length === 0 && !draft ? (
          <div className={`${cardCls} p-10 text-center`}>
            <MapPin className="h-8 w-8 text-kaunta-slate/30 mx-auto mb-3" />
            <p className="text-kaunta-slate/70">No workplaces yet.</p>
            <p className="text-sm text-kaunta-slate/50 mt-1">
              Run the{" "}
              <Link href="/dashboard/onboarding" className="text-kaunta-copper hover:underline">
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
                    <h3 className="font-display text-xl text-kaunta-ink inline-flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-kaunta-copper" /> {w.name}
                    </h3>
                    <p className="text-xs text-kaunta-slate/60 mt-1">
                      {w.lat != null && w.lng != null ? `${w.lat}, ${w.lng}` : "No coordinates"} · {w.geofence_radius_m} m
                    </p>
                    {w.ruleset && <p className="text-xs text-kaunta-sage mt-0.5">Ruleset: {w.ruleset.name}</p>}
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
                      className="text-kaunta-slate/60 hover:text-kaunta-copper p-1"
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(w.id)} className="text-kaunta-red/60 hover:text-kaunta-red p-1" aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 border-t border-kaunta-mist pt-3">
                  <p className="text-xs font-medium text-kaunta-slate inline-flex items-center gap-1 mb-1">
                    <Clock className="h-3 w-3" /> {w.shifts.length} shift{w.shifts.length === 1 ? "" : "s"}
                  </p>
                  <ul className="text-xs text-kaunta-slate/70 space-y-0.5">
                    {w.shifts.map((s) => (
                      <li key={s.id}>
                        {s.name} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                      </li>
                    ))}
                    {w.shifts.length === 0 && <li className="text-kaunta-slate/40">No shifts defined</li>}
                  </ul>
                  <Link href="/dashboard/shifts" className="text-xs text-kaunta-copper hover:underline mt-2 inline-block">
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
