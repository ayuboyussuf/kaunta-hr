"use client";

/**
 * Employee / team management (spec §2, owner side). Add employees (name + phone),
 * assign a workplace + shift + base salary, and the backend sends an SMS invite.
 * List, edit, reassign, suspend / reactivate. Uses the owner Supabase token.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { formatKES } from "@/lib/utils";
import { Users, Plus, Loader2, Pencil, Ban, RotateCcw, Phone, MessageCircle, ChevronDown } from "lucide-react";

interface Shift {
  id: string;
  name: string;
  kind: string;
  start_time: string;
  end_time: string;
}
interface Workplace {
  id: string;
  name: string;
  shifts: Shift[];
}
interface Employee {
  id: string;
  name: string;
  phone: string;
  base_salary: number;
  status: "invited" | "active" | "suspended";
  workplace_id: string | null;
  shift_id: string | null;
  workplace: { id: string; name: string } | null;
  shift: { id: string; name: string } | null;
}

const cardCls = "rounded-[12px] border border-kaunta-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.08)]";
const inputCls =
  "w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper";
const labelCls = "block text-xs font-medium text-kaunta-slate mb-1";

const STATUS: Record<Employee["status"], { label: string; cls: string }> = {
  invited: { label: "Invited", cls: "bg-kaunta-amber/15 text-kaunta-amber" },
  active: { label: "Active", cls: "bg-kaunta-sage-lt text-kaunta-sage" },
  suspended: { label: "Suspended", cls: "bg-kaunta-red/10 text-kaunta-red" },
};

interface Draft {
  id?: string;
  name: string;
  phone: string;
  workplace_id: string | null;
  shift_id: string | null;
  base_salary: number;
}
const emptyDraft = (): Draft => ({ name: "", phone: "", workplace_id: null, shift_id: null, base_salary: 0 });

interface Overview {
  employee_id: string;
  last_in: string | null;
  days_since_seen: number | null;
  checks_confirmed_7d: number;
  checks_missed_7d: number;
}
interface HistoryEntry {
  id: string;
  scanned_at: string;
  direction: "in" | "out";
  status: string;
  flags: string[];
  workplace: { name: string } | null;
}
interface HistoryCheck {
  id: string;
  due_at: string;
  respond_by: string;
  status: "pending" | "confirmed" | "missed";
}

/** Last-seen badge from days-since-clock-in. */
function seenBadge(o: Overview | undefined): { label: string; cls: string } {
  const d = o?.days_since_seen ?? null;
  if (d === null) return { label: "Never", cls: "bg-kaunta-mist text-kaunta-slate/70" };
  if (d === 0) return { label: "Today", cls: "bg-kaunta-sage/15 text-kaunta-sage" };
  if (d === 1) return { label: "Yesterday", cls: "bg-kaunta-mist text-kaunta-slate" };
  if (d === 2) return { label: "2d ago", cls: "bg-kaunta-amber/15 text-kaunta-amber" };
  return { label: `Absent ${d}d`, cls: "bg-kaunta-red/10 text-kaunta-red" };
}

export default function EmployeesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [overview, setOverview] = useState<Record<string, Overview>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ entries: HistoryEntry[]; checks: HistoryCheck[] } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const [emp, wp, ov] = await Promise.all([
        api<{ employees: Employee[] }>("/api/employees", { token: t }),
        api<{ workplaces: Workplace[] }>("/api/workplaces", { token: t }),
        api<{ overview: Overview[] }>("/api/employees/attendance-overview", { token: t }).catch(() => ({ overview: [] })),
      ]);
      setEmployees(emp.employees);
      setWorkplaces(wp.workplaces);
      setOverview(Object.fromEntries(ov.overview.map((o) => [o.employee_id, o])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  async function toggleHistory(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setHistory(null);
      return;
    }
    setExpandedId(id);
    setHistory(null);
    setHistoryLoading(true);
    try {
      const h = await api<{ entries: HistoryEntry[]; checks: HistoryCheck[] }>(`/api/employees/${id}/history`, {
        token: token ?? undefined,
      });
      setHistory(h);
    } catch {
      setHistory({ entries: [], checks: [] });
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const t = data.session?.access_token ?? null;
      if (!t) return router.replace("/login");
      setToken(t);
      await load(t);
    })();
  }, [supabase, router, load]);

  // Shifts available for the workplace currently chosen in the draft.
  const draftShifts = useMemo(() => {
    if (!draft?.workplace_id) return [];
    return workplaces.find((w) => w.id === draft.workplace_id)?.shifts ?? [];
  }, [draft?.workplace_id, workplaces]);

  async function save() {
    if (!token || !draft) return;
    if (!draft.name.trim()) return setError("Name is required.");
    if (!draft.phone.trim()) return setError("Phone is required.");
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body = {
        name: draft.name.trim(),
        phone: draft.phone.trim(),
        workplace_id: draft.workplace_id,
        shift_id: draft.shift_id,
        base_salary: Number(draft.base_salary) || 0,
      };
      if (draft.id) {
        await api(`/api/employees/${draft.id}`, { method: "PATCH", token, body });
        setNotice("Employee updated.");
      } else {
        const resp = await api<{ inviteSent: boolean; inviteError?: string }>("/api/employees", {
          method: "POST",
          token,
          body,
        });
        setNotice(
          resp.inviteSent
            ? "Employee added and invite sent by SMS."
            : `Employee added, but the SMS invite could not be sent${resp.inviteError ? `: ${resp.inviteError}` : "."}`
        );
      }
      setDraft(null);
      await load(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, action: "suspend" | "activate") {
    if (!token) return;
    try {
      await api(`/api/employees/${id}/${action}`, { method: "POST", token });
      await load(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function resendInvite(id: string) {
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      const r = await api<{ inviteSent: boolean; inviteError?: string }>(
        `/api/employees/${id}/resend-invite`,
        { method: "POST", token }
      );
      setNotice(
        r.inviteSent
          ? "Invite resent by SMS."
          : `Could not resend the invite${r.inviteError ? `: ${r.inviteError}` : "."}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resend failed");
    }
  }

  return (
    <main className="min-h-screen bg-kaunta-stone">
      <header className="border-b border-kaunta-mist bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <span className="font-display text-2xl text-kaunta-ink">Team</span>
            <Link href="/dashboard" className="text-sm text-kaunta-copper hover:underline ml-3">
              ← Dashboard
            </Link>
          </div>
          <Button onClick={() => { setDraft(emptyDraft()); setNotice(null); }}>
            <Plus className="h-4 w-4 mr-2" /> Add employee
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 rounded-lg border border-kaunta-red/30 bg-kaunta-red/5 px-4 py-3 text-sm text-kaunta-red">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-lg border border-kaunta-sage/30 bg-kaunta-sage-lt px-4 py-3 text-sm text-kaunta-sage inline-flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> {notice}
          </div>
        )}

        {draft && (
          <div className={`${cardCls} p-6 mb-6 space-y-4`}>
            <h2 className="font-display text-xl text-kaunta-ink">{draft.id ? "Edit employee" : "Add employee"}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Full name</label>
                <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Phone (SMS)</label>
                <input
                  className={inputCls}
                  value={draft.phone}
                  placeholder="07XX XXX XXX or +2547…"
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Workplace</label>
                <select
                  className={inputCls}
                  value={draft.workplace_id ?? ""}
                  onChange={(e) => setDraft({ ...draft, workplace_id: e.target.value || null, shift_id: null })}
                >
                  <option value="">Unassigned</option>
                  {workplaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Shift</label>
                <select
                  className={inputCls}
                  value={draft.shift_id ?? ""}
                  onChange={(e) => setDraft({ ...draft, shift_id: e.target.value || null })}
                  disabled={!draft.workplace_id}
                >
                  <option value="">Unassigned</option>
                  {draftShifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Base salary (KES)</label>
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={draft.base_salary}
                  onChange={(e) => setDraft({ ...draft, base_salary: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : draft.id ? "Save" : "Add & invite"}
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
        ) : employees.length === 0 && !draft ? (
          <div className={`${cardCls} p-10 text-center`}>
            <Users className="h-8 w-8 text-kaunta-slate/30 mx-auto mb-3" />
            <p className="text-kaunta-slate/70">No employees yet.</p>
            <p className="text-sm text-kaunta-slate/50 mt-1">Add your first team member — they&apos;ll get an SMS invite.</p>
          </div>
        ) : (
          <div className={`${cardCls} overflow-hidden`}>
            <p className="px-4 pt-3 text-xs text-kaunta-slate/60">
              <span className="font-medium text-kaunta-amber">Invited</span> = added but hasn&apos;t signed in yet ·{" "}
              <span className="font-medium text-kaunta-sage">Active</span> = has signed in. Use the{" "}
              <MessageCircle className="inline h-3 w-3" /> button to resend an invite.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-kaunta-mist text-left text-xs text-kaunta-slate/60">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Workplace</th>
                  <th className="px-4 py-3 font-medium">Shift</th>
                  <th className="px-4 py-3 font-medium tabular-nums">Salary</th>
                  <th className="px-4 py-3 font-medium">Last seen</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const ov = overview[e.id];
                  const badge = seenBadge(ov);
                  const isOpen = expandedId === e.id;
                  return (
                    <Fragment key={e.id}>
                      <tr className="border-b border-kaunta-mist/60 last:border-0">
                        <td className="px-4 py-3 font-medium text-kaunta-ink">{e.name}</td>
                        <td className="px-4 py-3 text-kaunta-slate/70">
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3 text-kaunta-slate/40" /> {e.phone}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-kaunta-slate/70">{e.workplace?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-kaunta-slate/70">{e.shift?.name ?? "—"}</td>
                        <td className="px-4 py-3 tabular-nums text-kaunta-slate/70">{formatKES(e.base_salary)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                            {badge.label}
                          </span>
                          {ov && ov.checks_missed_7d > 0 && (
                            <span className="ml-1 text-xs text-kaunta-red">· {ov.checks_missed_7d} missed</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS[e.status].cls}`}>
                            {STATUS[e.status].label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => toggleHistory(e.id)}
                              className="text-kaunta-slate/60 hover:text-kaunta-copper p-1"
                              aria-label="Attendance history"
                              title="Attendance history"
                            >
                              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                            </button>
                            <button
                              onClick={() =>
                                setDraft({
                                  id: e.id,
                                  name: e.name,
                                  phone: e.phone,
                                  workplace_id: e.workplace_id,
                                  shift_id: e.shift_id,
                                  base_salary: e.base_salary,
                                })
                              }
                              className="text-kaunta-slate/60 hover:text-kaunta-copper p-1"
                              aria-label="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            {e.status === "invited" && (
                              <button
                                onClick={() => resendInvite(e.id)}
                                className="text-kaunta-slate/60 hover:text-kaunta-copper p-1"
                                aria-label="Resend invite"
                                title="Resend invite by SMS"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </button>
                            )}
                            {e.status === "suspended" ? (
                              <button onClick={() => setStatus(e.id, "activate")} className="text-kaunta-sage/70 hover:text-kaunta-sage p-1" aria-label="Reactivate">
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            ) : (
                              <button onClick={() => setStatus(e.id, "suspend")} className="text-kaunta-red/60 hover:text-kaunta-red p-1" aria-label="Suspend">
                                <Ban className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-kaunta-stone/40">
                          <td colSpan={8} className="px-4 py-4">
                            {historyLoading ? (
                              <div className="flex items-center gap-2 text-sm text-kaunta-slate/60">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
                              </div>
                            ) : (
                              <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                  <p className="text-xs font-medium text-kaunta-slate mb-2">Recent scans (30 days)</p>
                                  {history && history.entries.length > 0 ? (
                                    <ul className="space-y-1 text-sm">
                                      {history.entries.slice(0, 12).map((en) => (
                                        <li key={en.id} className="flex items-center justify-between gap-2">
                                          <span className="text-kaunta-ink">
                                            {new Date(en.scanned_at).toLocaleString("en-KE", {
                                              month: "short",
                                              day: "numeric",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            })}{" "}
                                            <span className="text-kaunta-slate/50">· {en.direction === "in" ? "in" : "out"}</span>
                                          </span>
                                          <span
                                            className={`text-xs ${
                                              en.status === "flagged" ? "text-kaunta-red" : en.status === "late" ? "text-kaunta-amber" : "text-kaunta-sage"
                                            }`}
                                          >
                                            {en.status}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-sm text-kaunta-slate/50">No scans in the last 30 days.</p>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-kaunta-slate mb-2">Presence checks (30 days)</p>
                                  {history && history.checks.length > 0 ? (
                                    <ul className="space-y-1 text-sm">
                                      {history.checks.slice(0, 12).map((c) => (
                                        <li key={c.id} className="flex items-center justify-between gap-2">
                                          <span className="text-kaunta-slate/70">
                                            {new Date(c.due_at).toLocaleString("en-KE", {
                                              month: "short",
                                              day: "numeric",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            })}
                                          </span>
                                          <span
                                            className={`text-xs ${
                                              c.status === "confirmed" ? "text-kaunta-sage" : c.status === "missed" ? "text-kaunta-red" : "text-kaunta-slate/50"
                                            }`}
                                          >
                                            {c.status === "confirmed" ? "passed" : c.status}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-sm text-kaunta-slate/50">No presence checks yet.</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
