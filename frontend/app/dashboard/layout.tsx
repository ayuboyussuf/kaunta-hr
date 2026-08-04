"use client";

/**
 * Persistent dashboard chrome: a top navbar with the Kaunta logo, links to every
 * management section, and sign-out — shown on all /dashboard/* pages except the
 * standalone onboarding wizard.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { KauntaWordmark } from "@/components/KauntaLogo";
import { LogOut, Bell } from "lucide-react";

// Messages live behind the bell icon (top right), not in the nav.
const NAV = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/employees", label: "Team" },
  { href: "/dashboard/shifts", label: "Shifts" },
  { href: "/dashboard/workplaces", label: "Workplaces" },
  { href: "/dashboard/qr", label: "QR codes" },
  { href: "/dashboard/leave", label: "Leave" },
  { href: "/dashboard/violations", label: "Penalties" },
  { href: "/dashboard/rules", label: "Rules" },
  { href: "/dashboard/payroll", label: "Payroll" },
  { href: "/dashboard/announcements", label: "Announcements" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [unread, setUnread] = useState(0);

  const onboarding = pathname?.startsWith("/dashboard/onboarding") ?? false;

  // Poll the inbox unread count for the bell badge (light query, every 60s).
  const loadUnread = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const r = await api<{ unread: number }>("/api/owner/messages", { token });
      setUnread(r.unread ?? 0);
    } catch {
      /* best-effort badge */
    }
  }, [supabase]);

  useEffect(() => {
    if (onboarding) return;
    loadUnread();
    const timer = setInterval(loadUnread, 60_000);
    return () => clearInterval(timer);
  }, [onboarding, loadUnread, pathname]);

  // The onboarding wizard is a full-screen standalone flow — no dashboard chrome.
  if (onboarding) return <>{children}</>;

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
              <KauntaWordmark size="md" theme="dark" />
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/messages"
                aria-label={`Messages${unread > 0 ? `, ${unread} unread` : ""}`}
                className={`relative grid h-9 w-9 place-items-center rounded-full border transition-colors ${
                  isActive("/dashboard/messages")
                    ? "border-kaunta-ultra/40 text-kaunta-ultra bg-kaunta-ultra/5"
                    : "border-kaunta-mist text-kaunta-slate/70 hover:text-kaunta-ink hover:border-kaunta-slate/30"
                }`}
              >
                <Bell className="h-[18px] w-[18px]" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-kaunta-ultra px-1 text-[11px] font-semibold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <button
                onClick={signOut}
                className="inline-flex items-center gap-1.5 text-sm text-kaunta-slate/70 hover:text-kaunta-ink"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
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
                      ? "border-kaunta-ultra text-kaunta-ink font-medium"
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
