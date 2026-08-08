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
  title: "SMS setup",
  description:
    "How Aproksi HR sends SMS under the APROKSIHR sender ID, what messages go out, and how delivery and costs work.",
};

export default function SmsDocPage() {
  return (
    <DocPage
      href="/docs/sms"
      title="SMS setup"
      lede="Operational messages go out over SMS under the sender ID APROKSIHR, so a staff member sees who a penalty notice or payslip link came from instead of an unfamiliar shortcode."
    >
      <H2 id="sender">The sender ID</H2>
      <P>
        Messages arrive from <Code>APROKSIHR</Code>. It is an alphanumeric sender
        ID, which means recipients see the name rather than a number, and cannot
        reply to the thread.
      </P>
      <UL>
        <LI>
          Nothing to configure. The sender ID is registered and applies to every
          organisation on the platform.
        </LI>
        <LI>
          Because the ID is alphanumeric, replies are not delivered anywhere.
          Every message that needs a response carries a link instead.
        </LI>
        <LI>
          Staff verification on first sign-in uses the same SMS channel. See{" "}
          <DocLink href="/docs/onboarding">onboarding staff</DocLink>.
        </LI>
      </UL>

      <H2 id="what">What actually gets sent</H2>
      <DocTable
        head={["Message", "When", "Contains"]}
        rows={[
          ["Penalty notice", "A deduction is applied to a scan", "The amount, the date and a link to appeal"],
          ["Appeal outcome", "An appeal is decided", "Upheld or waived, and a link to the locked document"],
          ["Payslip link", "A payroll period is sent", "A signed, expiring link to their own payslip"],
          ["Announcement", "An owner sends one", "Free text to a site or the whole business"],
          ["Fallback code", "A code needs resending", "A one-time verification code"],
        ]}
      />

      <Callout title="Nothing marketing goes out" tone="note">
        Aproksi HR only sends messages tied to a specific event on a staff
        member&rsquo;s own record, plus announcements you write yourself. There
        are no promotional sends on your sender ID.
      </Callout>

      <H2 id="example">What a notice looks like</H2>
      <CodeBlock
        label="Penalty notice"
        lines={[
          "From: APROKSIHR",
          "",
          "Ruiru Station: a late arrival penalty of KES 250",
          "was applied for 21 Mar (07:52, shift 07:00).",
          "View or appeal: https://…/p/8f3c2a",
        ]}
      />
      <CodeBlock
        label="Payslip link"
        lines={[
          "From: APROKSIHR",
          "",
          "Your payslip for March is ready.",
          "Open: https://…/s/4b91de",
          "This link expires.",
        ]}
      />

      <H2 id="numbers">Number handling</H2>
      <P>
        Numbers are normalised to E.164 before any message is sent, so the same
        person entered two different ways is still one recipient.
      </P>
      <CodeBlock
        label="Normalisation"
        lines={[
          "0712 345 678      →  +254712345678",
          "+254 712 345 678  →  +254712345678",
          "254712345678      →  +254712345678",
        ]}
      />

      <H2 id="delivery">Delivery and failures</H2>
      <Steps>
        <StepItem n={1} title="Check the message log">
          Every send is recorded against the staff member with its delivery
          state. Open their record to see what went out and what happened to it.
        </StepItem>
        <StepItem n={2} title="Resend if it failed">
          A failed send can be retried from the same screen. The link inside stays
          valid unless it has expired.
        </StepItem>
        <StepItem n={3} title="Check the number if it keeps failing">
          Repeated failures to one recipient almost always mean a wrong or
          disconnected number rather than a delivery problem.
        </StepItem>
      </Steps>

      <DocTable
        head={["State", "Meaning"]}
        rows={[
          ["Queued", "Accepted for sending, not yet with the carrier"],
          ["Sent", "Handed to the carrier"],
          ["Delivered", "Confirmed delivered to the handset"],
          ["Failed", "Rejected — usually an invalid or unreachable number"],
        ]}
      />

      <H2 id="cost">Cost</H2>
      <P>
        SMS is billed separately from your plan and passed through at cost,
        because volume depends entirely on how many notices and payslip links you
        send. Verification codes are ordinary SMS and are billed the same way as any other message.
      </P>
      <H3>Keeping volume down</H3>
      <UL>
        <LI>
          A generous grace period produces far fewer penalty notices than a tight
          one, without changing what is recorded.
        </LI>
        <LI>
          Announcements go to everyone you select — scope them to one site rather
          than the whole business where that is enough.
        </LI>
        <LI>
          Long messages split into multiple SMS units. The composer shows the unit
          count as you type.
        </LI>
      </UL>

      <SeeAlso hrefs={["/docs/onboarding", "/docs/payslips", "/docs/disputes"]} />
    </DocPage>
  );
}
