import type { Metadata } from "next";
import { Shot, SHOTS } from "@/components/site/SiteUI";
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
    "Handle an Aproksi HR appeal from the moment a staff member raises it to the locked, tamper-evident PDF that closes the case — including the appeal window and the fact-checked brief prepared before you decide.",
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
          ["Acknowledged", "Staff", "They tap to confirm they have seen it; the time is kept"],
          ["Appealed", "Staff", "The staff member objects, in writing, from their own record"],
          ["Window closed", "The clock", "The appeal window passed without an appeal; the penalty stands"],
          ["Under review", "Owner", "The case appears in the exception queue with its brief attached"],
          ["Upheld", "Owner", "The deduction stands and carries to the payslip"],
          ["Waived", "Owner", "The deduction is reversed and never reaches the payslip"],
          ["Locked", "The system", "A tamper-evident PDF is written and sent to the staff member"],
        ]}
      />

      <H2 id="window">The appeal window</H2>
      <P>
        Every rule carries a window — 24 hours by default, 48 for absence in the
        supplied presets — measured from the moment the penalty was applied. Once
        it passes, the penalty reads as closed without an appeal, and the option
        to raise one is gone.
      </P>
      <Callout title="The deadline is the deadline" tone="note">
        The state is worked out from the clock, not from whether a background job
        happened to have run. A penalty whose window expired eleven minutes ago
        reads as closed to the staff member and to you at the same moment — there
        is no gap in which an expired penalty still offers a &ldquo;review&rdquo;
        button that would fail.
      </Callout>
      <P>
        Because the window matters, so does delivery. A staff member acknowledges
        a notice with one tap and the time is recorded against the penalty, and
        any notice that never reached a phone is surfaced to you with the number
        so you can correct it and resend. An appeal window that ran out against
        somebody who was never told is not a decision anybody should be
        defending.
      </P>

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

      <H2 id="brief">The brief that arrives with it</H2>
      <P>
        Most appeals turn on a question the records can answer and nobody has
        time to go and ask. So when an appeal is raised, Aproksi HR works out what
        is being claimed and goes and counts.
      </P>
      <DocTable
        head={["Claim", "What is checked"]}
        rows={[
          [
            "The app or the QR would not work",
            "Failed scan attempts that phone reported, and whether other staff at that site were failing to scan in the same window",
          ],
          [
            "They were unwell",
            "Whether a sick note was attached, and what the person's own record holds — never whether the illness was real",
          ],
          [
            "The road was blocked",
            "Whether colleagues travelling to that site arrived late together that morning, measured against their own four-week baseline",
          ],
          [
            "Not clear from the wording",
            "The facts of the penalty itself, with no claim-specific checking and a note saying so",
          ],
        ]}
      />
      <P>
        It reads Kenyan English and the Swahili staff actually type — {" "}
        <em>gari ilikwama</em>, <em>sikuwa mzima</em>, <em>app ilihang</em> — so
        an appeal written the way people speak does not fall through as
        unreadable.
      </P>

      <Callout title="It reports. It never decides." tone="warn">
        The brief never states whether a claim is true, never recommends upholding
        or waiving, never scores anybody and never estimates a likelihood. Every
        figure in it is a count taken from rows you can open and read yourself,
        and where something cannot be checked — a sick note is a piece of paper,
        not a fact in a database — it says so in those words. If it ever reads
        like a verdict, that is a bug, and it is tested for.
      </Callout>

      <H3>What a brief looks like</H3>
      <CodeBlock
        label="Appeal against a 52-minute lateness at Juja"
        lines={[
          "Peter Mwangi was 52 minutes late against a 07:00 start and is",
          "appealing that the road was blocked.",
          "",
          "The record is consistent with that: 3 of the 5 colleagues rostered",
          "at Juja that morning also arrived late, against a four-week average",
          "of 0.4, and 2 failed scan attempts were reported from the site",
          "between 07:10 and 07:35.",
          "",
          "Cannot be checked: whether the Thika road was in fact closed.",
          "",
          "Every figure above comes from the records and can be opened and",
          "read. The decision is yours.",
        ]}
      />

      <H2 id="deciding">Deciding an appeal</H2>
      <Steps>
        <StepItem n={1} title="Open the exception queue">
          Appeals sit alongside missed shifts and out-of-fence scans on the
          dashboard, oldest first. They are not a separate inbox to remember.
        </StepItem>
        <StepItem n={2} title="Read the evidence behind it">
          Each case shows the scan that triggered the penalty, the time against
          the rostered shift, the distance from the site pin and the selfie taken
          at the moment of the scan — with the brief above it, so you start from
          what the records already say rather than from the argument.
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
      <Shot
        shot={SHOTS.violationOutcome}
        caption="A closed case, upheld"
        className="mt-6 max-w-sm"
      />
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
        The owner. Staff can raise and read, never decide. See{" "}
        <DocLink href="/docs/roles">roles &amp; permissions</DocLink>.
      </P>

      <SeeAlso hrefs={["/docs/penalty-rules", "/docs/leave", "/docs/payslips"]} />
    </DocPage>
  );
}
