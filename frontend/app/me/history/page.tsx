"use client";

import { useEffect, useState } from "react";
import { api, getEmployeeToken } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import AttendanceCalendar, { CalEntry } from "@/components/AttendanceCalendar";

interface AttendanceEntry extends CalEntry {
  id: string;
}
interface Profile {
  start_date: string | null;
  shift: { days_of_week: number[] } | null;
}

export default function AttendanceHistoryPage() {
  const [entries, setEntries] = useState<AttendanceEntry[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getEmployeeToken();
    if (!token) return;
    Promise.all([
      api<{ attendance: AttendanceEntry[] }>("/api/employees/me/attendance", { token }),
      api<{ employee: Profile }>("/api/employees/me/profile", { token }),
    ])
      .then(([a, p]) => { setEntries(a.attendance); setProfile(p.employee); })
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-kaunta-ink mb-1">Attendance history</h1>
        <p className="text-kaunta-slate/70 text-sm">Your month at a glance — tap through the months.</p>
      </div>

      {error && <p className="text-sm text-kaunta-red">{error}</p>}
      {!entries && !error && <p className="text-sm text-kaunta-slate/60">Loading…</p>}

      {entries && (
        <Card>
          <CardContent className="p-4">
            <AttendanceCalendar
              entries={entries}
              scheduledDays={profile?.shift?.days_of_week ?? []}
              employmentStart={profile?.start_date ?? null}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
