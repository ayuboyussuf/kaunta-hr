import type { Metadata } from "next";
import {
  DocPage,
  H2,
  H3,
  P,
  UL,
  LI,
  Steps,
  StepItem,
  Callout,
  DocTable,
  DocLink,
  SeeAlso,
} from "@/components/site/DocsUI";
import { Screenshot } from "@/components/site/SiteUI";

export const metadata: Metadata = {
  title: "Roles & permissions",
  description:
    "How owner, accountant and staff roles differ in Kaunta HR, and how access is enforced on the server rather than hidden in the interface.",
};

export default function RolesDocPage() {
  return (
    <DocPage
      href="/docs/roles"
      title="Roles & permissions"
      lede="Three roles, drawn along the line that actually matters: who can change the rules, who can see the money, and who can only see themselves."
    >
      <H2 id="roles">The three roles</H2>
      <DocTable
        head={["", "Owner", "Accountant", "Staff"]}
        rows={[
          ["Create and edit sites", "Yes", "—", "—"],
          ["Draw and change geofences", "Yes", "—", "—"],
          ["Write penalty rules", "Yes", "—", "—"],
          ["Add and remove staff", "Yes", "—", "—"],
          ["See all attendance", "Yes", "Yes", "Own only"],
          ["Decide appeals", "Yes", "Yes", "Raise only"],
          ["Generate payslips", "Yes", "Yes", "—"],
          ["See payroll totals", "Yes", "Yes", "Own only"],
          ["Invite other users", "Yes", "—", "—"],
        ]}
      />

      <Callout title="The separation that matters" tone="note">
        An accountant can run payroll and settle appeals, but cannot rewrite the
        penalty rules those payroll figures came from. That gap is deliberate:
        the person applying a policy should not be able to change it after the
        fact.
      </Callout>

      <H2 id="owner">Owner</H2>
      <P>
        The account that created the organisation. Owners hold everything —
        sites, fences, rules, staff, appeals and payroll. An owner is the only
        role that can invite another user or change someone&rsquo;s role.
      </P>
      <UL>
        <LI>
          There is always at least one owner. The last remaining owner cannot be
          removed or demoted.
        </LI>
        <LI>
          Every decision an owner makes on an appeal is recorded against them by
          name in the locked outcome document.
        </LI>
      </UL>

      <H2 id="accountant">Accountant</H2>
      <P>
        For the person who runs payroll but does not set employment policy —
        an in-house bookkeeper, or an external accountant you work with monthly.
      </P>
      <Steps>
        <StepItem n={1} title="Invite them from Settings">
          Enter their email and choose the accountant role.
        </StepItem>
        <StepItem n={2} title="They accept and verify">
          They set their own credentials. You never hold their password.
        </StepItem>
        <StepItem n={3} title="Scope their access">
          On Multi-Site plans an accountant can be limited to specific sites
          rather than the whole business.
        </StepItem>
      </Steps>

      <H2 id="staff">Staff</H2>
      <P>
        Staff reach exactly one record — their own. They can see the times they
        scanned, the penalties applied to them and why, the appeals they have
        raised and the outcomes, and their own payslips. Nothing about a
        colleague is visible to them at any point, including at their own site.
      </P>

      <Screenshot
        label="roles and permissions"
        ratio="16 / 10"
        tone="dark"
        className="mt-8 max-w-2xl"
      />

      <H2 id="enforcement">How access is enforced</H2>
      <P>
        Permissions are checked on the server for every request, not applied by
        hiding buttons. A staff session that asks for another employee&rsquo;s
        payslip is refused at the API, regardless of what the interface shows.
      </P>
      <UL>
        <LI>
          Owner and accountant sessions are authenticated separately from staff
          sessions — they are not the same kind of token.
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

      <H3>Changing someone&rsquo;s role</H3>
      <P>
        An owner can promote or demote any user except the last owner. Role
        changes take effect on that user&rsquo;s next request — there is no cached
        permission to wait out.
      </P>

      <SeeAlso hrefs={["/docs/onboarding", "/docs/payslips", "/docs/disputes"]} />
    </DocPage>
  );
}
