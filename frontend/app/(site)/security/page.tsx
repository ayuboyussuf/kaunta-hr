import type { Metadata } from "next";
import {
  Container,
  SectionHead,
  SpecList,
  Eyebrow,
} from "@/components/site/SiteUI";
import { Reveal, DrawReveal } from "@/components/site/Reveal";
import { PageHero, CTASection, NextLinks, FAQ } from "@/components/site/Blocks";
import { SealedDocument, GeofencePlan } from "@/components/site/Engravings";

export const metadata: Metadata = {
  title: "Security & data",
  description:
    "Where Kaunta HR data is held, how access is separated between owners, accountants and staff, how payslip links are signed, and what document integrity means in practice.",
};

const SECURITY_FAQ = [
  {
    q: "Can one business see another's records?",
    a: "No. Every record belongs to an organisation, and every request is scoped to the organisation of the session making it. This is enforced in the database with row-level security as well as in the application, so a mistake in one layer does not expose data through the other.",
  },
  {
    q: "Is the selfie stored, and who can see it?",
    a: "Yes, it is stored against the scan — a clock-in without it would be an unverifiable timestamp. Owners and accountants can see it in the context of that scan or an appeal. Other staff never can. It is captured at the moment of the scan and nowhere else.",
  },
  {
    q: "Are staff tracked between clock-ins?",
    a: "No. Position is read once, at the moment a scan is attempted, to decide whether that scan is inside the fence. There is no background location collection, and nothing runs when a staff member is not actively clocking in.",
  },
  {
    q: "What happens if a payslip link is forwarded?",
    a: "For its lifetime the link grants access to that one document, so a staff member who forwards their own link has shared their own payslip. Links expire, and an owner can reissue at any time, which invalidates the previous one.",
  },
  {
    q: "Who at Kaunta can see my data?",
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
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-28">
          <Reveal>
            <SectionHead
              tone="light"
              eyebrow="Where the data lives"
              title="One managed database, one storage bucket, both encrypted."
              lede="Attendance records, penalties, appeals and staff details are held in managed PostgreSQL. Generated PDFs are held in object storage and served only through signed links."
            />
          </Reveal>
          <Reveal delay={90}>
            <SpecList
              tone="light"
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
                  term: "Hosting region",
                  value: (
                    <span className="font-mono text-[0.8125rem] text-white/45">
                      [SLOT: confirm and state your production region here]
                    </span>
                  ),
                },
              ]}
            />
          </Reveal>
        </Container>
      </section>

      {/* ── Access ────────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-20 sm:py-28">
          <Reveal>
            <SectionHead
              tone="light"
              align="center"
              eyebrow="Access control"
              title="Three separations, each enforced on the server."
            />
          </Reveal>
          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            {[
              {
                n: "01",
                t: "Between businesses",
                b: "Every request is scoped to the organisation of the session making it, in the application and again in the database through row-level security. There is no query path that returns another organisation's rows.",
              },
              {
                n: "02",
                t: "Between roles",
                b: "Owner, accountant and staff sessions are authenticated as different kinds of principal, not as the same user with a flag. An accountant cannot rewrite penalty rules; staff reach one record, their own.",
              },
              {
                n: "03",
                t: "Between interface and API",
                b: "Permissions are checked on every request rather than applied by hiding controls. A session that asks for something outside its role is refused at the API regardless of what was rendered.",
              },
            ].map((c, i) => (
              <Reveal key={c.n} delay={i * 80}>
                <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-7">
                  <span className="font-mono text-[0.625rem] tracking-[0.16em] text-kaunta-ultra-br/70">
                    {c.n}
                  </span>
                  <h3 className="font-display mt-4 text-xl text-white">{c.t}</h3>
                  <p className="mt-3 text-[0.875rem] leading-relaxed text-white/55">
                    {c.b}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Document integrity ────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-20">
            <Reveal variant="left">
              <SectionHead
                tone="light"
                eyebrow="Document integrity"
                title="Signed links, and files that can be checked."
                lede="Two different problems: making sure only the right person opens a document, and making sure the document they open is the one that was produced."
              />
              <SpecList
                tone="light"
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
            </Reveal>
            <Reveal variant="right" delay={100}>
              <div className="text-kaunta-ultra-br/85">
                <DrawReveal length={1200}>
                  <SealedDocument className="mx-auto h-auto w-[200px]" />
                </DrawReveal>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── What we collect ───────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-center lg:gap-20">
            <Reveal variant="left">
              <SectionHead
                tone="light"
                eyebrow="Staff data"
                title="What is collected about a staff member, and what is not."
                lede="A clock-in system that reads position is worth being precise about. Here is the whole list."
              />
              <SpecList
                tone="light"
                className="mt-10"
                items={[
                  { term: "Collected", value: "Name, phone number, assigned site, and pay details you enter." },
                  { term: "Collected", value: "Scan time, site, distance from the site pin, and a selfie taken at the moment of the scan." },
                  { term: "Collected", value: "Penalties applied, appeals raised, decisions made, and payslips produced." },
                  { term: "Not collected", value: "Location at any time other than the moment of a scan." },
                  { term: "Not collected", value: "Contacts, photos, messages or anything else on the staff member's phone." },
                  { term: "Not collected", value: "Anything at all while the staff member is off shift." },
                ]}
              />
            </Reveal>
            <Reveal variant="right" delay={100}>
              <div className="text-kaunta-ultra-br/85">
                <DrawReveal length={900}>
                  <GeofencePlan className="mx-auto h-auto w-full max-w-[280px]" />
                </DrawReveal>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── Reporting ─────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="prose" className="py-16 sm:py-20">
          <Reveal>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-7">
              <Eyebrow tone="light">Reporting a vulnerability</Eyebrow>
              <p className="mt-4 text-[0.9rem] leading-relaxed text-white/65">
                If you believe you have found a security issue in Kaunta HR, tell
                us before you tell anyone else and we will work the fix with you.
                Send the details to{" "}
                <span className="font-mono text-white/85">
                  [SLOT: security contact address]
                </span>
                . We will confirm receipt, keep you updated while it is being
                addressed, and credit you if you would like to be credited.
              </p>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="prose" className="py-20 sm:py-24">
          <Reveal>
            <SectionHead tone="light" eyebrow="Questions" title="The ones we get asked" />
          </Reveal>
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
            href: "/status",
            label: "Status",
            blurb: "Current service availability and incident history.",
          },
        ]}
      />

      <CTASection />
    </>
  );
}
