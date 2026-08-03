import { cn } from "@/lib/utils";
import { KauntaBell } from "@/components/KauntaLogo";

/* ─────────────────────────────────────────────────────────────────
 * LOGO SLOT
 *
 * This is the single place the Kaunta-HR logo asset gets dropped in.
 * Put the file at `public/brand/kaunta-hr.svg`, then replace the
 * <KauntaBell /> line below with:
 *
 *   <Image src="/brand/kaunta-hr.svg" alt="" width={28} height={28}
 *          priority className="h-7 w-7" />
 *
 * Until then this renders the Kaunta mark plus the HR wordmark, so
 * header and footer are never missing a brand anchor.
 * ───────────────────────────────────────────────────────────────── */

export function BrandLogo({
  className,
  size = "md",
  tone = "light",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  tone?: "light" | "dark";
}) {
  const mark = { sm: 22, md: 27, lg: 34 }[size];
  const text = { sm: "text-[1.05rem]", md: "text-[1.3rem]", lg: "text-[1.65rem]" }[size];
  const markColor = tone === "light" ? "#FFFFFF" : "#1E3FD8";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {/* ↓ logo slot — swap this element for the supplied asset */}
      <KauntaBell size={mark} color={markColor} />
      <span
        className={cn(
          "font-display leading-none tracking-[-0.015em]",
          text,
          tone === "light" ? "text-white" : "text-kaunta-ink"
        )}
      >
        Kaunta
        <span
          className={cn(
            "ml-1 font-sans text-[0.5em] font-medium uppercase tracking-[0.2em] align-middle",
            tone === "light" ? "text-white/55" : "text-kaunta-ultra"
          )}
        >
          HR
        </span>
      </span>
    </span>
  );
}

export default BrandLogo;
