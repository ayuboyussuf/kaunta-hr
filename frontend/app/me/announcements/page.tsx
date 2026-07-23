"use client";

/**
 * Employee message feed — a chat-style timeline anchored to the bottom.
 * Combines employer announcements, penalties logged against you, and appeal
 * outcomes into one stream. Newest sits at the bottom like a messaging app.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, getEmployeeToken } from "@/lib/api";
import { ANNOUNCEMENT_TYPES, formatDate, formatTime } from "@/lib/utils";

const SEEN_KEY = "kaunta_hr_announcements_seen_at";

interface Announcement {
  id: string;
  type: string;
  title: string;
  body: string;
  scope: "all" | "workplace";
  posted_at: string;
  workplaces: { name: string } | null;
}
interface Violation {
  id: string;
  reason: string;
  amount: number;
  status: string;
  can_appeal: boolean;
  outcome: string | null;
  created_at: string;
  appeal: { id: string; message: string; decision: string; submitted_at: string; decided_at: string | null } | null;
}

type Bubble = {
  key: string;
  at: string;
  side: "in" | "out"; // in = from employer/system, out = from you
  kind: "announcement" | "penalty" | "appeal" | "outcome";
  tag?: string;
  title?: string;
  body: string;
  link?: string;
  linkLabel?: string;
};

export default function EmployeeMessagesPage() {
  const [bubbles, setBubbles] = useState<Bubble[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const token = getEmployeeToken();
    if (!token) return;
    (async () => {
      try {
        const [ann, viol] = await Promise.all([
          api<{ announcements: Announcement[] }>("/api/employees/me/announcements", { token }),
          api<{ violations: Violation[] }>("/api/violations/mine", { token }),
        ]);

        const out: Bubble[] = [];
        for (const a of ann.announcements) {
          out.push({
            key: `a-${a.id}`,
            at: a.posted_at,
            side: "in",
            kind: "announcement",
            tag: ANNOUNCEMENT_TYPES[a.type] ?? "Announcement",
            title: a.title,
            body: a.body,
          });
        }
        for (const v of viol.violations) {
          out.push({
            key: `v-${v.id}`,
            at: v.created_at,
            side: "in",
            kind: "penalty",
            tag: "Penalty",
            body: `${v.reason} — KES ${v.amount}`,
            ...(v.can_appeal ? { link: "/me/violations", linkLabel: "Appeal this" } : {}),
          });
          if (v.appeal) {
            out.push({
              key: `ap-${v.appeal.id}`,
              at: v.appeal.submitted_at,
              side: "out",
              kind: "appeal",
              body: v.appeal.message,
            });
            if (v.appeal.decision !== "pending" && v.appeal.decided_at) {
              const accepted = v.appeal.decision === "accepted";
              out.push({
                key: `oc-${v.appeal.id}`,
                at: v.appeal.decided_at,
                side: "in",
                kind: "outcome",
                tag: accepted ? "Appeal accepted" : "Appeal rejected",
                body: accepted
                  ? "Your appeal was accepted — the penalty was waived."
                  : "Your appeal was reviewed and the penalty stands.",
                link: "/me/violations",
                linkLabel: "View details",
              });
            }
          }
        }
        out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
        setBubbles(out);
        localStorage.setItem(SEEN_KEY, new Date().toISOString());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [bubbles]);

  return (
    <div className="flex flex-col min-h-[70vh]">
      <div className="mb-4">
        <h1 className="font-display text-3xl text-kaunta-ink mb-1">Messages</h1>
        <p className="text-kaunta-slate/70 text-sm">Announcements, penalties and appeal outcomes.</p>
      </div>

      {error && <p className="text-sm text-kaunta-red">{error}</p>}
      {!bubbles && !error && <p className="text-sm text-kaunta-slate/60">Loading…</p>}

      {bubbles && bubbles.length === 0 && (
        <div className="flex-1 grid place-items-center text-sm text-kaunta-slate/60">
          No messages yet.
        </div>
      )}

      {bubbles && bubbles.length > 0 && (
        <div className="flex-1 flex flex-col justify-end gap-3">
          {bubbles.map((b) => {
            const outgoing = b.side === "out";
            const toneCls = outgoing
              ? "bg-kaunta-copper text-white rounded-br-sm"
              : b.kind === "penalty"
              ? "bg-kaunta-red/5 border border-kaunta-red/20 text-kaunta-ink rounded-bl-sm"
              : b.kind === "outcome"
              ? "bg-kaunta-sage-lt border border-kaunta-sage/20 text-kaunta-ink rounded-bl-sm"
              : "bg-white border border-kaunta-mist text-kaunta-ink rounded-bl-sm";
            return (
              <div key={b.key} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-[0_2px_10px_rgba(15,25,35,0.05)] ${toneCls}`}>
                  {b.tag && (
                    <p className={`text-[10px] uppercase tracking-wide mb-1 ${outgoing ? "text-white/70" : "text-kaunta-slate/50"}`}>
                      {b.tag}
                    </p>
                  )}
                  {b.title && <p className="font-medium text-sm mb-0.5">{b.title}</p>}
                  <p className="text-sm whitespace-pre-wrap">{b.body}</p>
                  {b.link && (
                    <Link
                      href={b.link}
                      className={`text-xs mt-1 inline-block hover:underline ${outgoing ? "text-white/90" : "text-kaunta-copper"}`}
                    >
                      {b.linkLabel ?? "Open"} →
                    </Link>
                  )}
                  <p className={`text-[10px] mt-1 ${outgoing ? "text-white/60" : "text-kaunta-slate/40"}`}>
                    {formatDate(b.at)} · {formatTime(b.at)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
