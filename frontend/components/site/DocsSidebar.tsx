"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { DOCS_NAV } from "./docsNav";

export function DocsSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DOCS_NAV;
    return DOCS_NAV.map((g) => ({
      ...g,
      items: g.items.filter((item) =>
        [item.title, item.summary, ...item.keywords]
          .join(" ")
          .toLowerCase()
          .includes(q)
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <label className="relative block">
        <span className="sr-only">Search the documentation</span>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35"
        >
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M10.5 10.5L14 14"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search docs"
          className="h-12 w-full rounded-lg sm:h-10 border border-white/12 bg-white/[0.03] pl-9 pr-3 text-[0.8125rem] text-white placeholder:text-white/30 focus:border-kaunta-ultra-br/60 focus:outline-none"
        />
      </label>

      <nav className="flex flex-col gap-7">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-white/40 sm:text-[0.6875rem] sm:text-[0.625rem] sm:text-white/30">
              {g.group}
            </p>
            <ul className="mt-3 space-y-0.5">
              {g.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex min-h-[44px] items-center rounded-md pl-3 text-[0.95rem] transition-colors duration-150 sm:min-h-0 sm:py-1.5 sm:text-[0.875rem]",
                        active
                          ? "border-l border-kaunta-ultra-br bg-white/[0.04] text-white"
                          : "border-l border-white/10 text-white/50 hover:border-white/30 hover:text-white/85"
                      )}
                    >
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {groups.length === 0 && (
          <p className="text-[0.8125rem] text-white/40">
            Nothing matches &ldquo;{query}&rdquo;.
          </p>
        )}
      </nav>
    </div>
  );
}

export default DocsSidebar;
