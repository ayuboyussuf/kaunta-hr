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
  title: "Leave and time off",
  description:
    "How staff file leave in Aproksi HR, how notice periods and half-days work, what approving as paid or unpaid does to a payslip, and why an approved day can never come back as a penalty.",
};

export default function LeaveDocPage() {
  return (
    <DocPage
      href="/docs/leave"
      title="Leave and time off"
      lede="Staff file ahead of time with a reason. You approve or decline, and say at that moment whether the day is paid. Everything downstream — the absence sweep, the lateness rules, the presence schedule and payroll — then reads the same answer."
    >
      <Callout title="One approval, settled everywhere" tone="note">
        This matters more than it sounds. In an earlier version of Aproksi HR only
        the absence sweep knew about leave, so a staff member on approved leave who
        came in anyway and scanned was recorded late and fined for it. Approved
        leave is now asked about in one place and answered the same way by every
        part of the product that could otherwise punish the day.
      </Callout>

      <H2 id="filing">How staff file</H2>
      <P>
        From their own record, staff choose the first and last day, give a reason,
        and send it. There is no form to collect and no supervisor in the middle.
      </P>
      <DocTable
        head={["Field", "Rules"]}
        rows={[
          ["First and last day", "The last day cannot be before the first"],
          ["Reason", "Required — between 3 and 500 characters"],
          ["Half day", "Morning or afternoon, and only on a single-day request"],
          ["Notice", "Must be filed at least the number of clear days you require"],
        ]}
      />

      <H3>Notice periods</H3>
      <P>
        Set how much warning you want in Settings, as a number of clear days
        between filing and the first day of leave. The default is one — leave has
        to be asked for at least the day before it starts. Setting it to{" "}
        <Code>0</Code> allows same-day requests.
      </P>
      <CodeBlock
        label="Notice set to 2 days, filing on Monday"
        lines={[
          "Leave starting Monday     rejected  — 0 days ahead",
          "Leave starting Tuesday    rejected  — 1 day ahead",
          "Leave starting Wednesday  accepted  — 2 days ahead",
          "Leave starting Thursday   accepted  — 3 days ahead",
        ]}
      />
      <P>
        A request that fails the notice rule is refused at the moment it is filed,
        with the reason stated, rather than sitting in your queue as something you
        have to decline by hand.
      </P>

      <H3>Half days</H3>
      <P>
        A single day can be asked for as the morning or the afternoon. A range
        cannot — &ldquo;the afternoon&rdquo; of a four-day request is not
        something anybody means, so it is refused rather than guessed at.
      </P>

      <H3>Overlaps</H3>
      <P>
        A request covering days already spoken for by a pending or approved
        request is refused. Two live answers for the same day is the kind of thing
        that only ever surfaces at payroll, so it is prevented at the door.
      </P>

      <H2 id="deciding">Approving and declining</H2>
      <P>
        Pending requests appear in the &ldquo;waiting on you&rdquo; list at the
        top of the dashboard, alongside appeals — not in a separate inbox you have
        to remember to open.
      </P>
      <Steps>
        <StepItem n={1} title="Read the dates and the reason">
          Each request shows who filed it, the days it covers and how soon the
          leave starts — &ldquo;starts tomorrow&rdquo; is a different decision
          from &ldquo;in eleven days&rdquo;.
        </StepItem>
        <StepItem n={2} title="Approve as paid or unpaid, or decline">
          Paid or unpaid is decided here, at approval, not later at payroll. It is
          stored on the request.
        </StepItem>
        <StepItem n={3} title="Add a note if the answer needs one">
          The note goes to the staff member with the decision.
        </StepItem>
      </Steps>
      <P>
        Every decision is recorded against you by name. Staff can withdraw a
        request themselves as long as it has not been decided.
      </P>

      <H2 id="effect">What an approved day does</H2>
      <DocTable
        head={["Would otherwise", "On an approved leave day"]}
        rows={[
          ["Absence sweep raises a penalty for a shift with no scan", "Skipped entirely"],
          ["A late scan matches a lateness band", "Not late — the day was signed off"],
          ["The presence schedule draws check times", "Nobody is drawn, so nobody is chased"],
          ["Payroll counts the day as absent", "Paid in full, or deducted, exactly as you approved"],
        ]}
      />
      <P>
        Only <em>approved</em> leave does any of this. A request that is still
        pending, or was declined, or was withdrawn, covers nothing — asking for a
        day off is not the same as being given it.
      </P>

      <H2 id="payroll">Leave on the payslip</H2>
      <UL>
        <LI>
          <strong>Paid leave</strong> is paid. The day is not prorated out of the
          salary.
        </LI>
        <LI>
          <strong>Unpaid leave</strong> comes off as one day, or as half a day for
          a morning or afternoon request.
        </LI>
        <LI>
          Days are counted in exact decimal arithmetic, so half-days add up to the
          shilling rather than to a rounding error.
        </LI>
      </UL>
      <P>
        Unpaid leave appears on the payslip as its own line —{" "}
        <Code>Unpaid leave (1 day(s), approved)</Code> — separately from
        penalties, because they are different things. One is time you agreed to;
        the other is a rule that was broken. See{" "}
        <DocLink href="/docs/payslips">generating payslips</DocLink>.
      </P>

      <Callout title="Paid leave for staff on an hourly rate" tone="warn">
        A daily-rate employee&rsquo;s paid leave day is simply paid. An hourly
        employee&rsquo;s paid leave has no hours attached to it, and Aproksi HR
        will not invent a number for you. The payslip is flagged instead, naming
        how many paid leave days were approved, so you can add the adjustment
        deliberately before sending it.
      </Callout>

      <H2 id="turning-up">If somebody turns up anyway</H2>
      <P>
        People do — a shift gets covered, plans change. The scan is accepted and
        recorded normally, and payroll counts that day as worked rather than as
        leave; it cannot be both. What does not happen is a lateness penalty,
        because the day was already signed off.
      </P>

      <SeeAlso
        hrefs={["/docs/penalty-rules", "/docs/payslips", "/docs/presence-checks"]}
      />
    </DocPage>
  );
}
