import type { Metadata } from "next";
import {
  Container,
  SectionHead,
  Shot,
  SHOTS,
  SpecList,
  Eyebrow,
} from "@/components/site/SiteUI";
import { PageHero, CTASection, NextLinks } from "@/components/site/Blocks";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "One shift at a fuel station in Ruiru, from the QR scan at the gate through the geofence check, the automatic penalty, the staff appeal, the owner's decision and the payslip at the end of the month.",
};

type Beat = {
  time: string;
  actor: string;
  title: string;
  body: React.ReactNode;
  detail?: { term: string; value: React.ReactNode }[];
  shot?: keyof typeof SHOTS;
};

const BEATS: Beat[] = [
  {
    time: "06:58",
    actor: "Staff",
    title: "Grace arrives at the forecourt and scans the code",
    body: (
      <>
        The QR is laminated on the pillar by the office door. She opens the
        camera, scans, and the page loads in the browser — there is nothing to
        install and no password to remember. Her shift is rostered for 07:00.
      </>
    ),
  },
  {
    time: "06:58",
    actor: "System",
    title: "The phone checks where it is before the scan counts",
    body: (
      <>
        The code is signed for this station and this station only. Before
        accepting the scan, Kaunta HR compares the device&rsquo;s position against the
        radius drawn around the forecourt. Grace is 22&nbsp;metres from the
        pumps, inside a 120&nbsp;metre fence, so the scan stands. A selfie is
        captured with it.
      </>
    ),
    detail: [
      { term: "Distance", value: "22 m from the site centre" },
      { term: "Fence", value: "120 m, set when the site was created" },
      { term: "Captured", value: "Selfie, GPS reading, device time" },
      { term: "Result", value: "Accepted — on time, 2 minutes early" },
    ],
  },
  {
    time: "07:41",
    actor: "System",
    shot: "overview",
    title: "At the second station, nobody has scanned",
    body: (
      <>
        The Ruiru site opened fine. The Juja site did not. A shift was rostered
        for 07:00 and there is still no scan against it at 07:41. It appears on
        the owner&rsquo;s dashboard as an exception — not buried in a log, but as one
        of three things asking for attention this morning.
      </>
    ),
  },
  {
    time: "07:52",
    actor: "System",
    shot: "rules",
    title: "Peter scans 52 minutes late, and the rule does the arithmetic",
    body: (
      <>
        Peter reaches Juja and scans in. The policy on this site allows
        10&nbsp;minutes of grace, then charges a fixed amount up to half an hour
        and a steeper one beyond it. Nobody has to look any of this up: the band
        is matched the moment the scan lands, and the deduction is attached to
        Peter&rsquo;s record with the scan that caused it.
      </>
    ),
    detail: [
      { term: "Shift start", value: "07:00" },
      { term: "Scan", value: "07:52 — 52 minutes late" },
      { term: "Band matched", value: "Over 30 minutes" },
      { term: "Applied", value: "Deduction recorded against the period, with a notice by SMS" },
    ],
  },
  {
    time: "09:15",
    actor: "Staff",
    title: "Peter appeals it, from the same phone",
    body: (
      <>
        The SMS he received links to his own record. He opens the penalty and
        raises an appeal against it, writing his reason — the Thika road was
        closed at Kenol and the matatu was turned back. The appeal is attached to
        the penalty, not sent as a message that can be lost.
      </>
    ),
  },
  {
    time: "13:30",
    actor: "Owner",
    title: "The owner decides, and the case locks",
    body: (
      <>
        The appeal is sitting in the same exception queue as the missed shift
        was. The owner reads the reason, checks the scan and the selfie behind
        it, and waives the deduction. The moment that decision is made the case
        closes into a locked PDF: what was claimed, what was decided, by whom,
        and when. Its hash is recorded against the case.
      </>
    ),
    detail: [
      { term: "Decision", value: "Waived" },
      { term: "Decided by", value: "Owner account, attributed by name" },
      { term: "Output", value: "Locked PDF, hash recorded at close" },
      { term: "Sent to", value: "Peter, as a secure link" },
    ],
  },
  {
    time: "End of month",
    actor: "Accountant",
    shot: "teamCalendar",
    title: "The payslip already knows all of it",
    body: (
      <>
        Nothing gets reconstructed at month end, because nothing was left
        undecided. Grace&rsquo;s payslip carries no deductions. Peter&rsquo;s
        carries the ones that were upheld and not the one that was waived, and
        each line still points back at the scan and the rule that produced it.
        Both go out as signed links over SMS.
      </>
    ),
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="One Tuesday, two stations, from the gate to the payslip."
        lede="This is a full pass through the product using a business that runs two fuel stations — one in Ruiru, one in Juja — and the eleven staff between them. Nothing here is a feature list; it is the order things actually happen in."
      />

      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-12 sm:py-16 lg:py-24">
          {BEATS.map((beat) => (
            <div
              key={beat.title}
              className="grid gap-8 border-t border-white/10 py-12 first:border-t-0 first:pt-0 lg:grid-cols-[7rem_minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-12 lg:py-16"
            >
              {/* time rail */}
              <>
                <div className="lg:sticky lg:top-28">
                  <p className="font-mono text-[0.8125rem] tracking-[0.08em] text-kaunta-ultra-br">
                    {beat.time}
                  </p>
                  <p className="mt-1.5 font-mono text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-[0.16em] text-white/30">
                    {beat.actor}
                  </p>
                </div>
              </>

              {/* narrative */}
              <>
                <h2 className="font-display text-[1.6rem] leading-[1.15] tracking-[-0.015em] text-white sm:text-[2rem]">
                  {beat.title}
                </h2>
                <div className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-white/60">
                  {beat.body}
                </div>
                {beat.detail && (
                  <SpecList tone="dark" className="mt-8" items={beat.detail} />
                )}
              </>

              {/* visual */}
              {beat.shot && (
                <Shot
                  shot={SHOTS[beat.shot]}
                  frame={beat.shot === "teamCalendar" ? "screen" : "device"}
                />
              )}
            </div>
          ))}
        </Container>
      </section>

      {/* What the owner actually did all day */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-14 sm:py-20 lg:py-28">
          <>
            <SectionHead
              align="center"
              tone="dark"
              eyebrow="The point"
              title="The owner touched this twice."
              lede="Once to look at three exceptions in the morning, once to settle an appeal after lunch. Everything else — the scans, the fence checks, the arithmetic, the notices, the documents — happened without anyone being asked to remember it."
            />
          </>
          <>
            <div className="mx-auto mt-8 grid sm:mt-12 max-w-3xl gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3">
              {[
                ["11", "scans recorded"],
                ["2", "decisions made by a person"],
                ["0", "notebooks consulted"],
              ].map(([n, l]) => (
                <div key={l} className="bg-kaunta-void p-7 text-center">
                  <p className="font-display text-4xl text-white">{n}</p>
                  <p className="mt-2 font-mono text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-[0.16em] text-white/35">
                    {l}
                  </p>
                </div>
              ))}
            </div>
          </>
          <>
            <div className="mx-auto mt-12 max-w-2xl text-center">
              <Eyebrow tone="dark">A note on signal</Eyebrow>
              <p className="mt-4 text-[0.9rem] leading-relaxed text-white/55">
                Both stations in this walkthrough had usable data. Kaunta HR is
                built for low-connectivity sites: a scan taken where the signal is
                poor is held on the device and syncs when signal returns, keeping
                the time it was taken. The dashboard marks those separately so a
                sync delay is never mistaken for a late arrival.
              </p>
            </div>
          </>
        </Container>
      </section>

      <NextLinks
        links={[
          {
            href: "/features",
            label: "Product",
            blurb: "Each capability from the walkthrough, in detail.",
          },
          {
            href: "/multi-site",
            label: "Multi-site owners",
            blurb: "Written for someone running four sites, not one.",
          },
          {
            href: "/docs",
            label: "Documentation",
            blurb: "Set up sites, rules and staff step by step.",
          },
        ]}
      />

      <CTASection />
    </>
  );
}
