"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/* One shared IntersectionObserver for every reveal on the page.
 *
 * There is deliberately no scroll listener anywhere in this file. The
 * observer fires off the main thread's intersection bookkeeping, flips a
 * class, and the transition runs on the compositor (opacity + transform
 * only). Elements are unobserved the moment they land, so a long page
 * never accumulates work as you scroll. */

type Entry = { el: Element; once: boolean };

let observer: IntersectionObserver | null = null;
const registry = new WeakMap<Element, Entry>();

function getObserver() {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const meta = registry.get(entry.target);
        if (!meta) continue;
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          if (meta.once) {
            observer?.unobserve(entry.target);
            registry.delete(entry.target);
          }
        } else if (!meta.once) {
          entry.target.classList.remove("is-in");
        }
      }
    },
    // Fire a little before the element reaches the fold so the motion
    // reads as "already settling" rather than popping in late.
    { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
  );
  return observer;
}

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** ms — stagger siblings without a JS timer */
  delay?: number;
  variant?: "fade" | "rise" | "left" | "right" | "scale";
  /** stroke-dash length for `draw` scenes */
  drawLength?: number;
  as?: "div" | "section" | "li" | "article" | "span" | "figure";
};

const variantClass: Record<NonNullable<RevealProps["variant"]>, string> = {
  fade: "",
  rise: "reveal-rise",
  left: "reveal-left",
  right: "reveal-right",
  scale: "reveal-scale",
};

export function Reveal({
  children,
  className,
  delay = 0,
  variant = "rise",
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-in");
      return;
    }
    registry.set(el, { el, once: true });
    const obs = getObserver();
    obs.observe(el);
    return () => {
      obs.unobserve(el);
      registry.delete(el);
    };
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={cn("reveal", variantClass[variant], className)}
      style={{ ["--reveal-delay" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/** Wraps engraved SVG so its strokes draw themselves in on entry. */
export function DrawReveal({
  children,
  className,
  delay = 0,
  length = 1600,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  length?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-in");
      return;
    }
    registry.set(el, { el, once: true });
    const obs = getObserver();
    obs.observe(el);
    return () => {
      obs.unobserve(el);
      registry.delete(el);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn("draw-in", className)}
      style={{
        ["--reveal-delay" as string]: `${delay}ms`,
        ["--len" as string]: String(length),
      }}
    >
      {children}
    </div>
  );
}

export default Reveal;
