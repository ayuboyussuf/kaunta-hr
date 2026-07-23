"use client";

/**
 * Roster / shift management (spec §4). Define shifts per workplace and view which
 * employees are assigned to each. Uses the owner Supabase token.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Clock, Plus, Trash2, Loader2, Pencil, Users } from "lucide-react";

interface Shift {
  id: string;
  workplace_id: string;
  name: string;
  kind: "day" | "night" | "custom";
  start_time: string;
  end_time: string;
  days_of_week: number[];
  grace_minutes: number;
}
interface Workplace {
  id: string;
  name: string;
  shifts: Shift[];
}
interface Employee {
  id: string;
  name: string;
  shift_id: string | null;
  workplace_id: string | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const cardCls = "rounded-[12px] border border-kaunta-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.08)]";
const inputCls =
  "w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper";
const labelCls = "block text-xs font-medium text-kaunta-slate mb-1";

interface Draft {
  id?: string;
  workplace_id: string;
  name: string;
  kind: "day" | "night" | "custom";
  start_time: string;
  end_time: string;
  days_of_week: number[];
  grace_minutes: number;
}
const emptyDraft = (workplaceId: string): Draft => ({
  workplace_id: workplaceId,
  name: "Day shift",
  kind: "day",
  start_time: "08:00",
  end_time: "17:00",
  days_of_week: [1, 2, 3, 4, 5],
  grace_minutes: 5,
});

export default function ShiftsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const [wp, emp] = await Promise.all([
        api<{ workplaces: Workplace[] }>("/api/workplaces", { token: t }),
        api<{ employees: Employee[] }>("/api/employees", { token: t }).catch(() => ({ employees: [] })),
      ]);
      setWorkplaces(wp.workplaces);
      setEmployees(emp.employees ?? []);
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

  const assignedCount = (shiftId: string) => employees.filter((e) => e.shift_id === shiftId).length;

  function toggleDay(d: number) {
    if (!draft) return;
    const has = draft.days_of_week.includes(d);
    setDraft({
      ...draft,
      days_of_week: has ? draft.days_of_week.filter((x) => x !== d) : [...draft.days_of_week, d].sort(),
    });
  }

  async function save() {
    if (!token || !draft) return;
    if (!draft.name.trim()) return setError("Shift name is required.");
    if (!draft.days_of_week.length) return setError("Pick at least one day.");
    setSaving(true);
    setError(null);
    try {
      const body = {
        workplace_id: draft.workplace_id,
        name: draft.name.trim(),
        kind: draft.kind,
        start_time: draft.start_time,
        end_time: draft.end_time,
        days_of_week: draft.days_of_week,
        grace_minutes: Number(draft.grace_minutes) || 0,
      };
      if (draft.id) {
        await api(`/api/shifts/${draft.id}`, { method: "PATCH", token, body });
      } else {
        await api("/api/shifts", { method: "POST", token, body });
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
    if (!confirm("Delete this shift?")) return;
    try {
      await api(`/api/shifts/${id}`, { method: "DELETE", token });
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
            <span className="font-display text-2xl text-kaunta-ink">Shifts & rosters</span>
            <Link href="/dashboard" className="text-sm text-kaunta-copper hover:underline ml-3">
              ← Dashboard
            </Link>
          </div>
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
            <h2 className="font-display text-xl text-kaunta-ink">{draft.id ? "Edit shift" : "New shift"}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Workplace</label>
                <select
                  className={inputCls}
                  value={draft.workplace_id}
                  onChange={(e) => setDraft({ ...draft, workplace_id: e.target.value })}
                  disabled={!!draft.id}
                >
                  {workplaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Name</label>
                <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Kind</label>
                <select className={inputCls} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })}>
                  <option value="day">Day</option>
                  <option value="night">Night</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Start</label>
                <input type="time" className={inputCls} value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>End</label>
                <input type="time" className={inputCls} value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Grace (min)</label>
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={draft.grace_minutes}
                  onChange={(e) => setDraft({ ...draft, grace_minutes: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Days of week</label>
              <div className="flex flex-wrap gap-1">
                {DAYS.map((d, di) => (
                  <button
                    key={di}
                    type="button"
                    onClick={() => toggleDay(di)}
                    className={`h-8 w-11 rounded-md text-xs ${
                      draft.days_of_week.includes(di)
                        ? "bg-kaunta-copper text-white"
                        : "bg-kaunta-stone text-kaunta-slate/70 hover:bg-kaunta-mist"
                    }`}
                  >
                    {d}
                  </button>
                ))}
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
        ) : workplaces.length === 0 ? (
          <div className={`${cardCls} p-10 text-center`}>
            <p className="text-kaunta-slate/70">No workplaces yet.</p>
            <Link href="/dashboard/workplaces" className="text-sm text-kaunta-copper hover:underline mt-1 inline-block">
              Add a workplace first →
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {workplaces.map((w) => (
              <div key={w.id} className={`${cardCls} p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-xl text-kaunta-ink">{w.name}</h3>
                  <Button size="sm" variant="outline" onClick={() => setDraft(emptyDraft(w.id))}>
                    <Plus className="h-3 w-3 mr-1" /> Add shift
                  </Button>
                </div>
                {w.shifts.length === 0 ? (
                  <p className="text-sm text-kaunta-slate/50">No shifts defined for this workplace.</p>
                ) : (
                  <div className="space-y-2">
                    {w.shifts.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg border border-kaunta-mist px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-kaunta-ink inline-flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-kaunta-copper" /> {s.name}
                            <span className="text-xs font-normal text-kaunta-slate/50 capitalize">({s.kind})</span>
                          </p>
                          <p className="text-xs text-kaunta-slate/60 mt-0.5">
                            {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.days_of_week.map((d) => DAYS[d]).join(" ")} ·{" "}
                            {s.grace_minutes}m grace
                          </p>
                          <p className="text-xs text-kaunta-sage mt-0.5 inline-flex items-center gap-1">
                            <Users className="h-3 w-3" /> {assignedCount(s.id)} assigned
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() =>
                              setDraft({
                                id: s.id,
                                workplace_id: s.workplace_id,
                                name: s.name,
                                kind: s.kind,
                                start_time: s.start_time.slice(0, 5),
                                end_time: s.end_time.slice(0, 5),
                                days_of_week: s.days_of_week,
                                grace_minutes: s.grace_minutes,
                              })
                            }
                            className="text-kaunta-slate/60 hover:text-kaunta-copper p-1"
                            aria-label="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => remove(s.id)} className="text-kaunta-red/60 hover:text-kaunta-red p-1" aria-label="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <p className="text-xs text-kaunta-slate/50">
              Assign employees to shifts from the{" "}
              <Link href="/dashboard/employees" className="text-kaunta-copper hover:underline">
                employees page
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
