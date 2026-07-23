"use client";

/**
 * Persistent dashboard chrome: a top navbar with the Kaunta logo, links to every
 * management section, and sign-out — shown on all /dashboard/* pages except the
 * standalone onboarding wizard.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import { LogOut } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/employees", label: "Team" },
  { href: "/dashboard/shifts", label: "Shifts" },
  { href: "/dashboard/workplaces", label: "Workplaces" },
  { href: "/dashboard/qr", label: "QR codes" },
  { href: "/dashboard/violations", label: "Penalties" },
  { href: "/dashboard/payroll", label: "Payroll" },
  { href: "/dashboard/announcements", label: "Announcements" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // The onboarding wizard is a full-screen standalone flow — no dashboard chrome.
  if (pathname?.startsWith("/dashboard/onboarding")) return <>{children}</>;

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname?.startsWith(href + "/");

  return (
    <div className="min-h-screen bg-kaunta-stone">
      <nav className="sticky top-0 z-30 border-b border-kaunta-mist bg-white/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <Link href="/dashboard" aria-label="Kaunta HR — Overview">
              <Logo mark={28} />
            </Link>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1.5 text-sm text-kaunta-slate/70 hover:text-kaunta-ink"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto -mb-px">
            {NAV.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap px-3 py-2.5 text-sm border-b-2 transition-colors ${
                    active
                      ? "border-kaunta-copper text-kaunta-ink font-medium"
                      : "border-transparent text-kaunta-slate/60 hover:text-kaunta-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
