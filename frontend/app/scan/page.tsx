"use client";

/**
 * Deep-link fallback: if an employee opens the printed QR with their phone
 * camera instead of the in-app scanner, they land here (…/scan?w=<token>).
 * Logged-in employees clock in immediately; others are sent to log in first,
 * then returned here.
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getEmployeeToken } from "@/lib/api";
import ClockInScanner from "@/components/ClockInScanner";

function ScanInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("w");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) return;
    if (!getEmployeeToken()) {
      router.replace(`/me/login?next=${encodeURIComponent(`/scan?w=${token}`)}`);
      return;
    }
    setReady(true);
  }, [token, router]);

  if (!token) {
    return <p className="text-sm text-kaunta-red">This link is missing its workplace code.</p>;
  }
  if (!ready) {
    return <p className="text-sm text-kaunta-slate/60">Checking your session…</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-kaunta-ink">Clocking you in…</h1>
      <ClockInScanner presetToken={token} />
    </div>
  );
}

export default function ScanPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Suspense fallback={<p className="text-sm text-kaunta-slate/60">Loading…</p>}>
        <ScanInner />
      </Suspense>
    </main>
  );
}
