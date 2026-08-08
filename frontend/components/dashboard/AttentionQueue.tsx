/**
 * The things waiting on the owner, above everything else.
 *
 * An owner opens this app for one reason: to find out whether anything needs
 * them. That was buried — appeals were a pill in the header, leave was a page
 * you had to remember existed, and an SMS that never reached an employee was
 * invisible entirely. So they went and looked at four boxes of zeros instead.
 *
 * This is the queue, and it renders nothing at all when the queue is empty.
 * A card that says "nothing to do" is still a card you have to read.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface AttentionItem {
  count: number;
  label: string;
  detail: string;
  href: string;
  tone: "urgent" | "normal";
}

export function AttentionQueue({ items }: { items: AttentionItem[] }) {
  const live = items.filter((i) => i.count > 0);
  if (live.length === 0) return null;

  return (
    <section aria-label="Waiting on you" className="space-y-2">
      <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-aproksi-slate/60">
        Waiting on you
      </h2>
      <ul className="overflow-hidden rounded-[12px] border border-aproksi-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.06)]">
        {live.map((item) => (
          <li key={item.href + item.label} className="border-b border-aproksi-mist/70 last:border-0">
            <Link
              href={item.href}
              className="group flex min-h-[64px] items-center gap-4 px-5 py-3 transition-colors hover:bg-aproksi-stone/70 focus-visible:bg-aproksi-stone/70 focus-visible:outline-none"
            >
              <span
                className={`grid h-9 min-w-9 shrink-0 place-items-center rounded-full px-2 font-display text-lg tabular-nums ${
                  item.tone === "urgent"
                    ? "bg-aproksi-red/10 text-aproksi-red"
                    : "bg-aproksi-ultra/10 text-aproksi-ultra"
                }`}
              >
                {item.count}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-aproksi-ink">{item.label}</span>
                <span className="block text-xs text-aproksi-slate/70">{item.detail}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-aproksi-slate/30 transition-transform group-hover:translate-x-0.5 group-hover:text-aproksi-ultra" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AttentionQueue;
