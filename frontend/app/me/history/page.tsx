"use client";

import { useEffect, useState } from "react";
import { api, getEmployeeToken } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { ATTENDANCE_STATUS, formatDate, formatTime } from "@/lib/utils";

interface AttendanceEntry {
  id: string;
  scanned_at: string;
  status: string;
  distance_m: number | null;
  flags: string[];
  workplace: { name: string } | null;
}

const STATUS_BADGE: Record<string, string> = {
  normal: "bg-kaunta-sage/10 text-kaunta-sage border-kaunta-sage/20",
  late: "bg-kaunta-amber/10 text-kaunta-amber border-kaunta-amber/20",
  flagged: "bg-kaunta-red/10 text-kaunta-red border-kaunta-red/20",
  adjusted: "bg-kaunta-slate/10 text-kaunta-slate border-kaunta-slate/20",
};

export default function AttendanceHistoryPage() {
  const [entries, setEntries] = useState<AttendanceEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getEmployeeToken();
    if (!token) return;
    api<{ attendance: AttendanceEntry[] }>("/api/employees/me/attendance", { token })
      .then((r) => setEntries(r.attendance))
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-kaunta-ink mb-1">Attendance history</h1>
        <p className="text-kaunta-slate/70 text-sm">Every clock-in scan, newest first.</p>
      </div>

      {error && <p className="text-sm text-kaunta-red">{error}</p>}

      {!entries && !error && <p className="text-sm text-kaunta-slate/60">Loading…</p>}

      {entries && entries.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-kaunta-slate/60">
            No attendance recorded yet.
          </CardContent>
        </Card>
      )}

      {entries && entries.length > 0 && (
        <Card>
          <CardContent className="p-0 divide-y divide-kaunta-mist">
            {entries.map((e) => {
              const status = ATTENDANCE_STATUS[e.status] ?? ATTENDANCE_STATUS.normal;
              return (
                <div key={e.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="text-sm text-kaunta-ink font-medium">
                      {formatDate(e.scanned_at)} · {formatTime(e.scanned_at)}
                    </p>
                    <p className="text-xs text-kaunta-slate/60 mt-0.5">
                      {e.workplace?.name ?? "Unknown workplace"}
                      {e.flags?.length ? ` · ${e.flags.join(", ")}` : ""}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full border shrink-0 ${STATUS_BADGE[e.status] ?? STATUS_BADGE.normal}`}
                  >
                    {status.label}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
