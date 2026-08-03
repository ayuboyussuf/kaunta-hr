import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import { Container, SectionHead, Screenshot } from "@/components/site/SiteUI";
import { Reveal } from "@/components/site/Reveal";
import { PageHero, CTASection, NextLinks } from "@/components/site/Blocks";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "What has shipped in Kaunta HR — attendance, penalty rules, disputes, payslips and the multi-site dashboard, release by release.",
};

type Tag = "Added" | "Improved" | "Fixed";

type Release = {
  version: string;
  date: string;
  title: string;
  summary?: string;
  screenshot?: { label: string; ratio?: string };
  changes: { tag: Tag; text: string }[];
};

const TAG_STYLE: Record<Tag, string> = {
  Added: "border-kaunta-ultra-br/45 text-kaunta-ultra-br",
  Improved: "border-white/25 text-white/60",
  Fixed: "border-kaunta-amber/45 text-kaunta-amber",
};

const RELEASES: Release[] = [
  {
    version: "1.6",
    date: "July 2026",
    title: "Attendance calendar and downloadable site reports",
    summary:
      "A month at a glance for a single site, and a report an owner can take away from the screen.",
    screenshot: { label: "attendance calendar view", ratio: "16 / 10" },
    changes: [
      { tag: "Added", text: "Calendar view of attendance per site, with exceptions marked on the day they occurred." },
      { tag: "Added", text: "Owner-only downloadable attendance report, including the selfie captured with each scan." },
      { tag: "Improved", text: "Exception queue now groups by site when more than four sites are active." },
      { tag: "Fixed", text: "Binary downloads no longer corrupt when a PDF or CSV is served through the gateway." },
    ],
  },
  {
    version: "1.5",
    date: "June 2026",
    title: "Per-site penalty policies",
    summary:
      "Rules moved from the business onto the site, so a station on a bad commuter road can differ from a branch staff walk to.",
    screenshot: { label: "penalty rules config" },
    changes: [
      { tag: "Added", text: "A separate penalty policy per site, with the option to copy an existing policy across." },
      { tag: "Added", text: "Validation that rejects overlapping or gapped lateness bands before a policy can save." },
      { tag: "Improved", text: "Penalty notices now name the band that matched, not only the amount." },
      { tag: "Fixed", text: "A shift crossing midnight matched the wrong roster entry when grace extended past 00:00." },
    ],
  },
  {
    version: "1.4",
    date: "May 2026",
    title: "Locked outcome documents",
    summary:
      "Appeals now close into a tamper-evident PDF with its hash recorded against the case.",
    screenshot: { label: "dispute appeal PDF" },
    changes: [
      { tag: "Added", text: "Locked PDF written at the moment an appeal is decided, sent to the staff member by secure link." },
      { tag: "Added", text: "Document hash recorded against the case at close." },
      { tag: "Added", text: "Decisions attributed by name and role inside the document." },
      { tag: "Improved", text: "A decided case is now read-only for every role, including owner." },
    ],
  },
  {
    version: "1.3",
    date: "April 2026",
    title: "Payslips over signed links",
    changes: [
      { tag: "Added", text: "PDF payslip generation per payroll period, in KES." },
      { tag: "Added", text: "Signed, expiring links delivered by SMS under the sender ID KAUNTAHR." },
      { tag: "Added", text: "Deduction lines that name the date and band behind each penalty." },
      { tag: "Improved", text: "Penalties under open appeal are excluded from a period rather than estimated." },
    ],
  },
  {
    version: "1.2",
    date: "March 2026",
    title: "Disputes and appeals",
    changes: [
      { tag: "Added", text: "Staff can appeal a penalty from their own record, with a written reason." },
      { tag: "Added", text: "Appeals surface in the owner's exception queue rather than as a separate inbox." },
      { tag: "Added", text: "Uphold and waive outcomes, each notified to the staff member." },
    ],
  },
  {
    version: "1.1",
    date: "February 2026",
    title: "Multi-site exception dashboard",
    screenshot: { label: "dashboard exception view", ratio: "16 / 9" },
    changes: [
      { tag: "Added", text: "One dashboard across all sites, built around exceptions rather than raw logs." },
      { tag: "Added", text: "Missed shift, out-of-fence and late-sync exception types." },
      { tag: "Added", text: "Accountant role, separated from owner." },
      { tag: "Improved", text: "Scans that sync after a gap are marked as late sync rather than late arrival." },
    ],
  },
  {
    version: "1.0",
    date: "January 2026",
    title: "Attendance, first release",
    summary: "QR clock-in with geofencing, selfie and GPS, and onboarding over WhatsApp OTP.",
    screenshot: { label: "mobile clock-in selfie+GPS", ratio: "4 / 3" },
    changes: [
      { tag: "Added", text: "Signed QR code per site, with a geofence radius set on a map." },
      { tag: "Added", text: "Selfie and GPS reading captured with every accepted scan." },
      { tag: "Added", text: "Staff onboarding by phone number, verified over WhatsApp OTP." },
      { tag: "Added", text: "Configurable grace period and lateness bands." },
    ],
  },
];

export default function ChangelogPage() {
  return (
    <>
      <PageHero
        eyebrow="Changelog"
        title="What has shipped, and when."
        lede="Kaunta HR is built against real sites with real staff on them. This is the record of what changed, in the order it changed."
      />

      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-16 sm:py-24">
          {RELEASES.map((r, i) => (
            <div
              key={r.version}
              className="grid gap-8 border-t border-white/10 py-12 first:border-t-0 first:pt-0 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-14 lg:py-16"
            >
              <Reveal variant="fade">
                <div className="lg:sticky lg:top-28">
                  <p className="font-display text-2xl text-white">
                    {r.version}
                  </p>
                  <p className="mt-1.5 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-white/35">
                    {r.date}
                  </p>
                  {i === 0 && (
                    <span className="mt-4 inline-block rounded-full border border-kaunta-ultra-br/45 px-2.5 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-kaunta-ultra-br">
                      Latest
                    </span>
                  )}
                </div>
              </Reveal>

              <Reveal variant="left" delay={60}>
                <h2 className="font-display text-[1.6rem] leading-snug tracking-[-0.015em] text-white sm:text-[2rem]">
                  {r.title}
                </h2>
                {r.summary && (
                  <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-white/55">
                    {r.summary}
                  </p>
                )}

                <ul className="mt-8 space-y-3.5">
                  {r.changes.map((c, j) => (
                    <li key={j} className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                      <span
                        className={cn(
                          "inline-flex h-[1.375rem] shrink-0 items-center self-start rounded-full border px-2.5 font-mono text-[0.5625rem] uppercase tracking-[0.14em]",
                          TAG_STYLE[c.tag]
                        )}
                      >
                        {c.tag}
                      </span>
                      <span className="max-w-xl text-[0.9rem] leading-relaxed text-white/60">
                        {c.text}
                      </span>
                    </li>
                  ))}
                </ul>

                {r.screenshot && (
                  <div className="mt-10 max-w-xl">
                    <Screenshot
                      label={r.screenshot.label}
                      ratio={r.screenshot.ratio ?? "16 / 10"}
                      tone="dark"
                    />
                  </div>
                )}
              </Reveal>
            </div>
          ))}
        </Container>
      </section>

      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="prose" className="py-16 sm:py-20">
          <Reveal>
            <SectionHead
              tone="light"
              align="center"
              eyebrow="Coming next"
              title="On the bench"
              lede="Not promises with dates on them — just what is being worked on now."
            />
          </Reveal>
          <Reveal delay={90}>
            <ul className="mx-auto mt-10 max-w-lg space-y-3.5">
              {[
                "Shift templates, so a roster can be applied to a site rather than built each week.",
                "Consolidated payroll export across all sites in one file.",
                "Bulk record export for audits, on Network plans.",
              ].map((t) => (
                <li
                  key={t}
                  className="flex gap-3 text-[0.9rem] leading-relaxed text-white/55"
                >
                  <span
                    aria-hidden
                    className="mt-[0.6rem] h-px w-3 shrink-0 bg-white/25"
                  />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </section>

      <NextLinks
        links={[
          {
            href: "/features",
            label: "Product",
            blurb: "Everything currently shipped, capability by capability.",
          },
          {
            href: "/status",
            label: "Status",
            blurb: "Current availability and incident history.",
          },
          {
            href: "/docs",
            label: "Documentation",
            blurb: "How to use what has shipped.",
          },
        ]}
      />

      <CTASection />
    </>
  );
}
