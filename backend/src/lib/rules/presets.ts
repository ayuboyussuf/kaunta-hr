/**
 * Rule presets.
 *
 * An owner setting up for the first time should not have to invent a policy
 * from an empty screen. These are the rules small Kenyan employers actually
 * run, written out so they can be picked from a menu and then edited.
 *
 * Amounts are starting points, not recommendations — every one is editable
 * after it is applied, and nothing here is applied without the owner choosing
 * it. Codes match what the engine knows how to enforce automatically:
 * `late` and `absent` run on their own; the rest are raised by the owner.
 */

export type PresetRule = {
  code: string;
  reason: string;
  amount: number;
  appeal_window_hours: number;
  /** optional per-minute logic the engine understands */
  calc?: Record<string, number>;
  /** true when the engine applies it without anyone pressing a button */
  automatic: boolean;
  note: string;
};

export type Preset = {
  key: string;
  name: string;
  blurb: string;
  /** the kind of business this was written for */
  suits: string;
  rules: PresetRule[];
};

export const PRESETS: Preset[] = [
  {
    key: "standard",
    name: "Standard",
    blurb:
      "A flat lateness charge after the grace period, and a half-day for a shift nobody turned up to.",
    suits: "Most businesses starting out",
    rules: [
      {
        code: "late",
        reason: "Late arrival",
        amount: 200,
        appeal_window_hours: 24,
        automatic: true,
        note: "Applied automatically on the scan, once past the shift's grace period.",
      },
      {
        code: "absent",
        reason: "Absent without notice",
        amount: 1000,
        appeal_window_hours: 48,
        automatic: true,
        note: "Applied automatically when a rostered shift closes with no scan and no approved leave.",
      },
    ],
  },
  {
    key: "per_minute",
    name: "Charged by the minute",
    blurb:
      "Lateness costs by the minute up to a ceiling, so five minutes and fifty minutes are not the same thing.",
    suits: "Forecourts and shops where the opening time is the job",
    rules: [
      {
        code: "late",
        reason: "Late arrival",
        amount: 0,
        calc: { per_minute: 10, max: 500 },
        appeal_window_hours: 24,
        automatic: true,
        note: "KES 10 for every minute past grace, capped at KES 500.",
      },
      {
        code: "absent",
        reason: "Absent without notice",
        amount: 1000,
        appeal_window_hours: 48,
        automatic: true,
        note: "Applied automatically when a rostered shift closes with no scan and no approved leave.",
      },
    ],
  },
  {
    key: "record_only",
    name: "Record only",
    blurb:
      "No money changes hands. Lateness and absence are still recorded, notified and appealable — there is simply nothing to deduct.",
    suits: "A first month, before you know what the real pattern is",
    rules: [
      {
        code: "late",
        reason: "Late arrival (recorded, no deduction)",
        amount: 0,
        appeal_window_hours: 24,
        automatic: false,
        note: "Recorded on the attendance calendar. No violation is raised because the amount is zero.",
      },
    ],
  },
  {
    key: "forecourt",
    name: "Fuel station",
    blurb:
      "Lateness by the minute, a firm absence charge, and the two things that actually cost a forecourt money.",
    suits: "Fuel stations running shifts around the clock",
    rules: [
      {
        code: "late",
        reason: "Late arrival",
        amount: 0,
        calc: { per_minute: 10, max: 400 },
        appeal_window_hours: 24,
        automatic: true,
        note: "KES 10 a minute past grace, capped at KES 400.",
      },
      {
        code: "absent",
        reason: "Absent without notice",
        amount: 1500,
        appeal_window_hours: 48,
        automatic: true,
        note: "Applied automatically when a rostered shift closes with no scan and no approved leave.",
      },
      {
        code: "phone",
        reason: "Phone use on the forecourt",
        amount: 500,
        appeal_window_hours: 24,
        automatic: false,
        note: "Raised by the owner — no system can see this on its own.",
      },
      {
        code: "post",
        reason: "Left the pump unattended",
        amount: 500,
        appeal_window_hours: 24,
        automatic: false,
        note: "Raised by the owner.",
      },
    ],
  },
  {
    key: "hospitality",
    name: "Restaurant",
    blurb:
      "A short grace and a modest charge, because a kitchen that opens late is felt immediately but rarely worth a large deduction.",
    suits: "Restaurants and cafes with a prep shift before service",
    rules: [
      {
        code: "late",
        reason: "Late arrival",
        amount: 150,
        appeal_window_hours: 24,
        automatic: true,
        note: "Flat charge once past the grace period.",
      },
      {
        code: "absent",
        reason: "Absent without notice",
        amount: 800,
        appeal_window_hours: 48,
        automatic: true,
        note: "Applied automatically when a rostered shift closes with no scan and no approved leave.",
      },
      {
        code: "uniform",
        reason: "Out of uniform",
        amount: 200,
        appeal_window_hours: 24,
        automatic: false,
        note: "Raised by the owner.",
      },
    ],
  },
];

export function findPreset(key: string): Preset | null {
  return PRESETS.find((p) => p.key === key) ?? null;
}
