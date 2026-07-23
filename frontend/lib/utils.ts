export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatKES(amount: number): string {
  return `KES ${Number(amount ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
}

/** Reason types for announcements (spec §7). */
export const ANNOUNCEMENT_TYPES: Record<string, string> = {
  meeting: "Meeting",
  policy_update: "Policy update",
  schedule_change: "Schedule change",
  other: "Other",
};

/** Attendance status → display label + tailwind colour token. */
export const ATTENDANCE_STATUS: Record<string, { label: string; color: string }> = {
  normal: { label: "On time", color: "kaunta-sage" },
  late: { label: "Late", color: "kaunta-amber" },
  flagged: { label: "Flagged", color: "kaunta-red" },
  adjusted: { label: "Adjusted", color: "kaunta-slate" },
};
