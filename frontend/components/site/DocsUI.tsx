import Link from "next/link";
import { cn } from "@/lib/utils";
import { DOCS_FLAT } from "./docsNav";
import { ArrowRight } from "./SiteUI";

/* ── Page frame ─────────────────────────────────────────────────── */

export function DocPage({
  title,
  lede,
  children,
  href,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
  /** current page href — drives prev/next */
  href: string;
}) {
  const index = DOCS_FLAT.findIndex((d) => d.href === href);
  const prev = index > 0 ? DOCS_FLAT[index - 1] : null;
  const next =
    index >= 0 && index < DOCS_FLAT.length - 1 ? DOCS_FLAT[index + 1] : null;

  return (
    <article className="min-w-0">
      <header className="border-b border-white/10 pb-10">
        <h1 className="font-display text-[2.15rem] leading-[1.08] tracking-[-0.02em] text-white sm:text-[2.75rem]">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-[1rem] leading-relaxed text-white/60">
          {lede}
        </p>
      </header>

      <div className="pt-10">{children}</div>

      {(prev || next) && (
        <nav className="mt-16 grid gap-4 border-t border-white/10 pt-8 sm:grid-cols-2">
          {prev ? (
            <Link
              href={prev.href}
              className="rounded-lg border border-white/10 p-5 transition-colors duration-200 hover:border-white/30"
            >
              <span className="font-mono text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-[0.16em] text-white/30">
                Previous
              </span>
              <span className="mt-2 block text-[0.95rem] text-white">
                {prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={next.href}
              className="rounded-lg border border-white/10 p-5 text-right transition-colors duration-200 hover:border-white/30 sm:col-start-2"
            >
              <span className="font-mono text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-[0.16em] text-white/30">
                Next
              </span>
              <span className="mt-2 block text-[0.95rem] text-white">
                {next.title}
              </span>
            </Link>
          )}
        </nav>
      )}
    </article>
  );
}

/* ── Prose atoms ────────────────────────────────────────────────── */

export function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="font-display mt-14 scroll-mt-28 border-t border-white/10 pt-10 text-[1.6rem] leading-snug tracking-[-0.015em] text-white first:mt-0 first:border-0 first:pt-0 sm:text-[1.85rem]"
    >
      {children}
    </h2>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-9 text-[1.05rem] font-medium leading-snug text-white">
      {children}
    </h3>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 max-w-2xl text-[1rem] leading-[1.75] text-white/65 sm:text-[0.95rem] sm:text-white/60">
      {children}
    </p>
  );
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mt-4 max-w-2xl space-y-3 text-[1rem] leading-[1.7] text-white/65 sm:space-y-2.5 sm:text-[0.95rem] sm:text-white/60">
      {children}
    </ul>
  );
}

export function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-[0.6rem] h-px w-3 shrink-0 bg-aproksi-ultra-br/60"
      />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-white underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-white"
    >
      {children}
    </Link>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-white/12 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[0.8125rem] text-white/85">
      {children}
    </code>
  );
}

/* ── Numbered procedure ─────────────────────────────────────────── */

export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="mt-6 max-w-2xl">{children}</ol>;
}

export function StepItem({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-5 pb-8 last:pb-0">
      <span
        aria-hidden
        className="absolute bottom-0 left-[0.9375rem] top-8 w-px bg-white/10"
      />
      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-aproksi-void font-mono text-[0.6875rem] text-white/70">
        {n}
      </span>
      <div className="min-w-0 pt-1">
        <p className="text-[0.975rem] font-medium leading-snug text-white">
          {title}
        </p>
        {children && (
          <div className="mt-2 text-[0.9rem] leading-[1.7] text-white/55">
            {children}
          </div>
        )}
      </div>
    </li>
  );
}

/* ── Code / config block ────────────────────────────────────────── */

export function CodeBlock({
  label,
  lines,
}: {
  label?: string;
  lines: string[];
}) {
  return (
    <div className="mt-6 max-w-2xl overflow-hidden rounded-lg border border-white/12 bg-white/[0.025]">
      {label && (
        <div className="border-b border-white/10 px-4 py-2.5">
          <span className="font-mono text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-[0.16em] text-white/35">
            {label}
          </span>
        </div>
      )}
      <pre className="overflow-x-auto px-4 py-4">
        <code className="font-mono text-[0.8125rem] leading-[1.7] text-white/75">
          {lines.map((line, i) => (
            <span key={i} className="block whitespace-pre">
              {line || " "}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

/* ── Callout ────────────────────────────────────────────────────── */

export function Callout({
  tone = "note",
  title,
  children,
}: {
  tone?: "note" | "warn";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <aside
      className={cn(
        "mt-6 max-w-2xl rounded-lg border p-5",
        tone === "note"
          ? "border-aproksi-ultra-br/30 bg-aproksi-ultra/[0.07]"
          : "border-aproksi-amber/40 bg-aproksi-amber/[0.08]"
      )}
    >
      <p
        className={cn(
          "font-mono text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-[0.16em]",
          tone === "note" ? "text-aproksi-ultra-br" : "text-aproksi-amber"
        )}
      >
        {title}
      </p>
      <div className="mt-2.5 text-[0.9rem] leading-[1.7] text-white/65">
        {children}
      </div>
    </aside>
  );
}

/* ── Definition table ───────────────────────────────────────────── */

export function DocTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="mt-6 -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[520px] max-w-2xl border-collapse text-left">
        <thead>
          <tr className="border-b border-white/15">
            {head.map((h) => (
              <th
                key={h}
                className="py-3 pr-4 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-white/40 sm:text-[0.6875rem] sm:text-[0.625rem]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/8">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    "py-3 pr-4 text-[0.875rem] leading-relaxed",
                    j === 0 ? "text-white/85" : "text-white/55"
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Related links footer ───────────────────────────────────────── */

export function SeeAlso({ hrefs }: { hrefs: string[] }) {
  const items = hrefs
    .map((h) => DOCS_FLAT.find((d) => d.href === h))
    .filter(Boolean) as typeof DOCS_FLAT;
  if (items.length === 0) return null;
  return (
    <div className="mt-14 rounded-lg border border-white/10 p-6">
      <p className="font-mono text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-[0.16em] text-white/30">
        See also
      </p>
      <ul className="mt-4 space-y-3">
        {items.map((d) => (
          <li key={d.href}>
            <Link
              href={d.href}
              className="group flex min-h-[44px] items-baseline gap-2 pt-3 text-[0.95rem] text-white/70 hover:text-white sm:min-h-0 sm:pt-0 sm:text-[0.9rem]"
            >
              {d.title}
              <ArrowRight className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-100" />
            </Link>
            <p className="mt-1 text-[0.8125rem] text-white/40">{d.summary}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
