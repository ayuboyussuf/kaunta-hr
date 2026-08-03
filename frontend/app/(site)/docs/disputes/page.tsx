import type { Metadata } from "next";
import {
  DocPage,
  H2,
  H3,
  P,
  UL,
  LI,
  Steps,
  StepItem,
  CodeBlock,
  Callout,
  DocTable,
  DocLink,
  SeeAlso,
} from "@/components/site/DocsUI";

export const metadata: Metadata = {
  title: "Running disputes",
  description:
    "Handle a Kaunta HR appeal from the moment a staff member raises it to the locked, tamper-evident PDF that closes the case.",
};

export default function DisputesDocPage() {
  return (
    <DocPage
      href="/docs/disputes"
      title="Running disputes"
      lede="A penalty that cannot be argued with is a penalty that gets argued about. The appeal workflow gives a staff member a formal way to object and gives you a decision that closes into a document neither side can quietly change."
    >
      <H2 id="lifecycle">The lifecycle</H2>
      <DocTable
        head={["State", "Who moves it", "What happens"]}
        rows={[
          ["Applied", "The engine", "A penalty is attached to a scan and notified by SMS"],
          ["Appealed", "Staff", "The staff member objects, in writing, from their own record"],
          ["Under review", "Owner or accountant", "The case appears in the exception queue"],
          ["Upheld", "Owner or accountant", "The deduction stands and carries to the payslip"],
          ["Waived", "Owner or accountant", "The deduction is reversed and never reaches the payslip"],
          ["Locked", "The system", "A tamper-evident PDF is written and sent to the staff member"],
        ]}
      />

      <H2 id="raising">How a staff member raises one</H2>
      <P>
        The SMS notifying a penalty links to that penalty on their own record.
        They open it, choose to appeal, and write their reason. No account
        recovery, no form to collect from an office.
      </P>
      <UL>
        <LI>An appeal is always attached to one specific penalty.</LI>
        <LI>The reason is required. A blank appeal cannot be submitted.</LI>
        <LI>
          Once submitted the penalty is held — it will not be swept onto a
          payslip while the case is open.
        </LI>
      </UL>

      <Callout title="Appeals are held, not deferred" tone="note">
        If a payroll period closes with an appeal still open, the penalty is
        excluded from that payslip rather than guessed at. It lands on the next
        period once the case is decided.
      </Callout>

      <H2 id="deciding">Deciding an appeal</H2>
      <Steps>
        <StepItem n={1} title="Open the exception queue">
          Appeals sit alongside missed shifts and out-of-fence scans on the
          dashboard, oldest first. They are not a separate inbox to remember.
        </StepItem>
        <StepItem n={2} title="Read the evidence behind it">
          Each case shows the scan that triggered the penalty, the time against
          the rostered shift, the distance from the site pin and the selfie taken
          at the moment of the scan.
        </StepItem>
        <StepItem n={3} title="Uphold or waive">
          There are two outcomes and no third. You can add a note explaining the
          decision, which is carried into the document.
        </StepItem>
        <StepItem n={4} title="The case locks">
          The moment you decide, the outcome is written to a PDF and the case
          becomes read-only. Nobody — including an owner — can reopen it.
        </StepItem>
      </Steps>


      <H2 id="document">What the locked document contains</H2>
      <CodeBlock
        label="Outcome document — fields"
        lines={[
          "Organisation      Business name as configured",
          "Site              Site name and pin",
          "Employee          Name and phone number",
          "Penalty           Rule matched, amount, period",
          "Scan              Time recorded, distance from pin",
          "Claim             The staff member's written reason",
          "Decision          Upheld / waived, with any note",
          "Decided by        User name and role",
          "Decided at        Timestamp",
          "Document hash     Recorded against the case at close",
        ]}
      />
      <P>
        The hash is the part that matters in an argument. It is recorded against
        the case at the moment the document is produced, so a file altered
        afterwards no longer matches the record held in the system. More on what
        that is for on the{" "}
        <DocLink href="/compliance">compliance &amp; records page</DocLink>.
      </P>

      <H2 id="practice">Practical notes</H2>
      <H3>Reversing something after the fact</H3>
      <P>
        Use the appeal workflow rather than editing the penalty rules. Waiving
        leaves a record of what was reversed, by whom and why; editing a policy
        leaves nothing at all and does not touch penalties already applied.
      </P>
      <H3>If a staff member disputes everything</H3>
      <P>
        Each case still gets a decision and a document. The pattern itself is
        visible on their record — a long run of upheld appeals is its own piece
        of evidence.
      </P>
      <H3>Who can decide</H3>
      <P>
        Owners and accountants. Staff can raise and read, never decide. See{" "}
        <DocLink href="/docs/roles">roles &amp; permissions</DocLink>.
      </P>

      <SeeAlso hrefs={["/docs/penalty-rules", "/docs/payslips", "/docs/roles"]} />
    </DocPage>
  );
}
