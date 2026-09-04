"use client";

/**
 * The answer to "who was in last Tuesday", which nothing in the product could
 * give before this.
 *
 * Two modes, deliberately not three. A range — any range, including today —
 * because that is the question people actually have. And closed periods, which
 * are a different kind of object: a document you file and compare, rather than
 * a query you run. The picker only ever offers periods that have finished, so
 * nothing here can refuse you after you have clicked it.
 *
 * The layout puts sites above people. An owner with four branches wants to know
 * which branch, and only then which person; leading with a forty-row employee
 * table makes them do the grouping in their head.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Totals {
  headcount: number;
  daysPresent: number;
  daysLate: number;
  daysAbsent: number;
  leaveDays: number;
  checksConfirmed: number;
  checksMissed: number;
  penalties: number;
  penaltyTotal: number;
  closedDays: number;
}
interface SiteLine {
  workplaceId: string | null;
  name: string;
  headcount: number;
  daysPresent: number;
  daysLate: number;
  daysAbsent: number;
  leaveDays: number;
  checksMissed: number;
  closedDays: number;
}
interface EmployeeLine {
  employeeId: string;
  name: string;
  daysPresent: number;
  daysLate: number;
  daysAbsent: number;
  leaveDays: number;
  checksMissed: number;
  penalties: number;
  penaltyTotal: number;
}
interface Report {
  range: { from: string; to: string };
  periodComplete: boolean;
  workingDays: number;
  totals: Totals;
  sites: SiteLine[];
  employees: EmployeeLine[];
}
interface Period {
  kind: string;
  key: string;
  label: string;
  from: string;
  to: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const kes = (n: number) => `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
const fmtDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

function ReportsView() {
  // The short link in the daily digest lands here with a range already chosen,
  // so following it from a text message opens the day it was about rather than
  // a default week the reader then has to correct.
  const search = useSearchParams();
  const linkedFrom = search.get("from");
  const linkedTo = search.get("to");

  const [from, setFrom] = useState(linkedFrom ?? daysAgo(7));
  const [to, setTo] = useState(linkedTo ?? daysAgo(1));
  const [report, setReport] = useState<Report | null>(null);
  const [periods, setPeriods] = useState<{ months: Period[]; years: Period[] } | null>(null);
  const [activePeriod, setActivePeriod] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = useCallback(async () => {
    const { data } = await createClient().auth.getSession();
    return data.session?.access_token ?? "";
  }, []);

  const loadRange = useCallback(
    async (f: string, t: string) => {
      setLoading(true);
      setError(null);
      setActivePeriod(null);
      try {
        const r = await api<{ report: Report }>(`/api/reports/range?from=${f}&to=${t}`, {
          token: await token(),
        });
        setReport(r.report);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const loadPeriod = useCallback(
    async (kind: "month" | "year", key: string) => {
      setLoading(true);
      setError(null);
      try {
        const r = await api<{ report: Report }>(`/api/reports/${kind}/${key}`, { token: await token() });
        setReport(r.report);
        setActivePeriod(key);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    (async () => {
      try {
        const p = await api<{ months: Period[]; years: Period[] }>("/api/reports/periods", {
          token: await token(),
        });
        setPeriods(p);
      } catch {
        /* the range still works without the period list */
      }
    })();
    void loadRange(linkedFrom ?? daysAgo(7), linkedTo ?? daysAgo(1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div>
        <h1 className="font-display text-3xl text-aproksi-ink mb-1">Reports</h1>
        <p className="text-sm text-aproksi-slate/70">
          Every site and every person over any stretch of days. Months and years appear here once
          they have finished.
        </p>
      </div>

      {/* ── Pick a range ─────────────────────────────────────────── */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-aproksi-slate/70">
            From
            <input
              type="date"
              value={from}
              max={today()}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-aproksi-mist px-3 py-2 text-sm text-aproksi-ink focus:border-aproksi-ultra focus:outline-none"
            />
          </label>
          <label className="text-xs text-aproksi-slate/70">
            To
            <input
              type="date"
              value={to}
              max={today()}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg border border-aproksi-mist px-3 py-2 text-sm text-aproksi-ink focus:border-aproksi-ultra focus:outline-none"
            />
          </label>
          <Button onClick={() => loadRange(from, to)} disabled={loading}>
            {loading ? "Working…" : "Show"}
          </Button>
        </div>

        {/* The three questions people actually ask, one tap each. */}
        <div className="flex flex-wrap gap-2 border-t border-aproksi-mist pt-3">
          {[
            { label: "Yesterday", f: daysAgo(1), t: daysAgo(1) },
            { label: "Last 7 days", f: daysAgo(7), t: daysAgo(1) },
            { label: "Last 30 days", f: daysAgo(30), t: daysAgo(1) },
          ].map((q) => (
            <button
              key={q.label}
              onClick={() => {
                setFrom(q.f);
                setTo(q.t);
                void loadRange(q.f, q.t);
              }}
              className="rounded-full border border-aproksi-mist px-3 py-1.5 text-xs text-aproksi-slate transition-colors hover:border-aproksi-ultra/40 hover:text-aproksi-ultra"
            >
              {q.label}
            </button>
          ))}
        </div>

        {(periods?.months.length ?? 0) > 0 && (
          <div className="space-y-2 border-t border-aproksi-mist pt-3">
            <p className="text-xs text-aproksi-slate/60">
              Finished periods — these are stable, so they can be compared with each other.
            </p>
            <div className="flex flex-wrap gap-2">
              {periods!.months.slice(0, 12).map((m) => (
                <button
                  key={m.key}
                  onClick={() => loadPeriod("month", m.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    activePeriod === m.key
                      ? "border-aproksi-ultra bg-aproksi-ultra/5 text-aproksi-ultra"
                      : "border-aproksi-mist text-aproksi-slate hover:border-aproksi-ultra/40"
                  }`}
                >
                  {m.label}
                </button>
              ))}
              {periods!.years.map((y) => (
                <button
                  key={y.key}
                  onClick={() => loadPeriod("year", y.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    activePeriod === y.key
                      ? "border-aproksi-ultra bg-aproksi-ultra/5 text-aproksi-ultra"
                      : "border-aproksi-mist text-aproksi-slate hover:border-aproksi-ultra/40"
                  }`}
                >
                  {y.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-aproksi-red">{error}</p>}

      {report && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl text-aproksi-ink">
              {fmtDay(report.range.from)}
              {report.range.from !== report.range.to && ` to ${fmtDay(report.range.to)}`}
            </h2>
            <span className="text-xs text-aproksi-slate/60">
              {report.workingDays} day{report.workingDays === 1 ? "" : "s"} ·{" "}
              {report.totals.headcount} on the roster
            </span>
          </div>

          {/* An open range is not comparable with a closed one. Saying so is
              cheaper than letting somebody read half a month as an improvement. */}
          {!report.periodComplete && (
            <p className="rounded-lg bg-aproksi-amber/10 px-4 py-2.5 text-xs text-aproksi-amber">
              This range includes days that are still running, so scans are still arriving. Compare
              it with finished periods carefully.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { k: "In", v: report.totals.daysPresent, tone: "text-aproksi-sage" },
              { k: "Late", v: report.totals.daysLate, tone: "text-aproksi-amber" },
              { k: "Absent", v: report.totals.daysAbsent, tone: "text-aproksi-red" },
              { k: "On leave", v: report.totals.leaveDays, tone: "text-aproksi-ultra" },
              { k: "Checks missed", v: report.totals.checksMissed, tone: "text-aproksi-red" },
              { k: "Closed days", v: report.totals.closedDays, tone: "text-aproksi-slate" },
            ].map((c) => (
              <Card key={c.k} className="p-4">
                <p className="text-[0.6875rem] uppercase tracking-wider text-aproksi-slate/50">{c.k}</p>
                <p className={`mt-1 font-display text-2xl tabular-nums ${c.tone}`}>{c.v}</p>
              </Card>
            ))}
          </div>

          {report.totals.penalties > 0 && (
            <p className="text-xs text-aproksi-slate/70">
              {report.totals.penalties} penalt{report.totals.penalties === 1 ? "y" : "ies"} charged,
              totalling {kes(report.totals.penaltyTotal)}.
            </p>
          )}

          {/* Sites first: with four branches, "which branch" comes before
              "which person", and a forty-row table makes you group by eye. */}
          {report.sites.length > 1 && (
            <Card className="overflow-hidden">
              <h3 className="font-display text-lg text-aproksi-ink px-5 pt-5 pb-2">By site</h3>
              <Table
                head={["Site", "People", "In", "Late", "Absent", "Leave", "Checks missed"]}
                rows={report.sites.map((s) => [
                  s.name,
                  s.headcount,
                  s.daysPresent,
                  s.daysLate,
                  s.daysAbsent,
                  s.leaveDays,
                  s.checksMissed,
                ])}
              />
            </Card>
          )}

          <Card className="overflow-hidden">
            <h3 className="font-display text-lg text-aproksi-ink px-5 pt-5 pb-2">By person</h3>
            <Table
              head={["Name", "In", "Late", "Absent", "Leave", "Checks missed", "Charged"]}
              rows={report.employees.map((e) => [
                e.name,
                e.daysPresent,
                e.daysLate,
                e.daysAbsent,
                e.leaveDays,
                e.checksMissed,
                e.penaltyTotal > 0 ? kes(e.penaltyTotal) : "—",
              ])}
            />
          </Card>
        </>
      )}
    </main>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-y border-aproksi-mist bg-aproksi-stone/50">
            {head.map((h, i) => (
              <th
                key={h}
                className={`px-5 py-2.5 text-[0.6875rem] font-medium uppercase tracking-wider text-aproksi-slate/60 ${
                  i === 0 ? "" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-aproksi-mist/60 last:border-0">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={`px-5 py-2.5 ${
                    j === 0 ? "text-aproksi-ink" : "text-right tabular-nums text-aproksi-slate"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * useSearchParams opts a route out of static rendering, and Next refuses to
 * prerender the page without a boundary to fall back to. The fallback is the
 * page frame with an empty state rather than a spinner, so following the link
 * from a text message lands on something that already looks like the report
 * that is arriving.
 */
export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="font-display text-3xl text-aproksi-ink mb-1">Reports</h1>
          <p className="text-sm text-aproksi-slate/60">Loading…</p>
        </main>
      }
    >
      <ReportsView />
    </Suspense>
  );
}
