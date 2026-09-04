"use client";

/**
 * "Nobody clocked in at Juja on Monday. What happened?"
 *
 * This screen exists because the honest answer to that question is not
 * available to the system. It can count — six rostered, none scanned, four
 * failed attempts — and it can say what those counts usually mean, but only a
 * person knows whether the business was shut.
 *
 * The design follows from one fact: nothing has been charged yet. So there is
 * no urgency in the red sense, no "confirm or lose it", no default selected.
 * The three answers are laid out flat and evenly, because two of them are
 * ordinary and one of them takes money from six people, and an interface that
 * makes the third easiest to reach would be doing the deciding.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Review {
  id: string;
  site_name: string | null;
  on_date: string;
  rostered: number;
  scanned: number;
  failed_attempts: number;
  status: string;
  resolution: string | null;
  note: string | null;
  resolved_at: string | null;
  question: string;
}

type Resolution = "closed_holiday" | "closed_other" | "system_problem" | "everyone_absent";

const ANSWERS: {
  key: Resolution;
  label: string;
  consequence: string;
  tone: "calm" | "grave";
}[] = [
  {
    key: "closed_holiday",
    label: "Public holiday",
    consequence: "Recorded as a non-working day. Nobody is charged.",
    tone: "calm",
  },
  {
    key: "closed_other",
    label: "We were closed",
    consequence: "Recorded as a non-working day. Nobody is charged.",
    tone: "calm",
  },
  {
    key: "system_problem",
    label: "Something was broken",
    consequence: "Nobody is charged, and the day stays flagged as our failure.",
    tone: "calm",
  },
  {
    key: "everyone_absent",
    label: "Nobody turned up",
    consequence: "Absence penalties are raised now, against your name, and staff are notified.",
    tone: "grave",
  },
];

const fmtDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export default function ClosuresPage() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, Resolution>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const token = useCallback(async () => {
    const { data } = await createClient().auth.getSession();
    return data.session?.access_token ?? "";
  }, []);

  const load = useCallback(async () => {
    try {
      const t = await token();
      const r = await api<{ reviews: Review[] }>("/api/closures/reviews", { token: t });
      setReviews(r.reviews);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function answer(review: Review) {
    const resolution = chosen[review.id];
    if (!resolution) return;
    setBusy(review.id);
    setError(null);
    try {
      const t = await token();
      await api(`/api/closures/reviews/${review.id}`, {
        method: "POST",
        token: t,
        body: { resolution, note: notes[review.id]?.trim() || undefined },
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const pending = (reviews ?? []).filter((r) => r.status === "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-aproksi-ink mb-1">Days nobody clocked in</h1>
        <p className="text-sm text-aproksi-slate/70">
          When a whole site records no clock-ins, Aproksi holds the absence penalties instead of
          applying them, and asks. Nothing here has cost anybody anything yet.
        </p>
      </div>

      {error && <p className="text-sm text-aproksi-red">{error}</p>}
      {!reviews && !error && <p className="text-sm text-aproksi-slate/60">Loading…</p>}

      {reviews && pending.length === 0 && (
        <Card className="p-6">
          <p className="text-sm text-aproksi-slate">
            Nothing waiting. Days you know about in advance can be declared in{" "}
            <Link href="/dashboard/workplaces" className="text-aproksi-ultra underline underline-offset-4">
              your workplaces
            </Link>{" "}
            so this question never has to be asked.
          </p>
        </Card>
      )}

      {pending.map((r) => (
        <Card key={r.id} className="p-6 space-y-5">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg text-aproksi-ink">
                {r.site_name ?? "Your business"} — {fmtDay(r.on_date)}
              </h2>
              <span className="text-xs text-aproksi-slate/60 tabular-nums">
                {r.scanned}/{r.rostered} clocked in
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-aproksi-slate">{r.question}</p>
          </div>

          {r.failed_attempts > 0 && (
            <p className="rounded-lg bg-aproksi-amber/10 px-4 py-3 text-xs leading-relaxed text-aproksi-amber">
              {r.failed_attempts} clock-in attempt{r.failed_attempts === 1 ? "" : "s"} failed on
              staff phones that day. People trying to scan and failing is not the same as people
              staying at home.
            </p>
          )}

          <fieldset className="space-y-2">
            <legend className="sr-only">What happened</legend>
            {ANSWERS.map((a) => {
              const selected = chosen[r.id] === a.key;
              return (
                <label
                  key={a.key}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                    selected
                      ? a.tone === "grave"
                        ? "border-aproksi-red bg-aproksi-red/5"
                        : "border-aproksi-ultra bg-aproksi-ultra/5"
                      : "border-aproksi-mist hover:border-aproksi-slate/30"
                  }`}
                >
                  <input
                    type="radio"
                    name={`answer-${r.id}`}
                    className="mt-1"
                    checked={selected}
                    onChange={() => setChosen((c) => ({ ...c, [r.id]: a.key }))}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-aproksi-ink">{a.label}</span>
                    {/* The consequence is stated on every option, not just the
                        costly one. An interface that only warns about the
                        expensive choice is nudging, and this decision belongs
                        entirely to the owner. */}
                    <span
                      className={`block text-xs ${
                        a.tone === "grave" ? "text-aproksi-red" : "text-aproksi-slate/70"
                      }`}
                    >
                      {a.consequence}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div className="space-y-2">
            <input
              type="text"
              maxLength={300}
              placeholder="Add a note — it is kept on the record (optional)"
              value={notes[r.id] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
              className="w-full rounded-lg border border-aproksi-mist px-3 py-2 text-sm text-aproksi-ink placeholder:text-aproksi-slate/40 focus:border-aproksi-ultra focus:outline-none"
            />
            <div className="flex items-center gap-3">
              <Button onClick={() => answer(r)} disabled={!chosen[r.id] || busy === r.id}>
                {busy === r.id ? "Saving…" : "Save answer"}
              </Button>
              <span className="text-xs text-aproksi-slate/50">
                Unanswered for a week, the held penalties are discarded.
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
