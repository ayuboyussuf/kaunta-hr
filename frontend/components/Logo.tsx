/**
 * Kaunta HR brand mark + wordmark.
 * Pure (no hooks) so it renders in both server and client components.
 * The mark is a copper rounded-square with a clock-in check — the core action.
 */
export function Logo({
  className = "",
  markOnly = false,
  mark = 30,
}: {
  className?: string;
  markOnly?: boolean;
  mark?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width={mark}
        height={mark}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="8" fill="#C4622D" />
        <path
          d="M8.5 16.6l4.6 4.6L23.5 10.6"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!markOnly && (
        <span className="font-display text-xl leading-none text-kaunta-ink">
          Kaunta<span className="text-kaunta-copper"> HR</span>
        </span>
      )}
    </span>
  );
}

export default Logo;
