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
  title: "Getting started",
  description:
    "Create your Kaunta HR organisation, add your first site, draw the geofence, print the QR code and take your first clock-in.",
};

export default function DocsIndexPage() {
  return (
    <DocPage
      href="/docs"
      title="Getting started"
      lede="From an empty account to a working clock-in at one site. Budget about fifteen minutes, and do it standing at the site if you can — the fence is easier to draw when you can see the gate."
    >
      <H2 id="before">Before you begin</H2>
      <P>You will need three things to hand:</P>
      <UL>
        <LI>
          A phone number for yourself that can receive SMS, for verifying
          the owner account.
        </LI>
        <LI>
          The physical address, or better the map position, of the first site you
          want to run.
        </LI>
        <LI>
          Phone numbers for the staff at that site. They do not have to be
          present — you can add them now and they verify whenever they next open
          the link.
        </LI>
      </UL>

      <Callout title="A note on devices" tone="note">
        Staff need a phone with a camera and a browser. There is nothing to
        install, and no staff passwords to reset. Owners can work
        from a phone but the dashboard is easier on a laptop.
      </Callout>

      <H2 id="account">1. Create the organisation</H2>
      <Steps>
        <StepItem n={1} title="Sign up as the owner">
          Go to <DocLink href="/signup">the sign-up page</DocLink> and register
          with your email and phone number. The first account created becomes the
          owner of the organisation and cannot be demoted by anyone else.
        </StepItem>
        <StepItem n={2} title="Name the business">
          Use the name your staff would recognise. It appears on payslips,
          penalty notices and every locked PDF the system produces, so it is worth
          getting right at the start.
        </StepItem>
        <StepItem n={3} title="Set your payroll period">
          Monthly is the default and matches most Kenyan payroll cycles. The
          period determines which scans and penalties are gathered onto a payslip.
        </StepItem>
      </Steps>

      <H2 id="site">2. Add your first site</H2>
      <P>
        A site — a <Code>workplace</Code> in the interface — is one physical
        location with its own QR code, its own fence and its own roster. Two
        shops on the same street are two sites. A back entrance to the same yard
        is not.
      </P>

      <Steps>
        <StepItem n={1} title="Open Workplaces and create one">
          Give it a name staff will recognise on a notice: &ldquo;Ruiru
          Station&rdquo;, not &ldquo;Site 2&rdquo;.
        </StepItem>
        <StepItem n={2} title="Drop the pin">
          Place the centre point where staff actually report — the office door or
          the forecourt, not the middle of the plot.
        </StepItem>
        <StepItem n={3} title="Set the fence radius">
          This is the distance from the pin within which a scan is accepted. Start
          with the guidance below and adjust after a week of real scans.
        </StepItem>
      </Steps>

      <DocTable
        head={["Site type", "Suggested radius", "Why"]}
        rows={[
          ["Fuel forecourt", "100 – 150 m", "Covers pumps, shop and office without reaching the road"],
          ["Restaurant / shop", "50 – 80 m", "Tight enough that the street outside fails"],
          ["Yard or depot", "150 – 250 m", "Staff report at different points across the plot"],
          ["Security post", "40 – 60 m", "The post is the job; anywhere else is not"],
        ]}
      />

      <Callout title="Set it tight, then loosen" tone="warn">
        A fence that is too generous quietly defeats the point — a scan from the
        matatu stage down the road will pass. A fence that is slightly too tight
        shows up immediately as failed scans you can see and fix. Err tight.
      </Callout>

      <H2 id="qr">3. Print the QR code</H2>
      <P>
        Each site generates its own signed QR. Print it, laminate it if the site
        is outdoors, and mount it where staff pass on the way in — beside the
        office door works better than inside the office.
      </P>
      <UL>
        <LI>
          The code is signed for that site. Photographing it and scanning from
          home does not work, because the position check fails.
        </LI>
        <LI>
          You can reprint at any time. Regenerating a code invalidates the old
          printout, which is what you want if a sheet goes missing.
        </LI>
        <LI>A4 is enough for a wall. A5 is enough for a counter.</LI>
      </UL>


      <H2 id="staff">4. Add the staff</H2>
      <P>
        Add each person with their name, phone number and the site they work at.
        They verify themselves by SMS the first time they open the link —
        you do not create passwords for anyone. The full procedure is in{" "}
        <DocLink href="/docs/onboarding">onboarding staff</DocLink>.
      </P>
      <CodeBlock
        label="Phone number format"
        lines={[
          "Accepted   0712 345 678",
          "Accepted   +254 712 345 678",
          "Accepted   254712345678",
          "",
          "All three are stored as  +254712345678",
        ]}
      />

      <H2 id="first-scan">5. Take the first scan</H2>
      <Steps>
        <StepItem n={1} title="Stand at the gate and scan it yourself">
          Use your own phone. The scan should be accepted and appear on the
          dashboard within a few seconds.
        </StepItem>
        <StepItem n={2} title="Walk out to the road and scan again">
          This one should be rejected for being outside the fence. If it is
          accepted, your radius is too wide — reduce it and try again.
        </StepItem>
        <StepItem n={3} title="Check what was recorded">
          Open the scan on the dashboard. You should see the time, the distance
          from the pin and the selfie captured with it.
        </StepItem>
      </Steps>

      <H3>What to do next</H3>
      <P>
        Attendance now works on its own. Penalties are entirely optional — plenty
        of owners run the first month with the record only, then turn on rules
        once they can see what the real arrival pattern looks like.
      </P>

      <SeeAlso
        hrefs={["/docs/onboarding", "/docs/penalty-rules", "/docs/roles"]}
      />
    </DocPage>
  );
}
