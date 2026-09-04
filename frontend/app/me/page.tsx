"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QrCode, ChevronRight, Megaphone, AlertTriangle } from "lucide-react";
import { api, getEmployeeToken } from "@/lib/api";
import { registerPush } from "@/lib/push";
import { flushScanFailures } from "@/lib/scanAttempts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppealQuestion } from "@/components/AppealQuestion";
import { ATTENDANCE_STATUS, formatDate, formatTime } from "@/lib/utils";

const SEEN_KEY = "aproksi_hr_announcements_seen_at";

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
  stage: "open" | "appealed" | "closed_no_appeal" | "settled";
  can_appeal: boolean;
  acknowledged_at: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  normal: "bg-aproksi-sage/10 text-aproksi-sage border-aproksi-sage/20",
  late: "bg-aproksi-amber/10 text-aproksi-amber border-aproksi-amber/20",
  flagged: "bg-aproksi-red/10 text-aproksi-red border-aproksi-red/20",
  adjusted: "bg-aproksi-slate/10 text-aproksi-slate border-aproksi-slate/20",
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
    // Any clock-in failures this phone couldn't report at the time — sent now
    // that it demonstrably has a connection.
    void flushScanFailures();
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
    return <p className="text-sm text-aproksi-slate/60">Loading…</p>;
  }

  if (error) {
    return <p className="text-sm text-aproksi-red">{error}</p>;
  }

  const lastEntry = attendance[0];
  const lastStatus = lastEntry ? ATTENDANCE_STATUS[lastEntry.status] : null;
  /* Counted on the derived stage, not on `status`. A row still sitting at
   * "open" because no sweep ever ran is settled, not something they can act on
   * — showing it as actionable is what made this banner say "Review" forever on
   * penalties whose window shut weeks ago. */
  const appealable = violations.filter((v) => v.can_appeal).length;
  const awaitingOwner = violations.filter((v) => v.stage === "appealed").length;
  const unseen = violations.filter(
    (v) => !v.acknowledged_at && (v.stage === "open" || v.stage === "closed_no_appeal")
  ).length;
  const needsAttention = appealable + awaitingOwner + unseen;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-aproksi-ink mb-1">
            {greeting()}
            {profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-aproksi-slate/70 text-sm">
            {profile?.workplace?.name ?? "No workplace assigned"}
            {profile?.shift ? ` · ${profile.shift.name} shift` : ""}
          </p>
        </div>
        {/* Announcements — moved off the nav to a bell icon here, with an unread count. */}
        <Link
          href="/me/announcements"
          aria-label={`Announcements${unread > 0 ? `, ${unread} unread` : ""}`}
          className="relative shrink-0 grid h-11 w-11 place-items-center rounded-full border border-aproksi-mist bg-white text-aproksi-slate hover:text-aproksi-ultra hover:border-aproksi-ultra/40 transition-colors"
        >
          <Megaphone className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-aproksi-ultra px-1 text-[11px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
      </div>

      {/* Aproksi has asked them a question about an appeal they already filed.
          It lived only on /me/violations, which meant an employee who opened
          the app normally never saw it — and the assist sat waiting for an
          answer to a question nobody had shown them. It renders nothing when
          there is nothing outstanding. */}
      <AppealQuestion />

      {/* Penalties needing something from them. The headline says WHICH thing,
          because "Review" told them nothing and got ignored — which is exactly
          how somebody ends up saying they never knew. */}
      {needsAttention > 0 && (
        <Card tone="alert">
          <CardContent className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-display text-lg mb-0.5">
                  {appealable > 0
                    ? `${appealable} penalt${appealable === 1 ? "y you can" : "ies you can"} still appeal`
                    : awaitingOwner > 0
                      ? `${awaitingOwner} appeal${awaitingOwner === 1 ? "" : "s"} with your employer`
                      : `${unseen} penalt${unseen === 1 ? "y" : "ies"} you haven't opened`}
                </p>
                <p className="text-sm text-aproksi-white/85">
                  {appealable > 0
                    ? "Once the window closes the penalty stands, so say your side now."
                    : awaitingOwner > 0
                      ? "They have your reason. You'll be texted when they decide."
                      : "Open them so there is a record that you were told."}
                </p>
              </div>
            </div>
            <Button asChild variant="secondary" size="lg">
              <Link href="/me/violations">
                {appealable > 0 ? "Appeal now" : "Open penalties"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {presenceDue && (
        <Card tone="alert">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-display text-lg mb-0.5">Presence check</p>
              <p className="text-sm text-aproksi-white/85">Scan the workplace QR now to confirm you&rsquo;re at work.</p>
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

      <Card tone="info">
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
                  <p className="text-sm text-aproksi-ink">
                    {formatDate(lastEntry.scanned_at)} · {formatTime(lastEntry.scanned_at)}
                  </p>
                  <p className="text-xs text-aproksi-slate/60 mt-0.5">
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
              <p className="text-sm text-aproksi-slate/60">No attendance recorded yet.</p>
            )}
            <Link
              href="/me/history"
              className="mt-4 flex items-center gap-1 text-sm text-aproksi-ultra hover:underline"
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
              <p className="text-sm text-aproksi-slate/60">No penalties. Keep it up.</p>
            ) : needsAttention > 0 ? (
              <p className="text-sm text-aproksi-ink">
                <span className="font-display text-2xl text-aproksi-red mr-1">{needsAttention}</span>
                need{needsAttention === 1 ? "s" : ""} something from you
              </p>
            ) : (
              <p className="text-sm text-aproksi-slate/60">
                {violations.length} on record, nothing outstanding.
              </p>
            )}
            <Link
              href="/me/violations"
              className="mt-4 flex items-center gap-1 text-sm text-aproksi-ultra hover:underline"
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
            <p className="text-sm text-aproksi-slate/60">
              See the penalties that apply at your workplace and their appeal windows.
            </p>
            <Link
              href="/me/rules"
              className="mt-4 flex items-center gap-1 text-sm text-aproksi-ultra hover:underline"
            >
              View rules <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
