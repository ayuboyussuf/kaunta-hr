import type { Metadata } from "next";
import {
  Container,
  SectionHead,
  Screenshot,
  SpecList,
  SiteButton,
  ArrowRight,
} from "@/components/site/SiteUI";
import { Reveal, DrawReveal } from "@/components/site/Reveal";
import { PageHero, CTASection, NextLinks } from "@/components/site/Blocks";
import {
  GeofencePlan,
  RuleLadder,
  SealedDocument,
  PayslipSheet,
  PhoneClockIn,
  MultiSitePlan,
  DisputeFlow,
} from "@/components/site/Engravings";

export const metadata: Metadata = {
  title: "Product",
  description:
    "QR attendance with geofencing, a configurable penalty rules engine, dispute and appeal workflow with locked PDFs, payslips over signed links, multi-site exception monitoring, role-based access and WhatsApp OTP onboarding.",
};

type Capability = {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  lede: string;
  spec: { term: string; value: React.ReactNode }[];
  screenshot: string;
  ratio?: string;
  art: React.ReactNode;
  flip?: boolean;
};

const CAPABILITIES: Capability[] = [
  {
    id: "attendance",
    index: "01",
    eyebrow: "QR attendance",
    title: "Clock-in that carries its own proof",
    lede: "Every site gets a signed QR code you print once and mount at the gate. A scan is only accepted when the device sits inside the radius you drew for that site, and the record it writes holds a selfie taken at that moment plus the GPS reading it was taken with.",
    spec: [
      { term: "Code", value: "Signed per workplace. A photographed code will not validate from outside the fence." },
      { term: "Position", value: "Radius drawn per site on a map, in metres. Set it tight for a forecourt, wide for a yard." },
      { term: "Selfie", value: "Captured at the moment of the scan, stored against the record, visible to the owner." },
      { term: "Signal", value: "Built for low-connectivity sites — a scan taken on a poor connection syncs when signal returns, keeping its original time." },
    ],
    screenshot: "mobile clock-in selfie+GPS",
    ratio: "4 / 3",
    art: (
      <div className="grid grid-cols-[1fr_auto] items-center gap-6">
        <DrawReveal length={900}>
          <GeofencePlan className="h-auto w-full max-w-[280px]" />
        </DrawReveal>
        <DrawReveal length={900} delay={180}>
          <PhoneClockIn className="h-auto w-[104px] sm:w-[128px]" />
        </DrawReveal>
      </div>
    ),
  },
  {
    id: "rules",
    index: "02",
    eyebrow: "Penalty rules engine",
    title: "Rules you configure, applied the same way every day",
    lede: "You decide what lateness costs and when it starts costing. Kaunta HR runs those rules against every scan the moment it lands, so a penalty is never a judgement call made three weeks later by whoever is doing payroll.",
    spec: [
      { term: "Grace", value: "Minutes after shift start that carry no penalty at all." },
      { term: "Bands", value: "Stack as many lateness bands as you need, each with its own deduction." },
      { term: "Absence", value: "A separate rule for a shift with no scan against it." },
      { term: "Scope", value: "One policy across the business, or a different set per site." },
      { term: "Optional", value: "Deductions can be switched off entirely — keep the attendance record without the penalties." },
    ],
    screenshot: "penalty rules config",
    art: <RuleLadder className="h-auto w-full max-w-[300px]" />,
    flip: true,
  },
  {
    id: "disputes",
    index: "03",
    eyebrow: "Disputes and appeals",
    title: "A penalty a staff member can argue with, and a file that closes",
    lede: "Staff raise an appeal from the phone the penalty was applied to, with their reason attached. It arrives in your queue as an exception, not as a message you might miss. When you uphold or waive it, the case locks.",
    spec: [
      { term: "Raised by", value: "The employee, against a specific penalty, with a written reason." },
      { term: "Decided by", value: "Owner or an accountant with the right role. Every decision is attributed." },
      { term: "Output", value: "A locked PDF recording the claim, the decision, the times and the site." },
      { term: "Integrity", value: "The document hash is recorded against the case at the moment it closes." },
      { term: "Delivery", value: "The outcome goes to the employee as a secure link." },
    ],
    screenshot: "dispute appeal PDF",
    art: (
      <div className="space-y-8">
        <DisputeFlow className="h-auto w-full max-w-[320px]" />
        <DrawReveal length={1200}>
          <SealedDocument className="h-auto w-[128px]" />
        </DrawReveal>
      </div>
    ),
  },
  {
    id: "payslips",
    index: "04",
    eyebrow: "Payslips",
    title: "Deductions that trace back to a scan",
    lede: "Generate a payslip for the period and every deduction on it points at a rule, a scan, and where relevant a closed appeal. Send it as a signed link over SMS — the link opens the PDF for that employee and stops working after it expires.",
    spec: [
      { term: "Format", value: "PDF, generated server-side, in KES." },
      { term: "Delivery", value: "A signed link by SMS under the sender ID KAUNTAHR." },
      { term: "Access", value: "The link resolves to one employee's document and expires." },
      { term: "History", value: "Staff can open past payslips from their own record." },
    ],
    screenshot: "payslip",
    ratio: "3 / 4",
    art: (
      <DrawReveal length={1100}>
        <PayslipSheet className="h-auto w-[150px]" />
      </DrawReveal>
    ),
    flip: true,
  },
  {
    id: "dashboard",
    index: "05",
    eyebrow: "Multi-site dashboard",
    title: "Exception monitoring, not a log to read",
    lede: "The dashboard's job is to be short. It surfaces the sites and people that broke the pattern today and stays quiet about everything that went normally, so checking on eight sites is a minute rather than an afternoon.",
    spec: [
      { term: "Missed", value: "A rostered shift with no scan against it." },
      { term: "Out of fence", value: "A scan attempted or recorded beyond the site radius." },
      { term: "Late sync", value: "Scans that reached the server well after they were taken." },
      { term: "Open appeals", value: "Disputes waiting on a decision, oldest first." },
      { term: "Per site", value: "Drill into a single site's day without leaving the view." },
    ],
    screenshot: "dashboard exception view",
    ratio: "16 / 9",
    art: <MultiSitePlan className="h-auto w-full max-w-[340px]" />,
  },
  {
    id: "roles",
    index: "06",
    eyebrow: "Roles and access",
    title: "Owner, accountant, staff — separated at the door",
    lede: "Payroll figures and rule configuration are not the same permission. Roles are assigned per person and enforced on the server, not hidden in the interface.",
    spec: [
      { term: "Owner", value: "Full access — sites, rules, staff, penalties, appeals, payroll." },
      { term: "Accountant", value: "Payroll and reporting access without the ability to rewrite penalty rules." },
      { term: "Staff", value: "Their own attendance, their own penalties, their own payslips. Nothing else." },
      { term: "Enforcement", value: "Checked on every request, not just on the screen that renders." },
    ],
    screenshot: "roles and permissions",
    art: <SealedDocument className="h-auto w-[128px]" />,
    flip: true,
  },
  {
    id: "onboarding",
    index: "07",
    eyebrow: "Onboarding and messaging",
    title: "Add a phone number, they verify over WhatsApp",
    lede: "There is no app for staff to install and no password to reset on a busy morning. You add a staff member by phone number, they confirm with a one-time code over WhatsApp, and from then on they use a link.",
    spec: [
      { term: "Verification", value: "WhatsApp OTP on first sign-in." },
      { term: "Notices", value: "Penalty notices, appeal outcomes and payslip links by SMS." },
      { term: "Sender ID", value: "Messages arrive from KAUNTAHR, not a shortcode nobody recognises." },
      { term: "Staff device", value: "A camera and a browser. Nothing to install." },
    ],
    screenshot: "staff onboarding + OTP",
    art: (
      <DrawReveal length={1000}>
        <PhoneClockIn className="h-auto w-[130px]" />
      </DrawReveal>
    ),
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Product"
        title="Seven capabilities, each doing one job properly."
        lede="Kaunta HR covers the stretch between a staff member arriving at a gate and the payslip that reflects it. Below is every part of that, in the order it happens."
      >
        <nav className="mt-10 flex flex-wrap gap-2">
          {CAPABILITIES.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-[0.75rem] text-white/55 transition-colors duration-200 hover:border-white/40 hover:text-white"
            >
              {c.eyebrow}
            </a>
          ))}
        </nav>
      </PageHero>

      {CAPABILITIES.map((c) => (
        <section
          key={c.id}
          id={c.id}
          className="scroll-mt-24 border-b border-white/10 bg-kaunta-void"
        >
          <Container width="wide" className="py-20 sm:py-28">
            <div
              className={`grid gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 ${
                c.flip ? "lg:[&>*:first-child]:order-2" : ""
              }`}
            >
              <Reveal variant={c.flip ? "right" : "left"}>
                <span className="font-mono text-[0.625rem] tracking-[0.16em] text-white/30">
                  {c.index}
                </span>
                <SectionHead
                  className="mt-3"
                  eyebrow={c.eyebrow}
                  tone="light"
                  title={c.title}
                  lede={c.lede}
                />
                <SpecList tone="light" className="mt-10" items={c.spec} />
              </Reveal>

              <Reveal variant={c.flip ? "left" : "right"} delay={90}>
                <div className="flex flex-col gap-10">
                  <div className="text-kaunta-ultra-br/85">{c.art}</div>
                  <Screenshot
                    label={c.screenshot}
                    ratio={c.ratio ?? "16 / 10"}
                    tone="dark"
                  />
                </div>
              </Reveal>
            </div>
          </Container>
        </section>
      ))}

      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-24">
          <Reveal>
            <SectionHead
              align="center"
              tone="light"
              eyebrow="What it is not"
              title="Things Kaunta HR deliberately leaves alone."
              lede="It is an attendance and payroll-record system for people who run sites. It is not a full HRIS, and it does not pretend to be."
            />
          </Reveal>
          <Reveal delay={100}>
            <div className="mx-auto mt-10 max-w-2xl">
              <SpecList
                tone="light"
                items={[
                  { term: "No recruitment", value: "No applicant tracking, no interview pipelines." },
                  { term: "No payments", value: "Kaunta HR produces the payslip. Moving the money stays with your bank or mobile money." },
                  { term: "No surveillance", value: "Location is checked at the moment of a scan. Staff are not tracked between scans." },
                  { term: "No per-scan billing", value: "Clock in as many times a day as the roster requires." },
                ]}
              />
            </div>
          </Reveal>
          <Reveal delay={140}>
            <div className="mt-10 flex justify-center">
              <SiteButton href="/how-it-works" variant="outline">
                Watch it run through a single day <ArrowRight />
              </SiteButton>
            </div>
          </Reveal>
        </Container>
      </section>

      <NextLinks
        links={[
          {
            href: "/how-it-works",
            label: "How it works",
            blurb: "One shift from the gate to the payslip, step by step.",
          },
          {
            href: "/compliance",
            label: "Compliance & records",
            blurb: "What the locked PDFs and audit trail are actually for.",
          },
          {
            href: "/pricing",
            label: "Pricing",
            blurb: "Per-site plans in KES, and what each one includes.",
          },
        ]}
      />

      <CTASection />
    </>
  );
}
