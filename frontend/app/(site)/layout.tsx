import type { Metadata } from "next";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: {
    default: "Aproksi HR — attendance records for multi-site businesses",
    template: "%s | Aproksi HR",
  },
  description:
    "Attendance, penalties, disputes and payslips for Kenyan businesses running staff across several sites. QR clock-in with geofencing, a penalty rules engine you configure, appeals with locked PDF outcomes, and payslips over secure links.",
};

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-aproksi-void">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
