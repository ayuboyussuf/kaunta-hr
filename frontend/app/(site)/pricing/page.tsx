import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import {
  Container,
  SectionHead,
  SiteButton,
  ArrowRight,
  SpecList,
} from "@/components/site/SiteUI";
import { Reveal } from "@/components/site/Reveal";
import { PageHero, FAQ, CTASection, NextLinks } from "@/components/site/Blocks";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Kaunta HR pricing in KES, billed per site. Single Site from KES 3,500 per month, Multi-Site at KES 2,900 per site, and custom pricing for networks of ten sites and above.",
};

const PLANS = [
  {
    name: "Single Site",
    price: "3,500",
    unit: "/ month",
    note: "One site, up to 25 staff",
    blurb:
      "For a business running one location that still wants the record to hold up.",
    cta: "Start free",
    href: "/signup",
    featured: false,
    includes: [
      "QR clock-in with geofencing",
      "Selfie and GPS on every scan",
      "Penalty rules engine",
      "Disputes and appeals with locked PDFs",
      "PDF payslips over signed links",
      "WhatsApp OTP onboarding",
      "Owner and staff roles",
    ],
  },
  {
    name: "Multi-Site",
    price: "2,900",
    unit: "/ site / month",
    note: "From 2 sites, up to 60 staff per site",
    blurb:
      "For owners running several locations who need one view across all of them.",
    cta: "Start free",
    href: "/signup",
    featured: true,
    includes: [
      "Everything in Single Site",
      "Cross-site exception dashboard",
      "Separate penalty policy per site",
      "Accountant role, separate from owner",
      "Per-site and consolidated payroll periods",
      "Bulk staff onboarding by phone number",
    ],
  },
  {
    name: "Network",
    price: "Custom",
    unit: "",
    note: "10 sites and above",
    blurb:
      "For chains and franchise groups with their own reporting and record-keeping obligations.",
    cta: "Talk to us",
    href: "/signup",
    featured: false,
    includes: [
      "Everything in Multi-Site",
      "Volume pricing per site",
      "Bulk record export for audits",
      "Onboarding and staff training support",
      "Named contact for support",
    ],
  },
];

const COMPARISON: { row: string; single: string; multi: string; network: string }[] = [
  { row: "Sites", single: "1", multi: "2 – 9", network: "10 +" },
  { row: "Staff per site", single: "25", multi: "60", network: "Unlimited" },
  { row: "QR clock-in + geofence", single: "Yes", multi: "Yes", network: "Yes" },
  { row: "Selfie + GPS on scan", single: "Yes", multi: "Yes", network: "Yes" },
  { row: "Penalty rules engine", single: "One policy", multi: "Per site", network: "Per site" },
  { row: "Disputes and appeals", single: "Yes", multi: "Yes", network: "Yes" },
  { row: "Locked outcome PDFs", single: "Yes", multi: "Yes", network: "Yes" },
  { row: "Payslips over signed links", single: "Yes", multi: "Yes", network: "Yes" },
  { row: "Exception dashboard", single: "Single site", multi: "All sites", network: "All sites" },
  { row: "Accountant role", single: "—", multi: "Yes", network: "Yes" },
  { row: "Bulk record export", single: "—", multi: "—", network: "Yes" },
  { row: "SMS under KAUNTAHR", single: "At cost", multi: "At cost", network: "At cost" },
];

const PRICING_FAQ = [
  {
    q: "How is a site counted?",
    a: "A site is one physical location with its own QR code and its own geofence — a station, a branch, a restaurant. Two shops on the same street are two sites. A second entrance to the same yard is not.",
  },
  {
    q: "What does SMS cost?",
    a: "SMS is passed through at cost and billed separately from your plan, because volume depends entirely on how many notices and payslip links you send. WhatsApp OTP for staff verification is included in the plan.",
  },
  {
    q: "Do I pay per clock-in?",
    a: "No. Staff scan as many times a day as the roster requires — opening, breaks, closing — at no extra charge. You pay for sites, not for events.",
  },
  {
    q: "What happens if I add a site mid-month?",
    a: "The new site is prorated for the remainder of the month, and joins the normal cycle after that. Removing a site takes effect at the end of the current period.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Create an account, set up your first site and run it with real staff. You are not asked for payment details to start.",
  },
  {
    q: "What happens to my records if I stop paying?",
    a: "Attendance history, closed appeal documents and generated payslips stay available to export for 12 months after an account lapses. Locked PDFs are records, and we treat them that way.",
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Priced per site, in shillings, with no charge per scan."
        lede="You pay for the locations you run. Staff clock in as often as the roster says. SMS is passed through at cost so you are never paying a markup on your own notices."
      />

      {/* ── Plans ─────────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-16 sm:py-24">
          <div className="grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 80}>
                <div
                  className={cn(
                    "flex h-full flex-col rounded-xl border p-7 sm:p-8",
                    plan.featured
                      ? "border-kaunta-ultra-br/45 bg-kaunta-ultra/[0.07]"
                      : "border-white/10 bg-white/[0.02]"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-display text-2xl text-white">
                      {plan.name}
                    </h2>
                    {plan.featured && (
                      <span className="rounded-full border border-kaunta-ultra-br/45 px-2.5 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-kaunta-ultra-br">
                        Most sites
                      </span>
                    )}
                  </div>

                  <p className="mt-5 flex items-baseline gap-1.5">
                    {plan.price !== "Custom" && (
                      <span className="font-mono text-sm text-white/45">KES</span>
                    )}
                    <span className="font-display text-[2.75rem] leading-none tracking-[-0.02em] text-white">
                      {plan.price}
                    </span>
                    {plan.unit && (
                      <span className="text-[0.8125rem] text-white/45">
                        {plan.unit}
                      </span>
                    )}
                  </p>
                  <p className="mt-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-white/35">
                    {plan.note}
                  </p>

                  <p className="mt-5 text-[0.875rem] leading-relaxed text-white/55">
                    {plan.blurb}
                  </p>

                  <ul className="mt-7 space-y-3 border-t border-white/10 pt-7">
                    {plan.includes.map((f) => (
                      <li key={f} className="flex gap-3 text-[0.875rem] text-white/70">
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          className="mt-1 h-3.5 w-3.5 shrink-0 text-kaunta-ultra-br"
                          aria-hidden="true"
                        >
                          <path
                            d="M3 8.5l3.5 3.5L13 5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8 pt-2">
                    <SiteButton
                      href={plan.href}
                      variant={plan.featured ? "light" : "outline"}
                      size="lg"
                      className="w-full"
                    >
                      {plan.cta} <ArrowRight />
                    </SiteButton>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <p className="mt-8 text-center font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-white/30">
              Prices exclude VAT · SMS billed at cost · No charge per clock-in
            </p>
          </Reveal>
        </Container>
      </section>

      {/* ── Comparison ────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-20 sm:py-24">
          <Reveal>
            <SectionHead
              tone="light"
              eyebrow="Side by side"
              title="What changes between the plans."
            />
          </Reveal>

          <Reveal delay={80}>
            <div className="mt-10 -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/15">
                    <th className="py-4 pr-4 font-mono text-[0.625rem] uppercase tracking-[0.16em] font-medium text-white/35">
                      Feature
                    </th>
                    {["Single Site", "Multi-Site", "Network"].map((h) => (
                      <th
                        key={h}
                        className="py-4 pr-4 font-mono text-[0.625rem] uppercase tracking-[0.16em] font-medium text-white/60"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((r) => (
                    <tr key={r.row} className="border-b border-white/8">
                      <td className="py-3.5 pr-4 text-[0.875rem] text-white/70">
                        {r.row}
                      </td>
                      <td className="py-3.5 pr-4 text-[0.875rem] text-white/50">
                        {r.single}
                      </td>
                      <td className="py-3.5 pr-4 text-[0.875rem] text-white/80">
                        {r.multi}
                      </td>
                      <td className="py-3.5 pr-4 text-[0.875rem] text-white/50">
                        {r.network}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ── Worked example ────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal variant="left">
              <SectionHead
                tone="light"
                eyebrow="A worked example"
                title="Four stations, forty-one staff."
                lede="A fuel business running four forecourts across Kiambu county, sending roughly two notices per staff member per month plus payslips."
              />
            </Reveal>
            <Reveal variant="right" delay={80}>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-7 sm:p-8">
                <SpecList
                  tone="light"
                  items={[
                    { term: "Plan", value: "Multi-Site — 4 sites" },
                    { term: "Sites", value: "KES 2,900 × 4 = KES 11,600 / month" },
                    { term: "Staff", value: "41 across all sites — no per-staff charge" },
                    { term: "Clock-ins", value: "≈ 2,400 per month — no charge" },
                    { term: "SMS", value: "≈ 120 messages, billed at cost" },
                  ]}
                />
                <p className="mt-6 border-t border-white/10 pt-6 text-[0.9rem] text-white/70">
                  Roughly{" "}
                  <span className="font-mono text-white">KES 283</span> per staff
                  member per month, before SMS.
                </p>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="prose" className="py-20 sm:py-24">
          <Reveal>
            <SectionHead tone="light" eyebrow="Billing" title="Questions about the money" />
          </Reveal>
          <div className="mt-10">
            <FAQ items={PRICING_FAQ} tone="dark" />
          </div>
        </Container>
      </section>

      <NextLinks
        links={[
          {
            href: "/features",
            label: "Product",
            blurb: "Everything included, capability by capability.",
          },
          {
            href: "/multi-site",
            label: "Multi-site owners",
            blurb: "Why the per-site model matches how you actually operate.",
          },
          {
            href: "/security",
            label: "Security & data",
            blurb: "Where the records live and who can reach them.",
          },
        ]}
      />

      <CTASection
        title="Run one site free before you pay for four."
        body="Set up your first location, put the QR on the wall and let a real shift go through it. Add the rest when you are satisfied it holds."
      />
    </>
  );
}
