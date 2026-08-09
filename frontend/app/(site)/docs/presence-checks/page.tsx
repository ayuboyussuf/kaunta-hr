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
  title: "Presence checks",
  description:
    "Turn on mid-shift presence checks in Aproksi HR: how the times are drawn, how staff answer, what a missed check means and why the feature is off by default.",
};

export default function PresenceChecksDocPage() {
  return (
    <DocPage
      href="/docs/presence-checks"
      title="Presence checks"
      lede="A clock-in and a clock-out prove somebody arrived and somebody left. They say nothing about the hours in between. A presence check asks a staff member, at a moment nobody could have predicted, to walk to the code and scan it again."
    >
      <Callout title="Off until you turn it on" tone="note">
        Presence checks are disabled for every new organisation. Nothing is sent,
        nothing is scheduled and nothing appears on a staff member&rsquo;s phone
        until you set a number of checks per shift above zero. Many businesses
        never do, and the rest of the product works identically either way.
      </Callout>

      <H2 id="when">When this is worth switching on</H2>
      <P>
        It solves one specific problem: the staff member who scans in at seven,
        goes home, and comes back at five to scan out. On the record that person
        is indistinguishable from someone who worked the whole shift, and no
        amount of geofencing at the two ends can tell them apart.
      </P>
      <UL>
        <LI>
          Worth it where the job is being <em>at</em> the site — a forecourt, a
          security post, a shop that has to stay open.
        </LI>
        <LI>
          Usually not worth it where the work itself is the evidence — a kitchen
          that served two hundred covers did not do it empty.
        </LI>
        <LI>
          Start at one check per shift. It is a control, and a control people
          resent is one they will work around.
        </LI>
      </UL>

      <H2 id="turn-on">1. Switch it on</H2>
      <Steps>
        <StepItem n={1} title="Open Settings">
          Presence checks are set for the business, not per site.
        </StepItem>
        <StepItem n={2} title="Set checks per shift">
          Between <Code>0</Code> and <Code>10</Code>. Zero is off. One or two is
          what most sites end up running.
        </StepItem>
        <StepItem n={3} title="Set the response window">
          How long somebody has to answer once a check lands. Ten minutes is the
          default; a large yard may want more.
        </StepItem>
        <StepItem n={4} title="Decide about SMS">
          Checks reach the phone as a browser notification and appear as a banner
          when the staff member opens their page. SMS is there as a fallback for
          people whose phone will not hold a notification.
        </StepItem>
      </Steps>

      <H2 id="timing">How the times are chosen</H2>
      <P>
        The times are drawn per employee per day. Two people on the same shift at
        the same site are asked at different moments, and the same person is
        asked at different moments tomorrow. Nobody can learn a pattern, because
        there is no pattern to learn.
      </P>
      <DocTable
        head={["Rule", "Why"]}
        rows={[
          [
            "Never in the opening stretch of the shift",
            "Somebody who just scanned in has already proved where they are",
          ],
          [
            "Never in the closing stretch",
            "A check nobody can answer before they legitimately leave is a trap",
          ],
          [
            "At least 45 minutes apart",
            "Two checks landing back to back is harassment, not a control",
          ],
          [
            "Spread across the shift",
            "Several checks bunched into one hour leave the rest of the day unproved",
          ],
        ]}
      />
      <CodeBlock
        label="Two checks on an 07:00 – 17:00 shift"
        lines={[
          "Shift            07:00 – 17:00",
          "Checks per shift 2",
          "Response window  10 minutes",
          "",
          "Drawn today      10:24   and   14:05",
          "Drawn tomorrow   09:11   and   13:38",
          "",
          "Same employee. Different draw. No pattern to memorise.",
        ]}
      />

      <H2 id="answering">How a staff member answers</H2>
      <P>
        They walk to the QR code and scan it, the same code they clock in with.
        That is the whole procedure.
      </P>
      <UL>
        <LI>
          The scan has to be their own site&rsquo;s code. A code from another of
          your sites will not answer it.
        </LI>
        <LI>
          <strong>Answering never clocks anybody out.</strong> The scan is read as
          a check response and the shift carries on.
        </LI>
        <LI>
          The answer always counts, even where the location cannot back it up.
          Whether the position agreed is recorded alongside as{" "}
          <Code>location_verified</Code>, so you see a confirmation you can weigh
          rather than an employee with a cheap handset indoors being marked
          absent for something no action of theirs could have fixed.
        </LI>
        <LI>Anyone on approved leave is never asked at all.</LI>
      </UL>

      <Callout title="A control an honest person can always satisfy" tone="note">
        The first version of this refused any answer taken outside the fence.
        Read from the staff member&rsquo;s side that meant: you are standing at
        the till, you scan the right code at the right site, nothing happens, and
        fifteen minutes later you are recorded as having ignored it. There was no
        action available to you that would have worked. A control that cannot be
        satisfied is not a control, so the quality of the answer is now recorded
        instead of the answer being thrown away.
      </Callout>

      <H2 id="missed">What a missed check means</H2>
      <P>
        A check that is not answered inside its window is marked missed. The open
        clock-in is flagged for review, and you are told — a missed check nobody
        hears about is the same as no check at all. It is a flag on the record,
        not an automatic deduction: the rules engine does not price it, and no
        money moves without you.
      </P>
      <H3>Reasons a check goes unanswered that are not dishonesty</H3>
      <UL>
        <LI>The phone was on charge in the back office.</LI>
        <LI>They were serving a customer and could not walk away.</LI>
        <LI>The notification never arrived because the handset does not keep them.</LI>
      </UL>
      <P>
        This is why a missed check is put in front of a person rather than
        converted into money. Repeated misses are a different matter, and
        Aproksi HR raises those separately as a pattern — see{" "}
        <DocLink href="/features">patterns</DocLink> on the product page.
      </P>

      <H2 id="on-demand">Checking on somebody now</H2>
      <P>
        The schedule handles the random checks. When you have a specific reason to
        wonder about a specific person, the roster row carries a button that sends
        one immediately.
      </P>
      <UL>
        <LI>It refuses, and says so, if the person is not clocked in.</LI>
        <LI>It refuses if they already have a check open — one at a time.</LI>
        <LI>
          Otherwise it sends, and tells you the time by which they have to
          confirm.
        </LI>
        <LI>
          It does not spend the day&rsquo;s random draw. Asking for a check must
          not cost you the one that keeps everybody honest.
        </LI>
        <LI>
          The record says you asked. A targeted check and a drawn one are
          different events, and if a pattern of targeting one person is ever
          questioned, the record has to be able to show it.
        </LI>
      </UL>

      <H2 id="privacy">What staff are told, and what is collected</H2>
      <P>
        Nothing here tracks anybody between scans. The phone reads its position at
        the moment of a scan and at no other time; there is no background
        reporting, and Aproksi HR cannot see where a staff member is when they are
        not scanning.
      </P>
      <P>
        Tell your staff you have switched it on, and why. A check that arrives
        unexplained reads as suspicion; a check that was explained in advance
        reads as the job.
      </P>

      <SeeAlso hrefs={["/docs/penalty-rules", "/docs/leave", "/docs/disputes"]} />
    </DocPage>
  );
}
