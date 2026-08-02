"use client";

/**
 * Month calendar of attendance, colour-coded per day. Used on both the employer
 * Team drawer and the employee History page. Employer passes `onSelectDay` to
 * open a day's scans (with selfies); the employee view omits it (no selfies).
 *
 * Day states (worst-wins): flagged > late > present; a scheduled work day with
 * no scan (within employment, not in the future) is "absent". A missed presence
 * check that day adds a small dot.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface CalEntry {
  scanned_at: string;
  status: string; // normal | late | flagged | adjusted
  direction?: string;
}
export interface CalCheck {
  due_at: string;
  status: string; // pending | confirmed | missed
}

const TZ = "Africa/Nairobi";
const ymdInTz = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const todayYmd = () => ymdInTz(new Date().toISOString());

type DayState = "present" | "late" | "flagged" | "absent" | "off" | "future";

const STATE_STYLE: Record<DayState, string> = {
  present: "bg-kaunta-sage/20 text-kaunta-sage",
  late: "bg-kaunta-amber/20 text-kaunta-amber",
  flagged: "bg-kaunta-red/15 text-kaunta-red",
  absent: "bg-kaunta-red/5 text-kaunta-red/70 ring-1 ring-inset ring-kaunta-red/30",
  off: "text-kaunta-slate/40",
  future: "text-kaunta-slate/20",
};

const LEGEND: { label: string; cls: string }[] = [
  { label: "On site", cls: "bg-kaunta-sage/20" },
  { label: "Late", cls: "bg-kaunta-amber/20" },
  { label: "Flagged", cls: "bg-kaunta-red/15" },
  { label: "Absent", cls: "bg-kaunta-red/5 ring-1 ring-inset ring-kaunta-red/30" },
];

export default function AttendanceCalendar({
  entries,
  checks = [],
  scheduledDays = [],
  employmentStart,
  monthsBack = 6,
  onSelectDay,
  onMonthChange,
}: {
  entries: CalEntry[];
  checks?: CalCheck[];
  scheduledDays?: number[]; // 0=Sun..6=Sat
  employmentStart?: string | null; // YYYY-MM-DD; days before this aren't "absent"
  monthsBack?: number;
  onSelectDay?: (ymd: string) => void;
  onMonthChange?: (monthKey: string) => void; // "YYYY-MM"
}) {
  // Current view month (1st). Start on the latest month with data, else now.
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Bucket entries + missed checks by Nairobi day.
  const byDay = useMemo(() => {
    const m = new Map<string, CalEntry[]>();
    for (const e of entries) {
      const d = ymdInTz(e.scanned_at);
      (m.get(d) ?? m.set(d, []).get(d)!).push(e);
    }
    return m;
  }, [entries]);
  const missedByDay = useMemo(() => {
    const s = new Set<string>();
    for (const c of checks) if (c.status === "missed") s.add(ymdInTz(c.due_at));
    return s;
  }, [checks]);

  const today = todayYmd();
  const year = cursor.getFullYear();
  const month = cursor.getMonth(); // 0-based
  const monthLabel = cursor.toLocaleDateString("en-KE", { month: "long", year: "numeric" });
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  useEffect(() => {
    onMonthChange?.(monthKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  // Build the grid: leading blanks for the 1st's weekday, then each day.
  const firstWeekday = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  function dayState(ymd: string, weekday: number): DayState {
    if (ymd > today) return "future";
    const dayEntries = byDay.get(ymd);
    if (dayEntries && dayEntries.length) {
      if (dayEntries.some((e) => e.status === "flagged")) return "flagged";
      if (dayEntries.some((e) => e.status === "late")) return "late";
      return "present";
    }
    const scheduled = scheduledDays.includes(weekday);
    const afterStart = !employmentStart || ymd >= employmentStart;
    if (scheduled && afterStart) return "absent";
    return "off";
  }

  // Bound navigation: no further forward than the current month; back a few months.
  const now = new Date();
  const atCurrent = year === now.getFullYear() && month === now.getMonth();
  const minCursor = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const atMin = cursor <= minCursor;

  const cells: { ymd: string; day: number; weekday: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ ymd, day: d, weekday: new Date(year, month, d).getDay() });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          disabled={atMin}
          className="p-1 text-kaunta-slate/60 hover:text-kaunta-ink disabled:opacity-30"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-kaunta-ink">{monthLabel}</span>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          disabled={atCurrent}
          className="p-1 text-kaunta-slate/60 hover:text-kaunta-ink disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-[10px] text-kaunta-slate/50 py-1">{d}</div>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => <div key={`b${i}`} />)}
        {cells.map((c) => {
          const st = dayState(c.ymd, c.weekday);
          const clickable = !!onSelectDay && !!byDay.get(c.ymd)?.length;
          return (
            <button
              key={c.ymd}
              type="button"
              onClick={clickable ? () => onSelectDay!(c.ymd) : undefined}
              className={`relative aspect-square rounded-md text-xs flex items-center justify-center ${STATE_STYLE[st]} ${clickable ? "hover:ring-1 hover:ring-kaunta-copper cursor-pointer" : "cursor-default"}`}
            >
              {c.day}
              {missedByDay.has(c.ymd) && (
                <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-kaunta-red" title="Missed presence check" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1 text-[11px] text-kaunta-slate/60">
            <span className={`h-3 w-3 rounded ${l.cls}`} /> {l.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-[11px] text-kaunta-slate/60">
          <span className="h-1.5 w-1.5 rounded-full bg-kaunta-red" /> Missed check
        </span>
      </div>
    </div>
  );
}
