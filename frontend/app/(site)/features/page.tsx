import type { Metadata } from "next";
import {
  Container,
  SectionHead,
  Shot,
  SHOTS,
  SpecList,
  SiteButton,
  ArrowRight,
} from "@/components/site/SiteUI";
import { PageHero, CTASection, NextLinks } from "@/components/site/Blocks";

export const metadata: Metadata = {
  title: "Product",
  description:
    "QR attendance with geofencing, mid-shift presence checks, a configurable penalty rules engine, leave that settles the day, appeals with a fact-checked brief and locked PDFs, payslips over signed links, multi-site exception monitoring and SMS code onboarding.",
};

type Capability = {
  id: string;
  eyebrow: string;
  title: string;
  lede: string;
  spec: { term: string; value: React.ReactNode }[];
  shot?: keyof typeof SHOTS;
  flip?: boolean;
};

const CAPABILITIES: Capability[] = [
  {
    id: "attendance",
    shot: "overview",
    eyebrow: "QR attendance",
    title: "Clock-in that carries its own proof",
    lede: "Every site gets a signed QR code you print once and mount at the gate. A scan is only accepted when the device sits inside the radius you drew for that site, and the record it writes holds a selfie taken at that moment plus the GPS reading it was taken with.",
    spec: [
      { term: "Code", value: "Signed per workplace. A photographed code will not validate from outside the fence." },
      { term: "Site", value: "A code belonging to another of your sites will not clock somebody in. Staff assigned to no fixed site can use any of yours." },
      { term: "Position", value: "Radius drawn per site on a map, in metres. Set it tight for a forecourt, wide for a yard." },
      { term: "Selfie", value: "Captured at the moment of the scan, stored against the record, visible to the owner." },
      { term: "Signal", value: "Built for low-connectivity sites — a scan taken on a poor connection syncs when signal returns, keeping its original time." },
      { term: "Failures", value: "When a scan cannot happen at all — camera blocked, no signal, location refused — the phone records that and reports it once it can. A claim, recorded as one." },
    ],
  },
  {
    id: "rules",
    shot: "rules",
    eyebrow: "Penalty rules engine",
    title: "Rules you configure, applied the same way every day",
    lede: "You decide what lateness costs and when it starts costing. Aproksi HR runs those rules against every scan the moment it lands, so a penalty is never a judgement call made three weeks later by whoever is doing payroll.",
    spec: [
      { term: "Grace", value: "Minutes after shift start that carry no penalty at all." },
      { term: "Bands", value: "Stack as many lateness bands as you need, each with its own deduction." },
      { term: "By the minute", value: "Or charge per minute past grace, up to a ceiling, so five minutes and fifty are not the same thing." },
      { term: "Absence", value: "A separate rule for a shift with no scan against it." },
      { term: "Presets", value: "Five starting policies — standard, by the minute, record only, fuel station, restaurant — each fully editable once applied." },
      { term: "Scope", value: "One policy across the business, or a different set per site." },
      { term: "Optional", value: "Deductions can be switched off entirely — keep the attendance record without the penalties." },
    ],
    flip: true,
  },
  {
    id: "presence",
    eyebrow: "Presence checks",
    title: "Two scans prove somebody arrived, not that they stayed",
    lede: "An employee who clocks in, leaves, and comes back to clock out looks identical to one who worked the shift. Aproksi HR can ask, at unannounced moments inside the shift, for a staff member to re-scan the site code. The moments are drawn fresh per person per day, so there is no pattern to learn.",
    spec: [
      { term: "Off by default", value: "Nothing fires until you set a number of checks per shift. Zero is the default and zero means silence." },
      { term: "Timing", value: "Drawn per employee per day, spread across the shift, never in its opening or closing stretch, and never less than 45 minutes apart." },
      { term: "Window", value: "They get a window to answer — ten minutes unless you change it." },
      { term: "Answering", value: "A scan of their own site's code confirms it. Whether the location backed it up is recorded next to the answer, so a bad GPS fix is a note on the record rather than a missed check." },
      { term: "Not a clock-out", value: "Answering a check never ends anybody's shift." },
      { term: "On leave", value: "Nobody on approved leave is ever asked to confirm." },
      { term: "On demand", value: "You can also ask one named person to confirm right now, from the roster." },
    ],
  },
  {
    id: "leave",
    eyebrow: "Leave",
    title: "A day you signed off cannot come back as a penalty",
    lede: "Staff file leave in advance with a reason. You approve or decline, and say at that moment whether the day is paid. From then on the day is settled everywhere it could otherwise be punished — the absence sweep, the lateness rules, the presence schedule and payroll all read the same answer.",
    spec: [
      { term: "Filed by", value: "The staff member, ahead of time. How much notice you require is yours to set — one clear day by default." },
      { term: "Half days", value: "A single day can be asked for as the morning or the afternoon only. Half of a four-day range is not a thing anybody means." },
      { term: "Decided by", value: "The owner — approve or decline, paid or unpaid, recorded with the decision." },
      { term: "Effect", value: "An approved day is never an absence, never late, and never chased for a presence check." },
      { term: "Payroll", value: "Paid leave is paid in full. Unpaid leave comes off as a day, or as half of one." },
      { term: "Clashes", value: "A request overlapping one already pending or approved is refused rather than left to fight it out." },
    ],
    flip: true,
  },
  {
    id: "disputes",
    eyebrow: "Disputes and appeals",
    title: "A penalty a staff member can argue with, and a file that closes",
    lede: "Staff raise an appeal from the phone the penalty was applied to, with their reason attached. It arrives in your queue as an exception, not as a message you might miss. Before you read it, Aproksi HR has already gone and counted whatever the records can say about the claim. When you uphold or waive it, the case locks.",
    spec: [
      { term: "Raised by", value: "The employee, against a specific penalty, with a written reason." },
      { term: "Window", value: "Set per rule — 24 hours by default. Once it passes the penalty reads as closed without an appeal, on the deadline rather than on whenever a sweep happened to run." },
      { term: "Brief", value: "Aproksi works out what is being claimed — in English or the Swahili staff actually type — and checks it against the record: failed scan attempts at that site that morning, whether colleagues arrived late together, what this person's history holds." },
      { term: "What it will not do", value: "It never says whether the claim is true, never recommends an outcome and never scores anyone. Every figure in the brief can be opened and read." },
      { term: "Decided by", value: "The owner. Every decision is attributed by name." },
      { term: "Output", value: "A locked PDF recording the claim, the decision, the times and the site." },
      { term: "Integrity", value: "The document hash is recorded against the case at the moment it closes." },
      { term: "Delivery", value: "The outcome goes to the employee as a secure link." },
    ],
  },
  {
    id: "payslips",
    eyebrow: "Payslips",
    title: "Deductions that trace back to a scan",
    lede: "Generate a payslip for the period and every deduction on it points at a rule, a scan, and where relevant a closed appeal. Send it as a signed link over SMS — the link opens the PDF for that employee and stops working after it expires.",
    spec: [
      { term: "Format", value: "PDF, generated server-side, in KES." },
      { term: "Arithmetic", value: "Money is computed to the shilling with exact decimal maths, not floating point." },
      { term: "Leave", value: "Approved paid leave is paid; unpaid leave is deducted at a day or a half-day, matching what you approved." },
      { term: "Delivery", value: "A signed link by SMS under the sender ID APROKSIHR." },
      { term: "Access", value: "The link resolves to one employee's document and expires." },
      { term: "History", value: "Staff can open past payslips from their own record." },
    ],
    flip: true,
  },
  {
    id: "dashboard",
    shot: "teamCalendar",
    eyebrow: "Multi-site dashboard",
    title: "Exception monitoring, not a log to read",
    lede: "The dashboard's job is to be short. It opens on the things waiting for a decision from you, then the shape of the morning, and it stays quiet about everything that went normally — so checking on eight sites is a minute rather than an afternoon.",
    spec: [
      { term: "Waiting on you", value: "Appeals to decide, leave to approve, notices that never reached a phone. The list disappears entirely when there is nothing in it." },
      { term: "Arrivals", value: "The morning drawn as a distribution with your grace deadline marked on it. Six people bunched just past the line is a badly set grace period, which no count could ever tell you." },
      { term: "Missed", value: "A rostered shift with no scan against it." },
      { term: "Out of fence", value: "A scan attempted or recorded beyond the site radius." },
      { term: "Late sync", value: "Scans that reached the server well after they were taken." },
      { term: "Per site", value: "Drill into a single site's day without leaving the view." },
    ],
  },
  {
    id: "patterns",
    eyebrow: "Patterns",
    title: "The shape across a fortnight, not one bad morning",
    lede: "A single late arrival is arithmetic the engine already did. What no rule catches is the shape across many of them — repeated misses on one shift, at one site, by one person. Those are computed from the rows and shown with the counts they were derived from, so a finding cannot exist unless the records do.",
    spec: [
      { term: "Kinds", value: "Repeat lateness, lateness concentrated at a site or shift, repeated missed checks, somebody improving, and a clean month." },
      { term: "Window", value: "A trailing fortnight by default." },
      { term: "Evidence", value: "Each finding carries the numbers behind its sentence and the records it came from." },
      { term: "Month end", value: "On the 1st, anyone who closed the month clean is put in front of you as a bonus suggestion — while there is still time to act on it before payroll runs." },
      { term: "Never acts", value: "It reports. Nothing here raises a penalty, awards a bonus or touches a payslip." },
    ],
    flip: true,
  },
  {
    id: "roles",
    eyebrow: "Roles and access",
    title: "Owner and staff, separated at the door",
    lede: "Two roles and nothing in between. The owner runs the business; staff reach one record, their own. Both are enforced on the server, not hidden in the interface.",
    spec: [
      { term: "Owner", value: "Full access — sites, rules, staff, leave, penalties, appeals, payroll." },
      { term: "Staff", value: "Their own attendance, their own penalties, their own payslips. Nothing else." },
      { term: "Enforcement", value: "Checked on every request, not just on the screen that renders." },
      { term: "Attribution", value: "Every decision on an appeal or a leave request is recorded against the person who made it, by name." },
    ],
  },
  {
    id: "onboarding",
    eyebrow: "Onboarding and messaging",
    title: "Add a phone number, they verify by SMS",
    lede: "There is no app for staff to install and no password to reset on a busy morning. You add a staff member by phone number, they confirm with a one-time code by SMS, and from then on they use a link.",
    spec: [
      { term: "Verification", value: "An SMS code on first sign-in." },
      { term: "Notices", value: "Penalty notices, appeal outcomes, presence prompts and payslip links by SMS." },
      { term: "Sender ID", value: "Messages arrive from APROKSIHR, not a shortcode nobody recognises." },
      { term: "Browser notifications", value: "Where a staff member allows them, presence prompts also arrive as a notification. SMS stays the fallback, and nothing depends on it." },
      { term: "Acknowledged", value: "A penalty notice is acknowledged with a tap and the time is kept — so “nobody told me” is a question with an answer on it." },
      { term: "Delivery failures", value: "A notice that never reached a phone is surfaced to you with the number, to fix and resend or to mark unreachable." },
      { term: "Staff device", value: "A camera and a browser. Nothing to install." },
    ],
  },
];

/** Rendered as 01, 02 … so the list can grow without renumbering by hand. */
const stamp = (i: number) => String(i + 1).padStart(2, "0");

/** The headline counts the list rather than repeating a number that goes stale. */
const WORDS = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six",
  "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
];
const spellOut = (n: number) => WORDS[n] ?? String(n);

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Product"
        title={`${spellOut(CAPABILITIES.length)} capabilities, each doing one job properly.`}
        lede="Aproksi HR covers the stretch between a staff member arriving at a gate and the payslip that reflects it. Below is every part of that, in the order it happens."
      >
        <nav className="mt-10 flex flex-wrap gap-2">
          {CAPABILITIES.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-4 text-[0.8125rem] text-white/60 transition-colors duration-200 hover:border-white/40 hover:text-white sm:min-h-0 sm:py-1.5 sm:text-[0.75rem]"
            >
              {c.eyebrow}
            </a>
          ))}
        </nav>
      </PageHero>

      {CAPABILITIES.map((c, i) => (
        <section
          key={c.id}
          id={c.id}
          className="scroll-mt-24 border-b border-white/10 bg-aproksi-void"
        >
          <Container width="wide" className="py-14 sm:py-20 lg:py-28">
            <div
              className={
                c.shot
                  ? `grid gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.8fr)] lg:items-center lg:gap-16 ${
                      c.flip ? "lg:[&>*:first-child]:order-2" : ""
                    }`
                  : "max-w-3xl"
              }
            >
              <div>
                <span className="font-mono text-[0.6875rem] sm:text-[0.625rem] tracking-[0.16em] text-white/30">
                  {stamp(i)}
                </span>
                <SectionHead
                  className="mt-3"
                  eyebrow={c.eyebrow}
                  tone="dark"
                  title={c.title}
                  lede={c.lede}
                />
                <SpecList tone="dark" className="mt-10" items={c.spec} />
              </div>

              {c.shot && (
                <Shot
                  shot={SHOTS[c.shot]}
                  frame={c.shot === "teamCalendar" ? "screen" : "device"}
                />
              )}
            </div>
          </Container>
        </section>
      ))}

      <section className="border-b border-white/10 bg-aproksi-void">
        <Container className="py-14 sm:py-20 lg:py-24">
          <>
            <SectionHead
              align="center"
              tone="dark"
              eyebrow="What it is not"
              title="Things Aproksi HR deliberately leaves alone."
              lede="It is an attendance and payroll-record system for people who run sites. It is not a full HRIS, and it does not pretend to be."
            />
          </>
          <>
            <div className="mx-auto mt-10 max-w-2xl">
              <SpecList
                tone="dark"
                items={[
                  { term: "No recruitment", value: "No applicant tracking, no interview pipelines." },
                  { term: "No payments", value: "Aproksi HR produces the payslip. Moving the money stays with your bank or mobile money." },
                  { term: "No surveillance", value: "Location is read at the moment of a scan and at no other time. A presence check is a prompt to scan, not a position the phone reports on its own." },
                  { term: "No verdicts", value: "Nothing in the product decides an appeal, scores a person or recommends a deduction. It counts what happened and hands the decision back to you." },
                  { term: "No per-scan billing", value: "Clock in as many times a day as the roster requires." },
                ]}
              />
            </div>
          </>
          <>
            <div className="mt-10 flex justify-center">
              <SiteButton href="/how-it-works" variant="outline">
                Watch it run through a single day <ArrowRight />
              </SiteButton>
            </div>
          </>
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
            href: "/security",
            label: "Security & data",
            blurb: "Where the records live and who can reach them.",
          },
        ]}
      />

      <CTASection />
    </>
  );
}
