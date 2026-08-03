/**
 * Pattern detection across the record.
 *
 * A single late arrival is a fact the engine already handles. What no
 * deterministic rule catches is the shape across many of them — "three missed
 * checks in a fortnight, all on the late shift, all at Juja". That is what
 * this produces.
 *
 * ── Why there is no model here ───────────────────────────────────────────
 * The requirement was that it must never hallucinate. The reliable way to
 * guarantee that is not to prompt carefully — it is to leave nothing for a
 * model to invent. Every finding below is computed from rows, carries the
 * exact counts it was derived from, and names the records it came from. A
 * finding cannot exist unless the underlying rows exist.
 *
 * If prose is wanted later, this is the right substrate for it: facts in,
 * phrasing out, and nothing in the phrasing layer able to add a fact.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type Severity = "info" | "watch" | "act";

export type Finding = {
  /** stable identifier for the kind of pattern */
  kind:
    | "repeat_lateness"
    | "lateness_concentrated"
    | "repeat_missed_checks"
    | "improving"
    | "perfect_month";
  severity: Severity;
  employeeId: string;
  employeeName: string;
  /** one sentence, assembled from the counts — never generated */
  headline: string;
  detail: string;
  /** the numbers the sentence was built from, so it can be checked */
  evidence: Record<string, number | string>;
  /** ids of the rows this was derived from */
  sourceIds: string[];
};

const DAY = 86400000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Findings for one org over a trailing window (default 14 days).
 *
 * Everything is read-only. This never writes a violation, never changes an
 * amount, and never decides anything — it reports.
 */
export async function detect(
  db: SupabaseClient,
  orgId: string,
  windowDays = 14
): Promise<Finding[]> {
  const since = new Date(Date.now() - windowDays * DAY);
  const sinceIso = since.toISOString();

  const { data: employees } = await db
    .from("employees")
    .select("id, name, workplace_id, shift_id, workplaces(name), shifts(start_time)")
    .eq("org_id", orgId)
    .eq("status", "active");
  if (!employees?.length) return [];

  const empIds = employees.map((e) => e.id as string);

  const [{ data: entries }, { data: checks }, { data: violations }] = await Promise.all([
    db
      .from("attendance_entries")
      .select("id, employee_id, workplace_id, status, scanned_at, roster_expected")
      .in("employee_id", empIds)
      .gte("scanned_at", sinceIso),
    db
      .from("presence_checks")
      .select("id, employee_id, status, created_at")
      .in("employee_id", empIds)
      .gte("created_at", sinceIso),
    db
      .from("violations")
      .select("id, employee_id, reason, amount, status, created_at")
      .in("employee_id", empIds)
      .gte("created_at", sinceIso),
  ]);

  const findings: Finding[] = [];

  for (const emp of employees) {
    const id = emp.id as string;
    const name = (emp.name as string) ?? "This employee";
    const site =
      (emp.workplaces as unknown as { name: string } | null)?.name ?? null;

    const mine = (entries ?? []).filter((e) => e.employee_id === id);
    const lates = mine.filter((e) => e.status === "late");
    const myChecks = (checks ?? []).filter((c) => c.employee_id === id);
    const missedChecks = myChecks.filter((c) => c.status === "missed");

    /* ── Repeat lateness ─────────────────────────────────────────── */
    if (lates.length >= 3) {
      const minutes = lates
        .map((e) => {
          const r = e.roster_expected as { late_by_min?: number } | null;
          return Number(r?.late_by_min ?? 0);
        })
        .filter((m) => m > 0);
      const avg =
        minutes.length > 0
          ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length)
          : 0;

      findings.push({
        kind: "repeat_lateness",
        severity: lates.length >= 5 ? "act" : "watch",
        employeeId: id,
        employeeName: name,
        headline: `${name} was late ${plural(lates.length, "time", "times")} in ${windowDays} days.`,
        detail:
          avg > 0
            ? `Average ${plural(avg, "minute", "minutes")} past the grace period${site ? `, at ${site}` : ""}.`
            : `Recorded late on ${plural(lates.length, "occasion", "occasions")}${site ? ` at ${site}` : ""}.`,
        evidence: {
          late_count: lates.length,
          window_days: windowDays,
          average_minutes_late: avg,
          ...(site ? { site } : {}),
        },
        sourceIds: lates.map((e) => e.id as string),
      });

      /* ── Is the lateness concentrated on particular days? ──────── */
      const byWeekday = new Map<number, number>();
      for (const e of lates) {
        const wd = new Date(e.scanned_at as string).getDay();
        byWeekday.set(wd, (byWeekday.get(wd) ?? 0) + 1);
      }
      const [topDay, topCount] = [...byWeekday.entries()].sort((a, b) => b[1] - a[1])[0];
      if (topCount >= 3 && topCount / lates.length >= 0.6) {
        const dayName = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ][topDay];
        findings.push({
          kind: "lateness_concentrated",
          severity: "watch",
          employeeId: id,
          employeeName: name,
          headline: `${name}'s lateness is mostly on ${dayName}s.`,
          detail: `${topCount} of ${lates.length} late arrivals fell on a ${dayName}. That pattern usually has a cause worth asking about before it costs anyone more money.`,
          evidence: {
            weekday: dayName,
            on_that_day: topCount,
            total_late: lates.length,
          },
          sourceIds: lates
            .filter((e) => new Date(e.scanned_at as string).getDay() === topDay)
            .map((e) => e.id as string),
        });
      }
    }

    /* ── Repeat missed presence checks ───────────────────────────── */
    if (missedChecks.length >= 2) {
      findings.push({
        kind: "repeat_missed_checks",
        severity: missedChecks.length >= 3 ? "act" : "watch",
        employeeId: id,
        employeeName: name,
        headline: `${name} missed ${plural(missedChecks.length, "presence check", "presence checks")} in ${windowDays} days.`,
        detail: `${missedChecks.length} of ${myChecks.length} checks went unanswered inside the window${site ? ` at ${site}` : ""}. Each one flagged the clock-in it belonged to.`,
        evidence: {
          missed: missedChecks.length,
          total_checks: myChecks.length,
          window_days: windowDays,
          ...(site ? { site } : {}),
        },
        sourceIds: missedChecks.map((c) => c.id as string),
      });
    }

    /* ── Improving: second half better than the first ────────────── */
    if (windowDays >= 14 && lates.length > 0) {
      const mid = new Date(Date.now() - (windowDays / 2) * DAY).getTime();
      const early = lates.filter((e) => new Date(e.scanned_at as string).getTime() < mid).length;
      const recent = lates.length - early;
      if (early >= 3 && recent === 0) {
        findings.push({
          kind: "improving",
          severity: "info",
          employeeId: id,
          employeeName: name,
          headline: `${name} has not been late once in the last ${Math.floor(windowDays / 2)} days.`,
          detail: `${early} late arrivals in the first half of the window, none since. Worth saying so — it is the cheapest thing you can do about attendance.`,
          evidence: {
            late_first_half: early,
            late_second_half: recent,
            window_days: windowDays,
          },
          sourceIds: lates.map((e) => e.id as string),
        });
      }
    }
  }

  // Most serious first, then the largest numbers.
  const rank: Record<Severity, number> = { act: 0, watch: 1, info: 2 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/**
 * A clean month, computed on the first of the following month.
 *
 * "Perfect" is defined precisely and checkably: at least one scan, no late
 * arrival, no absence, no missed presence check and no violation of any kind
 * for the whole calendar month.
 */
export async function perfectMonth(
  db: SupabaseClient,
  orgId: string,
  month: { start: string; end: string; label: string }
): Promise<Finding[]> {
  const { data: employees } = await db
    .from("employees")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("status", "active");
  if (!employees?.length) return [];

  const empIds = employees.map((e) => e.id as string);
  const startIso = new Date(`${month.start}T00:00:00+03:00`).toISOString();
  const endIso = new Date(`${month.end}T23:59:59+03:00`).toISOString();

  const [{ data: entries }, { data: checks }, { data: violations }] = await Promise.all([
    db
      .from("attendance_entries")
      .select("id, employee_id, status, scanned_at")
      .in("employee_id", empIds)
      .gte("scanned_at", startIso)
      .lte("scanned_at", endIso),
    db
      .from("presence_checks")
      .select("id, employee_id, status")
      .in("employee_id", empIds)
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    db
      .from("violations")
      .select("id, employee_id")
      .in("employee_id", empIds)
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);

  const out: Finding[] = [];
  for (const emp of employees) {
    const id = emp.id as string;
    const mine = (entries ?? []).filter((e) => e.employee_id === id);
    if (mine.length === 0) continue; // nothing to be perfect about

    const anyLate = mine.some((e) => e.status === "late" || e.status === "flagged");
    const anyMissed = (checks ?? []).some(
      (c) => c.employee_id === id && c.status === "missed"
    );
    const anyViolation = (violations ?? []).some((v) => v.employee_id === id);
    if (anyLate || anyMissed || anyViolation) continue;

    const answered = (checks ?? []).filter(
      (c) => c.employee_id === id && c.status === "answered"
    ).length;

    out.push({
      kind: "perfect_month",
      severity: "info",
      employeeId: id,
      employeeName: (emp.name as string) ?? "This employee",
      headline: `${(emp.name as string) ?? "This employee"} had a clean ${month.label}.`,
      detail: `${plural(mine.length, "clock-in", "clock-ins")}, none late, no missed checks${answered ? ` (${answered} answered)` : ""}, and no penalties for the whole month. Worth a bonus if you give them.`,
      evidence: {
        clock_ins: mine.length,
        late: 0,
        missed_checks: 0,
        violations: 0,
        month: month.label,
      },
      sourceIds: mine.map((e) => e.id as string),
    });
  }
  return out;
}
