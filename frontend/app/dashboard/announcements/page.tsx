"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ANNOUNCEMENT_TYPES, formatDate, formatTime } from "@/lib/utils";

type Scope = "all" | "workplace";

interface Workplace {
  id: string;
  name: string;
}

interface Announcement {
  id: string;
  type: string;
  title: string;
  body: string;
  scope: Scope;
  workplace_id: string | null;
  posted_at: string;
  workplaces: { name: string } | null;
}

const inputCls =
  "w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper";

/** Owner announcement composer + posted feed (spec §7). */
export default function AnnouncementsPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [type, setType] = useState<string>("other");
  const [scope, setScope] = useState<Scope>("all");
  const [workplaceId, setWorkplaceId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      setToken(session.access_token);

      const [{ data: wps }, announcementsRes] = await Promise.all([
        supabase.from("workplaces").select("id, name").order("name"),
        api<{ announcements: Announcement[] }>("/api/announcements", {
          token: session.access_token,
        }).catch(() => ({ announcements: [] as Announcement[] })),
      ]);
      setWorkplaces(wps ?? []);
      setAnnouncements(announcementsRes.announcements);
      setLoading(false);
    })();
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setPosting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{
        announcement: Announcement;
        notified: { total: number; sent: number; failed: number };
      }>("/api/announcements", {
        method: "POST",
        token,
        body: {
          scope,
          workplace_id: scope === "workplace" ? workplaceId : undefined,
          type,
          title,
          body,
        },
      });
      setAnnouncements((prev) => [res.announcement, ...prev]);
      setTitle("");
      setBody("");
      setNotice(
        `Posted. Notified ${res.notified.sent}/${res.notified.total} employee(s) on WhatsApp${
          res.notified.failed ? ` (${res.notified.failed} failed to send)` : ""
        }.`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  const canSubmit =
    !posting && title.trim() && body.trim() && (scope === "all" || workplaceId);

  if (loading) {
    return (
      <main className="min-h-screen bg-kaunta-stone px-6 py-10">
        <p className="text-sm text-kaunta-slate/60 max-w-3xl mx-auto">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-kaunta-stone">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="font-display text-3xl text-kaunta-ink mb-1 flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-kaunta-copper" />
            Announcements
          </h1>
          <p className="text-kaunta-slate/70 text-sm">
            Post an update to all employees, or a single workplace, over WhatsApp.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New announcement</CardTitle>
            <CardDescription>Sent immediately to everyone in scope.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-kaunta-slate mb-1">Type</label>
                  <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                    {Object.entries(ANNOUNCEMENT_TYPES).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-kaunta-slate mb-1">Scope</label>
                  <select
                    value={scope}
                    onChange={(e) => {
                      const v = e.target.value as Scope;
                      setScope(v);
                      if (v === "all") setWorkplaceId("");
                    }}
                    className={inputCls}
                  >
                    <option value="all">All employees</option>
                    <option value="workplace">Single workplace</option>
                  </select>
                </div>
              </div>

              {scope === "workplace" && (
                <div>
                  <label className="block text-xs font-medium text-kaunta-slate mb-1">Workplace</label>
                  <select
                    value={workplaceId}
                    onChange={(e) => setWorkplaceId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Select a workplace…</option>
                    {workplaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  {workplaces.length === 0 && (
                    <p className="text-xs text-kaunta-slate/50 mt-1">No workplaces set up yet.</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-kaunta-slate mb-1">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. All-hands meeting Friday"
                  maxLength={200}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-kaunta-slate mb-1">Message</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write the announcement…"
                  rows={4}
                  maxLength={4000}
                  className={inputCls}
                />
              </div>

              {error && <p className="text-sm text-kaunta-red">{error}</p>}
              {notice && <p className="text-sm text-kaunta-sage">{notice}</p>}

              <Button type="submit" disabled={!canSubmit}>
                {posting ? "Posting…" : "Post announcement"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div>
          <h2 className="font-display text-xl text-kaunta-ink mb-3">Posted</h2>
          {announcements.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-kaunta-slate/60">
                No announcements posted yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {announcements.map((a) => (
                <Card key={a.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-xs font-medium px-2 py-1 rounded-full border border-kaunta-copper/20 bg-kaunta-copper/10 text-kaunta-copper">
                        {ANNOUNCEMENT_TYPES[a.type] ?? "Other"}
                      </span>
                      <span className="text-xs text-kaunta-slate/50 shrink-0">
                        {formatDate(a.posted_at)} · {formatTime(a.posted_at)}
                      </span>
                    </div>
                    <h3 className="font-display text-lg text-kaunta-ink mb-1">{a.title}</h3>
                    <p className="text-sm text-kaunta-slate/80 whitespace-pre-wrap">{a.body}</p>
                    <p className="text-xs text-kaunta-slate/40 mt-3">
                      {a.scope === "all" ? "All workplaces" : a.workplaces?.name ?? "This workplace"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
