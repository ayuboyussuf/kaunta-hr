import Link from "next/link";
import { BrandLogo } from "./BrandLogo";
import { Container } from "./SiteUI";

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/changelog", label: "Changelog" },
    ],
  },
  {
    heading: "Use cases",
    links: [
      { href: "/multi-site", label: "Multi-site owners" },
      { href: "/compliance", label: "Compliance & records" },
      { href: "/security", label: "Security & data" },
    ],
  },
  {
    heading: "Documentation",
    links: [
      { href: "/docs", label: "Getting started" },
      { href: "/docs/onboarding", label: "Onboarding staff" },
      { href: "/docs/penalty-rules", label: "Penalty rules" },
      { href: "/docs/presence-checks", label: "Presence checks" },
      { href: "/docs/leave", label: "Leave and time off" },
      { href: "/docs/payslips", label: "Payslips" },
      { href: "/docs/sms", label: "SMS setup" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/signup", label: "Create an account" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-aproksi-void">
      <Container width="wide" className="py-14 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.1fr)]">
          <div>
            {/* logo slot — footer */}
            <BrandLogo size="md" tone="dark" />
            <p className="mt-5 max-w-xs text-[0.875rem] leading-relaxed text-white/45">
              Attendance, penalties, disputes and payslips for Kenyan businesses
              running staff across more than one site.
            </p>
            <p className="mt-6 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-white/30">
              Nairobi, Kenya
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.heading}>
                <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-white/45 sm:text-[0.6875rem] sm:text-white/35">
                  {col.heading}
                </h3>
                <ul className="mt-3 sm:mt-4 sm:space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="inline-flex min-h-[44px] items-center text-[0.9375rem] text-white/60 transition-colors duration-200 hover:text-white sm:min-h-0 sm:text-[0.875rem]"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.8125rem] text-white/35">
            © {new Date().getFullYear()} Aproksi HR. Part of the Aproksi family.
          </p>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-white/30">
            SMS sender ID · APROKSIHR
          </p>
        </div>
      </Container>
    </footer>
  );
}

export default SiteFooter;
