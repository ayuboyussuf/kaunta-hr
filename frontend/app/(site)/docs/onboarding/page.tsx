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
  title: "Onboarding staff",
  description:
    "Add staff to Kaunta HR by phone number and verify them with a WhatsApp one-time code. No app to install and no staff passwords.",
};

export default function OnboardingDocPage() {
  return (
    <DocPage
      href="/docs/onboarding"
      title="Onboarding staff"
      lede="Staff join with a phone number and a one-time code over WhatsApp. There is no app to install, no password to issue and nothing for anyone to forget on a busy morning."
    >
      <H2 id="model">How it works</H2>
      <P>
        You add a staff member; they receive a message; they confirm with a
        six-digit code; the device is then trusted for that person. From then on
        they open a link, scan the site QR, and their record is theirs alone.
      </P>
      <UL>
        <LI>
          The phone number is the identity. One number, one staff record, one
          site assignment.
        </LI>
        <LI>
          Verification happens over <strong className="text-white/80">WhatsApp OTP</strong>.
          Operational messages afterwards — penalty notices, appeal outcomes,
          payslip links — go over SMS under the sender ID{" "}
          <Code>KAUNTAHR</Code>.
        </LI>
        <LI>
          Staff never see anyone else&rsquo;s attendance, penalties or pay. See{" "}
          <DocLink href="/docs/roles">roles &amp; permissions</DocLink>.
        </LI>
      </UL>

      <H2 id="adding">Adding one staff member</H2>
      <Steps>
        <StepItem n={1} title="Open Employees and add a person">
          You need their full name as it should appear on a payslip, their phone
          number, and the site they report to.
        </StepItem>
        <StepItem n={2} title="Assign the site">
          A staff member belongs to one site at a time. Moving someone between
          sites is a change you make on their record — their history stays with
          them.
        </StepItem>
        <StepItem n={3} title="Send the invitation">
          They receive a WhatsApp message with a link and a one-time code. The
          code is valid for a short window; you can resend as often as needed.
        </StepItem>
        <StepItem n={4} title="They confirm">
          Once the code is entered the record shows as verified, and they can
          scan at their site immediately.
        </StepItem>
      </Steps>

      <Screenshot
        label="staff onboarding + OTP"
        ratio="16 / 10"
        tone="dark"
        className="mt-8 max-w-2xl"
      />

      <H2 id="numbers">Phone number formats</H2>
      <P>
        Kenyan numbers are accepted in the three forms people actually type them.
        All are normalised to E.164 before storage, so the same person entered
        two different ways is still one person.
      </P>
      <CodeBlock
        label="Accepted input"
        lines={[
          "0712 345 678        →  +254712345678",
          "+254 712 345 678    →  +254712345678",
          "254712345678        →  +254712345678",
          "0110 123 456        →  +254110123456",
        ]}
      />
      <Callout title="Duplicate numbers" tone="warn">
        A number already attached to an active staff member cannot be added
        again. If someone has left and is returning, reactivate the original
        record rather than creating a second one — otherwise their history splits
        in two.
      </Callout>

      <H2 id="bulk">Adding a whole site at once</H2>
      <P>
        On Multi-Site plans you can add staff in bulk rather than one at a time.
        Prepare the list in this shape and paste it in:
      </P>
      <CodeBlock
        label="Bulk staff list"
        lines={[
          "Name,                 Phone,          Site,          Role",
          "Grace Wanjiru,        0712345678,     Ruiru Station, Attendant",
          "Peter Otieno,         0723456789,     Juja Station,  Attendant",
          "Mary Achieng,         0734567890,     Ruiru Station, Supervisor",
        ]}
      />
      <P>
        Every person on the list receives their own WhatsApp code. Nobody is
        activated until they confirm it themselves.
      </P>

      <H2 id="states">Staff record states</H2>
      <DocTable
        head={["State", "What it means", "Can they scan?"]}
        rows={[
          ["Invited", "Added, invitation sent, code not yet entered", "No"],
          ["Active", "Verified over WhatsApp and assigned to a site", "Yes"],
          ["Suspended", "Temporarily blocked by an owner", "No"],
          ["Left", "Deactivated. History and past payslips are retained", "No"],
        ]}
      />

      <H3>If someone changes their number</H3>
      <P>
        Update the number on their existing record and reissue the code. Their
        attendance history, penalties and payslips stay attached to the record,
        not to the handset.
      </P>

      <H3>If a staff member is not receiving the code</H3>
      <UL>
        <LI>Check the number is the one actually running WhatsApp on their phone.</LI>
        <LI>Resend from their record — the previous code is invalidated.</LI>
        <LI>
          If WhatsApp is unavailable on that handset, an owner can fall back to
          an SMS code from the same screen.
        </LI>
      </UL>

      <SeeAlso hrefs={["/docs/roles", "/docs/sms", "/docs/penalty-rules"]} />
    </DocPage>
  );
}
