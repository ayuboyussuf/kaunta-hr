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

  const [{ data: workplaces }, { data: employees }, { data: entries }, { count: pendingAppeals }] =
    await Promise.all([
      supabase.from("workplaces").select("id, name").eq("org_id", org.id).order("created_at"),
      supabase
        .from("employees")
        .select("id, name, status, workplace_id")
        .eq("org_id", org.id)
        .eq("status", "active"),
      supabase
        .from("attendance_entries")
        .select("id, employee_id, workplace_id, scanned_at, status, flags, employee:employees(name)")
        .gte("scanned_at", dayStart)
        .order("scanned_at", { ascending: false }),
      supabase
        .from("appeals")
        .select("id, violations!inner(employee_id)", { count: "exact", head: true })
        .eq("decision", "pending"),
    ]);

  const wps = workplaces ?? [];
  const selectedId = w && wps.some((x) => x.id === w) ? w : wps[0]?.id;
  const selected = wps.find((x) => x.id === selectedId);

  const wpEmployees = (employees ?? []).filter((e) => e.workplace_id === selectedId);
  const wpEntries = (entries ?? []).filter((e) => e.workplace_id === selectedId);

  const clockedInIds = new Set(wpEntries.map((e) => e.employee_id));
  const lateEntries = wpEntries.filter((e) => e.status === "late");
  const flaggedEntries = wpEntries.filter((e) => e.status === "flagged");
  const absent = wpEmployees.filter((e) => !clockedInIds.has(e.id));

  const stats = [
    { label: "Clocked in", value: clockedInIds.size, tone: "text-kaunta-sage" },
    { label: "Late", value: lateEntries.length, tone: "text-kaunta-amber" },
    { label: "Absent", value: absent.length, tone: "text-kaunta-slate" },
    { label: "Flagged", value: flaggedEntries.length, tone: "text-kaunta-red" },
  ];

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

            <div className="grid gap-6 md:grid-cols-2">
              {/* Flagged scans */}
              <section className="rounded-[12px] border border-kaunta-mist bg-white p-6">
                <h2 className="font-display text-xl text-kaunta-ink mb-4">Flagged scans today</h2>
                {flaggedEntries.length === 0 ? (
                  <p className="text-sm text-kaunta-slate/60">No flagged scans.</p>
                ) : (
                  <ul className="space-y-2">
                    {flaggedEntries.map((e) => (
                      <li key={e.id} className="flex items-center justify-between text-sm">
                        <span className="text-kaunta-ink">
                          {(e.employee as { name?: string } | null)?.name ?? "Employee"}
                        </span>
                        <span className="text-xs text-kaunta-red">
                          {Array.isArray(e.flags) ? (e.flags as string[]).join(", ") : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Absent */}
              <section className="rounded-[12px] border border-kaunta-mist bg-white p-6">
                <h2 className="font-display text-xl text-kaunta-ink mb-4">Not clocked in</h2>
                {absent.length === 0 ? (
                  <p className="text-sm text-kaunta-slate/60">Everyone assigned here has clocked in.</p>
                ) : (
                  <ul className="space-y-2">
                    {absent.map((e) => (
                      <li key={e.id} className="text-sm text-kaunta-ink">
                        {e.name}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
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
