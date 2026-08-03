import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import { Container, SectionHead, Eyebrow } from "@/components/site/SiteUI";
import { PageHero, NextLinks } from "@/components/site/Blocks";

export const metadata: Metadata = {
  title: "Status",
  description:
    "Current availability of Kaunta HR services — clock-in, dashboard, document generation and SMS delivery — plus recent incident history.",
};

type State = "operational" | "degraded" | "down";

const STATE_STYLE: Record<State, { dot: string; label: string; text: string }> = {
  operational: { dot: "bg-kaunta-sage", label: "Operational", text: "text-kaunta-sage" },
  degraded: { dot: "bg-kaunta-amber", label: "Degraded", text: "text-kaunta-amber" },
  down: { dot: "bg-kaunta-red", label: "Outage", text: "text-kaunta-red" },
};

const SERVICES: { name: string; detail: string; state: State }[] = [
  {
    name: "Clock-in",
    detail: "QR scanning, geofence checks, selfie and GPS capture",
    state: "operational",
  },
  {
    name: "Dashboard",
    detail: "Owner and accountant sign-in, exception queue, site management",
    state: "operational",
  },
  {
    name: "Document generation",
    detail: "Locked appeal outcomes and payslip PDFs",
    state: "operational",
  },
  {
    name: "Secure links",
    detail: "Signed payslip and outcome link delivery",
    state: "operational",
  },
  {
    name: "SMS delivery",
    detail: "Notices and links sent under the sender ID KAUNTAHR",
    state: "operational",
  },
  {
    name: "WhatsApp OTP",
    detail: "Staff verification on first sign-in",
    state: "operational",
  },
];

export default function StatusPage() {
  return (
    <>
      <PageHero
        eyebrow="Status"
        title="Current service availability."
        lede="Clock-in is the part that matters at seven in the morning, so it is listed first. Incidents are posted here while they are happening, not after they are resolved."
      />

      {/* ── Overall ───────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-14 sm:py-16">
          <>
            <div className="flex flex-col gap-4 rounded-xl border border-kaunta-sage/35 bg-kaunta-sage/[0.08] p-7 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-kaunta-sage" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-kaunta-sage" />
                </span>
                <p className="font-display text-xl text-white sm:text-2xl">
                  All systems operational
                </p>
              </div>
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-white/35">
                [SLOT: last checked timestamp]
              </p>
            </div>
          </>
        </Container>
      </section>

      {/* ── Per service ───────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-16 sm:py-20">
          <>
            <SectionHead tone="dark" eyebrow="Services" title="Component by component" />
          </>
          <>
            <ul className="mt-10 border-t border-white/10">
              {SERVICES.map((s) => {
                const style = STATE_STYLE[s.state];
                return (
                  <li
                    key={s.name}
                    className="flex flex-col gap-2 border-b border-white/10 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                  >
                    <div className="min-w-0">
                      <p className="text-[0.975rem] text-white">{s.name}</p>
                      <p className="mt-1 text-[0.8125rem] leading-relaxed text-white/45">
                        {s.detail}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className={cn("h-2 w-2 rounded-full", style.dot)} />
                      <span
                        className={cn(
                          "font-mono text-[0.625rem] uppercase tracking-[0.16em]",
                          style.text
                        )}
                      >
                        {style.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        </Container>
      </section>

      {/* ── Incidents ─────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-16 sm:py-20">
          <>
            <SectionHead
              tone="dark"
              eyebrow="History"
              title="Recent incidents"
              lede="Every incident that affected a customer gets an entry here, including the ones that were our fault and short."
            />
          </>
          <>
            <div className="mt-10 rounded-xl border border-dashed border-white/15 p-10 text-center">
              <Eyebrow tone="dark">Incident feed</Eyebrow>
              <p className="mx-auto mt-4 max-w-md text-[0.9rem] leading-relaxed text-white/50">
                [SLOT: incident history. Each entry should carry a date, the
                components affected, the duration, and what was done about it.]
              </p>
            </div>
          </>
        </Container>
      </section>

      {/* ── What to do ────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="prose" className="py-16 sm:py-20">
          <>
            <SectionHead
              tone="dark"
              eyebrow="During an incident"
              title="If staff cannot clock in"
            />
          </>
          <>
            <ul className="mt-8 space-y-4">
              {[
                "Have supervisors record arrival times as they normally would on paper. Scans can be entered afterwards by an owner, and they are marked as manually entered so the record stays honest about it.",
                "A scan taken while the site had no signal is not lost — it syncs when signal returns, keeping the time it was taken.",
                "Penalties are applied when a scan resolves, so a delay in syncing does not create a deduction that should not exist.",
                "Nothing needs to be re-decided. Appeals already closed stay closed, and their documents remain reachable.",
              ].map((t) => (
                <li
                  key={t}
                  className="flex gap-3 text-[0.9rem] leading-relaxed text-white/60"
                >
                  <span
                    aria-hidden
                    className="mt-[0.6rem] h-px w-3 shrink-0 bg-kaunta-ultra-br/60"
                  />
                  {t}
                </li>
              ))}
            </ul>
          </>
        </Container>
      </section>

      <NextLinks
        links={[
          {
            href: "/security",
            label: "Security & data",
            blurb: "Where the data lives and who can reach it.",
          },
          {
            href: "/changelog",
            label: "Changelog",
            blurb: "What shipped, release by release.",
          },
          {
            href: "/docs",
            label: "Documentation",
            blurb: "Setting up sites, staff and rules.",
          },
        ]}
      />
    </>
  );
}
