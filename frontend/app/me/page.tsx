"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QrCode, ChevronRight, Megaphone, AlertTriangle } from "lucide-react";
import { api, getEmployeeToken } from "@/lib/api";
import { registerPush } from "@/lib/push";
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

interface MyViolation {
  id: string;
  status: string; // open | appealed | locked
  can_appeal: boolean;
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
  const [violations, setViolations] = useState<MyViolation[]>([]);
  const [presenceDue, setPresenceDue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getEmployeeToken();
    if (!token) return;

    (async () => {
      try {
        const [profileRes, attendanceRes, announcementsRes, violationsRes] = await Promise.all([
          api<{ employee: Profile }>("/api/employees/me/profile", { token }),
          api<{ attendance: AttendanceEntry[] }>("/api/employees/me/attendance", { token }),
          api<{ announcements: Announcement[] }>("/api/employees/me/announcements", { token }),
          api<{ violations: MyViolation[] }>("/api/violations/mine", { token }),
        ]);
        setProfile(profileRes.employee);
        setAttendance(attendanceRes.attendance.slice(0, 1));
        setViolations(violationsRes.violations);

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

    // Subscribe to push (best-effort), then poll for a pending presence check so
    // the banner shows even if the notification was missed.
    registerPush(token);
    let cancelled = false;
    const checkPending = async () => {
      try {
        const { check } = await api<{ check: { id: string } | null }>("/api/presence/pending", { token });
        if (!cancelled) setPresenceDue(!!check);
      } catch {
        /* ignore */
      }
    };
    checkPending();
    const timer = setInterval(checkPending, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-kaunta-slate/60">Loading…</p>;
  }

  if (error) {
    return <p className="text-sm text-kaunta-red">{error}</p>;
  }

  const lastEntry = attendance[0];
  const lastStatus = lastEntry ? ATTENDANCE_STATUS[lastEntry.status] : null;
  const openPenalties = violations.filter((v) => v.status === "open" || v.status === "appealed").length;
  const appealable = violations.filter((v) => v.can_appeal).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
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
        {/* Announcements — moved off the nav to a bell icon here, with an unread count. */}
        <Link
          href="/me/announcements"
          aria-label={`Announcements${unread > 0 ? `, ${unread} unread` : ""}`}
          className="relative shrink-0 grid h-11 w-11 place-items-center rounded-full border border-kaunta-mist bg-white text-kaunta-slate hover:text-kaunta-ultra hover:border-kaunta-ultra/40 transition-colors"
        >
          <Megaphone className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-kaunta-ultra px-1 text-[11px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
      </div>

      {/* Penalties the employee hasn't resolved — surfaced so they can't be missed. */}
      {openPenalties > 0 && (
        <Card className="bg-kaunta-red text-white border-none">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-display text-lg mb-0.5">
                  {openPenalties} open penalt{openPenalties === 1 ? "y" : "ies"}
                </p>
                <p className="text-sm text-white/85">
                  {appealable > 0
                    ? `You can still appeal ${appealable === openPenalties ? (openPenalties === 1 ? "it" : "them") : `${appealable} of them`}. The window closes soon.`
                    : "Review the details on your penalties page."}
                </p>
              </div>
            </div>
            <Button asChild variant="secondary" size="lg">
              <Link href="/me/violations">Review</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {presenceDue && (
        <Card className="bg-kaunta-red text-white border-none">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-display text-lg mb-0.5">Presence check</p>
              <p className="text-sm text-white/85">Scan the workplace QR now to confirm you&rsquo;re at work.</p>
            </div>
            <Button asChild variant="secondary" size="lg">
              <Link href="/me/clock-in" className="flex items-center gap-2">
                <QrCode className="h-4 w-4" />
                Confirm
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="bg-kaunta-ultra text-white border-none">
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
              className="mt-4 flex items-center gap-1 text-sm text-kaunta-ultra hover:underline"
            >
              View history <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Penalties</CardTitle>
            <CardDescription>Fines and appeals</CardDescription>
          </CardHeader>
          <CardContent>
            {violations.length === 0 ? (
              <p className="text-sm text-kaunta-slate/60">No penalties. Keep it up.</p>
            ) : openPenalties > 0 ? (
              <p className="text-sm text-kaunta-ink">
                <span className="font-display text-2xl text-kaunta-red mr-1">{openPenalties}</span>
                open penalt{openPenalties === 1 ? "y" : "ies"}
              </p>
            ) : (
              <p className="text-sm text-kaunta-slate/60">All penalties resolved.</p>
            )}
            <Link
              href="/me/violations"
              className="mt-4 flex items-center gap-1 text-sm text-kaunta-ultra hover:underline"
            >
              View penalties <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workplace rules</CardTitle>
            <CardDescription>Know the penalties before they apply</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-kaunta-slate/60">
              See the penalties that apply at your workplace and their appeal windows.
            </p>
            <Link
              href="/me/rules"
              className="mt-4 flex items-center gap-1 text-sm text-kaunta-ultra hover:underline"
            >
              View rules <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
