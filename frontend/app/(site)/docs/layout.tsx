import type { Metadata } from "next";
import Link from "next/link";
import DocsSidebar from "@/components/site/DocsSidebar";
import { Container } from "@/components/site/SiteUI";

export const metadata: Metadata = {
  title: {
    default: "Documentation",
    template: "%s | Aproksi HR docs",
  },
  description:
    "Aproksi HR documentation — getting started, onboarding staff by SMS, setting penalty rules, running disputes, generating payslips, roles and permissions, and SMS setup.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-aproksi-void">
      {/* docs masthead */}
      <div className="border-b border-white/10">
        <Container width="wide" className="py-8 sm:py-10">
          <p className="font-mono text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-[0.16em] text-white/35">
            Documentation
          </p>
          <p className="mt-2 max-w-2xl text-[0.9rem] leading-relaxed text-white/50">
            Everything needed to set up sites, onboard staff and run a payroll
            period. Written for the person doing it, not for a developer.{" "}
            <Link
              href="/how-it-works"
              className="text-white/75 underline decoration-white/25 underline-offset-4 hover:decoration-white"
            >
              Prefer the narrative version?
            </Link>
          </p>
        </Container>
      </div>

      <Container width="wide" className="pb-24 pt-10 sm:pt-14">
        <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
          {/* On a phone the full index above every page buries the content,
              so it collapses into a disclosure. From lg it is a sticky rail. */}
          <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2">
            <details className="group rounded-xl border border-white/12 lg:hidden">
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between px-4 text-[0.95rem] text-white">
                Browse the documentation
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-white/45 transition-transform duration-200 group-open:rotate-45"
                >
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </summary>
              <div className="border-t border-white/12 p-4">
                <DocsSidebar />
              </div>
            </details>
            <div className="hidden lg:block">
              <DocsSidebar />
            </div>
          </aside>
          {children}
        </div>
      </Container>
    </div>
  );
}
