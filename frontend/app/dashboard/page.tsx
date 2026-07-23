import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Owner live dashboard + hub (spec §9). Shows, per workplace, who's clocked in /
 * late / absent today plus flagged scans and the pending-appeals queue, with a
 * workplace switcher (?w=) and links out to every management section. Reads run
 * as the owner's Supabase session (RLS scopes them to the owner's org).
 */

const TZ = "Africa/Nairobi";

/** Start of "today" in Nairobi (UTC+3, no DST) as an ISO instant. */
function nairobiDayStartISO(): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00+03:00`).toISOString();
}

interface PageProps {
  searchParams: Promise<{ w?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const { w } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: org } = await supabase
    .from("orgs")
    .select("id, name, onboarding_complete")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!org) redirect("/dashboard/onboarding");
  if (!org.onboarding_complete) redirect("/dashboard/onboarding");

  const dayStart = nairobiDayStartISO();

  const [{ data: workplaces }, { data: employees }, { data: entries }, { data: violations }, { count: pendingAppeals }] =
    await Promise.all([
      supabase.from("workplaces").select("id, name").eq("org_id", org.id).order("created_at"),
      supabase
        .from("employees")
        .select("id, name, status, workplace_id")
        .eq("org_id", org.id)
        .eq("status", "active"),
      supabase
        .from("attendance_entries")
        .select("id, employee_id, workplace_id, scanned_at, status, direction, flags")
        .gte("scanned_at", dayStart)
        .order("scanned_at", { ascending: true }),
      supabase
        .from("violations")
        .select("id, employee_id, reason, amount, status, created_at")
        .gte("created_at", dayStart),
      supabase
        .from("appeals")
        .select("id, violations!inner(employee_id)", { count: "exact", head: true })
        .eq("decision", "pending"),
    ]);

  const wps = workplaces ?? [];
  const selectedId = w && wps.some((x) => x.id === w) ? w : wps[0]?.id;
  const selected = wps.find((x) => x.id === selectedId);

  const wpEmployees = (employees ?? []).filter((e) => e.workplace_id === selectedId);
  const wpEntries = (entries ?? []).filter((e) => e.workplace_id === selectedId); // ascending

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-KE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

  const STATUS_RANK: Record<string, number> = { normal: 0, adjusted: 1, late: 2, flagged: 3 };

  // Per-employee attendance for today: first clock-in, last clock-out, worst status, flags.
  interface Att {
    inAt: string | null;
    outAt: string | null;
    status: string;
    flags: string[];
    scans: number;
  }
  const attByEmp = new Map<string, Att>();
  for (const e of wpEntries) {
    const a = attByEmp.get(e.employee_id) ?? { inAt: null, outAt: null, status: "normal", flags: [], scans: 0 };
    a.scans += 1;
    if (e.direction === "out") a.outAt = e.scanned_at; // ascending → last wins
    else if (!a.inAt) a.inAt = e.scanned_at; // first 'in' wins
    if ((STATUS_RANK[e.status] ?? 0) > (STATUS_RANK[a.status] ?? 0)) a.status = e.status;
    if (Array.isArray(e.flags)) for (const f of e.flags as string[]) if (!a.flags.includes(f)) a.flags.push(f);
    attByEmp.set(e.employee_id, a);
  }

  // Today's violations grouped by employee (for the "violated → penalties" link).
  const violByEmp = new Map<string, { id: string; reason: string; amount: number }[]>();
  for (const v of violations ?? []) {
    const list = violByEmp.get(v.employee_id) ?? [];
    list.push({ id: v.id, reason: v.reason, amount: Number(v.amount) });
    violByEmp.set(v.employee_id, list);
  }

  const clockedInIds = new Set(attByEmp.keys());
  const absent = wpEmployees.filter((e) => !clockedInIds.has(e.id));

  // Sort: still-in first, then out, then absent — each alphabetical.
  const roster = [...wpEmployees].sort((a, b) => a.name.localeCompare(b.name));

  const stats = [
    { label: "Clocked in", value: clockedInIds.size, tone: "text-kaunta-sage" },
    { label: "Late", value: [...attByEmp.values()].filter((a) => a.status === "late").length, tone: "text-kaunta-amber" },
    { label: "Absent", value: absent.length, tone: "text-kaunta-slate" },
    { label: "Flagged", value: [...attByEmp.values()].filter((a) => a.status === "flagged").length, tone: "text-kaunta-red" },
  ];

  const STATUS_BADGE: Record<string, string> = {
    normal: "bg-kaunta-sage-lt text-kaunta-sage",
    late: "bg-kaunta-amber/15 text-kaunta-amber",
    flagged: "bg-kaunta-red/10 text-kaunta-red",
    adjusted: "bg-kaunta-slate/10 text-kaunta-slate",
  };

  return (
    <main className="min-h-screen bg-kaunta-stone">
      <header className="border-b border-kaunta-mist bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-display text-2xl text-kaunta-ink">{org.name}</span>
          <div className="flex items-center gap-3">
            {(pendingAppeals ?? 0) > 0 && (
              <Link
                href="/dashboard/violations"
                className="rounded-full bg-kaunta-copper/10 px-3 py-1 text-sm text-kaunta-copper hover:bg-kaunta-copper/20"
              >
                {pendingAppeals} pending appeal{pendingAppeals === 1 ? "" : "s"}
              </Link>
            )}
            <span className="text-sm text-kaunta-slate/70 hidden sm:inline">{user.email}</span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Workplace switcher */}
        {wps.length > 0 && (
          <div className="flex gap-1 overflow-x-auto">
            {wps.map((x) => (
              <Link
                key={x.id}
                href={`/dashboard?w=${x.id}`}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${
                  x.id === selectedId
                    ? "bg-kaunta-ink text-white"
                    : "bg-white text-kaunta-slate/70 border border-kaunta-mist hover:bg-kaunta-mist/40"
                }`}
              >
                {x.name}
              </Link>
            ))}
          </div>
        )}

        {selected ? (
          <>
            {/* Live stats */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-[12px] border border-kaunta-mist bg-white p-5 shadow-[0_2px_16px_rgba(15,25,35,0.06)]"
                >
                  <p className={`font-display text-4xl tabular-nums ${s.tone}`}>{s.value}</p>
                  <p className="text-sm text-kaunta-slate/60 mt-1">{s.label}</p>
                </div>
              ))}
            </section>

            {/* Attendance today — per employee, expandable */}
            <section className="rounded-[12px] border border-kaunta-mist bg-white overflow-hidden">
              <h2 className="font-display text-xl text-kaunta-ink px-6 pt-6 pb-2">Attendance today</h2>
              {roster.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-kaunta-slate/60">No employees assigned to this workplace yet.</p>
              ) : (
                <ul className="divide-y divide-kaunta-mist/70">
                  {roster.map((e) => {
                    const a = attByEmp.get(e.id);
                    const viols = violByEmp.get(e.id) ?? [];
                    const clockedIn = !!a;
                    const stillIn = !!a && !a.outAt;
                    return (
                      <li key={e.id}>
                        <details className="group">
                          <summary className="flex items-center justify-between gap-3 px-6 py-4 cursor-pointer list-none hover:bg-kaunta-stone/60">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-kaunta-ink truncate">{e.name}</p>
                              <p className="text-xs text-kaunta-slate/60 mt-0.5">
                                {clockedIn
                                  ? `In ${a!.inAt ? fmtTime(a!.inAt) : "—"} · Out ${a!.outAt ? fmtTime(a!.outAt) : "—"}`
                                  : "Not clocked in"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {viols.length > 0 && (
                                <span className="rounded-full bg-kaunta-red/10 px-2 py-0.5 text-xs text-kaunta-red">
                                  {viols.length} penalt{viols.length === 1 ? "y" : "ies"}
                                </span>
                              )}
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs ${
                                  clockedIn
                                    ? stillIn
                                      ? STATUS_BADGE[a!.status] ?? STATUS_BADGE.normal
                                      : "bg-kaunta-mist text-kaunta-slate"
                                    : "bg-kaunta-stone text-kaunta-slate/60 border border-kaunta-mist"
                                }`}
                              >
                                {clockedIn ? (stillIn ? "On site" : "Left") : "Absent"}
                              </span>
                              <span className="text-kaunta-slate/40 text-xs transition-transform group-open:rotate-90">▸</span>
                            </div>
                          </summary>
                          <div className="px-6 pb-4 -mt-1 text-sm text-kaunta-slate/70 space-y-1">
                            <p>Clock in: <span className="text-kaunta-ink">{a?.inAt ? fmtTime(a.inAt) : "—"}</span></p>
                            <p>Clock out: <span className="text-kaunta-ink">{a?.outAt ? fmtTime(a.outAt) : (clockedIn ? "still on site" : "—")}</span></p>
                            {a && a.status !== "normal" && (
                              <p>Status: <span className="capitalize text-kaunta-ink">{a.status}</span></p>
                            )}
                            {a && a.flags.length > 0 && (
                              <p className="text-kaunta-red">Flags: {a.flags.join(", ")}</p>
                            )}
                            {viols.length > 0 && (
                              <div className="pt-1">
                                {viols.map((v) => (
                                  <p key={v.id} className="text-kaunta-ink">
                                    ⚠ {v.reason} — KES {v.amount}
                                  </p>
                                ))}
                                <Link
                                  href="/dashboard/violations"
                                  className="inline-block mt-1 text-kaunta-copper hover:underline text-xs"
                                >
                                  Open in Penalties →
                                </Link>
                              </div>
                            )}
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <div className="rounded-[12px] border border-kaunta-mist bg-white p-8">
            <p className="text-kaunta-slate/70">
              No workplaces yet.{" "}
              <Link href="/dashboard/workplaces" className="text-kaunta-copper hover:underline">
                Add one
              </Link>{" "}
              to start tracking attendance.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
