import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * `tone` picks the surface AND the text together, because they must never be
 * chosen separately.
 *
 * Passing `className="bg-aproksi-red text-white"` used to look like it worked and
 * did not: tailwind-merge does not recognise these custom colour names as the
 * same group, so the base `bg-aproksi-white` survived, and Tailwind emits
 * `.bg-aproksi-white` LATER in the sheet than `.bg-aproksi-red` — so white won on
 * source order regardless of the order of the classes on the element. The
 * result was a white card with white text: the copy was in the DOM, perfectly
 * accessible to a screen reader, and invisible to everyone else.
 *
 * A tone cannot be half-applied. That is the whole point of it.
 */
type CardTone = "plain" | "alert" | "info";

const TONE: Record<CardTone, string> = {
  plain: "border-aproksi-mist bg-aproksi-white",
  alert: "border-transparent bg-aproksi-red text-aproksi-white",
  info: "border-transparent bg-aproksi-ultra text-aproksi-white",
};

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { tone?: CardTone }
>(({ className, tone = "plain", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-[12px] border shadow-[0_2px_16px_rgba(15,25,35,0.08)]",
      TONE[tone],
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("font-display text-xl text-aproksi-ink leading-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-aproksi-ink/50", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
