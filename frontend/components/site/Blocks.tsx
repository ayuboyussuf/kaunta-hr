import Link from "next/link";
import { cn } from "@/lib/utils";
import { Container, SectionHead, SiteButton, ArrowRight, Eyebrow } from "./SiteUI";

/* ── FAQ — native <details>, so open/close costs no JS at all ───── */

export function FAQ({
  items,
  tone = "dark",
}: {
  items: { q: string; a: React.ReactNode }[];
  tone?: "dark" | "light";
}) {
  const dark = tone === "dark";
  return (
    <div className={cn("border-t", dark ? "border-white/10" : "border-kaunta-mist")}>
      {items.map((item) => (
        <details
          key={item.q}
          className={cn(
            "group border-b",
            dark ? "border-white/10" : "border-kaunta-mist"
          )}
        >
            <summary
              className={cn(
                "flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-left text-[0.975rem] leading-snug transition-colors duration-200 sm:text-[1.05rem]",
                dark
                  ? "text-white/85 hover:text-white"
                  : "text-kaunta-ink hover:text-kaunta-ultra"
              )}
            >
              {item.q}
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 shrink-0 transition-transform duration-300 group-open:rotate-45",
                  dark ? "text-white/40" : "text-kaunta-slate/40"
                )}
              >
                <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                  <path
                    d="M8 3v10M3 8h10"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </summary>
            <div
              className={cn(
                "max-w-2xl pb-6 pr-8 text-[0.9rem] leading-relaxed",
                dark ? "text-white/55" : "text-kaunta-slate/70"
              )}
            >
              {item.a}
            </div>
        </details>
      ))}
    </div>
  );
}

/* ── Closing CTA ────────────────────────────────────────────────── */

export function CTASection({
  title = "Set up your first site this afternoon.",
  body = "Create the site, print the QR, add your staff by phone number. Everything after that runs on the rules you set.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="ultra-glow border-t border-white/10 bg-kaunta-void">
      <Container className="py-14 sm:py-20 lg:py-28">
        <>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-[2rem] leading-[1.08] tracking-[-0.02em] text-white sm:text-[2.75rem]">
              {title}
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-[0.975rem] leading-relaxed text-white/55 sm:text-lg">
              {body}
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <SiteButton href="/signup" variant="light" size="lg">
                Start free <ArrowRight />
              </SiteButton>
              <SiteButton href="/docs" variant="outline" size="lg">
                Read the docs
              </SiteButton>
            </div>
          </div>
        </>
      </Container>
    </section>
  );
}

/* ── Page hero used by every non-home page ──────────────────────── */

export function PageHero({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="ultra-glow-top relative overflow-hidden border-b border-white/10 bg-kaunta-void">
      <Container className="pb-12 pt-10 sm:pb-16 sm:pt-14 lg:pb-24 lg:pt-20">
        <>
          <Eyebrow tone="dark">{eyebrow}</Eyebrow>
          <h1 className="font-display mt-5 max-w-3xl text-[2.35rem] leading-[1.04] tracking-[-0.025em] text-white sm:text-[3.4rem] lg:text-[4rem]">
            {title}
          </h1>
          {lede && (
            <p className="mt-6 max-w-2xl text-[1rem] leading-relaxed text-white/60 sm:text-[1.1rem]">
              {lede}
            </p>
          )}
          {children}
        </>
      </Container>
    </section>
  );
}

/* ── Numbered step, used by the explainer and docs ──────────────── */

export function Step({
  n,
  title,
  children,
  tone = "dark",
}: {
  n: string;
  title: string;
  children: React.ReactNode;
  tone?: "dark" | "light";
}) {
  const dark = tone === "dark";
  return (
    <div className="flex gap-5 sm:gap-7">
      <div className="flex shrink-0 flex-col items-center">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border font-mono text-[0.6875rem]",
            dark
              ? "border-white/20 text-white/70"
              : "border-kaunta-ultra/30 text-kaunta-ultra"
          )}
        >
          {n}
        </span>
        <span
          aria-hidden
          className={cn(
            "mt-2 w-px flex-1",
            dark ? "bg-white/10" : "bg-kaunta-mist"
          )}
        />
      </div>
      <div className="pb-10">
        <h3
          className={cn(
            "font-display text-xl leading-snug tracking-[-0.01em] sm:text-2xl",
            dark ? "text-white" : "text-kaunta-ink"
          )}
        >
          {title}
        </h3>
        <div
          className={cn(
            "mt-3 max-w-xl text-[0.9rem] leading-relaxed",
            dark ? "text-white/55" : "text-kaunta-slate/70"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Cross-links between pages ──────────────────────────────────── */

export function NextLinks({
  links,
}: {
  links: { href: string; label: string; blurb: string }[];
}) {
  return (
    <section className="border-t border-white/10 bg-kaunta-void">
      <Container className="py-12 sm:py-16 lg:py-20">
        <SectionHead eyebrow="Keep reading" title="Related" tone="dark" />
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3">
          {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex h-full flex-col bg-kaunta-void p-6 transition-colors duration-300 hover:bg-white/[0.03]"
              >
                <span className="font-display text-lg text-white">{l.label}</span>
                <span className="mt-2 text-[0.85rem] leading-relaxed text-white/50">
                  {l.blurb}
                </span>
                <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-white/40">
                  Open <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
