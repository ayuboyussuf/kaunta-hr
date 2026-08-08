/* Engraved marks for the Aproksi-HR site.
 *
 * The hero forecourt is a supplied raster engraving (public/art), so what
 * remains here is the sealed record and the section rule. Tone is built
 * the way an engraver builds it — parallel hatch at varying density,
 * cross-hatch in the darks — rather than with fills or gradients.
 */

type SvgProps = {
  className?: string;
  /** unique per page instance — keeps <defs> ids from colliding */
  uid?: string;
};

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/* ── Tonal hatch patterns ───────────────────────────────────────── */

function HatchDefs({ uid }: { uid: string }) {
  const specs: [string, number, number, number][] = [
    // id suffix, gap, angle, stroke width
    ["light", 7, 45, 0.6],
    ["mid", 4, 45, 0.7],
    ["dark", 2.6, 45, 0.8],
    ["vert", 3.4, 90, 0.6],
    ["cross", 3.2, 0, 0.6],
  ];
  return (
    <>
      {specs.map(([name, gap, angle, w]) => (
        <pattern
          key={name}
          id={`${uid}-${name}`}
          width={gap}
          height={gap}
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${angle})`}
        >
          <line x1="0" y1="0" x2="0" y2={gap} stroke="currentColor" strokeWidth={w} />
        </pattern>
      ))}
      <pattern
        id={`${uid}-crosshatch`}
        width="4"
        height="4"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" strokeWidth="0.7" />
        <line x1="0" y1="0" x2="4" y2="0" stroke="currentColor" strokeWidth="0.7" />
      </pattern>
    </>
  );
}

/* ── A sealed record: the locked outcome document ───────────────── */
export function SealedRecord({ className, uid = "seal" }: SvgProps) {
  return (
    <svg viewBox="0 0 420 340" fill="none" className={className} aria-hidden="true">
      <defs>
        <HatchDefs uid={uid} />
      </defs>
      <g stroke="currentColor">
        {/* the sheets beneath */}
        <path d="M64 60h198l40 40v208H64z" strokeWidth="1" opacity="0.35" />
        <path d="M52 48h198l40 40v208H52z" strokeWidth="1.1" opacity="0.6" />
        {/* the top sheet */}
        <path d="M40 36h198l40 40v208H40z" strokeWidth="1.5" />
        <rect x="40" y="36" width="238" height="248" fill={`url(#${uid}-light)`} stroke="none" opacity="0.28" />
        <path d="M238 36v40h40" strokeWidth="1.2" />
        {/* the fold's cast shadow */}
        <path d="M238 76h40l-40 -40z" fill={`url(#${uid}-dark)`} stroke="none" opacity="0.5" />
        {/* ruled content */}
        {range(9).map((i) => (
          <line
            key={i}
            x1="66"
            y1={110 + i * 17}
            x2={i % 3 === 2 ? 190 : 250}
            y2={110 + i * 17}
            strokeWidth="1"
            opacity="0.45"
          />
        ))}
        {/* wax seal, cross-hatched to read as raised */}
        <circle cx="300" cy="252" r="52" strokeWidth="1.6" />
        <circle cx="300" cy="252" r="52" fill={`url(#${uid}-crosshatch)`} stroke="none" opacity="0.55" />
        <circle cx="300" cy="252" r="40" strokeWidth="0.8" strokeDasharray="3 5" opacity="0.8" />
        <path
          d="M280 252l14 15 28 -31"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* ribbon */}
        <path d="M268 296l-16 40 26 -12 22 14z" strokeWidth="1.2" />
        <path d="M268 296l-16 40 26 -12 22 14z" fill={`url(#${uid}-mid)`} stroke="none" opacity="0.6" />
      </g>
    </svg>
  );
}

/* ── Section rule ───────────────────────────────────────────────── */
export function RuleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 8" fill="none" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1">
        <line x1="0" y1="4" x2="44" y2="4" opacity="0.4" />
        <circle cx="60" cy="4" r="3" />
        <line x1="76" y1="4" x2="120" y2="4" opacity="0.4" />
      </g>
    </svg>
  );
}
