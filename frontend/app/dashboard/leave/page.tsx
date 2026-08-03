"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface LeaveRow {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  paid: boolean | null;
  decided_at: string | null;
  created_at: string;
  employees: { id: string; name: string; phone: string; workplace_id: string | null } | null;
}

const TABS = [
  { key: "pending", label: "Waiting on you" },
  { key: "approved", label: "Approved" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
] as const;

const fmtDay = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function dayCount(a: string, b: string) {
  const ms =
    new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime();
  return Math.round(ms / 86400000) + 1;
}

/** Days until the leave starts — the thing that decides how urgent this is. */
function noticeLeft(start: string) {
  const ms = new Date(`${start}T00:00:00`).getTime() - Date.now();
  const days = Math.ceil(ms / 86400000);
  if (days < 0) return "already started";
  if (days === 0) return "starts today";
  if (days === 1) return "starts tomorrow";
  return `in ${days} days`;
}

export default function OwnerLeavePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending");
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ requests: LeaveRow[] }>(`/api/leave?status=${tab}`, {
        token: await token(),
      });
      setRows(r.requests ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab, token]);

  useEffect(() => {
    // Deferred so the first setState is not synchronous inside the effect.
    void Promise.resolve().then(load);
  }, [load]);

  async function decide(id: string, action: "approve" | "decline", paid?: boolean) {
    setBusy(id);
    setError(null);
    try {
      await api(`/api/leave/${id}/${action}`, {
        method: "POST",
        token: await token(),
        body: action === "approve" ? { paid: Boolean(paid) } : {},
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-kaunta-ink">
            Leave{" "}
            <Link href="/dashboard" className="text-sm text-kaunta-ultra hover:underline">
              ← Dashboard
            </Link>
          </h1>
          <p className="mt-1 text-sm text-kaunta-slate/70">
            A day you approve is never counted as an absence, and never
            attracts a penalty.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={[
              "inline-flex min-h-[40px] items-center rounded-full px-4 text-sm transition-colors",
              tab === t.key
                ? "bg-kaunta-ultra text-white"
                : "border border-kaunta-mist bg-white text-kaunta-slate hover:border-kaunta-ultra/40",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-kaunta-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-kaunta-slate/60">Loading…</p>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-kaunta-slate/70">
            {tab === "pending"
              ? "Nothing waiting on you."
              : "Nothing here yet."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-kaunta-ink">
                    {r.employees?.name ?? "Employee"}
                  </p>
                  <p className="mt-1 text-sm text-kaunta-slate">
                    {r.start_date === r.end_date
                      ? fmtDay(r.start_date)
                      : `${fmtDay(r.start_date)} – ${fmtDay(r.end_date)}`}{" "}
                    <span className="text-kaunta-slate/60">
                      · {dayCount(r.start_date, r.end_date)} day
                      {dayCount(r.start_date, r.end_date) > 1 ? "s" : ""}
                      {r.status === "pending" ? ` · ${noticeLeft(r.start_date)}` : ""}
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-kaunta-slate/70">{r.reason}</p>
                </div>

                {r.status !== "pending" && (
                  <span className="shrink-0 rounded-full bg-kaunta-stone px-2.5 py-1 text-[0.6875rem] font-medium capitalize text-kaunta-slate">
                    {r.status}
                    {r.status === "approved" ? (r.paid ? " · paid" : " · unpaid") : ""}
                  </span>
                )}
              </div>

              {r.status === "pending" && (
                <div className="mt-4 flex flex-col gap-2 border-t border-kaunta-mist pt-4 sm:flex-row">
                  <Button
                    onClick={() => decide(r.id, "approve", true)}
                    disabled={busy === r.id}
                    className="sm:flex-1"
                  >
                    Approve — paid
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => decide(r.id, "approve", false)}
                    disabled={busy === r.id}
                    className="sm:flex-1"
                  >
                    Approve — unpaid
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => decide(r.id, "decline")}
                    disabled={busy === r.id}
                  >
                    Decline
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
