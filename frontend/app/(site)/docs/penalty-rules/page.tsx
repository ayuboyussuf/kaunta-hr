import type { Metadata } from "next";
import { Screenshot } from "@/components/site/SiteUI";
import {
  DocPage,
  H2,
  H3,
  P,
  UL,
  LI,
  Code,
  Steps,
  StepItem,
  CodeBlock,
  Callout,
  DocTable,
  DocLink,
  SeeAlso,
} from "@/components/site/DocsUI";

export const metadata: Metadata = {
  title: "Setting penalty rules",
  description:
    "Configure grace periods, lateness bands and absence rules in Kaunta HR, and understand exactly how a scan is matched to a deduction.",
};

export default function PenaltyRulesDocPage() {
  return (
    <DocPage
      href="/docs/penalty-rules"
      title="Setting penalty rules"
      lede="You decide what lateness costs and when it starts costing. The engine applies what you wrote, the same way, to every scan — so a deduction is never a judgement someone makes three weeks later."
    >
      <Callout title="Rules are optional" tone="note">
        Attendance works perfectly well with no rules at all. Many owners run the
        first month recording only, look at the real arrival pattern, and set
        thresholds that reflect it rather than guessing.
      </Callout>

      <H2 id="anatomy">Anatomy of a policy</H2>
      <P>A policy is made of four parts, evaluated in this order:</P>
      <DocTable
        head={["Part", "What it does"]}
        rows={[
          ["Grace period", "Minutes after shift start that carry no penalty at all"],
          ["Lateness bands", "Ranges beyond the grace period, each with its own deduction"],
          ["Absence rule", "What a rostered shift with no scan against it costs"],
          ["Scope", "Whether this policy applies to one site or across the business"],
        ]}
      />

      <H2 id="grace">1. Set the grace period</H2>
      <P>
        Grace is measured from the rostered shift start. A scan inside the grace
        window is recorded as late for the record but attracts no deduction —
        which is usually what you want for traffic on a bad morning.
      </P>
      <CodeBlock
        label="Example — Ruiru Station"
        lines={[
          "Shift start      07:00",
          "Grace period     10 minutes",
          "",
          "06:58  →  on time",
          "07:06  →  late, recorded, no deduction",
          "07:11  →  late, band 1 applies",
        ]}
      />

      <H2 id="bands">2. Build the lateness bands</H2>
      <P>
        Bands are ranges measured from the end of the grace period. Add as many
        as you need; they must not overlap, and the engine matches the first band
        the lateness falls into.
      </P>
      <Steps>
        <StepItem n={1} title="Open the site and choose Rules">
          Rules live on the site, so a busy branch and a quiet one can differ.
        </StepItem>
        <StepItem n={2} title="Add a band">
          Give it a lower bound, an upper bound and an amount. Amounts are in KES
          and can be a fixed sum or a portion of a day&rsquo;s pay.
        </StepItem>
        <StepItem n={3} title="Leave the last band open-ended">
          The final band should have no upper bound, so arrivals well beyond it
          still match something.
        </StepItem>
      </Steps>

      <CodeBlock
        label="A typical three-band policy"
        lines={[
          "Grace          0 – 10 min      no deduction",
          "Band 1        11 – 30 min      KES 100",
          "Band 2        31 – 60 min      KES 250",
          "Band 3        61 min and over  KES 500",
          "",
          "Absence        no scan          half day",
        ]}
      />

      <Callout title="Bands must not overlap" tone="warn">
        If two bands cover the same minute the policy will not save. The
        interface shows the gap or the overlap so you can see which boundary to
        move. A gap is also rejected — every minute past grace must resolve to
        exactly one band.
      </Callout>

      <Screenshot
        label="penalty rules config"
        ratio="16 / 10"
        tone="dark"
        className="mt-8 max-w-2xl"
      />

      <H2 id="absence">3. Set the absence rule</H2>
      <P>
        Absence is triggered when a rostered shift closes with no accepted scan
        against it. It is evaluated after the shift window has passed, not at the
        start of it, so a late arrival is never counted as an absence.
      </P>
      <UL>
        <LI>
          A scan rejected for being outside the fence does not satisfy the shift.
          It appears separately as an out-of-fence exception.
        </LI>
        <LI>
          A scan that syncs late still satisfies the shift, because the time
          recorded is the time it was taken. See the note on{" "}
          <DocLink href="/how-it-works">low-connectivity sites</DocLink>.
        </LI>
      </UL>

      <H2 id="matching">How a scan is matched</H2>
      <P>
        When a scan is accepted, Kaunta HR resolves it against the roster and the
        policy in one pass:
      </P>
      <Steps>
        <StepItem n={1} title="Find the shift">
          The scan is attached to the rostered shift it falls nearest, for that
          staff member at that site.
        </StepItem>
        <StepItem n={2} title="Measure lateness">
          Lateness is <Code>scan time − shift start</Code>, in whole minutes.
        </StepItem>
        <StepItem n={3} title="Apply grace">
          If lateness is within grace, the record is written and nothing further
          happens.
        </StepItem>
        <StepItem n={4} title="Match the band">
          Otherwise the first band containing that lateness is selected and its
          deduction is attached to the scan.
        </StepItem>
        <StepItem n={5} title="Notify">
          A notice goes to the staff member by SMS with a link to the penalty and
          the option to appeal it.
        </StepItem>
      </Steps>

      <H2 id="changing">Changing rules later</H2>
      <P>
        Rule changes apply from the moment you save them. They are never applied
        backwards over scans that have already been resolved, because those
        penalties may already have been notified, appealed or paid.
      </P>
      <H3>If you need to reverse something already applied</H3>
      <P>
        Waive the individual penalties through the appeal workflow rather than
        editing the policy. That leaves a record of what was reversed and by
        whom — which is the whole point. See{" "}
        <DocLink href="/docs/disputes">running disputes</DocLink>.
      </P>

      <SeeAlso hrefs={["/docs/disputes", "/docs/payslips", "/docs"]} />
    </DocPage>
  );
}
