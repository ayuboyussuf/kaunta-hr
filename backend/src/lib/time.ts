/**
 * Kaunta runs on Nairobi time.
 *
 * It is UTC+3 with no DST, so the arithmetic is trivial — but every conversion
 * still goes through Intl with an explicit zone, so a server in Frankfurt gives
 * the same answer as the phone in the employee's hand. Attendance is decided in
 * minutes; a server that quietly thinks in UTC would mark a 08:05 arrival as
 * three hours early.
 */
export const TZ = "Africa/Nairobi";

/** "YYYY-MM-DD" for an instant, as seen in Nairobi. */
export function nairobiDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Midnight of that Nairobi day, as an ISO instant. */
export function nairobiDayStartISO(d: Date = new Date()): string {
  return new Date(`${nairobiDate(d)}T00:00:00+03:00`).toISOString();
}

/** Minutes since local midnight in Nairobi. */
export function nairobiMinutes(d: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}
