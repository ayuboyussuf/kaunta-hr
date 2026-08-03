"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getEmployeeToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  paid: boolean | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-kaunta-amber/15 text-kaunta-amber",
  approved: "bg-kaunta-sage/15 text-kaunta-sage",
  declined: "bg-kaunta-red/15 text-kaunta-red",
  cancelled: "bg-kaunta-slate/10 text-kaunta-slate/70",
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const fmtDay = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Inclusive day count between two ISO dates. */
function dayCount(a: string, b: string) {
  const ms =
    new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime();
  return Math.round(ms / 86400000) + 1;
}

export default function MyLeavePage() {
  const router = useRouter();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);

  // month shown in the picker
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getEmployeeToken();
    if (!token) return router.replace("/me/login");
    try {
      const r = await api<{ requests: LeaveRequest[] }>("/api/leave/mine", { token });
      setRequests(r.requests ?? []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // Deferred so the first setState is not synchronous inside the effect.
    void Promise.resolve().then(load);
  }, [load]);

  /* The earliest day that can be selected. Leave is filed ahead of time, so
   * today and anything past is closed — the server enforces the same rule and
   * will say so, but there is no reason to let someone pick a day that will
   * be rejected. */
  const earliest = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return ymd(d);
  }, []);

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const lead = first.getDay();
    return {
      lead,
      days,
      label: first.toLocaleDateString("en-KE", { month: "long", year: "numeric" }),
    };
  }, [cursor]);

  function pick(dateStr: string) {
    if (dateStr < earliest) return;
    if (!from || (from && to)) {
      setFrom(dateStr);
      setTo(null);
      return;
    }
    if (dateStr < from) {
      setFrom(dateStr);
      return;
    }
    setTo(dateStr);
  }

  const inRange = (d: string) =>
    from && to ? d >= from && d <= to : from === d;

  async function submit() {
    if (!from) return setError("Choose the days you will be away.");
    if (reason.trim().length < 3) return setError("Add a short reason.");
    setSaving(true);
    setError(null);
    try {
      await api("/api/leave", {
        method: "POST",
        token: getEmployeeToken()!,
        body: { start_date: from, end_date: to ?? from, reason: reason.trim() },
      });
      setFrom(null);
      setTo(null);
      setReason("");
      setPicking(false);
      await load();
    } catch (e) {
      setError((e as Error).message || "Could not send the request.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    try {
      await api(`/api/leave/${id}/cancel`, { method: "POST", token: getEmployeeToken()! });
      await load();
    } catch {
      /* the list refresh below will show the real state */
    }
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-kaunta-ink">Leave</h1>
          <p className="mt-1 text-sm text-kaunta-slate/70">
            Ask for days off before you take them. Approved days are not marked
            absent.
          </p>
        </div>
        {!picking && (
          <Button onClick={() => setPicking(true)}>Request leave</Button>
        )}
      </div>

      {picking && (
        <Card className="p-5">
          {/* ── month picker ── */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-kaunta-slate hover:bg-kaunta-stone"
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
              }
            >
              ‹
            </button>
            <p className="text-sm font-medium text-kaunta-ink">{grid.label}</p>
            <button
              type="button"
              aria-label="Next month"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-kaunta-slate hover:bg-kaunta-stone"
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
              }
            >
              ›
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span
                key={i}
                className="py-1 text-[0.6875rem] uppercase tracking-wider text-kaunta-slate/50"
              >
                {d}
              </span>
            ))}
            {Array.from({ length: grid.lead }).map((_, i) => (
              <span key={`lead-${i}`} />
            ))}
            {Array.from({ length: grid.days }).map((_, i) => {
              const d = ymd(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1));
              const disabled = d < earliest;
              const selected = inRange(d);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(d)}
                  className={[
                    "flex h-11 items-center justify-center rounded-lg text-sm transition-colors",
                    disabled
                      ? "cursor-not-allowed text-kaunta-slate/25"
                      : selected
                        ? "bg-kaunta-ultra text-white"
                        : "text-kaunta-ink hover:bg-kaunta-stone",
                  ].join(" ")}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-kaunta-slate/60">
            {from
              ? to
                ? `${fmtDay(from)} – ${fmtDay(to)} · ${dayCount(from, to)} day${dayCount(from, to) > 1 ? "s" : ""}`
                : `${fmtDay(from)} — tap another day for a range, or send for one day.`
              : "Tap the first day you will be away."}
          </p>

          <label className="mt-4 block">
            <span className="text-sm text-kaunta-ink">Reason</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Why you need the days off"
              className="mt-1.5 w-full rounded-lg border border-kaunta-mist bg-white p-3 text-sm text-kaunta-ink placeholder:text-kaunta-slate/40 focus:border-kaunta-ultra focus:outline-none"
            />
          </label>

          {error && <p className="mt-3 text-sm text-kaunta-red">{error}</p>}

          <div className="mt-4 flex gap-2">
            <Button onClick={submit} disabled={saving} className="flex-1">
              {saving ? "Sending…" : "Send request"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPicking(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-kaunta-slate/60">Loading…</p>
      ) : requests.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-kaunta-slate/70">
            You have not asked for any leave yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-kaunta-ink">
                    {r.start_date === r.end_date
                      ? fmtDay(r.start_date)
                      : `${fmtDay(r.start_date)} – ${fmtDay(r.end_date)}`}
                  </p>
                  <p className="mt-1 text-sm text-kaunta-slate/70">{r.reason}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium capitalize ${STATUS_STYLE[r.status]}`}
                >
                  {r.status}
                </span>
              </div>

              {r.status === "approved" && (
                <p className="mt-3 border-t border-kaunta-mist pt-3 text-sm text-kaunta-slate/70">
                  Approved as{" "}
                  <strong className="text-kaunta-ink">
                    {r.paid ? "paid" : "unpaid"}
                  </strong>
                  . You will not be marked absent on these days.
                </p>
              )}
              {r.status === "declined" && (
                <p className="mt-3 border-t border-kaunta-mist pt-3 text-sm text-kaunta-slate/70">
                  Not approved.
                  {r.decision_note ? ` ${r.decision_note}` : ""} Normal
                  attendance rules apply.
                </p>
              )}
              {r.status === "pending" && (
                <div className="mt-3 border-t border-kaunta-mist pt-3">
                  <button
                    type="button"
                    onClick={() => cancel(r.id)}
                    className="text-sm text-kaunta-red hover:underline"
                  >
                    Withdraw this request
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
