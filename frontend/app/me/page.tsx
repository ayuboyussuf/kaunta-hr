"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QrCode, ChevronRight } from "lucide-react";
import { api, getEmployeeToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ATTENDANCE_STATUS, formatDate, formatTime } from "@/lib/utils";

const SEEN_KEY = "kaunta_hr_announcements_seen_at";

interface Profile {
  id: string;
  name: string;
  status: string;
  base_salary: number;
  workplace: { id: string; name: string } | null;
  shift: {
    id: string;
    name: string;
    kind: string;
    start_time: string;
    end_time: string;
  } | null;
}

interface AttendanceEntry {
  id: string;
  scanned_at: string;
  status: string;
  workplace: { name: string } | null;
}

interface Announcement {
  id: string;
  title: string;
  posted_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  normal: "bg-kaunta-sage/10 text-kaunta-sage border-kaunta-sage/20",
  late: "bg-kaunta-amber/10 text-kaunta-amber border-kaunta-amber/20",
  flagged: "bg-kaunta-red/10 text-kaunta-red border-kaunta-red/20",
  adjusted: "bg-kaunta-slate/10 text-kaunta-slate border-kaunta-slate/20",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function EmployeeHome() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getEmployeeToken();
    if (!token) return;

    (async () => {
      try {
        const [profileRes, attendanceRes, announcementsRes] = await Promise.all([
          api<{ employee: Profile }>("/api/employees/me/profile", { token }),
          api<{ attendance: AttendanceEntry[] }>("/api/employees/me/attendance", { token }),
          api<{ announcements: Announcement[] }>("/api/employees/me/announcements", { token }),
        ]);
        setProfile(profileRes.employee);
        setAttendance(attendanceRes.attendance.slice(0, 1));

        const seenAt = localStorage.getItem(SEEN_KEY);
        const seenMs = seenAt ? new Date(seenAt).getTime() : 0;
        const unreadCount = announcementsRes.announcements.filter(
          (a) => new Date(a.posted_at).getTime() > seenMs
        ).length;
        setUnread(unreadCount);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <p className="text-sm text-kaunta-slate/60">Loading…</p>;
  }

  if (error) {
    return <p className="text-sm text-kaunta-red">{error}</p>;
  }

  const lastEntry = attendance[0];
  const lastStatus = lastEntry ? ATTENDANCE_STATUS[lastEntry.status] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-kaunta-ink mb-1">
          {greeting()}
          {profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-kaunta-slate/70 text-sm">
          {profile?.workplace?.name ?? "No workplace assigned"}
          {profile?.shift ? ` · ${profile.shift.name} shift` : ""}
        </p>
      </div>

      <Card className="bg-kaunta-copper text-white border-none">
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <p className="font-display text-xl mb-1">Ready to clock in?</p>
            <p className="text-sm text-white/80">Scan the QR code at your workplace.</p>
          </div>
          <Button asChild variant="secondary" size="lg">
            <Link href="/me/clock-in" className="flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              Clock in
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Recent attendance</CardTitle>
            <CardDescription>Your last scan</CardDescription>
          </CardHeader>
          <CardContent>
            {lastEntry && lastStatus ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-kaunta-ink">
                    {formatDate(lastEntry.scanned_at)} · {formatTime(lastEntry.scanned_at)}
                  </p>
                  <p className="text-xs text-kaunta-slate/60 mt-0.5">
                    {lastEntry.workplace?.name ?? ""}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full border ${STATUS_BADGE[lastEntry.status] ?? STATUS_BADGE.normal}`}
                >
                  {lastStatus.label}
                </span>
              </div>
            ) : (
              <p className="text-sm text-kaunta-slate/60">No attendance recorded yet.</p>
            )}
            <Link
              href="/me/history"
              className="mt-4 flex items-center gap-1 text-sm text-kaunta-copper hover:underline"
            >
              View history <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
            <CardDescription>From your employer</CardDescription>
          </CardHeader>
          <CardContent>
            {unread > 0 ? (
              <p className="text-sm text-kaunta-ink">
                <span className="font-display text-2xl text-kaunta-copper mr-1">{unread}</span>
                unread announcement{unread === 1 ? "" : "s"}
              </p>
            ) : (
              <p className="text-sm text-kaunta-slate/60">You&rsquo;re all caught up.</p>
            )}
            <Link
              href="/me/announcements"
              className="mt-4 flex items-center gap-1 text-sm text-kaunta-copper hover:underline"
            >
              View announcements <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
