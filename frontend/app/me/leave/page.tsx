"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getEmployeeToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type HalfDay = "morning" | "afternoon";

interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  half_day: HalfDay | null;
  reason: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  paid: boolean | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-aproksi-amber/15 text-aproksi-amber",
  approved: "bg-aproksi-sage/15 text-aproksi-sage",
  declined: "bg-aproksi-red/15 text-aproksi-red",
  cancelled: "bg-aproksi-slate/10 text-aproksi-slate/70",
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
  const [halfDay, setHalfDay] = useState<HalfDay | null>(null);
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
    // A range is no longer half of anything.
    if (dateStr !== from) setHalfDay(null);
  }

  const inRange = (d: string) =>
    from && to ? d >= from && d <= to : from === d;

  async function submit() {
    if (!from) return setError("Choose the days you will be away.");
    if (reason.trim().length < 3) return setError("Add a short reason.");
    setSaving(true);
    setError(null);
    try {
      const singleDay = !to || to === from;
      await api("/api/leave", {
        method: "POST",
        token: getEmployeeToken()!,
        body: {
          start_date: from,
          end_date: to ?? from,
          reason: reason.trim(),
          half_day: singleDay ? halfDay : null,
        },
      });
      setFrom(null);
      setTo(null);
      setHalfDay(null);
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
          <h1 className="font-display text-2xl text-aproksi-ink">Leave</h1>
          <p className="mt-1 text-sm text-aproksi-slate/70">
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
              className="flex h-11 w-11 items-center justify-center rounded-lg text-aproksi-slate hover:bg-aproksi-stone"
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
              }
            >
              ‹
            </button>
            <p className="text-sm font-medium text-aproksi-ink">{grid.label}</p>
            <button
              type="button"
              aria-label="Next month"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-aproksi-slate hover:bg-aproksi-stone"
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
                className="py-1 text-[0.6875rem] uppercase tracking-wider text-aproksi-slate/50"
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
                      ? "cursor-not-allowed text-aproksi-slate/25"
                      : selected
                        ? "bg-aproksi-ultra text-white"
                        : "text-aproksi-ink hover:bg-aproksi-stone",
                  ].join(" ")}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-aproksi-slate/60">
            {from
              ? to && to !== from
                ? `${fmtDay(from)} – ${fmtDay(to)} · ${dayCount(from, to)} day${dayCount(from, to) > 1 ? "s" : ""}`
                : `${fmtDay(from)} — tap another day for a range, or send for one day.`
              : "Tap the first day you will be away."}
          </p>

          {/* Half days, only where they mean something. Most of what people
              actually need is a morning at the clinic, not a whole day off —
              and asking for the whole day costs them the rest of it. */}
          {from && (!to || to === from) && (
            <div className="mt-3">
              <span className="text-xs text-aproksi-slate/60">How much of the day?</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {[
                  { key: null, label: "Whole day" },
                  { key: "morning" as const, label: "Morning only" },
                  { key: "afternoon" as const, label: "Afternoon only" },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setHalfDay(opt.key)}
                    className={[
                      "inline-flex min-h-[40px] items-center rounded-full px-4 text-sm transition-colors",
                      halfDay === opt.key
                        ? "bg-aproksi-ultra text-white"
                        : "border border-aproksi-mist bg-white text-aproksi-slate hover:border-aproksi-ultra/40",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="mt-4 block">
            <span className="text-sm text-aproksi-ink">Reason</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Why you need the days off"
              className="mt-1.5 w-full rounded-lg border border-aproksi-mist bg-white p-3 text-sm text-aproksi-ink placeholder:text-aproksi-slate/40 focus:border-aproksi-ultra focus:outline-none"
            />
          </label>

          {error && <p className="mt-3 text-sm text-aproksi-red">{error}</p>}

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
        <p className="text-sm text-aproksi-slate/60">Loading…</p>
      ) : requests.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-aproksi-slate/70">
            You have not asked for any leave yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-aproksi-ink">
                    {r.start_date === r.end_date
                      ? fmtDay(r.start_date)
                      : `${fmtDay(r.start_date)} – ${fmtDay(r.end_date)}`}
                    {r.half_day && (
                      <span className="ml-1.5 font-normal text-aproksi-slate/60">
                        · {r.half_day} only
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-aproksi-slate/70">{r.reason}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium capitalize ${STATUS_STYLE[r.status]}`}
                >
                  {r.status}
                </span>
              </div>

              {r.status === "approved" && (
                <p className="mt-3 border-t border-aproksi-mist pt-3 text-sm text-aproksi-slate/70">
                  Approved as{" "}
                  <strong className="text-aproksi-ink">
                    {r.paid ? "paid" : "unpaid"}
                  </strong>
                  . You will not be marked absent on these days.
                </p>
              )}
              {r.status === "declined" && (
                <p className="mt-3 border-t border-aproksi-mist pt-3 text-sm text-aproksi-slate/70">
                  Not approved.
                  {r.decision_note ? ` ${r.decision_note}` : ""} Normal
                  attendance rules apply.
                </p>
              )}
              {r.status === "pending" && (
                <div className="mt-3 border-t border-aproksi-mist pt-3">
                  <button
                    type="button"
                    onClick={() => cancel(r.id)}
                    className="text-sm text-aproksi-red hover:underline"
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
