import type { Metadata } from "next";
import {
  DocPage,
  H2,
  H3,
  P,
  UL,
  LI,
  Callout,
  DocTable,
  DocLink,
  SeeAlso,
} from "@/components/site/DocsUI";

export const metadata: Metadata = {
  title: "Roles & permissions",
  description:
    "How the owner and staff roles differ in Kaunta HR, and how access is enforced on the server rather than hidden in the interface.",
};

export default function RolesDocPage() {
  return (
    <DocPage
      href="/docs/roles"
      title="Roles & permissions"
      lede="Two roles, drawn along the only line that matters: the person who runs the business, and the people who work for it."
    >
      <H2 id="roles">The two roles</H2>
      <DocTable
        head={["", "Owner", "Staff"]}
        rows={[
          ["Create and edit sites", "Yes", "—"],
          ["Draw and change geofences", "Yes", "—"],
          ["Write penalty rules", "Yes", "—"],
          ["Add and remove staff", "Yes", "—"],
          ["See all attendance", "Yes", "Own only"],
          ["Approve leave", "Yes", "Request only"],
          ["Decide appeals", "Yes", "Raise only"],
          ["Generate payslips", "Yes", "—"],
          ["See payroll totals", "Yes", "Own only"],
        ]}
      />

      <Callout title="Deliberately only two" tone="note">
        There is no bookkeeper or manager tier. A small business running four
        sites does not need a permissions matrix — it needs one person who can
        change things and a clear rule that nobody else can. Everything an owner
        decides is recorded against them by name.
      </Callout>

      <H2 id="owner">Owner</H2>
      <P>
        The account that created the organisation. The owner holds everything —
        sites, fences, rules, staff, leave, appeals and payroll.
      </P>
      <UL>
        <LI>
          Every decision the owner makes on an appeal or a leave request is
          recorded against them by name in the record.
        </LI>
        <LI>
          The owner signs in with email and password. Staff never do.
        </LI>
      </UL>

      <H2 id="staff">Staff</H2>
      <P>
        Staff reach exactly one record — their own. They can see the times they
        scanned, the penalties applied to them and why, the appeals they have
        raised and the outcomes, and their own payslips. Nothing about a
        colleague is visible to them at any point, including at their own site.
      </P>


      <H2 id="enforcement">How access is enforced</H2>
      <P>
        Permissions are checked on the server for every request, not applied by
        hiding buttons. A staff session that asks for another employee&rsquo;s
        payslip is refused at the API, regardless of what the interface shows.
      </P>
      <UL>
        <LI>
          The owner session and a staff session are not the same kind of token,
          and are issued by different paths.
        </LI>
        <LI>
          Every request is scoped to the organisation it belongs to, so one
          business can never read another&rsquo;s records.
        </LI>
        <LI>
          Payslip links are signed and resolve to a single employee&rsquo;s
          document. See <DocLink href="/docs/payslips">generating payslips</DocLink>.
        </LI>
      </UL>

      <H3>Adding another owner</H3>
      <P>
        Not supported today. One organisation has one owner account. If you need
        a second person able to decide appeals and run payroll, that is worth
        telling us about — it is the most requested change to this model.
      </P>

      <SeeAlso hrefs={["/docs/onboarding", "/docs/payslips", "/docs/disputes"]} />
    </DocPage>
  );
}
