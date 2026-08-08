"use client";

/**
 * Owner inbox. Appeal notifications and system messages land here; new appeals
 * also SMS the owner if a number is set in Settings.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Loader2, Inbox, Scale, Bell, Check } from "lucide-react";

interface Message {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  ref_id: string | null;
  read_at: string | null;
  created_at: string;
}

const cardCls = "rounded-[12px] border border-aproksi-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.08)]";

function timeAgo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
}

export default function OwnerMessagesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const load = useCallback(async (t: string) => {
    try {
      const r = await api<{ messages: Message[]; unread: number }>("/api/owner/messages", { token: t });
      setMessages(r.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const t = data.session?.access_token ?? null;
      if (!t) return router.replace("/login");
      setToken(t);
      await load(t);
    })();
  }, [supabase, router, load]);

  async function markAll() {
    if (!token) return;
    try {
      await api("/api/owner/messages/read", { method: "POST", token });
      setMessages((ms) => ms.map((m) => ({ ...m, read_at: m.read_at ?? new Date().toISOString() })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function open(m: Message) {
    if (token && !m.read_at) {
      api(`/api/owner/messages/${m.id}/read`, { method: "POST", token }).catch(() => {});
      setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    if (m.link) router.push(m.link);
  }

  const unread = messages.filter((m) => !m.read_at).length;

  return (
    <main className="bg-aproksi-stone">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl text-aproksi-ink mb-1">Messages</h1>
            <p className="text-sm text-aproksi-slate/60">
              Appeals and updates from your team.{unread > 0 ? ` ${unread} unread.` : ""}
            </p>
          </div>
          {unread > 0 && (
            <button onClick={markAll} className="text-sm text-aproksi-ultra hover:underline inline-flex items-center gap-1">
              <Check className="h-4 w-4" /> Mark all read
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-aproksi-red/30 bg-aproksi-red/5 px-4 py-3 text-sm text-aproksi-red">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-aproksi-ultra" />
          </div>
        ) : messages.length === 0 ? (
          <div className={`${cardCls} p-10 text-center`}>
            <Inbox className="h-8 w-8 text-aproksi-slate/30 mx-auto mb-3" />
            <p className="text-aproksi-slate/70">No messages yet.</p>
            <p className="text-sm text-aproksi-slate/50 mt-1">Appeals from your team will show up here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => {
              const Icon = m.kind === "appeal" ? Scale : Bell;
              const unreadRow = !m.read_at;
              return (
                <button
                  key={m.id}
                  onClick={() => open(m)}
                  className={`${cardCls} w-full text-left p-5 flex gap-4 transition hover:border-aproksi-ultra/40 ${
                    unreadRow ? "border-l-4 border-l-aproksi-ultra" : ""
                  }`}
                >
                  <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                    m.kind === "appeal" ? "bg-aproksi-ultra/10 text-aproksi-ultra" : "bg-aproksi-mist text-aproksi-slate"
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className={`text-sm ${unreadRow ? "font-semibold text-aproksi-ink" : "text-aproksi-ink"}`}>
                        {m.title}
                      </p>
                      <span className="text-xs text-aproksi-slate/50 shrink-0">{timeAgo(m.created_at)}</span>
                    </div>
                    <p className="text-sm text-aproksi-slate/70 mt-0.5 whitespace-pre-wrap line-clamp-3">{m.body}</p>
                    {m.link && <span className="text-xs text-aproksi-ultra mt-1 inline-block">Open →</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
