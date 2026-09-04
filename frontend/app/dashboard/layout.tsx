"use client";

/**
 * Persistent dashboard chrome: a top navbar with the Aproksi logo, links to every
 * management section, and sign-out — shown on all /dashboard/* pages except the
 * standalone onboarding wizard.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { AproksiWordmark } from "@/components/AproksiLogo";
import { LogOut, Bell, Settings } from "lucide-react";

/**
 * The nav, grouped by what the owner is doing rather than by what table the
 * data sits in.
 *
 * There were eleven items here, and the list read like a schema dump: Team,
 * Shifts, Workplaces, QR codes, Leave, Penalties, Rules, Payroll,
 * Announcements, Settings. Half of them are things you touch twice in the life
 * of a site — a QR code is not a job, it is something you print when you open a
 * branch — and they sat at the same weight as the queue of decisions waiting on
 * you this morning.
 *
 * Six groups, each with its own tab strip. Nothing moved: every old URL still
 * resolves, because breaking an owner's bookmarks to tidy a menu is not a trade
 * worth making. What changed is how much you have to read to find anything.
 *
 * Settings lives in the account menu with sign-out; Messages stays behind the
 * bell. Neither is a section of the product.
 */
interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}
interface NavGroup extends NavItem {
  /** Rendered as a tab strip under the navbar. Absent for single-page groups. */
  tabs?: NavItem[];
}

const NAV: NavGroup[] = [
  { href: "/dashboard", label: "Today", exact: true },
  {
    href: "/dashboard/employees",
    label: "People",
    tabs: [
      { href: "/dashboard/employees", label: "Team" },
      { href: "/dashboard/leave", label: "Leave" },
      { href: "/dashboard/announcements", label: "Announcements" },
    ],
  },
  {
    href: "/dashboard/violations",
    label: "Decisions",
    tabs: [
      { href: "/dashboard/violations", label: "Penalties" },
      { href: "/dashboard/closures", label: "Days nobody clocked in" },
    ],
  },
  {
    href: "/dashboard/workplaces",
    label: "Setup",
    tabs: [
      { href: "/dashboard/workplaces", label: "Workplaces" },
      { href: "/dashboard/qr", label: "QR codes" },
      { href: "/dashboard/shifts", label: "Shifts" },
      { href: "/dashboard/rules", label: "Rules" },
    ],
  },
  { href: "/dashboard/payroll", label: "Payroll" },
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

  // A group is current when the page you are on is any of its tabs — so
  // /dashboard/qr lights up "Setup" even though Setup's own link points at
  // Workplaces. Without this, four of the eleven old destinations would have
  // left the navbar showing nothing selected at all.
  const groupIsActive = (group: NavGroup) =>
    isActive(group.href, group.exact) || (group.tabs ?? []).some((t) => isActive(t.href));

  const currentGroup = NAV.find(groupIsActive);
  const tabs = currentGroup?.tabs ?? [];

  return (
    <div className="min-h-screen bg-aproksi-stone">
      <nav className="sticky top-0 z-30 border-b border-aproksi-mist bg-white/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <Link href="/dashboard" aria-label="Aproksi HR — Overview">
              <AproksiWordmark size="md" theme="dark" />
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/messages"
                aria-label={`Messages${unread > 0 ? `, ${unread} unread` : ""}`}
                className={`relative grid h-9 w-9 place-items-center rounded-full border transition-colors ${
                  isActive("/dashboard/messages")
                    ? "border-aproksi-ultra/40 text-aproksi-ultra bg-aproksi-ultra/5"
                    : "border-aproksi-mist text-aproksi-slate/70 hover:text-aproksi-ink hover:border-aproksi-slate/30"
                }`}
              >
                <Bell className="h-[18px] w-[18px]" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-aproksi-ultra px-1 text-[11px] font-semibold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              {/* Settings is configuration, not a section of the product. It
                  sits with sign-out, where you look for account things. */}
              <Link
                href="/dashboard/settings"
                aria-label="Settings"
                className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${
                  isActive("/dashboard/settings")
                    ? "border-aproksi-ultra/40 text-aproksi-ultra bg-aproksi-ultra/5"
                    : "border-aproksi-mist text-aproksi-slate/70 hover:text-aproksi-ink hover:border-aproksi-slate/30"
                }`}
              >
                <Settings className="h-[18px] w-[18px]" />
              </Link>
              <button
                onClick={signOut}
                className="inline-flex items-center gap-1.5 text-sm text-aproksi-slate/70 hover:text-aproksi-ink"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto -mb-px">
            {NAV.map((item) => {
              const active = groupIsActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap px-3 py-2.5 text-sm border-b-2 transition-colors ${
                    active
                      ? "border-aproksi-ultra text-aproksi-ink font-medium"
                      : "border-transparent text-aproksi-slate/60 hover:text-aproksi-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* The second row only exists where there is somewhere else to go. A tab
          strip with one tab is chrome pretending to be navigation. */}
      {tabs.length > 1 && (
        <div className="border-b border-aproksi-mist bg-white">
          <div className="max-w-6xl mx-auto flex gap-1 overflow-x-auto px-4 sm:px-6">
            {tabs.map((t) => {
              const active = isActive(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`whitespace-nowrap px-3 py-2 text-[0.8125rem] transition-colors ${
                    active
                      ? "text-aproksi-ultra font-medium"
                      : "text-aproksi-slate/60 hover:text-aproksi-ink"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
