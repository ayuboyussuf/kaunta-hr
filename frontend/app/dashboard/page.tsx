import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SelfieThumb from "@/components/SelfieThumb";
import { InsightsPanel } from "@/components/InsightsPanel";
import { AttentionQueue, type AttentionItem } from "@/components/dashboard/AttentionQueue";
import { ArrivalsRail } from "@/components/dashboard/ArrivalsRail";
import { CheckNowButton } from "@/components/dashboard/CheckNowButton";

/**
 * Owner live dashboard + hub (spec §9). Shows, per workplace, who's clocked in /
 * late / absent today plus flagged scans and the pending-appeals queue, with a
 * workplace switcher (?w=) and links out to every management section. Reads run
 * as the owner's Supabase session (RLS scopes them to the owner's org).
 */

const TZ = "Africa/Nairobi";

/** "YYYY-MM-DD" for today in Nairobi. */
function nairobiDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** An ISO instant N days back. Wrapped so the clock read is not in the render body. */
function daysAgoISO(days: number): string {
  return new Date(new Date().getTime() - days * 864e5).toISOString();
}

/** Start of "today" in Nairobi (UTC+3, no DST) as an ISO instant. */
function nairobiDayStartISO(): string {
  return new Date(`${nairobiDate()}T00:00:00+03:00`).toISOString();
}

interface PageProps {
  searchParams: Promise<{ w?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const { w } = await searchParams;
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? "";
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
  const today = nairobiDate();

  const [
    { data: workplaces },
    { data: employees },
    { data: entries },
    { data: violations },
    { count: pendingAppeals },
    { data: leaveToday },
    { count: pendingLeave },
    { count: undelivered },
    { data: shifts },
  ] = await Promise.all([
      supabase.from("workplaces").select("id, name").eq("org_id", org.id).order("created_at"),
      supabase
        .from("employees")
        .select("id, name, status, workplace_id")
        .eq("org_id", org.id)
        .eq("status", "active"),
      supabase
        .from("attendance_entries")
        .select("id, employee_id, workplace_id, scanned_at, status, direction, flags, selfie_path")
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
      // Days the owner has already signed off. Someone on approved leave is not
      // absent — showing them in the absent column is how a signed-off day ends
      // up being chased.
      supabase
        .from("leave_requests")
        .select("employee_id, paid, half_day, start_date, end_date")
        .eq("org_id", org.id)
        .eq("status", "approved")
        .lte("start_date", today)
        .gte("end_date", today),
      // Leave the owner has not answered yet.
      supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.id)
        .eq("status", "pending"),
      // Penalties whose notice never reached the employee. `notice_tracked`
      // matters: rows raised before delivery was recorded have a null
      // notified_at because nothing was watching, not because anything failed,
      // and counting those turned a live dashboard into nine red accusations
      // about sends that were never observed.
      supabase
        .from("violations")
        .select("id, employees!inner(org_id)", { count: "exact", head: true })
        .eq("employees.org_id", org.id)
        .is("notified_at", null)
        .eq("notice_tracked", true)
        .gte("created_at", daysAgoISO(30)),
      // Shift starts, for the arrivals rail.
      supabase.from("shifts").select("workplace_id, start_time, grace_minutes").order("start_time"),
    ]);

  const wps = workplaces ?? [];
  const selectedId = w && wps.some((x) => x.id === w) ? w : wps[0]?.id;
  const selected = wps.find((x) => x.id === selectedId);

  const wpEmployees = (employees ?? []).filter((e) => e.workplace_id === selectedId);
  const wpEntries = (entries ?? []).filter((e) => e.workplace_id === selectedId); // ascending

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-KE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

  const leaveByEmp = new Map<string, { paid: boolean | null; half_day: string | null }>();
  for (const l of leaveToday ?? []) {
    leaveByEmp.set(l.employee_id, { paid: l.paid, half_day: l.half_day ?? null });
  }

  const STATUS_RANK: Record<string, number> = { normal: 0, on_leave: 0, adjusted: 1, late: 2, flagged: 3 };

  // Per-employee attendance for today: first clock-in, last clock-out, worst status, flags.
  interface Att {
    inAt: string | null;
    outAt: string | null;
    inSelfieId: string | null; // attendance entry id of the clock-IN (for the selfie)
    outSelfieId: string | null; // attendance entry id of the last clock-OUT
    status: string;
    flags: string[];
    scans: number;
    checks: number;
  }
  const attByEmp = new Map<string, Att>();
  for (const e of wpEntries) {
    const a =
      attByEmp.get(e.employee_id) ??
      { inAt: null, outAt: null, inSelfieId: null, outSelfieId: null, status: "normal", flags: [], scans: 0, checks: 0 };
    a.scans += 1;
    // A presence-check scan is neither an arrival nor a departure. Counting it
    // as one would show somebody as having clocked in when they answered a
    // check, or left when they proved they were there.
    if (e.direction === "check") {
      a.checks += 1;
    } else if (e.direction === "out") {
      a.outAt = e.scanned_at; // ascending → last wins
      if (e.selfie_path) a.outSelfieId = e.id;
    } else if (!a.inAt) {
      a.inAt = e.scanned_at; // first 'in' wins
      if (e.selfie_path) a.inSelfieId = e.id;
    }
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
  // Absent means unaccounted for. A day the owner approved is accounted for.
  const onLeave = wpEmployees.filter((e) => leaveByEmp.has(e.id));
  const absent = wpEmployees.filter((e) => !clockedInIds.has(e.id) && !leaveByEmp.has(e.id));

  // Sort: still-in first, then out, then absent — each alphabetical.
  const roster = [...wpEmployees].sort((a, b) => a.name.localeCompare(b.name));

  /* Four, always. A stat row whose length changes with the data produces a
   * ragged grid and a divider running under an empty cell — which is exactly
   * what "on leave" appearing as a fifth headline did. */
  const stats = [
    { label: "In", value: clockedInIds.size, tone: "text-kaunta-sage" },
    { label: "Late", value: [...attByEmp.values()].filter((a) => a.status === "late").length, tone: "text-kaunta-amber" },
    { label: "Absent", value: absent.length, tone: "text-kaunta-slate" },
    { label: "Flagged", value: [...attByEmp.values()].filter((a) => a.status === "flagged").length, tone: "text-kaunta-red" },
  ];

  // What actually wants the owner's attention, most costly first. Renders
  // nothing when there is nothing — see components/dashboard/AttentionQueue.
  const attention: AttentionItem[] = [
    {
      count: pendingAppeals ?? 0,
      label: "Appeals to decide",
      detail: "Kaunta has already checked each one against the record.",
      href: "/dashboard/violations",
      tone: "urgent",
    },
    {
      count: pendingLeave ?? 0,
      label: "Leave requests",
      detail: "Approve as paid or unpaid, or decline.",
      href: "/dashboard/leave",
      tone: "normal",
    },
    {
      count: undelivered ?? 0,
      label: "Penalties nobody received",
      detail: "Fix the number and resend, or mark them unreachable.",
      href: "/dashboard/violations?status=undelivered",
      tone: "urgent",
    },
  ];

  // The earliest shift at this site anchors the rail.
  const siteShifts = (shifts ?? []).filter((sh) => sh.workplace_id === selectedId);
  const railStart = siteShifts[0]?.start_time?.slice(0, 5) ?? null;
  const railGrace = Number(siteShifts[0]?.grace_minutes ?? 0);
  const arrivals = roster
    .map((e) => {
      const a = attByEmp.get(e.id);
      return a?.inAt ? { employeeId: e.id, name: e.name, at: a.inAt, status: a.status } : null;
    })
    .filter((x): x is { employeeId: string; name: string; at: string; status: string } => x !== null);

  const STATUS_BADGE: Record<string, string> = {
    normal: "bg-kaunta-sage-lt text-kaunta-sage",
    late: "bg-kaunta-amber/15 text-kaunta-amber",
    flagged: "bg-kaunta-red/10 text-kaunta-red",
    adjusted: "bg-kaunta-slate/10 text-kaunta-slate",
    on_leave: "bg-kaunta-ultra/10 text-kaunta-ultra",
  };

  return (
    <main className="min-h-screen bg-kaunta-stone">
      <header className="border-b border-kaunta-mist bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-display text-2xl text-kaunta-ink">{org.name}</span>
          <span className="hidden text-sm text-kaunta-slate/70 sm:inline">{user.email}</span>
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
            <AttentionQueue items={attention} />
            {/* Live stats */}
            {/* Always exactly four cells, so the grid is a clean 2x2 at 375px
                and a single row on desktop. The fifth and sixth stats used to
                be crammed in here, which left a ragged half-empty row and a
                divider running under nothing. Leave and headcount are context,
                not headline numbers, so they sit on the caption line below. */}
            <section aria-label="Today at this site" className="space-y-2">
              <div className="grid grid-cols-2 overflow-hidden rounded-[12px] border border-kaunta-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.06)] sm:grid-cols-4">
                {stats.map((s, i) => (
                  <div
                    key={s.label}
                    className={[
                      "px-5 py-4",
                      // Interior hairlines only — never one along an outer edge.
                      i % 2 === 0 ? "border-r border-kaunta-mist" : "",
                      i < 2 ? "border-b border-kaunta-mist" : "",
                      "sm:border-b-0 sm:border-r sm:last:border-r-0",
                    ].join(" ")}
                  >
                    <p
                      className={`font-display text-3xl tabular-nums ${
                        s.value === 0 ? "text-kaunta-slate/25" : s.tone
                      }`}
                    >
                      {s.value}
                    </p>
                    <p className="mt-0.5 text-xs uppercase tracking-wide text-kaunta-slate/55">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
              <p className="px-1 text-xs text-kaunta-slate/60">
                {roster.length} on the books at {selected.name}
                {onLeave.length > 0 && ` · ${onLeave.length} on approved leave`}
              </p>
            </section>

            <ArrivalsRail arrivals={arrivals} shiftStart={railStart} graceMinutes={railGrace} />

            {/* Patterns across the record — deterministic, never inferred. */}
            {accessToken && <InsightsPanel token={accessToken} />}

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
                    const leave = leaveByEmp.get(e.id);
                    return (
                      <li key={e.id}>
                        <details className="group">
                          <summary className="flex items-center justify-between gap-3 px-6 py-4 cursor-pointer list-none hover:bg-kaunta-stone/60">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-kaunta-ink truncate">{e.name}</p>
                              <p className="text-xs text-kaunta-slate/60 mt-0.5">
                                {clockedIn
                                  ? `In ${a!.inAt ? fmtTime(a!.inAt) : "—"} · Out ${a!.outAt ? fmtTime(a!.outAt) : "—"}`
                                  : leave
                                    ? `Approved leave${leave.half_day ? ` (${leave.half_day} only)` : ""} · ${leave.paid ? "paid" : "unpaid"}`
                                    : "Not clocked in"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {viols.length > 0 && (
                                <span className="rounded-full bg-kaunta-red/10 px-2 py-0.5 text-xs text-kaunta-red">
                                  {viols.length} penalt{viols.length === 1 ? "y" : "ies"}
                                </span>
                              )}
                              {leave && clockedIn && (
                                <span className="rounded-full bg-kaunta-ultra/10 px-2 py-0.5 text-xs text-kaunta-ultra">
                                  On leave
                                </span>
                              )}
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs ${
                                  clockedIn
                                    ? stillIn
                                      ? STATUS_BADGE[a!.status] ?? STATUS_BADGE.normal
                                      : "bg-kaunta-mist text-kaunta-slate"
                                    : leave
                                      ? STATUS_BADGE.on_leave
                                      : "bg-kaunta-stone text-kaunta-slate/60 border border-kaunta-mist"
                                }`}
                              >
                                {clockedIn ? (stillIn ? "On site" : "Left") : leave ? "On leave" : "Absent"}
                              </span>
                              <span className="text-kaunta-slate/40 text-xs transition-transform group-open:rotate-90">▸</span>
                            </div>
                          </summary>
                          <div className="px-6 pb-4 -mt-1 text-sm text-kaunta-slate/70 space-y-1">
                            {leave && (
                              <p className="text-kaunta-ultra">
                                On approved leave today
                                {leave.half_day ? ` — ${leave.half_day} only` : ""} (
                                {leave.paid ? "paid" : "unpaid"}).
                                {clockedIn
                                  ? " They scanned anyway — the day is not counted late and carries no penalty."
                                  : " Not counted absent, and no penalty applies."}{" "}
                                <Link href="/dashboard/leave" className="underline">
                                  Leave
                                </Link>
                              </p>
                            )}
                            <p>Clock in: <span className="text-kaunta-ink">{a?.inAt ? fmtTime(a.inAt) : "—"}</span></p>
                            <p>Clock out: <span className="text-kaunta-ink">{a?.outAt ? fmtTime(a.outAt) : (clockedIn ? "still on site" : "—")}</span></p>
                            {a && (a.inSelfieId || a.outSelfieId) && (
                              <div className="flex items-center gap-3 pt-1">
                                {a.inSelfieId && <SelfieThumb entryId={a.inSelfieId} label="clock-in" />}
                                {a.outSelfieId && <SelfieThumb entryId={a.outSelfieId} label="clock-out" />}
                              </div>
                            )}
                            {a && a.checks > 0 && (
                              <p className="text-kaunta-sage">
                                Answered {a.checks} presence check{a.checks === 1 ? "" : "s"} today.
                              </p>
                            )}
                            {a && a.status !== "normal" && (
                              <p>Status: <span className="capitalize text-kaunta-ink">{a.status}</span></p>
                            )}
                            {a && a.flags.length > 0 && (
                              <p className="text-kaunta-red">Flags: {a.flags.join(", ")}</p>
                            )}
                            {/* The other half of presence checks: the schedule
                                draws the random ones, this is the owner asking
                                about one person, now. */}
                            <div className="pt-2">
                              <CheckNowButton
                                employeeId={e.id}
                                name={e.name}
                                clockedIn={stillIn}
                              />
                            </div>
                            {viols.length > 0 && (
                              <div className="pt-1">
                                {viols.map((v) => (
                                  <p key={v.id} className="text-kaunta-ink">
                                    ⚠ {v.reason} — KES {v.amount}
                                  </p>
                                ))}
                                <Link
                                  href="/dashboard/violations"
                                  className="inline-block mt-1 text-kaunta-ultra hover:underline text-xs"
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
              <Link href="/dashboard/workplaces" className="text-kaunta-ultra hover:underline">
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
