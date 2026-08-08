import { cn } from "@/lib/utils";
import { AproksiBell } from "@/components/AproksiLogo";

/* ─────────────────────────────────────────────────────────────────
 * LOGO SLOT
 *
 * This is the single place the Aproksi-HR logo asset gets dropped in.
 * Put the file at `public/brand/aproksi-hr.svg`, then replace the
 * <AproksiBell /> line below with:
 *
 *   <Image src="/brand/aproksi-hr.svg" alt="" width={28} height={28}
 *          priority className="h-7 w-7" />
 *
 * Until then this renders the Aproksi mark plus the HR wordmark, so
 * header and footer are never missing a brand anchor.
 * ───────────────────────────────────────────────────────────────── */

export function BrandLogo({
  className,
  size = "md",
  tone = "dark",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  tone?: "dark" | "light";
}) {
  const mark = { sm: 22, md: 27, lg: 34 }[size];
  const text = { sm: "text-[1.05rem]", md: "text-[1.3rem]", lg: "text-[1.65rem]" }[size];
  const markColor = tone === "dark" ? "#FFFFFF" : "#1E3FD8";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {/* ↓ logo slot — swap this element for the supplied asset */}
      <AproksiBell size={mark} color={markColor} />
      <span
        className={cn(
          "font-display leading-none tracking-[-0.015em]",
          text,
          tone === "dark" ? "text-white" : "text-aproksi-ink"
        )}
      >
        Aproksi
        <span
          className={cn(
            "ml-1 font-sans text-[0.5em] font-medium uppercase tracking-[0.2em] align-middle",
            tone === "dark" ? "text-white/55" : "text-aproksi-ultra"
          )}
        >
          HR
        </span>
      </span>
    </span>
  );
}

export default BrandLogo;
