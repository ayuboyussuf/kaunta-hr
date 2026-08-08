import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { RuleMark } from "./Engravings";

/* `tone` always describes the SURFACE a component sits on:
 *   tone="dark"  → dark surface, light text   (the marketing site)
 *   tone="light" → light surface, dark text   (the app UI)
 * Every component in this file and in Blocks.tsx follows that. */

/* ── Layout ─────────────────────────────────────────────────────── */

export function Container({
  children,
  className,
  width = "default",
}: {
  children: React.ReactNode;
  className?: string;
  width?: "default" | "wide" | "prose";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-5 sm:px-8",
        width === "default" && "max-w-6xl",
        width === "wide" && "max-w-[1400px]",
        width === "prose" && "max-w-3xl",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  className,
  tone = "dark",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "dark" | "light";
}) {
  return (
    <p
      className={cn(
        "eyebrow",
        tone === "dark" ? "text-white/45" : "text-aproksi-slate/50",
        className
      )}
    >
      {children}
    </p>
  );
}

export function SectionHead({
  eyebrow,
  title,
  lede,
  tone = "dark",
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  tone?: "dark" | "light";
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        align === "center" && "mx-auto max-w-2xl text-center",
        className
      )}
    >
      {eyebrow && <Eyebrow tone={tone}>{eyebrow}</Eyebrow>}
      <h2
        className={cn(
          "font-display mt-4 text-[2rem] leading-[1.08] tracking-[-0.02em] sm:text-[2.75rem] lg:text-[3.25rem]",
          tone === "dark" ? "text-white" : "text-aproksi-ink"
        )}
      >
        {title}
      </h2>
      {lede && (
        <p
          className={cn(
            "mt-5 text-[0.975rem] leading-relaxed sm:text-lg",
            tone === "dark" ? "text-white/60" : "text-aproksi-slate/70",
            align === "center" ? "mx-auto max-w-xl" : "max-w-xl"
          )}
        >
          {lede}
        </p>
      )}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-center py-2", className)}>
      <RuleMark className="h-2 w-[120px] text-aproksi-slate/30" />
    </div>
  );
}

/* ── Buttons ────────────────────────────────────────────────────── */

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full text-[0.8125rem] font-medium tracking-[0.01em] transition-[background-color,color,border-color,transform] duration-200 active:translate-y-px";

export function SiteButton({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "light" | "outline" | "ghost";
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        btnBase,
        size === "md" ? "h-11 px-5 sm:h-9 sm:px-4" : "h-12 px-6 text-sm sm:h-11",
        variant === "primary" &&
          "bg-aproksi-ultra text-white hover:bg-aproksi-ultra-dp",
        variant === "light" &&
          "bg-white text-aproksi-ink hover:bg-white/88",
        variant === "outline" &&
          "border border-white/25 bg-white/[0.06] text-white backdrop-blur-sm hover:border-white/50 hover:bg-white/[0.12]",
        variant === "ghost" &&
          "border border-aproksi-mist bg-white text-aproksi-ink hover:border-aproksi-slate/25",
        className
      )}
    >
      {children}
    </Link>
  );
}

export function ArrowRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={cn("h-3.5 w-3.5", className)}
      aria-hidden="true"
    >
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Product screenshots ────────────────────────────────────────────
 * Real captures only. There is no placeholder variant on purpose: an
 * empty slot on a live page is worse than no image at all.
 * ------------------------------------------------------------------ */

export const SHOTS = {
  teamCalendar: {
    src: "/shots/team-calendar.png",
    width: 1400,
    height: 1302,
    alt: "The Team screen with an employee's attendance calendar open for July, days marked late, absent and flagged, and a button to download the month's report with photos.",
  },
  overview: {
    src: "/shots/overview-mobile.png",
    width: 760,
    height: 1333,
    alt: "The site overview on a phone: counts for clocked in, late, absent and flagged, above today's attendance list.",
  },
  rules: {
    src: "/shots/rules-mobile.png",
    width: 760,
    height: 1333,
    alt: "The Rules screen on a phone showing a shared default ruleset with a late-arrival penalty of KES 200 and a phone-use penalty of KES 500, each with a 24-hour appeal window.",
  },
  violationOutcome: {
    src: "/shots/violation-outcome.png",
    width: 900,
    height: 1317,
    alt: "A locked Violation Outcome PDF: the employee and site, the reason recorded as late arrival, a KES 200 deduction, status upheld, the appeal the employee submitted, and the time the outcome was logged.",
  },
} as const;

export function Shot({
  shot,
  caption,
  className,
  frame = "screen",
  priority = false,
}: {
  shot: (typeof SHOTS)[keyof typeof SHOTS];
  caption?: string;
  className?: string;
  /** "screen" = browser-ish plate, "device" = phone plate */
  frame?: "screen" | "device";
  priority?: boolean;
}) {
  return (
    <figure className={cn("w-full", className)}>
      <div
        className={cn(
          "overflow-hidden border border-white/12 bg-white/[0.03]",
          frame === "device"
            ? "mx-auto max-w-[280px] rounded-[1.75rem] p-1.5"
            : "rounded-xl p-1.5"
        )}
      >
        <Image
          src={shot.src}
          width={shot.width}
          height={shot.height}
          alt={shot.alt}
          priority={priority}
          sizes={frame === "device" ? "280px" : "(max-width: 1024px) 100vw, 720px"}
          className={cn(
            "h-auto w-full",
            frame === "device" ? "rounded-[1.35rem]" : "rounded-lg"
          )}
        />
      </div>
      {caption && (
        <figcaption className="mt-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-white/35">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/* ── Cards ──────────────────────────────────────────────────────── */

export function FeatureCard({
  index,
  title,
  body,
  tone = "dark",
  className,
}: {
  index?: string;
  title: string;
  body: React.ReactNode;
  tone?: "dark" | "light";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "group relative flex h-full flex-col rounded-xl border p-6 transition-colors duration-300 sm:p-7",
        dark
          ? "border-white/10 bg-white/[0.02] hover:border-white/22"
          : "border-aproksi-mist bg-white hover:border-aproksi-ultra/35",
        className
      )}
    >
      {index && (
        <span
          className={cn(
            "font-mono text-[0.6875rem] sm:text-[0.625rem] tracking-[0.16em]",
            dark ? "text-white/30" : "text-aproksi-slate/35"
          )}
        >
          {index}
        </span>
      )}
      <h3
        className={cn(
          "font-display mt-4 text-xl leading-snug tracking-[-0.01em] sm:text-[1.375rem]",
          dark ? "text-white" : "text-aproksi-ink"
        )}
      >
        {title}
      </h3>
      <div
        className={cn(
          "mt-3 text-[0.95rem] leading-relaxed sm:text-[0.9rem]",
          dark ? "text-white/60" : "text-aproksi-slate/70"
        )}
      >
        {body}
      </div>
    </div>
  );
}

/* ── Spec list — the hairline table used across the site ────────── */

export function SpecList({
  items,
  tone = "dark",
  className,
}: {
  items: { term: string; value: React.ReactNode }[];
  tone?: "dark" | "light";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <dl className={cn("w-full", className)}>
      {items.map((it) => (
        <div
          key={it.term}
          className={cn(
            "grid grid-cols-1 gap-1 border-t py-4 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-6",
            dark ? "border-white/10" : "border-aproksi-mist"
          )}
        >
          <dt
            className={cn(
              "font-mono text-xs uppercase tracking-[0.14em] leading-5 sm:text-[0.6875rem]",
              dark ? "text-white/40" : "text-aproksi-slate/45"
            )}
          >
            {it.term}
          </dt>
          <dd
            className={cn(
              "text-[0.9rem] leading-relaxed",
              dark ? "text-white/70" : "text-aproksi-slate/75"
            )}
          >
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
