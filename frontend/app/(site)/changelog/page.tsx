import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import { Container, SectionHead, Shot, SHOTS } from "@/components/site/SiteUI";
import { PageHero, CTASection, NextLinks } from "@/components/site/Blocks";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "What has shipped in Aproksi HR — attendance, penalty rules, presence checks, leave, disputes, payslips and the multi-site dashboard, release by release.",
};

type Tag = "Added" | "Improved" | "Fixed";

type Release = {
  version: string;
  date: string;
  title: string;
  summary?: string;
  shot?: keyof typeof SHOTS;
  changes: { tag: Tag; text: string }[];
};

const TAG_STYLE: Record<Tag, string> = {
  Added: "border-aproksi-ultra-br/45 text-aproksi-ultra-br",
  Improved: "border-white/25 text-white/60",
  Fixed: "border-aproksi-amber/45 text-aproksi-amber",
};

const RELEASES: Release[] = [
  {
    version: "1.7",
    date: "August 2026",
    title: "Presence checks, leave, and a brief before every appeal",
    summary:
      "Three gaps closed at once: the middle of the shift, the days an owner had already signed off, and the twenty minutes of digging that an appeal used to be worth and never got.",
    changes: [
      {
        tag: "Added",
        text: "Mid-shift presence checks, off by default. The times are drawn per person per day, spread across the shift, never in its opening or closing stretch and never less than 45 minutes apart.",
      },
      {
        tag: "Added",
        text: "Ask one named person to confirm right now, from the roster — without spending the day's random draw, and recorded as a check you asked for rather than one that was drawn.",
      },
      {
        tag: "Added",
        text: "Leave requests: notice periods you set, half-days on a single day, and paid or unpaid decided at the moment of approval rather than later at payroll.",
      },
      {
        tag: "Added",
        text: "A brief on every appeal — what is being claimed and what the records hold about it, counted from rows the owner can open. It never states a verdict, recommends an outcome or scores anybody.",
      },
      {
        tag: "Added",
        text: "Appeals are read in Kenyan English and the Swahili staff actually type, so an appeal written the way people speak is not filed as unreadable.",
      },
      {
        tag: "Added",
        text: "Five penalty presets to start from — standard, charged by the minute, record only, fuel station and restaurant — each fully editable once applied.",
      },
      {
        tag: "Added",
        text: "Failed clock-ins reported by the phone itself: camera blocked, no signal, location refused. They queue on the device when there is no connection and go out when there is.",
      },
      {
        tag: "Added",
        text: "A tap to acknowledge a penalty notice, with the time recorded against it.",
      },
      {
        tag: "Added",
        text: "Pattern findings across a trailing fortnight, and a monthly review on the 1st that puts anyone with a clean month in front of the owner while there is still time to act on it.",
      },
      {
        tag: "Improved",
        text: "The dashboard now opens on what is waiting for a decision, then on the morning's arrivals plotted against the grace deadline — a distribution rather than four numbers.",
      },
      {
        tag: "Fixed",
        text: "An employee on approved leave who came in and scanned anyway was recorded late and penalised for it. Leave is now asked about in one place and answered identically by the scan path, the absence sweep, the presence schedule and payroll.",
      },
      {
        tag: "Fixed",
        text: "Payroll prorated approved paid leave out of the salary it was supposed to protect.",
      },
      {
        tag: "Fixed",
        text: "A penalty whose appeal window had already elapsed still offered a review that could not be used. The state is now read from the deadline itself rather than from whether a background sweep happened to have run.",
      },
      {
        tag: "Fixed",
        text: "Answering a presence check clocked the employee out.",
      },
      {
        tag: "Fixed",
        text: "A QR code belonging to one site could be used to clock in at another.",
      },
      {
        tag: "Fixed",
        text: "A presence check could not be confirmed at all where the phone could not get a location fix — which fell hardest on the cheapest handsets and on anybody working indoors.",
      },
      {
        tag: "Fixed",
        text: "Outcome PDFs stopped opening about a week after the case closed.",
      },
      {
        tag: "Fixed",
        text: "Penalty notices that never reached a phone could be seen but not acted on. They can now be resent to a corrected number or marked unreachable.",
      },
    ],
  },
  {
    version: "1.6",
    date: "July 2026",
    title: "Attendance calendar and downloadable site reports",
    summary:
      "A month at a glance for a single site, and a report an owner can take away from the screen.",
    shot: "teamCalendar",
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
    shot: "rules",
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
      { tag: "Added", text: "Signed, expiring links delivered by SMS under the sender ID APROKSIHR." },
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
    shot: "overview",
    changes: [
      { tag: "Added", text: "One dashboard across all sites, built around exceptions rather than raw logs." },
      { tag: "Added", text: "Missed shift, out-of-fence and late-sync exception types." },
      { tag: "Added", text: "Staff sessions separated from owner sessions." },
      { tag: "Improved", text: "Scans that sync after a gap are marked as late sync rather than late arrival." },
    ],
  },
  {
    version: "1.0",
    date: "January 2026",
    title: "Attendance, first release",
    summary: "QR clock-in with geofencing, selfie and GPS, and onboarding over SMS code.",

    changes: [
      { tag: "Added", text: "Signed QR code per site, with a geofence radius set on a map." },
      { tag: "Added", text: "Selfie and GPS reading captured with every accepted scan." },
      { tag: "Added", text: "Staff onboarding by phone number, verified with an SMS code." },
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
        lede="Aproksi HR is built against real sites with real staff on them. This is the record of what changed, in the order it changed."
      />

      <section className="border-b border-white/10 bg-aproksi-void">
        <Container width="wide" className="py-12 sm:py-16 lg:py-24">
          {RELEASES.map((r, i) => (
            <div
              key={r.version}
              className="grid gap-8 border-t border-white/10 py-12 first:border-t-0 first:pt-0 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-10 lg:py-16"
            >
              <>
                <div className="lg:sticky lg:top-28">
                  <p className="font-display text-2xl text-white">
                    {r.version}
                  </p>
                  <p className="mt-1.5 font-mono text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-[0.16em] text-white/35">
                    {r.date}
                  </p>
                  {i === 0 && (
                    <span className="mt-4 inline-block rounded-full border border-aproksi-ultra-br/45 px-2.5 py-1 font-mono text-[0.625rem] sm:text-[0.5625rem] uppercase tracking-[0.16em] text-aproksi-ultra-br">
                      Latest
                    </span>
                  )}
                </div>
              </>

              <>
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
                          "inline-flex h-[1.375rem] shrink-0 items-center self-start rounded-full border px-2.5 font-mono text-[0.625rem] sm:text-[0.5625rem] uppercase tracking-[0.14em]",
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

                {r.shot && (
                  <div className="mt-10 max-w-xl">
                    <Shot
                      shot={SHOTS[r.shot]}
                      frame={r.shot === "teamCalendar" ? "screen" : "device"}
                    />
                  </div>
                )}
              </>
            </div>
          ))}
        </Container>
      </section>

      <section className="border-b border-white/10 bg-aproksi-void">
        <Container width="prose" className="py-12 sm:py-16 lg:py-20">
          <>
            <SectionHead
              tone="dark"
              align="center"
              eyebrow="Coming next"
              title="On the bench"
              lede="Not promises with dates on them — just what is being worked on now."
            />
          </>
          <>
            <ul className="mx-auto mt-10 max-w-lg space-y-3.5">
              {[
                "Shift templates, so a roster can be applied to a site rather than built each week.",
                "Consolidated payroll export across all sites in one file.",
                "A single-file record export for audits.",
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
          </>
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
            href: "/compliance",
            label: "Compliance & records",
            blurb: "What the locked documents are actually for.",
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
