import { redirect } from "next/navigation";

/**
 * The short link that rides in every daily digest.
 *
 * `/r/260818` instead of `/dashboard/reports?from=2026-08-18&to=2026-08-18`.
 * That is about thirty-five characters, on a message with a hard budget of a
 * hundred and sixty, sent every morning of every year — which is the difference
 * between naming two sites and saying "2 sites need a look".
 *
 * It carries no data and grants no access: it resolves a date and redirects.
 * Whoever follows it still has to be signed in to see anything, which is
 * exactly what you want from a URL sitting in a text message on an unlocked
 * phone.
 */
export default async function ShortReportLink({
  params,
}: {
  params: Promise<{ day: string }>;
}) {
  const { day } = await params;

  // YYMMDD. Anything else is a mistyped or stale link, and the reports page
  // with no range beats an error page — the person came here to look at a
  // report either way.
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(day);
  if (!m) redirect("/dashboard/reports");

  const ymd = `20${m[1]}-${m[2]}-${m[3]}`;
  redirect(`/dashboard/reports?from=${ymd}&to=${ymd}`);
}
