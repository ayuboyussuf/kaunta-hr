"use client";

/**
 * Month calendar of attendance, colour-coded per day. Used on both the employer
 * Team drawer and the employee History page. Employer passes `onSelectDay` to
 * open a day's scans (with selfies); the employee view omits it (no selfies).
 *
 * Day states (worst-wins): flagged > late > present; a scheduled work day with
 * no scan (within employment, not in the future) is "absent". A missed presence
 * check that day adds a small dot.
 *
 * ── Approved leave is not absence ────────────────────────────────────────────
 * It reads as one only if you never tell the calendar about leave, which is
 * precisely what happened. The engine had been taught not to CHARGE for a
 * signed-off day, and every screen went on ACCUSING people of it: a fortnight
 * the owner personally approved came back as fourteen red squares, on the
 * owner's own screen and on the employee's. The employee could not appeal it,
 * because no penalty existed to appeal — there was just a record calling them
 * absent for a fortnight.
 *
 * So leave is a first-class day state, ranked above absence and below anything
 * derived from a real scan. Somebody who came in anyway on an approved day is
 * shown as present, because they were; the day is not painted over.
 */
import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
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
/** One approved leave day, as returned by the history endpoints. */
export interface CalLeave {
  date: string; // YYYY-MM-DD
  paid: boolean;
  half_day: "morning" | "afternoon" | null;
}

const TZ = "Africa/Nairobi";
// Nairobi calendar date (YYYY-MM-DD) for an instant — used to bucket scans/checks.
const ymdInTz = (iso: string) => DateTime.fromISO(iso).setZone(TZ).toISODate()!;
const todayYmd = () => DateTime.now().setZone(TZ).toISODate()!;

type DayState =
  | "present"
  | "late"
  | "flagged"
  | "leave"
  | "half_leave"
  | "absent"
  | "off"
  | "future";

const STATE_STYLE: Record<DayState, string> = {
  present: "bg-aproksi-sage/20 text-aproksi-sage",
  late: "bg-aproksi-amber/20 text-aproksi-amber",
  flagged: "bg-aproksi-red/15 text-aproksi-red",
  // Ultramarine, not red and not grey: an approved day is neither a failure nor
  // a nothing. It is a decision the owner made, and it should look like one.
  leave: "bg-aproksi-ultra/15 text-aproksi-ultra",
  // A half day is visibly a partial version of the same thing, not a fifth
  // colour to learn: same hue, lighter fill, outlined.
  half_leave: "bg-aproksi-ultra/[0.07] text-aproksi-ultra ring-1 ring-inset ring-aproksi-ultra/40",
  absent: "bg-aproksi-red/5 text-aproksi-red/70 ring-1 ring-inset ring-aproksi-red/30",
  off: "text-aproksi-slate/40",
  future: "text-aproksi-slate/20",
};

const LEGEND: { label: string; cls: string }[] = [
  { label: "On site", cls: "bg-aproksi-sage/20" },
  { label: "Late", cls: "bg-aproksi-amber/20" },
  { label: "Flagged", cls: "bg-aproksi-red/15" },
  { label: "On leave", cls: "bg-aproksi-ultra/15" },
  { label: "Absent", cls: "bg-aproksi-red/5 ring-1 ring-inset ring-aproksi-red/30" },
];

export default function AttendanceCalendar({
  entries,
  checks = [],
  leave = [],
  scheduledDays = [],
  employmentStart,
  monthsBack = 6,
  onSelectDay,
  onMonthChange,
}: {
  entries: CalEntry[];
  checks?: CalCheck[];
  leave?: CalLeave[];
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
  const leaveByDay = useMemo(() => {
    const m = new Map<string, CalLeave>();
    for (const l of leave) m.set(l.date, l);
    return m;
  }, [leave]);
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
    // Leave outranks absence. It is checked after the scan states so that
    // somebody who came in anyway still shows as having worked.
    const onLeave = leaveByDay.get(ymd);
    if (onLeave) return onLeave.half_day ? "half_leave" : "leave";
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

  const monthLeave = leave.filter((l) => l.date.startsWith(monthKey));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          disabled={atMin}
          className="p-1 text-aproksi-slate/60 hover:text-aproksi-ink disabled:opacity-30"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-aproksi-ink">{monthLabel}</span>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          disabled={atCurrent}
          className="p-1 text-aproksi-slate/60 hover:text-aproksi-ink disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-[10px] text-aproksi-slate/50 py-1">{d}</div>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => <div key={`b${i}`} />)}
        {cells.map((c) => {
          const st = dayState(c.ymd, c.weekday);
          const clickable = !!onSelectDay && !!byDay.get(c.ymd)?.length;
          const lv = leaveByDay.get(c.ymd);
          return (
            <button
              key={c.ymd}
              type="button"
              onClick={clickable ? () => onSelectDay!(c.ymd) : undefined}
              // Hover has to answer "why is this day blue?" without a click.
              // Touch has no hover, which is what the summary line under the
              // calendar is for.
              title={lv ? leaveLabel(lv, st) : undefined}
              className={`relative aspect-square rounded-md text-xs flex items-center justify-center ${STATE_STYLE[st]} ${clickable ? "hover:ring-1 hover:ring-aproksi-ultra cursor-pointer" : "cursor-default"}`}
            >
              {c.day}
              {missedByDay.has(c.ymd) && (
                <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-aproksi-red" title="Missed presence check" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1 text-[11px] text-aproksi-slate/60">
            <span className={`h-3 w-3 rounded ${l.cls}`} /> {l.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-[11px] text-aproksi-slate/60">
          <span className="h-1.5 w-1.5 rounded-full bg-aproksi-red" /> Missed check
        </span>
      </div>

      {/* Spelled out, because a colour cannot say "paid" and a phone cannot
          hover. This is also the line that answers the question an owner
          actually has when they see blue squares: was I paying for those? */}
      {monthLeave.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-aproksi-ultra">
          {monthLeave.length === 1 ? "1 approved leave day" : `${monthLeave.length} approved leave days`}
          {" this month — "}
          {summariseLeave(monthLeave)}.
        </p>
      )}
    </div>
  );
}

/** Tooltip for one leave day. */
function leaveLabel(l: CalLeave, state: DayState): string {
  const half = l.half_day ? `${l.half_day} only` : "whole day";
  const pay = l.paid ? "paid" : "unpaid";
  const worked =
    state === "present" || state === "late" || state === "flagged"
      ? " — they scanned in anyway, so the day counts as worked"
      : "";
  return `Approved leave: ${half}, ${pay}${worked}`;
}

/** "3 paid, 1 unpaid (1 half day)" — counted, never estimated. */
function summariseLeave(days: CalLeave[]): string {
  const paid = days.filter((d) => d.paid).length;
  const unpaid = days.length - paid;
  const halves = days.filter((d) => d.half_day).length;
  const parts: string[] = [];
  if (paid > 0) parts.push(`${paid} paid`);
  if (unpaid > 0) parts.push(`${unpaid} unpaid`);
  if (halves > 0) parts.push(`${halves} of them a half day`);
  return parts.join(", ");
}
