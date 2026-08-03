import type { Metadata } from "next";
import {
  Container,
  SectionHead,
  SpecList,
  Eyebrow,
  Shot,
  SHOTS,
} from "@/components/site/SiteUI";
import {
  PageHero,
  CTASection,
  NextLinks,
  Step,
  FAQ,
} from "@/components/site/Blocks";
import { SealedRecord } from "@/components/site/Engravings";

export const metadata: Metadata = {
  title: "Compliance & records",
  description:
    "How Kaunta HR's locked PDFs and audit trail give a Kenyan employer something concrete to point at when an attendance or deduction dispute goes beyond the office.",
};

const RECORD_FAQ = [
  {
    q: "Does using Kaunta HR make my business compliant?",
    a: "No product can do that on its own. Kaunta HR keeps the attendance and deduction records in a form that is contemporaneous, attributed and hard to alter after the fact. Whether your policies themselves are lawful, and what your specific obligations are, is a question for your own advisor.",
  },
  {
    q: "How long are records kept?",
    a: "Attendance history, closed appeal documents and generated payslips remain available for the life of the account, and are exportable for 12 months after an account lapses. Locked documents are records, and we treat them as records rather than as app data.",
  },
  {
    q: "Can I delete a record if a staff member asks?",
    a: "Personal data requests are handled case by case, but a closed appeal outcome is evidence in a matter that has already been decided — deleting it would remove the protection it provides to both sides. Where deletion applies, we say what was removed and when.",
  },
  {
    q: "Can I export everything?",
    a: "Yes. Attendance, penalties, appeal outcomes and payslips export per site and per period. On Network plans this includes a bulk export intended for audits.",
  },
  {
    q: "What if the employer is the one acting badly?",
    a: "The same record cuts both ways, which is the point. A staff member's own attendance, penalties and appeal outcomes are visible to them and downloadable by them. A deduction with no scan behind it is as visible as a late arrival.",
  },
];

export default function CompliancePage() {
  return (
    <>
      <PageHero
        eyebrow="Compliance & records"
        title="When it stops being an argument in the office."
        lede="Most attendance disputes are settled by whoever sounds more certain. That works until the matter goes further — to a labour officer, to a lawyer's letter, to a tribunal — at which point what settles it is what you can show. This page is about what Kaunta HR leaves behind."
      />

      {/* ── The problem with the book ─────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-20">
            <>
              <SectionHead
                tone="dark"
                eyebrow="The gap"
                title="A notebook is a record until someone questions it."
                lede="Kenyan employers are expected to keep records of the hours their staff work and the deductions they make. The trouble is not usually that no record exists — it is that the record is a book, written by hand, by an interested party, after the fact, with corrections in it."
              />
              <SpecList
                tone="dark"
                className="mt-10"
                items={[
                  {
                    term: "Written when",
                    value: "Often at the end of the week, from memory or from a supervisor's word.",
                  },
                  {
                    term: "Written by",
                    value: "Someone with a stake in what it says — on either side.",
                  },
                  {
                    term: "Altered",
                    value: "Silently. A crossed-out time carries no record of who crossed it out.",
                  },
                  {
                    term: "Corroborated by",
                    value: "Nothing. There is no second thing to check it against.",
                  },
                ]}
              />
            </>
            <>
              <div className="text-white/70">
                <>
                  <SealedRecord className="mx-auto h-auto w-full max-w-[330px]" />
                </>
              </div>
            </>
          </div>
        </Container>
      </section>

      {/* ── What makes a record hold ──────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="wide" className="py-20 sm:py-28">
          <>
            <SectionHead
              tone="dark"
              align="center"
              eyebrow="Four properties"
              title="What makes an attendance record worth anything."
              lede="These are the qualities that separate a record someone can rely on from a book someone wrote. Kaunta HR is built around all four."
            />
          </>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "01",
                t: "Contemporaneous",
                b: "The record is written at the moment the thing happens — a scan, at a gate, at a time — not reconstructed later from memory.",
              },
              {
                n: "02",
                t: "Corroborated",
                b: "Each clock-in carries a selfie and a GPS reading alongside the timestamp, so the entry is checkable against something other than itself.",
              },
              {
                n: "03",
                t: "Attributed",
                b: "Every decision — a penalty upheld, an appeal waived, a rule changed — is recorded against the person who made it, by name and role.",
              },
              {
                n: "04",
                t: "Tamper-evident",
                b: "A closed outcome is written to a locked PDF and its hash recorded against the case. An altered copy no longer matches the record.",
              },
            ].map((c) => (
              <div key={c.n}>
                <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-6">
                  <span className="font-mono text-[0.625rem] tracking-[0.16em] text-kaunta-ultra-br/70">
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

      {/* ── The trail ─────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-20">
            <div>
              <>
                <SectionHead
                  tone="dark"
                  eyebrow="The audit trail"
                  title="What a single disputed deduction leaves behind."
                  lede="Take one KES 200 lateness penalty that a staff member objected to — the document beside this is the real one. Here is everything Kaunta HR can produce about that case, months later, without anyone having to remember anything."
                />
              </>
              <div className="mt-12">
                {[
                  {
                    n: "01",
                    t: "The scan",
                    b: "The time it was taken, the site it was taken at, the distance from the site pin, and the selfie captured with it.",
                  },
                  {
                    n: "02",
                    t: "The rule that was in force",
                    b: "The policy as it stood on that date — grace period and the band that matched — not the policy as it stands today.",
                  },
                  {
                    n: "03",
                    t: "The notice",
                    b: "That the staff member was told, when, and by which message.",
                  },
                  {
                    n: "04",
                    t: "The appeal",
                    b: "Their own words, in their own submission, timestamped when they made it.",
                  },
                  {
                    n: "05",
                    t: "The decision",
                    b: "Upheld or waived, any note written with it, the name and role of the person who decided, and when.",
                  },
                  {
                    n: "06",
                    t: "The locked document",
                    b: "A PDF containing all of the above, with its hash recorded against the case at the moment it closed.",
                  },
                ].map((s) => (
                  <div key={s.n}>
                    <Step n={s.n} title={s.t} tone="dark">
                      {s.b}
                    </Step>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:sticky lg:top-28 lg:self-start">
              <Shot
                shot={SHOTS.violationOutcome}
                caption="A real outcome document, produced when the case closed"
              />
            </div>
          </div>
        </Container>
      </section>

      {/* ── Integrity mechanics ───────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container className="py-20 sm:py-24">
          <>
            <SectionHead
              tone="dark"
              eyebrow="Document integrity"
              title="What “locked” actually means here."
              lede="Not a password on a PDF. Locking is about the relationship between the file and the record it came from."
            />
          </>
          <>
            <SpecList
              tone="dark"
              className="mt-10"
              items={[
                {
                  term: "Generated server-side",
                  value:
                    "The document is produced by the server from the stored case, not assembled on someone's laptop.",
                },
                {
                  term: "Written once",
                  value:
                    "A case becomes read-only the moment it is decided. There is no edit path afterwards, for any role including owner.",
                },
                {
                  term: "Hashed at close",
                  value:
                    "A hash of the produced document is recorded against the case. Re-hashing a copy later either matches or it does not.",
                },
                {
                  term: "Superseded, not overwritten",
                  value:
                    "A correction produces a new document that references the old one. The original stays in the record.",
                },
                {
                  term: "Available to both sides",
                  value:
                    "The staff member receives the same locked document you hold, by secure link, at the moment it closes.",
                },
              ]}
            />
          </>
        </Container>
      </section>

      {/* ── Disclaimer ────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="prose" className="py-16 sm:py-20">
          <>
            <div className="rounded-xl border border-kaunta-amber/35 bg-kaunta-amber/[0.07] p-7">
              <Eyebrow tone="dark" className="text-kaunta-amber">
                Please read
              </Eyebrow>
              <p className="mt-4 text-[0.9rem] leading-relaxed text-white/70">
                Kaunta HR is record-keeping software, not legal advice, and using
                it does not by itself make an employment practice lawful. What it
                does is make sure that when a question is asked about an arrival
                time or a deduction, there is a contemporaneous, attributed,
                tamper-evident answer rather than two conflicting recollections.
                Your obligations as an employer — and whether your own penalty
                policy is enforceable — should be confirmed with a qualified
                advisor.
              </p>
            </div>
          </>
        </Container>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-kaunta-void">
        <Container width="prose" className="py-20 sm:py-24">
          <>
            <SectionHead
              tone="dark"
              eyebrow="Questions"
              title="About records and retention"
            />
          </>
          <div className="mt-10">
            <FAQ items={RECORD_FAQ} tone="dark" />
          </div>
        </Container>
      </section>

      <NextLinks
        links={[
          {
            href: "/security",
            label: "Security & data",
            blurb: "Where the records live and who can reach them.",
          },
          {
            href: "/docs/disputes",
            label: "Running disputes",
            blurb: "The appeal workflow that produces these documents.",
          },
          {
            href: "/multi-site",
            label: "Multi-site owners",
            blurb: "Why this matters more the further you are from the gate.",
          },
        ]}
      />

      <CTASection
        title="Start keeping the record before you need it."
        body="The value of an attendance record is entirely in having it already. Set up one site and let a month accumulate."
      />
    </>
  );
}
