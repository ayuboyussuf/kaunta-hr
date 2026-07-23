"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getEmployeeToken } from "@/lib/api";
import ClockInScanner from "@/components/ClockInScanner";

export default function ClockInPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getEmployeeToken()) router.replace("/me/login");
  }, [router]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-kaunta-ink mb-1">Clock in</h1>
        <p className="text-kaunta-slate/70 text-sm">
          Scan the QR code posted at your workplace. Your time and location are recorded on the server.
        </p>
      </div>
      <ClockInScanner />
    </div>
  );
}
