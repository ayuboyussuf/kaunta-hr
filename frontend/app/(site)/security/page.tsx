import type { Metadata } from "next";
import {
  Container,
  SectionHead,
  SpecList,
  Eyebrow,
} from "@/components/site/SiteUI";
import { PageHero, CTASection, NextLinks, FAQ } from "@/components/site/Blocks";
import { SealedRecord } from "@/components/site/Engravings";

export const metadata: Metadata = {
  title: "Security & data",
  description:
    "Where Aproksi HR data is held, how access is separated between the owner and staff, how payslip links are signed, what is redacted before anything reaches a log, and what document integrity means in practice.",
};

const SECURITY_FAQ = [
  {
    q: "Can one business see another's records?",
    a: "No. Every record belongs to an organisation, and every request is scoped to the organisation of the session making it. This is enforced in the database with row-level security as well as in the application, so a mistake in one layer does not expose data through the other.",
  },
  {
    q: "Is the selfie stored, and who can see it?",
    a: "Yes, it is stored against the scan — a clock-in without it would be an unverifiable timestamp. The owner can see it in the context of that scan or an appeal. Other staff never can. It is captured at the moment of the scan and nowhere else.",
  },
  {
    q: "Are staff tracked between clock-ins?",
    a: "No. Position is read once, at the moment a scan is attempted, to decide whether that scan is inside the fence. There is no background location collection, and nothing runs when a staff member is not actively clocking in. Presence checks do not change this: a check is a prompt asking somebody to go and scan the code, and the position is read at that scan and at no other point. Nothing reports where a staff member is unless they are scanning.",
  },
  {
    q: "Is anything sent to an AI service?",
    a: "No. There is no language model anywhere in Aproksi HR, and no request leaves the system to one. The brief that accompanies an appeal is assembled by template out of counts taken from your own records — a sentence that can only be built from figures that already exist cannot contain a figure that does not. That is also why it never states a verdict: there is nothing in the path capable of forming one.",
  },
  {
    q: "What ends up in your logs?",
    a: "Not your staff. Everything written to a log or an error report passes through redaction first: phone numbers, amounts, national ID numbers, email addresses and images are replaced by their shape, and employee names are matched against the organisation's own roster and replaced with an opaque reference. The structure survives so a problem stays diagnosable; the values do not. Redaction is deliberately over-eager — an employee named Grace will also cause the phrase 'grace period' to be redacted, which costs a debugging session some context rather than writing somebody's name to disk permanently.",
  },
  {
    q: "What happens if a payslip link is forwarded?",
    a: "For its lifetime the link grants access to that one document, so a staff member who forwards their own link has shared their own payslip. Links expire, and an owner can reissue at any time, which invalidates the previous one.",
  },
  {
    q: "Who at Aproksi can see my data?",
    a: "Access to production data is limited to what is needed to operate and support the service, and support access is requested rather than standing. We do not read payroll records for any other purpose.",
  },
  {
    q: "What happens to my data if I leave?",
    a: "Attendance history, closed appeal documents and payslips remain exportable for 12 months after an account lapses, after which they are removed. You can export at any point before that.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <PageHero
        eyebrow="Security & data"
        title="Payroll records, so the boring answers matter."
        lede="This page says where the data sits, who can reach it, and what happens to a document after it is signed. Nothing here is aspirational — if something is a plan rather than a property, it is not on this page."
      />

      {/* ── Where it lives ────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-aproksi-void">
        <Container className="py-14 sm:py-20 lg:py-28">
          <>
            <SectionHead
              tone="dark"
              eyebrow="Where the data lives"
              title="One managed database, one storage bucket, both encrypted."
              lede="Attendance records, penalties, appeals and staff details are held in managed PostgreSQL. Generated PDFs are held in object storage and served only through signed links."
            />
          </>
          <>
            <SpecList
              tone="dark"
              className="mt-10"
              items={[
                {
                  term: "Database",
                  value:
                    "Managed PostgreSQL with row-level security. Every table carrying business data is scoped by organisation at the database layer, not only in application code.",
                },
                {
                  term: "Documents",
                  value:
                    "Locked outcome PDFs and payslips are held in object storage with no public read path. They are reachable only through a signed, expiring URL.",
                },
                {
                  term: "In transit",
                  value: "TLS on every connection, including staff clock-in from the browser at the gate.",
                },
                {
                  term: "At rest",
                  value: "Encrypted at rest by the managed platform, for both the database and stored documents.",
                },
                {
                  term: "Backups",
                  value: "Automated, point-in-time recovery on the managed database tier.",
                },
                {
                  term: "Logs",
                  value:
                    "Redacted before they are written, not after. Phone numbers, amounts, ID numbers, emails and images are reduced to their shape, and employee names are matched against the organisation's roster and replaced with an opaque reference. The same redaction runs over error reports before they leave the service.",
                },
                {
                  term: "Hosting region",
                  value: (
                    <span className="font-mono text-[0.8125rem] text-white/45">
                      [SLOT: confirm and state your production region here]
                    </span>
                  ),
                },
              ]}
            />
          </>
        </Container>
      </section>

      {/* ── Access ────────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-aproksi-void">
        <Container width="wide" className="py-14 sm:py-20 lg:py-28">
          <>
            <SectionHead
              tone="dark"
              align="center"
              eyebrow="Access control"
              title="Three separations, each enforced on the server."
            />
          </>
          <div className="mt-10 grid sm:mt-14 gap-4 lg:grid-cols-3">
            {[
              {
                n: "01",
                t: "Between businesses",
                b: "Every request is scoped to the organisation of the session making it, in the application and again in the database through row-level security. There is no query path that returns another organisation's rows.",
              },
              {
                n: "02",
                t: "Between roles",
                b: "Owner and staff sessions are authenticated as different kinds of principal, not as the same user with a flag. Staff reach one record, their own.",
              },
              {
                n: "03",
                t: "Between interface and API",
                b: "Permissions are checked on every request rather than applied by hiding controls. A session that asks for something outside its role is refused at the API regardless of what was rendered.",
              },
            ].map((c) => (
              <div key={c.n}>
                <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-7">
                  <span className="font-mono text-[0.6875rem] sm:text-[0.625rem] tracking-[0.16em] text-aproksi-ultra-br/70">
                    {c.n}
                  </span>
                  <h3 className="font-display mt-4 text-xl text-white">{c.t}</h3>
                  <p className="mt-3 text-[0.875rem] leading-relaxed text-white/55">
                    {c.b}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Document integrity ────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-aproksi-void">
        <Container className="py-14 sm:py-20 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-20">
            <>
              <SectionHead
                tone="dark"
                eyebrow="Document integrity"
                title="Signed links, and files that can be checked."
                lede="Two different problems: making sure only the right person opens a document, and making sure the document they open is the one that was produced."
              />
              <SpecList
                tone="dark"
                className="mt-10"
                items={[
                  {
                    term: "Signed links",
                    value: "Every payslip and outcome link is signed server-side and resolves to exactly one document for one person. A tampered link is rejected rather than falling back to anything.",
                  },
                  {
                    term: "Expiry",
                    value: "Links stop working after their window. Reissuing produces a new link and retires the old one.",
                  },
                  {
                    term: "Produced server-side",
                    value: "Documents are generated from the stored record on the server, never assembled on a client where the inputs could differ.",
                  },
                  {
                    term: "Hashed at close",
                    value: "A hash of each locked document is recorded against its case at the moment it is produced. A copy that has been altered no longer matches.",
                  },
                  {
                    term: "Write-once",
                    value: "A decided case is read-only for every role, including owner. Corrections supersede; they never overwrite.",
                  },
                ]}
              />
            </>
            <>
              <div className="text-white/70">
                <>
                  <SealedRecord className="mx-auto h-auto w-full max-w-[340px]" />
                </>
              </div>
            </>
          </div>
        </Container>
      </section>

      {/* ── What we collect ───────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-aproksi-void">
        <Container className="py-14 sm:py-20 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-center lg:gap-20">
            <>
              <SectionHead
                tone="dark"
                eyebrow="Staff data"
                title="What is collected about a staff member, and what is not."
                lede="A clock-in system that reads position is worth being precise about. Here is the whole list."
              />
              <SpecList
                tone="dark"
                className="mt-10"
                items={[
                  { term: "Collected", value: "Name, phone number, assigned site, and pay details you enter." },
                  { term: "Collected", value: "Scan time, site, distance from the site pin, and a selfie taken at the moment of the scan." },
                  { term: "Collected", value: "Penalties applied, appeals raised, decisions made, and payslips produced." },
                  { term: "Collected", value: "Failed scan attempts the phone reports itself — camera blocked, no signal, location refused — recorded as the employee's own claim, on their side of the argument." },
                  { term: "Not collected", value: "Location at any time other than the moment of a scan, including during a presence check, which is a prompt to go and scan." },
                  { term: "Not collected", value: "Contacts, photos, messages or anything else on the staff member's phone." },
                  { term: "Not collected", value: "Anything at all while the staff member is off shift." },
                ]}
              />
            </>
            <>
            </>
          </div>
        </Container>
      </section>

      {/* ── Reporting ─────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-aproksi-void">
        <Container width="prose" className="py-12 sm:py-16 lg:py-20">
          <>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-7">
              <Eyebrow tone="dark">Reporting a vulnerability</Eyebrow>
              <p className="mt-4 text-[0.9rem] leading-relaxed text-white/65">
                If you believe you have found a security issue in Aproksi HR, tell
                us before you tell anyone else and we will work the fix with you.
                Send the details to{" "}
                <span className="font-mono text-white/85">
                  [SLOT: security contact address]
                </span>
                . We will confirm receipt, keep you updated while it is being
                addressed, and credit you if you would like to be credited.
              </p>
            </div>
          </>
        </Container>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-aproksi-void">
        <Container width="prose" className="py-14 sm:py-20 lg:py-24">
          <>
            <SectionHead tone="dark" eyebrow="Questions" title="The ones we get asked" />
          </>
          <div className="mt-10">
            <FAQ items={SECURITY_FAQ} tone="dark" />
          </div>
        </Container>
      </section>

      <NextLinks
        links={[
          {
            href: "/compliance",
            label: "Compliance & records",
            blurb: "What the record is for when a dispute escalates.",
          },
          {
            href: "/docs/roles",
            label: "Roles & permissions",
            blurb: "The access model, in operational detail.",
          },
          {
            href: "/how-it-works",
            label: "How it works",
            blurb: "A day across two sites, gate to payslip.",
          },
        ]}
      />

      <CTASection />
    </>
  );
}
