"use client";

/**
 * Owner QR codes (spec §3). For each workplace, fetch its signed token and render
 * a printable QR encoding a `…/scan?w=<token>` deep link — so an employee can
 * scan it with the in-app scanner OR their plain phone camera. Owners print it and
 * post it at the location; "Replace code" rotates the nonce to void old prints.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeCanvas } from "qrcode.react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Workplace {
  id: string;
  name: string;
}

export default function QrCodesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [selected, setSelected] = useState<Workplace | null>(null);
  const [origin, setOrigin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ownerToken(): Promise<string> {
    const {
      data: { session },
    } = await createClient().auth.getSession();
    if (!session) throw new Error("Please sign in again.");
    return session.access_token;
  }

  async function loadToken(wp: Workplace) {
    try {
      setSelected(wp);
      setToken(null);
      const t = await ownerToken();
      const res = await api<{ token: string }>(`/api/attendance/qr/${wp.id}`, { token: t });
      setToken(res.token);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function rotate() {
    if (!selected) return;
    setBusy(true);
    try {
      const t = await ownerToken();
      const res = await api<{ token: string }>(`/api/attendance/qr/${selected.id}/rotate`, {
        method: "POST",
        token: t,
      });
      setToken(res.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      try {
        const t = await ownerToken();
        const res = await api<{ workplaces: Workplace[] }>("/api/workplaces", { token: t });
        setWorkplaces(res.workplaces);
        if (res.workplaces[0]) loadToken(res.workplaces[0]);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scanUrl = token ? `${origin}/scan?w=${token}` : "";

  return (
    <main className="min-h-screen bg-kaunta-stone">
      <header className="border-b border-kaunta-mist bg-white print:hidden">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <span className="font-display text-2xl text-kaunta-ink">QR codes</span>
          <Link href="/dashboard" className="text-sm text-kaunta-copper hover:underline">
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="rounded-lg border border-kaunta-red/30 bg-kaunta-red/5 px-4 py-3 text-sm text-kaunta-red print:hidden">
            {error}
          </div>
        )}

        <div className="flex gap-1 overflow-x-auto print:hidden">
          {workplaces.map((wp) => (
            <button
              key={wp.id}
              onClick={() => loadToken(wp)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${
                selected?.id === wp.id
                  ? "bg-kaunta-ink text-white"
                  : "bg-white text-kaunta-slate/70 border border-kaunta-mist hover:bg-kaunta-mist/40"
              }`}
            >
              {wp.name}
            </button>
          ))}
        </div>

        {selected && token ? (
          <Card>
            <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
              <p className="font-display text-2xl text-kaunta-ink">{selected.name}</p>
              <div className="rounded-2xl bg-white p-4 border border-kaunta-mist">
                <QRCodeCanvas value={scanUrl} size={260} level="M" includeMargin />
              </div>
              <p className="text-sm text-kaunta-slate/60 max-w-sm">
                Print this and post it at {selected.name}. Employees scan it to clock in. Valid ~3 months.
              </p>
              <div className="flex gap-3 print:hidden">
                <Button onClick={() => window.print()}>Print</Button>
                <Button variant="outline" onClick={rotate} disabled={busy}>
                  {busy ? "Replacing…" : "Replace code"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-kaunta-slate/60">
            {workplaces.length === 0 ? "Add a workplace first." : "Loading…"}
          </p>
        )}
      </div>
    </main>
  );
}
