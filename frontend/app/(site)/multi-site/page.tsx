import type { Metadata } from "next";
import {
  Container,
  SectionHead,
  Shot,
  SHOTS,
  SpecList,
  SiteButton,
  ArrowRight,
  FeatureCard,
} from "@/components/site/SiteUI";
import { PageHero, CTASection, NextLinks, FAQ } from "@/components/site/Blocks";
import { SealedRecord } from "@/components/site/Engravings";

export const metadata: Metadata = {
  title: "For multi-site owners",
  description:
    "Written for owners running fuel stations, restaurant branches and retail outlets across several locations — how Kaunta HR gives one view of who showed up where, and what it cost.",
};

const SEGMENTS = [
  {
    tag: "Fuel stations",
    title: "Forecourts running shifts around the clock",
    points: [
      "Three shifts a day across pumps, shop and office, with different start times per role.",
      "Attendants who move between your stations depending on the week.",
      "A fence tight enough that the stage across the road does not qualify as arrival.",
    ],
    radius: "100 – 150 m",
  },
  {
    tag: "Restaurants",
    title: "Kitchens and floors that open before you do",
    points: [
      "Prep staff in at 06:00, service staff at 10:00, both at the same address.",
      "High turnover — onboarding by phone number matters more than anything else.",
      "Lateness that shows up as a slow open rather than as anything you can see later.",
    ],
    radius: "50 – 80 m",
  },
  {
    tag: "Retail branches",
    title: "Shops where opening on time is the whole job",
    points: [
      "A shutter that goes up late is revenue you never find out you lost.",
      "One supervisor per branch, reporting on themselves.",
      "Stock and cash handovers that need the attendance record to line up.",
    ],
    radius: "50 – 80 m",
  },
];

const MULTI_FAQ = [
  {
    q: "Can I run different rules at different sites?",
    a: "Yes. Penalty policies live on the site, so a station on a bad commuter road can carry more grace than a branch staff walk to. On the Multi-Site plan each site has its own policy; you can also apply one policy everywhere and only vary the exceptions.",
  },
  {
    q: "What about staff who move between sites?",
    a: "A staff member belongs to one site at a time, and you move them on their record when the rota changes. Their attendance history, penalties and payslips follow the person, not the location, so a transfer never splits someone's record in two.",
  },
  {
    q: "Can my supervisor at each site see the dashboard?",
    a: "Supervisors are staff — they see their own record only. If you want someone running payroll or settling appeals without the ability to rewrite rules, that is the accountant role, and on Multi-Site it can be scoped to specific sites.",
  },
  {
    q: "How long does it take to add a fourth site?",
    a: "Minutes. Create the site, drop the pin, set the radius, print the QR, and move or add the staff. The policy from an existing site can be copied across rather than rebuilt.",
  },
  {
    q: "Do I pay per site or per staff member?",
    a: "Per site. Staff numbers within a site do not change the price, and clock-ins are never charged per event.",
  },
];

export default function MultiSitePage() {
  return (
    <>
      <PageHero
        eyebrow="For multi-site owners"
        title="You cannot be at four gates at seven in the morning."
        lede="This page is for the owner running fuel stations across a county, three restaurant branches in one town, or a chain of shops with a supervisor at each. The problem is not that you lack information — it is that all of it arrives second-hand, and late."
      >
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <SiteButton href="/signup" variant="light" size="lg">
            Start with one site <ArrowRight />
          </SiteButton>
          <SiteButton href="/how-it-works" variant="outline" size="lg">
            See a day across two sites
          </SiteButton>
        </div>
      </PageHero>

      {/* ── What changes at site two ──────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-20">
            <>
              <SectionHead
                tone="dark"
                eyebrow="The second site"
                title="One location you manage. Two, you supervise a supervisor."
                lede="At one site you know who came in because you were there. The moment there is a second, your attendance record becomes a report from someone who has a relationship with the people in it — and every payroll dispute afterwards is your word against a page in a book."
              />
              <SpecList
                tone="dark"
                className="mt-10"
                items={[
                  {
                    term: "What you lose",
                    value: "Direct sight of arrival times, and any way of checking them independently.",
                  },
                  {
                    term: "What you gain",
                    value: "A supervisor with an incentive to smooth over a late team, and no malice required for it to happen.",
                  },
                  {
                    term: "What it costs",
                    value: "Openings that slip, deductions you cannot defend, and month-end arguments with no evidence on either side.",
                  },
                ]}
              />
            </>
            <div className="text-white/70">
              <SealedRecord className="mx-auto h-auto w-full max-w-[320px]" />
            </div>
          </div>
        </Container>
      </section>

      {/* ── The morning ───────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-20 sm:py-28">
          <>
            <SectionHead
              tone="dark"
              align="center"
              eyebrow="Your morning"
              title="Eight sites, one screen, about a minute."
              lede="The dashboard does not show you eight sites' worth of clock-ins. It shows you the handful of things that did not go to plan, and stays quiet about the rest."
            />
          </>
          <div className="mt-12">
            <Shot shot={SHOTS.overview} frame="device" caption="Site overview on a phone" />
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                index: "07:12",
                title: "Juja has not opened",
                body: "A rostered shift with no scan against it, twelve minutes in. You know before a customer does.",
              },
              {
                index: "07:31",
                title: "A scan from outside the fence",
                body: "Someone tried to clock in from beyond the radius at Thika. It did not count, and you can see it was attempted.",
              },
              {
                index: "09:40",
                title: "Two appeals waiting",
                body: "Both from last week, both with the scan and selfie attached. Decide them in the same place you saw them.",
              },
              {
                index: "—",
                title: "The other five sites",
                body: "Opened on time, nothing to report, nothing shown. That silence is the feature.",
              },
            ].map((c) => (
              <div key={c.title}>
                <FeatureCard
                  index={c.index}
                  title={c.title}
                  body={c.body}
                  tone="dark"
                />
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Segments ──────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-20 sm:py-28">
          <>
            <SectionHead
              tone="dark"
              eyebrow="By business"
              title="What this looks like at your kind of site."
            />
          </>

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {SEGMENTS.map((s) => (
              <div key={s.tag}>
                <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-7">
                  <span className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-kaunta-ultra-br/70">
                    {s.tag}
                  </span>
                  <h3 className="font-display mt-4 text-xl leading-snug text-white">
                    {s.title}
                  </h3>
                  <ul className="mt-5 flex-1 space-y-3">
                    {s.points.map((p) => (
                      <li
                        key={p}
                        className="flex gap-3 text-[0.875rem] leading-relaxed text-white/55"
                      >
                        <span
                          aria-hidden
                          className="mt-[0.55rem] h-px w-3 shrink-0 bg-kaunta-ultra-br/60"
                        />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-6 border-t border-white/10 pt-5 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-white/35">
                    Typical fence · {s.radius}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Rolling out ───────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-20">
            <div className="order-2 lg:order-1">
            </div>
            <div className="order-1 lg:order-2">
              <SectionHead
                tone="dark"
                eyebrow="Rolling out"
                title="Do one site first. Do not do all of them."
                lede="The owners who get this working start at their most difficult location — the one furthest away, or the one they trust the record from least — and run it alone for a few weeks."
              />
              <SpecList
                tone="dark"
                className="mt-10"
                items={[
                  {
                    term: "Week one",
                    value: "Record only. No penalty rules. Watch what the actual arrival pattern looks like without changing anyone's behaviour first.",
                  },
                  {
                    term: "Week two",
                    value: "Set grace and bands against what you have now seen, rather than against what you assumed.",
                  },
                  {
                    term: "Week three",
                    value: "Tell staff how appeals work before the first penalty lands. The appeal route is what makes the rules survive contact.",
                  },
                  {
                    term: "Then",
                    value: "Copy the policy to your other sites and add them. The second site takes minutes, not weeks.",
                  },
                ]}
              />
            </div>
          </div>
        </Container>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="prose" className="py-20 sm:py-24">
          <>
            <SectionHead
              tone="dark"
              eyebrow="Questions"
              title="Running more than one"
            />
          </>
          <div className="mt-10">
            <FAQ items={MULTI_FAQ} tone="dark" />
          </div>
        </Container>
      </section>

      <NextLinks
        links={[
          {
            href: "/how-it-works",
            label: "How it works",
            blurb: "A full day across two stations, start to finish.",
          },
          {
            href: "/docs",
            label: "Documentation",
            blurb: "Setting up sites, fences, rules and staff.",
          },
          {
            href: "/compliance",
            label: "Compliance & records",
            blurb: "What the record is worth when a dispute escalates.",
          },
        ]}
      />

      <CTASection
        title="Start at the site you trust the least."
        body="Put the QR up at your most distant location and give it a fortnight. If the record surprises you, you have found the reason to roll it out everywhere else."
      />
    </>
  );
}
