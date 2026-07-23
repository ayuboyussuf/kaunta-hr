"use client";

import { useEffect, useState } from "react";
import { api, getEmployeeToken } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
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

export default function EmployeeAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getEmployeeToken();
    if (!token) return;
    api<{ announcements: Announcement[] }>("/api/employees/me/announcements", { token })
      .then((r) => {
        setItems(r.announcements);
        // Mark everything as seen now that the feed has been opened.
        localStorage.setItem(SEEN_KEY, new Date().toISOString());
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-kaunta-ink mb-1">Announcements</h1>
        <p className="text-kaunta-slate/70 text-sm">Company and workplace updates.</p>
      </div>

      {error && <p className="text-sm text-kaunta-red">{error}</p>}
      {!items && !error && <p className="text-sm text-kaunta-slate/60">Loading…</p>}

      {items && items.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-kaunta-slate/60">
            No announcements yet.
          </CardContent>
        </Card>
      )}

      {items && items.length > 0 && (
        <div className="space-y-3">
          {items.map((a) => (
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
  );
}
