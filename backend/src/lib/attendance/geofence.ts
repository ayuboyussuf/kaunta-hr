/**
 * Attendance integrity heuristics.
 *
 * NOTE ON MOCK-LOCATION: browser geolocation cannot expose OS-level mock-location
 * flags the way a native Android app can. Detection here is therefore heuristic —
 * geofence radius, GPS accuracy, and impossible-jump/velocity between consecutive
 * scans. OS-grade mock flagging requires the native app (later phase).
 */

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two lat/lng points, in metres. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// A person cannot plausibly travel faster than this between two scans (m/s).
// ~250 km/h covers driving/rail; anything above implies spoofed coordinates.
const MAX_PLAUSIBLE_SPEED_MS = 70;
// GPS fixes worse than this are too coarse to trust for a geofence decision.
const MAX_TRUSTED_ACCURACY_M = 100;

export interface PriorFix {
  lat: number;
  lng: number;
  scanned_at: string; // ISO timestamp
}

export interface GeofenceInput {
  workplaceLat: number;
  workplaceLng: number;
  radiusM: number;
  lat: number;
  lng: number;
  accuracyM: number | null;
  now: Date;
  prior?: PriorFix | null;
}

export interface GeofenceResult {
  distanceM: number;
  flags: string[];
  insideGeofence: boolean;
}

/** Run all heuristics and return the distance + any flags raised. */
export function evaluateScan(input: GeofenceInput): GeofenceResult {
  const flags: string[] = [];
  const distanceM = haversineMeters(
    input.workplaceLat,
    input.workplaceLng,
    input.lat,
    input.lng
  );

  const insideGeofence = distanceM <= input.radiusM;
  if (!insideGeofence) flags.push("outside_geofence");

  if (input.accuracyM != null && input.accuracyM > MAX_TRUSTED_ACCURACY_M) {
    flags.push("low_accuracy");
  }

  if (input.prior) {
    const jump = haversineMeters(input.prior.lat, input.prior.lng, input.lat, input.lng);
    const dtSec = (input.now.getTime() - new Date(input.prior.scanned_at).getTime()) / 1000;
    if (dtSec > 0) {
      const speed = jump / dtSec;
      if (speed > MAX_PLAUSIBLE_SPEED_MS && jump > 500) {
        flags.push("impossible_jump");
      }
    }
  }

  return { distanceM, flags, insideGeofence };
}
