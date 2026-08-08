"use client";

/**
 * Employee-facing rules screen. Shows the penalties that apply at the
 * employee's workplace so they know the rules before any penalty is logged.
 * Read-only; always available from the employee home.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getEmployeeToken } from "@/lib/api";
import { Card } from "@/components/ui/card";

interface Rule {
  id: string;
  code: string;
  reason: string;
  amount: number;
  appeal_window_hours: number;
}
interface RulesResponse {
  workplace: { name: string } | null;
  ruleset: { id: string; name: string } | null;
  rules: Rule[];
}

const fmtKes = (n: number) => `KES ${Number(n ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

export default function MyRulesPage() {
  const router = useRouter();
  const [data, setData] = useState<RulesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getEmployeeToken();
    if (!t) {
      router.replace("/me/login");
      return;
    }
    (async () => {
      try {
        setData(await api<RulesResponse>("/api/employees/me/rules", { token: t }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-aproksi-stone grid place-items-center">
        <p className="text-aproksi-slate/60">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-aproksi-stone">
      <header className="border-b border-aproksi-mist bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-display text-2xl text-aproksi-ink">Workplace rules</span>
          <button onClick={() => router.push("/me")} className="text-sm text-aproksi-ultra hover:underline">
            Back
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {error && (
          <div className="rounded-lg border border-aproksi-red/30 bg-aproksi-red/5 px-4 py-3 text-sm text-aproksi-red">
            {error}
          </div>
        )}

        {data?.workplace?.name && (
          <p className="text-sm text-aproksi-slate/70">
            These are the penalties that apply at <span className="text-aproksi-ink">{data.workplace.name}</span>.
          </p>
        )}

        {!data || data.rules.length === 0 ? (
          <Card className="p-8 text-center text-sm text-aproksi-slate/60">
            No penalty rules have been set for your workplace.
          </Card>
        ) : (
          data.rules.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-aproksi-ink">{r.reason}</p>
                  <p className="text-xs text-aproksi-slate/60 mt-0.5">
                    You can appeal within {r.appeal_window_hours}h of the penalty.
                  </p>
                </div>
                <span className="shrink-0 text-lg text-aproksi-red tabular-nums">{fmtKes(r.amount)}</span>
              </div>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
