"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Home, QrCode, Clock, AlertTriangle, Wallet, Megaphone } from "lucide-react";
import { getEmployeeToken, clearEmployeeToken } from "@/lib/api";

/**
 * Employee shell (spec §8). Wraps every page under /me/** with a header + nav,
 * gated on the employee session. /me/login is exempt from the gate — it's how
 * an employee without a session gets one.
 */
const NAV = [
  { href: "/me", label: "Home", icon: Home },
  { href: "/me/clock-in", label: "Clock in", icon: QrCode },
  { href: "/me/history", label: "History", icon: Clock },
  { href: "/me/violations", label: "Violations", icon: AlertTriangle },
  { href: "/me/payslips", label: "Payslips", icon: Wallet },
  { href: "/me/announcements", label: "Announcements", icon: Megaphone },
];

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === "/me/login";
  const [ready, setReady] = useState(isLoginRoute);

  useEffect(() => {
    if (isLoginRoute) {
      setReady(true);
      return;
    }
    if (!getEmployeeToken()) {
      router.replace("/me/login");
    } else {
      setReady(true);
    }
  }, [isLoginRoute, router, pathname]);

  // /me/login renders standalone — no shell, no auth gate.
  if (isLoginRoute) return <>{children}</>;

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-kaunta-stone flex flex-col">
      <header className="border-b border-kaunta-mist bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-display text-2xl text-kaunta-ink">Kaunta HR</span>
          <button
            onClick={() => {
              clearEmployeeToken();
              router.replace("/me/login");
            }}
            className="flex items-center gap-1.5 text-sm text-kaunta-copper hover:underline"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
        <nav className="max-w-3xl mx-auto px-6 flex gap-1 overflow-x-auto pb-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-kaunta-copper/10 text-kaunta-copper font-medium"
                    : "text-kaunta-slate/70 hover:bg-kaunta-stone hover:text-kaunta-ink"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">{children}</div>
    </div>
  );
}
