export type DocLink = {
  href: string;
  title: string;
  summary: string;
  /** extra search terms that should match this page */
  keywords: string[];
};

export type DocGroup = {
  group: string;
  items: DocLink[];
};

export const DOCS_NAV: DocGroup[] = [
  {
    group: "Start here",
    items: [
      {
        href: "/docs",
        title: "Getting started",
        summary: "Create your organisation, add your first site, draw the fence and print the QR.",
        keywords: ["setup", "install", "first site", "qr", "workplace", "geofence", "account"],
      },
    ],
  },
  {
    group: "People",
    items: [
      {
        href: "/docs/onboarding",
        title: "Onboarding staff",
        summary: "Add staff by phone number and verify them with an SMS code.",
        keywords: ["sms", "otp", "code", "employees", "invite", "phone number", "verify", "staff"],
      },
      {
        href: "/docs/roles",
        title: "Roles & permissions",
        summary: "What an owner can reach, and what a staff member can.",
        keywords: ["owner", "staff", "access", "permissions", "roles", "security"],
      },
    ],
  },
  {
    group: "Attendance & pay",
    items: [
      {
        href: "/docs/penalty-rules",
        title: "Setting penalty rules",
        summary: "Grace periods, lateness bands, absence rules and how they are matched.",
        keywords: ["penalty", "lateness", "grace", "deduction", "rules", "absence", "policy"],
      },
      {
        href: "/docs/disputes",
        title: "Running disputes",
        summary: "Handle an appeal from the moment it is raised to the locked outcome.",
        keywords: ["dispute", "appeal", "waive", "uphold", "pdf", "locked", "outcome"],
      },
      {
        href: "/docs/payslips",
        title: "Generating payslips",
        summary: "Produce payslips for a period and send them as signed links.",
        keywords: ["payslip", "payroll", "pdf", "signed link", "kes", "period", "salary"],
      },
    ],
  },
  {
    group: "Messaging",
    items: [
      {
        href: "/docs/sms",
        title: "SMS setup",
        summary: "The APROKSIHR sender ID, what goes out over SMS, and delivery.",
        keywords: ["sms", "sender id", "aproksihr", "africa's talking", "messages", "delivery"],
      },
    ],
  },
];

export const DOCS_FLAT: DocLink[] = DOCS_NAV.flatMap((g) => g.items);
