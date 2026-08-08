"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";

const NAV = [
  { href: "/features", label: "Product" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/multi-site", label: "Multi-site" },
  { href: "/docs", label: "Docs" },
];

const MORE = [
  { href: "/compliance", label: "Compliance & records" },
  { href: "/security", label: "Security & data" },
  { href: "/changelog", label: "Changelog" },
];

export function SiteHeader() {
  const pathname = usePathname();
  /* The sheet is open only for the route it was opened on, so navigating
   * closes it without an effect syncing state back into React. */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  /* Sticky state comes from a sentinel crossing the top edge — no
   * scroll handler, so the header can never contend with the scroller. */
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => setStuck(!e.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div ref={sentinel} aria-hidden className="absolute top-0 h-px w-full" />
      <header
        className={cn(
          "sticky top-0 z-50 transition-colors duration-300",
          stuck
            ? "border-b border-white/10 bg-aproksi-void/85 backdrop-blur-md"
            : "border-b border-transparent bg-transparent"
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between px-5 sm:h-18 sm:px-8">
          <Link
            href="/"
            aria-label="Aproksi HR — home"
            className="flex min-h-[44px] shrink-0 items-center"
          >
            <BrandLogo size="md" tone="dark" />
          </Link>

          {/* desktop nav */}
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-[0.8125rem] transition-colors duration-200",
                    active
                      ? "text-white"
                      : "text-white/55 hover:text-white/90"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href="/login"
              className="rounded-full px-3.5 py-2 text-[0.8125rem] text-white/55 transition-colors duration-200 hover:text-white/90"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center rounded-full bg-white px-4 text-[0.8125rem] font-medium text-aproksi-ink transition-colors duration-200 hover:bg-white/88"
            >
              Start free
            </Link>
          </div>

          {/* mobile trigger */}
          <button
            type="button"
            onClick={() => setOpenedOn((v) => (v === pathname ? null : pathname))}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white transition-colors duration-200 hover:border-white/35 lg:hidden"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              {open ? (
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M3 6h14M3 13h14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* mobile sheet */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 top-16 z-40 bg-aproksi-void transition-opacity duration-250 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <nav className="flex h-full flex-col overflow-y-auto px-5 pb-10 pt-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="font-display border-b border-white/8 py-4 text-2xl tracking-[-0.01em] text-white"
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-4 grid">
            {MORE.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-[44px] items-center text-[0.95rem] text-white/60"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mt-auto grid gap-3 pt-8">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white text-sm font-medium text-aproksi-ink"
            >
              Start free
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/20 text-sm text-white"
            >
              Sign in
            </Link>
          </div>
        </nav>
      </div>
    </>
  );
}

export default SiteHeader;
