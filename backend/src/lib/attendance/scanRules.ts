/**
 * What a scan means, decided before anything is written.
 *
 * Pulled out of the route so the three rules that were wrong can be tested
 * without a database. Each of them was reported from a real phone at a real
 * till, and each was silent — the scan succeeded and recorded the wrong thing.
 */

/**
 * Is this QR one this employee may use?
 *
 * The route only ever checked "same organisation", so every code the business
 * printed worked at every site it owned: someone posted to one branch could
 * clock in on another branch's code without going near it. A photograph of one
 * printed QR unlocked the lot — the geofence undone by a group chat.
 *
 * Someone with no assigned workplace is a genuine floater (a relief driver, an
 * owner covering a shift) and any site of theirs is legitimate for them.
 */
export function qrIsUsableBy(
  employeeWorkplaceId: string | null,
  scannedWorkplaceId: string,
  scannedWorkplaceOrgId: string,
  employeeOrgId: string
): boolean {
  if (scannedWorkplaceOrgId !== employeeOrgId) return false;
  if (!employeeWorkplaceId) return true;
  return employeeWorkplaceId === scannedWorkplaceId;
}

/**
 * Clock-in, clock-out, or an answer to a check?
 *
 * Every scan used to toggle in→out→in. So answering "confirm you are at work"
 * clocked the employee OUT: they were then not clocked in, no further check
 * could reach them, their hours ended early, and the roster showed them gone
 * while they stood at the till. The scan whose only purpose is to prove
 * presence was recording absence.
 *
 * An open check claims the scan. The toggle reads only past CLOCK scans, so
 * answering a check never moves where it stands.
 */
export function directionFor(
  hasOpenCheck: boolean,
  lastClockDirection: "in" | "out" | null
): "in" | "out" | "check" {
  if (hasOpenCheck) return "check";
  return lastClockDirection === "in" ? "out" : "in";
}

/**
 * How much the location backed up a check answer.
 *
 * The answer always counts. Requiring the geofence meant an employee standing
 * at the till with a weak signal indoors could scan the right code at the right
 * site and have nothing happen — the check aged into 'missed', flagged their
 * clock-in, and no action available to them would have worked. A control an
 * honest person cannot satisfy is not a control.
 *
 * Null when there was nothing to judge by: no workplace coordinates, or no
 * fix from the phone.
 */
export function locationVerdict(
  workplaceHasCoords: boolean,
  scanHasCoords: boolean,
  insideGeofence: boolean
): boolean | null {
  if (!workplaceHasCoords || !scanHasCoords) return null;
  return insideGeofence;
}
