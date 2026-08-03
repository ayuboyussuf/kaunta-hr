import type { Metadata } from "next";
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
  title: "Generating payslips",
  description:
    "Produce PDF payslips for a payroll period in Kaunta HR and send them to staff as signed, expiring links over SMS.",
};

export default function PayslipsDocPage() {
  return (
    <DocPage
      href="/docs/payslips"
      title="Generating payslips"
      lede="Every deduction on a Kaunta HR payslip points back at a scan, a rule and — where it was challenged — a closed appeal. Nothing is reconstructed at month end, because nothing was left undecided."
    >
      <H2 id="period">1. Close the period</H2>
      <P>
        A payroll period gathers the scans, penalties and decided appeals that
        fall inside it. Before generating, the dashboard shows you what is still
        outstanding.
      </P>
      <DocTable
        head={["Blocker", "What to do"]}
        rows={[
          ["Open appeals", "Decide them, or let the penalty roll to the next period"],
          ["Missed shifts undecided", "Confirm whether an absence rule should apply"],
          ["Unverified staff", "They will not receive a link until they verify by SMS"],
        ]}
      />
      <Callout title="Open appeals do not block you" tone="note">
        A period can be closed with appeals still open. The penalties under
        appeal are simply excluded from that payslip and carried to the next one
        after they are decided — never guessed at.
      </Callout>

      <H2 id="generate">2. Generate the payslips</H2>
      <Steps>
        <StepItem n={1} title="Open Payroll and select the period">
          Monthly by default. The period boundaries were set when the
          organisation was created.
        </StepItem>
        <StepItem n={2} title="Review the totals">
          You see gross, total deductions and net per staff member, grouped by
          site, before anything is produced.
        </StepItem>
        <StepItem n={3} title="Generate">
          A PDF is produced per employee. Generation is server-side, so figures
          do not depend on the device you are working from.
        </StepItem>
        <StepItem n={4} title="Send">
          Each staff member receives an SMS with a signed link to their own
          document.
        </StepItem>
      </Steps>


      <H2 id="contents">What is on the payslip</H2>
      <CodeBlock
        label="Payslip — structure"
        lines={[
          "Header        Business name, site, period, employee",
          "",
          "Earnings      Basic                      KES  x,xxx",
          "              Allowances                 KES  x,xxx",
          "",
          "Deductions    Lateness — 3 penalties     KES    450",
          "                14 Mar  band 1   KES 100",
          "                21 Mar  band 2   KES 250",
          "                28 Mar  band 1   KES 100",
          "              Absence — 1 shift          KES  x,xxx",
          "",
          "              Waived on appeal            —  KES 250",
          "",
          "Net pay                                  KES  x,xxx",
        ]}
      />
      <UL>
        <LI>
          Each penalty line shows the date and the band that matched it, so a
          staff member can check it against their own record.
        </LI>
        <LI>
          Anything waived on appeal is shown as waived rather than silently
          removed. The staff member can see the appeal worked.
        </LI>
        <LI>All figures are in <Code>KES</Code>.</LI>
      </UL>

      <H2 id="links">3. How the links work</H2>
      <P>
        Payslips are not attached to messages — SMS cannot carry a file, and an
        emailed PDF has no access control on it. Instead each staff member gets a
        signed link.
      </P>
      <DocTable
        head={["Property", "Behaviour"]}
        rows={[
          ["Scope", "Resolves to exactly one employee's document"],
          ["Signature", "Signed server-side; an altered link is rejected"],
          ["Expiry", "Stops working after its window closes"],
          ["Reissue", "An owner can send a fresh link at any time"],
          ["History", "Staff can open past payslips from their own record"],
        ]}
      />

      <Callout title="Forwarded links" tone="warn">
        A signed link is a bearer of access for its lifetime — a staff member who
        forwards their own link has shared their own payslip. Reissue to
        invalidate the old one if this matters.
      </Callout>

      <H2 id="corrections">Corrections after sending</H2>
      <H3>A deduction was wrong</H3>
      <P>
        Waive it through the appeal workflow, then regenerate. The correction
        carries its own record rather than overwriting the original quietly. See{" "}
        <DocLink href="/docs/disputes">running disputes</DocLink>.
      </P>
      <H3>Earnings figures were wrong</H3>
      <P>
        Update the staff member&rsquo;s pay details and regenerate the period. The
        earlier document remains in the record; the new one supersedes it and the
        staff member receives a fresh link.
      </P>

      <SeeAlso hrefs={["/docs/sms", "/docs/disputes", "/docs/roles"]} />
    </DocPage>
  );
}
