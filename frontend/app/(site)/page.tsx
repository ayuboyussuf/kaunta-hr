import Link from "next/link";
import {
  Container,
  SectionHead,
  Eyebrow,
  SiteButton,
  ArrowRight,
  Screenshot,
  FeatureCard,
  SpecList,
} from "@/components/site/SiteUI";
import { Reveal, DrawReveal } from "@/components/site/Reveal";
import { FAQ, CTASection } from "@/components/site/Blocks";
import {
  SiteRowEngraving,
  GeofencePlan,
  RuleLadder,
  SealedDocument,
  PayslipSheet,
  PhoneClockIn,
  MultiSitePlan,
} from "@/components/site/Engravings";

const SITE_TYPES = [
  "Fuel stations",
  "Restaurants",
  "Retail branches",
  "Hardware yards",
  "Car washes",
  "Security posts",
  "Pharmacies",
  "Distribution depots",
];

const CAPABILITIES = [
  {
    index: "01",
    title: "QR clock-in, fenced to the site",
    body: "Each site gets its own signed QR code. A scan only counts if the phone is inside the radius you drew, and it carries a selfie and a GPS fix with it.",
  },
  {
    index: "02",
    title: "Penalty rules you write yourself",
    body: "Set the grace period, the lateness bands and what each one costs. The rules run against every scan, so nobody has to remember who was late on the 14th.",
  },
  {
    index: "03",
    title: "Appeals that end in a locked file",
    body: "Staff dispute a penalty from their phone. You uphold or waive it, and the outcome is written to a tamper-evident PDF that neither side can quietly edit later.",
  },
  {
    index: "04",
    title: "Payslips over secure links",
    body: "Generate the payslip, send a signed link by SMS. The link opens the PDF for that employee only, and expires.",
  },
  {
    index: "05",
    title: "A dashboard about exceptions",
    body: "Not a wall of clock-in logs. The screen opens on what broke today: who missed, who was outside the fence, which appeals are waiting on you.",
  },
  {
    index: "06",
    title: "Owner and accountant, separately",
    body: "Role-based access separates who can change rules from who can read payroll. Staff only ever see their own record.",
  },
  {
    index: "07",
    title: "Onboarding by phone number",
    body: "Add staff with a phone number and they verify over WhatsApp OTP. Notices and payslip links go out by SMS under the sender ID KAUNTAHR.",
  },
];

const FAQ_ITEMS = [
  {
    q: "What happens when a site has weak signal?",
    a: "Kaunta HR is built for low-connectivity sites. A clock-in captured on a weak connection is held on the device and syncs when signal returns, with the original scan time preserved. The dashboard marks anything that arrived late so you can see it was a sync delay rather than a late arrival.",
  },
  {
    q: "Can a staff member clock in for someone else?",
    a: "Each scan carries a selfie taken at the moment of the scan plus a GPS reading, and the QR itself is signed per site. A screenshot of the code taken home will not validate, because the position check fails outside the fence.",
  },
  {
    q: "Do I have to use the penalty rules?",
    a: (
      <>
        No. Attendance works on its own. The rules engine is optional per site
        &mdash; some owners run it on lateness only, some leave deductions off
        entirely and just keep the record. See{" "}
        <Link href="/docs/penalty-rules" className="text-white underline underline-offset-4">
          setting penalty rules
        </Link>
        .
      </>
    ),
  },
  {
    q: "Who can see payroll figures?",
    a: "Owners and any accountant you invite. Staff see their own attendance, their own penalties and their own payslips, and nothing belonging to anyone else. Roles are set per person, not per site.",
  },
  {
    q: "What do staff need on their phones?",
    a: "A camera and a browser. There is no app to install. Staff verify once over WhatsApp OTP and then use a link.",
  },
  {
    q: "Is the PDF actually tamper-evident?",
    a: (
      <>
        Locked outcome PDFs carry a document hash recorded against the case at
        the moment it closed. If the file is altered afterwards, the hash no
        longer matches the record. Details on the{" "}
        <Link href="/compliance" className="text-white underline underline-offset-4">
          compliance page
        </Link>
        .
      </>
    ),
  },
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative isolate -mt-16 flex min-h-[92svh] flex-col justify-end overflow-hidden bg-kaunta-void pt-16 sm:-mt-18 sm:min-h-[94svh] sm:pt-18">
        {/* engraved forecourt, drifting slowly as the hero leaves */}
        <div
          aria-hidden
          className="drift drift-slow pointer-events-none absolute inset-x-0 bottom-0 h-[34%] overflow-hidden text-white/55 lg:h-[62%]"
        >
          <SiteRowEngraving className="h-full w-full" />
        </div>
        <div
          aria-hidden
          className="ultra-glow pointer-events-none absolute inset-0"
        />
        {/* scrim — keeps the copy column legible over the line art */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,9,15,0.97)_0%,rgba(6,9,15,0.95)_52%,rgba(6,9,15,0.72)_74%,rgba(6,9,15,0.25)_92%,transparent_100%)] lg:bg-[linear-gradient(to_right,rgba(6,9,15,0.94)_0%,rgba(6,9,15,0.82)_34%,rgba(6,9,15,0.30)_62%,transparent_82%)]"
        />
        <div
          aria-hidden
          className="grain-overlay pointer-events-none absolute inset-0"
        />

        <Container width="wide" className="relative z-10 pb-16 pt-24 sm:pb-24 sm:pt-28">
          <Reveal variant="fade">
            <Eyebrow tone="light">
              Attendance · Penalties · Payslips
            </Eyebrow>
          </Reveal>

          <Reveal delay={90}>
            <h1 className="font-display mt-6 max-w-[19ch] text-[2.6rem] leading-[1.02] tracking-[-0.028em] text-white sm:text-[4rem] lg:text-[5rem]">
              The attendance record for businesses running staff across several
              sites.
            </h1>
          </Reveal>

          <Reveal delay={180}>
            <p className="mt-7 max-w-xl text-[1rem] leading-relaxed text-white/65 sm:text-[1.15rem]">
              Kaunta HR is built for Kenyan fuel stations, restaurants and branch
              networks. Staff clock in at the gate by QR, with a selfie and a GPS
              fix. The lateness rules you set apply on their own, staff appeal
              from their phones, and every outcome lands as a locked PDF and a
              payslip you can send.
            </p>
          </Reveal>

          <Reveal delay={260}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <SiteButton href="/signup" variant="light" size="lg">
                Start free <ArrowRight />
              </SiteButton>
              <SiteButton href="/how-it-works" variant="outline" size="lg">
                See a day, start to finish
              </SiteButton>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ── Spec strip ───────────────────────────────────────────── */}
      <section className="border-y border-white/10 bg-kaunta-void">
        <Container width="wide">
          <dl className="grid grid-cols-2 gap-px bg-white/10 lg:grid-cols-4">
            {[
              ["Clock-in", "QR + geofence + selfie"],
              ["Onboarding", "WhatsApp OTP"],
              ["Payslips", "Signed PDF links"],
              ["SMS sender ID", "KAUNTAHR"],
            ].map(([k, v], i) => (
              <Reveal key={k} delay={i * 60} variant="fade">
                <div className="bg-kaunta-void px-5 py-7 sm:px-7">
                  <dt className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-white/35">
                    {k}
                  </dt>
                  <dd className="mt-2 text-[0.9rem] text-white/75 sm:text-[0.975rem]">
                    {v}
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </Container>
      </section>

      {/* ── Ticker of site types ─────────────────────────────────── */}
      <section className="ticker-mask overflow-hidden border-b border-white/10 bg-kaunta-void py-5">
        <div className="ticker-track flex w-max gap-10 whitespace-nowrap">
          {[...SITE_TYPES, ...SITE_TYPES].map((t, i) => (
            <span
              key={i}
              className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-white/30"
            >
              {t}
              <span className="ml-10 text-white/15">/</span>
            </span>
          ))}
        </div>
      </section>

      {/* ── The premise ──────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-20">
            <div>
              <Reveal>
                <SectionHead
                  eyebrow="The problem"
                  tone="light"
                  title="One site you can watch. Four, you are taking someone's word for it."
                  lede="Once staff are spread across sites, the attendance book stops being a record and starts being a report from whoever is holding the pen. Payroll arguments follow, and there is nothing to settle them with."
                />
              </Reveal>
              <Reveal delay={100}>
                <SpecList
                  tone="light"
                  className="mt-10"
                  items={[
                    {
                      term: "Today",
                      value:
                        "A supervisor writes the times down. You find out about the 8:40 arrival at the end of the month, if at all.",
                    },
                    {
                      term: "Disputes",
                      value:
                        "A deduction is challenged. Neither side has anything to point at, so the loudest version wins.",
                    },
                    {
                      term: "Records",
                      value:
                        "If the matter goes further than the office, the attendance book is a notebook with corrections in it.",
                    },
                  ]}
                />
              </Reveal>
            </div>
            <Reveal delay={120} variant="scale">
              <div className="text-kaunta-ultra-br/85">
                <MultiSitePlan className="h-auto w-full" />
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── Exception dashboard ──────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-20 sm:py-28">
          <Reveal>
            <SectionHead
              eyebrow="Multi-site dashboard"
              tone="light"
              align="center"
              title="It opens on what went wrong, not on everything that happened."
              lede="Every site reports in. The dashboard shows you the exceptions — missed shifts, scans outside the fence, appeals waiting on a decision — and leaves the ordinary days alone."
            />
          </Reveal>
          <Reveal delay={120} variant="scale" className="mt-12">
            <Screenshot label="dashboard exception view" ratio="16 / 9" tone="dark" />
          </Reveal>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3">
            {[
              ["Missed", "Nobody scanned at a site that had a shift rostered."],
              ["Out of fence", "A scan came from beyond the radius you set."],
              ["Waiting on you", "An appeal has been open longer than a day."],
            ].map(([k, v], i) => (
              <Reveal key={k} delay={i * 70}>
                <div className="h-full bg-kaunta-void p-6">
                  <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-kaunta-ultra-br/70">
                    {k}
                  </p>
                  <p className="mt-3 text-[0.875rem] leading-relaxed text-white/55">
                    {v}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Clock-in ─────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal variant="left">
              <SectionHead
                eyebrow="Clock-in"
                tone="light"
                title="A scan that proves where it happened."
                lede="Print the QR and put it at the gate. When a staff member scans it, the phone checks its own position against the fence you drew around that site, takes a selfie, and stamps the time. A code photographed and carried home does not work."
              />
              <div className="mt-8">
                <SiteButton href="/features" variant="outline">
                  How the geofence works <ArrowRight />
                </SiteButton>
              </div>
            </Reveal>
            <Reveal delay={100} variant="right">
              <div className="grid grid-cols-[1fr_auto] items-center gap-6 text-kaunta-ultra-br/85">
                <DrawReveal length={900}>
                  <GeofencePlan className="h-auto w-full max-w-[300px]" />
                </DrawReveal>
                <DrawReveal length={900} delay={200}>
                  <PhoneClockIn className="h-auto w-[110px] sm:w-[140px]" />
                </DrawReveal>
              </div>
            </Reveal>
          </div>
          <Reveal delay={80} className="mt-14">
            <Screenshot
              label="mobile clock-in selfie+GPS"
              ratio="4 / 3"
              tone="dark"
              className="mx-auto max-w-md"
            />
          </Reveal>
        </Container>
      </section>

      {/* ── Rules + disputes ─────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-20 sm:py-28">
          <Reveal>
            <SectionHead
              eyebrow="Rules and appeals"
              tone="light"
              title="The deduction is calculated once, and it can be argued with."
            />
          </Reveal>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <Reveal variant="left">
              <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-7 sm:p-9">
                <div className="text-kaunta-ultra-br/85">
                  <RuleLadder className="h-auto w-full max-w-[300px]" />
                </div>
                <h3 className="font-display mt-8 text-2xl text-white">
                  You write the rules
                </h3>
                <p className="mt-3 max-w-md text-[0.9rem] leading-relaxed text-white/55">
                  Grace period, lateness bands, what absence costs, whether
                  weekends count differently. Set it per site or apply one policy
                  across all of them. Nothing is applied that you did not
                  configure.
                </p>
                <div className="mt-8">
                  <Screenshot label="penalty rules config" ratio="16 / 10" tone="dark" />
                </div>
              </div>
            </Reveal>

            <Reveal variant="right" delay={90}>
              <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-7 sm:p-9">
                <div className="text-kaunta-ultra-br/85">
                  <DrawReveal length={1200}>
                    <SealedDocument className="h-auto w-[150px]" />
                  </DrawReveal>
                </div>
                <h3 className="font-display mt-8 text-2xl text-white">
                  Staff can appeal it
                </h3>
                <p className="mt-3 max-w-md text-[0.9rem] leading-relaxed text-white/55">
                  A penalty can be disputed from the phone it was applied to,
                  with a reason attached. You uphold or waive. Either way the
                  case closes into a locked PDF that records what was claimed,
                  what was decided and when.
                </p>
                <div className="mt-8">
                  <Screenshot label="dispute appeal PDF" ratio="16 / 10" tone="dark" />
                </div>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── Payslips ─────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal delay={80} variant="left" className="order-2 lg:order-1">
              <Screenshot label="payslip" ratio="3 / 4" tone="dark" className="max-w-xs" />
            </Reveal>
            <Reveal variant="right" className="order-1 lg:order-2">
              <SectionHead
                eyebrow="Payslips"
                tone="light"
                title="The deductions on the payslip are the ones you can trace."
                lede="Every line on a Kaunta HR payslip goes back to a scan, a rule and — where it was challenged — a closed appeal. Send it as a signed link over SMS; it opens for that employee and expires."
              />
              <div className="mt-8 text-kaunta-ultra-br/85">
                <DrawReveal length={1100}>
                  <PayslipSheet className="h-auto w-[130px]" />
                </DrawReveal>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── Capability grid ──────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-20 sm:py-28">
          <Reveal>
            <SectionHead
              eyebrow="Everything in the box"
              tone="light"
              title="Seven things it does, and nothing it doesn't."
            />
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c, i) => (
              <Reveal key={c.index} delay={(i % 3) * 70}>
                <FeatureCard
                  index={c.index}
                  title={c.title}
                  body={c.body}
                  tone="dark"
                />
              </Reveal>
            ))}
            <Reveal delay={140}>
              <Link
                href="/features"
                className="flex h-full flex-col justify-between rounded-xl border border-dashed border-white/15 p-6 transition-colors duration-300 hover:border-white/35 sm:p-7"
              >
                <span className="font-display text-xl text-white/80">
                  Every capability in detail
                </span>
                <span className="mt-6 inline-flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-white/45">
                  Product <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── Social proof slot ────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-24">
          <Reveal>
            <Eyebrow tone="light" className="text-center">
              In use at
            </Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex h-24 items-center justify-center bg-kaunta-void"
                >
                  <span className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-white/25">
                    [Logo slot {i}]
                  </span>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={140}>
            <blockquote className="mx-auto mt-12 max-w-2xl text-center">
              <p className="font-display text-xl leading-snug text-white/85 sm:text-2xl">
                [Customer quote slot &mdash; one owner, one specific outcome, with
                the site count and the month.]
              </p>
              <footer className="mt-5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-white/35">
                [Name] · [Business] · [Town]
              </footer>
            </blockquote>
          </Reveal>
        </Container>
      </section>

      {/* ── Pricing teaser ───────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
            <Reveal>
              <SectionHead
                eyebrow="Pricing"
                tone="light"
                title="Priced per site, in shillings."
                lede="One site or twenty, you pay for the sites you actually run. SMS is billed at cost. No per-scan charges — staff clock in as often as the roster says."
              />
              <div className="mt-8">
                <SiteButton href="/pricing" variant="light">
                  See the plans <ArrowRight />
                </SiteButton>
              </div>
            </Reveal>
            <Reveal delay={100} variant="right">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-7 sm:p-9">
                <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-white/35">
                  From
                </p>
                <p className="font-display mt-3 text-[3rem] leading-none tracking-[-0.02em] text-white">
                  KES 3,500
                  <span className="ml-2 font-sans text-sm font-normal tracking-normal text-white/40">
                    / site / month
                  </span>
                </p>
                <SpecList
                  tone="light"
                  className="mt-8"
                  items={[
                    { term: "Included", value: "QR clock-in, geofencing, selfie + GPS" },
                    { term: "Included", value: "Penalty rules, appeals, locked PDFs" },
                    { term: "Included", value: "Payslips and secure links" },
                    { term: "Billed at cost", value: "SMS sent under KAUNTAHR" },
                  ]}
                />
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="prose" className="py-20 sm:py-28">
          <Reveal>
            <SectionHead eyebrow="Questions" tone="light" title="Before you set it up" />
          </Reveal>
          <div className="mt-12">
            <FAQ items={FAQ_ITEMS} tone="dark" />
          </div>
        </Container>
      </section>

      <CTASection />
    </>
  );
}
