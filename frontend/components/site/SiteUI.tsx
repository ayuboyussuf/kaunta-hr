import Link from "next/link";
import { cn } from "@/lib/utils";
import { RuleMark } from "./Engravings";

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
        tone === "dark" ? "text-kaunta-slate/50" : "text-white/45",
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
          tone === "dark" ? "text-kaunta-ink" : "text-white"
        )}
      >
        {title}
      </h2>
      {lede && (
        <p
          className={cn(
            "mt-5 text-[0.975rem] leading-relaxed sm:text-lg",
            tone === "dark" ? "text-kaunta-slate/70" : "text-white/60",
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
      <RuleMark className="h-2 w-[120px] text-kaunta-slate/30" />
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
        size === "md" ? "h-9 px-4" : "h-11 px-6 text-sm",
        variant === "primary" &&
          "bg-kaunta-ultra text-white hover:bg-kaunta-ultra-dp",
        variant === "light" &&
          "bg-white text-kaunta-ink hover:bg-white/88",
        variant === "outline" &&
          "border border-white/20 text-white hover:border-white/45 hover:bg-white/5",
        variant === "ghost" &&
          "border border-kaunta-mist bg-white text-kaunta-ink hover:border-kaunta-slate/25",
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

/* ── Screenshot slots ───────────────────────────────────────────────
 * Drop the real capture in by replacing the inner block with an
 * <Image src="…" />. The label is kept visible on purpose so an empty
 * slot never reads as a broken image.
 * ------------------------------------------------------------------ */

export function Screenshot({
  label,
  ratio = "16 / 10",
  tone = "dark",
  className,
}: {
  label: string;
  ratio?: string;
  tone?: "dark" | "light";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <figure
      className={cn(
        "relative w-full overflow-hidden rounded-xl border",
        dark
          ? "border-white/12 bg-white/[0.025]"
          : "border-kaunta-mist bg-white shadow-[0_2px_16px_rgba(11,17,32,0.06)]",
        className
      )}
      style={{ aspectRatio: ratio }}
    >
      {/* corner registration ticks */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-3 rounded-lg border border-dashed",
          dark ? "border-white/12" : "border-kaunta-slate/12"
        )}
      />
      <figcaption className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <span
          className={cn(
            "font-mono text-[0.625rem] uppercase tracking-[0.18em]",
            dark ? "text-white/35" : "text-kaunta-slate/40"
          )}
        >
          Screenshot
        </span>
        <span
          className={cn(
            "font-mono text-[0.7rem] leading-relaxed sm:text-xs",
            dark ? "text-white/60" : "text-kaunta-slate/65"
          )}
        >
          [SCREENSHOT: {label}]
        </span>
      </figcaption>
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
          : "border-kaunta-mist bg-white hover:border-kaunta-ultra/35",
        className
      )}
    >
      {index && (
        <span
          className={cn(
            "font-mono text-[0.625rem] tracking-[0.16em]",
            dark ? "text-white/30" : "text-kaunta-slate/35"
          )}
        >
          {index}
        </span>
      )}
      <h3
        className={cn(
          "font-display mt-4 text-xl leading-snug tracking-[-0.01em] sm:text-[1.375rem]",
          dark ? "text-white" : "text-kaunta-ink"
        )}
      >
        {title}
      </h3>
      <div
        className={cn(
          "mt-3 text-[0.9rem] leading-relaxed",
          dark ? "text-white/55" : "text-kaunta-slate/70"
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
            dark ? "border-white/10" : "border-kaunta-mist"
          )}
        >
          <dt
            className={cn(
              "font-mono text-[0.6875rem] uppercase tracking-[0.14em] leading-5",
              dark ? "text-white/40" : "text-kaunta-slate/45"
            )}
          >
            {it.term}
          </dt>
          <dd
            className={cn(
              "text-[0.9rem] leading-relaxed",
              dark ? "text-white/70" : "text-kaunta-slate/75"
            )}
          >
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
