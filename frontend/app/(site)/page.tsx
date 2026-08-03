import Link from "next/link";
import {
  Container,
  SectionHead,
  Eyebrow,
  SiteButton,
  ArrowRight,
  Shot,
  SHOTS,
  FeatureCard,
  SpecList,
} from "@/components/site/SiteUI";
import { FAQ, CTASection } from "@/components/site/Blocks";
import { ForecourtEngraving, SealedRecord } from "@/components/site/Engravings";

const CAPABILITIES = [
  {
    index: "01",
    title: "QR clock-in, fenced to the site",
    body: "Each site gets its own signed QR code. A scan only counts if the phone is inside the radius you drew, and it carries a selfie and a GPS fix with it.",
  },
  {
    index: "02",
    title: "Penalty rules you write yourself",
    body: "Set the grace period, what lateness costs, what absence costs. The rules run against every scan, so nobody has to remember who was late on the 14th.",
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
      <section className="relative isolate -mt-16 flex min-h-[94svh] flex-col bg-kaunta-void pt-16 sm:-mt-18 sm:pt-18">
        {/* the forecourt — anchored to the fold so it is never half-shown */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] overflow-hidden text-white/70 sm:h-[62%]"
        >
          <ForecourtEngraving className="h-full w-full" />
        </div>
        <div
          aria-hidden
          className="ultra-glow pointer-events-none absolute inset-x-0 bottom-0 h-[70%]"
        />
        {/* scrim — the copy column must stay readable over the line work */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,9,15,0.97)_0%,rgba(6,9,15,0.93)_42%,rgba(6,9,15,0.55)_66%,rgba(6,9,15,0.12)_86%,transparent_100%)] lg:bg-[linear-gradient(to_right,rgba(6,9,15,0.96)_0%,rgba(6,9,15,0.88)_34%,rgba(6,9,15,0.42)_58%,transparent_78%)]"
        />
        <div
          aria-hidden
          className="grain-overlay pointer-events-none absolute inset-0"
        />

        <Container width="wide" className="relative z-20 pb-24 pt-12 sm:pb-28 sm:pt-20">
          <div className="max-w-3xl">
            <Eyebrow tone="dark">Attendance · Penalties · Payslips</Eyebrow>

            <h1 className="font-display mt-6 text-[2.6rem] leading-[1.02] tracking-[-0.028em] text-white sm:text-[3.9rem] lg:text-[4.6rem]">
              The attendance record for businesses running staff across several
              sites.
            </h1>

            <p className="mt-7 max-w-xl text-[1rem] leading-relaxed text-white/65 sm:text-[1.1rem]">
              Kaunta HR is built for Kenyan fuel stations, restaurants and branch
              networks. Staff clock in at the gate by QR, with a selfie and a GPS
              fix. The lateness rules you set apply on their own, staff appeal
              from their phones, and every outcome lands as a locked PDF and a
              payslip you can send.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <SiteButton href="/signup" variant="light" size="lg">
                Start free <ArrowRight />
              </SiteButton>
              <SiteButton href="/how-it-works" variant="outline" size="lg">
                See a day, start to finish
              </SiteButton>
            </div>
          </div>
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
            ].map(([k, v]) => (
              <div key={k} className="bg-kaunta-void px-5 py-7 sm:px-7">
                <dt className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-white/35">
                  {k}
                </dt>
                <dd className="mt-2 text-[0.9rem] text-white/75 sm:text-[0.975rem]">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* ── The premise ──────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-28">
          <SectionHead
            eyebrow="The problem"
            tone="dark"
            title="One site you can watch. Four, you are taking someone's word for it."
            lede="Once staff are spread across sites, the attendance book stops being a record and starts being a report from whoever is holding the pen. Payroll arguments follow, and there is nothing to settle them with."
          />
          <SpecList
            tone="dark"
            className="mt-12 max-w-3xl"
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
        </Container>
      </section>

      {/* ── Exception dashboard ──────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-20 sm:py-28">
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)] lg:items-center lg:gap-20">
            <div>
              <SectionHead
                eyebrow="Multi-site dashboard"
                tone="dark"
                title="It opens on what went wrong, not on everything that happened."
                lede="Every site reports in. The screen shows the exceptions — who missed, who was late, what is flagged — and leaves the ordinary days alone."
              />
              <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3">
                {[
                  ["Late", "Arrived after the grace period you set."],
                  ["Absent", "A rostered shift with no scan against it."],
                  ["Flagged", "A scan that needs a person to look at it."],
                ].map(([k, v]) => (
                  <div key={k} className="h-full bg-kaunta-void p-6">
                    <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-kaunta-ultra-br/80">
                      {k}
                    </p>
                    <p className="mt-3 text-[0.875rem] leading-relaxed text-white/55">
                      {v}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <Shot
              shot={SHOTS.overview}
              frame="device"
              caption="Site overview — the day in four numbers"
            />
          </div>
        </Container>
      </section>

      {/* ── Rules ────────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-20 sm:py-28">
          <div className="grid gap-14 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)] lg:items-center lg:gap-20">
            <Shot
              shot={SHOTS.rules}
              frame="device"
              caption="Rulesets — shared or per site"
            />
            <div>
              <SectionHead
                eyebrow="Penalty rules"
                tone="dark"
                title="The deduction is decided once, in advance, by you."
                lede="Write the rules for your business — what lateness costs, what phone use on the forecourt costs, how long someone has to appeal. Every scan is measured against them the moment it lands, so nothing is decided from memory at month end."
              />
              <SpecList
                tone="dark"
                className="mt-10"
                items={[
                  { term: "Set by", value: "The owner, per site or shared across all of them." },
                  { term: "Applied", value: "Automatically, against the scan that triggered it." },
                  { term: "Appeal window", value: "Configured per rule — 24 hours by default." },
                  { term: "Optional", value: "Deductions can be switched off entirely; the attendance record still stands." },
                ]}
              />
              <div className="mt-8">
                <SiteButton href="/docs/penalty-rules" variant="outline">
                  How rules are matched <ArrowRight />
                </SiteButton>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ── The record ───────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-20 sm:py-28">
          <SectionHead
            eyebrow="The record"
            tone="dark"
            align="center"
            title="A month you can hand to somebody."
            lede="Every day carries its own state, every state traces back to a scan, and the whole month exports as a report with the selfies attached."
          />
          <div className="mt-12">
            <Shot shot={SHOTS.teamCalendar} caption="One employee's month, with the report export" />
          </div>
        </Container>
      </section>

      {/* ── Appeals + locked documents ───────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
            <div>
              <SectionHead
                eyebrow="Appeals"
                tone="dark"
                title="A penalty a staff member can argue with, and a file that closes."
                lede="Staff dispute from the phone the penalty landed on, with a reason attached. You uphold or waive. Either way the case closes into a locked PDF recording what was claimed, what was decided, by whom and when — and its hash is kept against the case."
              />
              <div className="mt-8">
                <SiteButton href="/compliance" variant="outline">
                  What the record is worth <ArrowRight />
                </SiteButton>
              </div>
            </div>
            <div className="text-white/70">
              <SealedRecord className="mx-auto h-auto w-full max-w-[340px]" />
            </div>
          </div>
        </Container>
      </section>

      {/* ── Capability grid ──────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-20 sm:py-28">
          <SectionHead
            eyebrow="Everything in the box"
            tone="dark"
            title="Seven things it does, and nothing it doesn't."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <FeatureCard
                key={c.index}
                index={c.index}
                title={c.title}
                body={c.body}
                tone="dark"
              />
            ))}
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
          </div>
        </Container>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="prose" className="py-20 sm:py-28">
          <SectionHead eyebrow="Questions" tone="dark" title="Before you set it up" />
          <div className="mt-12">
            <FAQ items={FAQ_ITEMS} tone="dark" />
          </div>
        </Container>
      </section>

      <CTASection />
    </>
  );
}
