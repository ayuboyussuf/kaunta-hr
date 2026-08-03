/* Engraved illustration for the Kaunta-HR site.
 *
 * These are pictures, not diagrams. Tone is built the way an engraver
 * builds it — parallel hatch at varying density, cross-hatch in the
 * darks, stipple in the foliage — rather than with fills or gradients.
 * Everything is deterministic (seeded PRNG, no Math.random) so server
 * and client render identical markup.
 */

type SvgProps = {
  className?: string;
  /** unique per page instance — keeps <defs> ids from colliding */
  uid?: string;
};

/* Deterministic PRNG so SSR and CSR agree. */
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const r2 = (n: number) => Math.round(n * 100) / 100;

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

/* ── Foliage: stippled clumps, the way an engraver renders a canopy ── */

function Foliage({
  cx,
  cy,
  rx,
  ry,
  seed,
  density = 90,
  opacity = 1,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  seed: number;
  density?: number;
  opacity?: number;
}) {
  const rand = rng(seed);
  const marks = range(density).map(() => {
    const a = rand() * Math.PI * 2;
    // bias toward the rim so the clump reads as a mass with a lit edge
    const d = Math.pow(rand(), 0.55);
    const x = cx + Math.cos(a) * rx * d;
    const y = cy + Math.sin(a) * ry * d;
    const s = 2.4 + rand() * 5.2;
    const rot = rand() * 60 - 30;
    return { x: r2(x), y: r2(y), s: r2(s), rot: r2(rot) };
  });
  return (
    <g opacity={opacity} strokeLinecap="round" fill="none">
      {marks.map((m, i) => (
        <path
          key={i}
          d={`M${m.x} ${m.y}a${m.s} ${m.s * 0.72} ${m.rot} 0 1 ${m.s * 1.5} 0`}
          strokeWidth={0.7}
        />
      ))}
    </g>
  );
}

/* ── Hero: a fuel forecourt at night ────────────────────────────────
 * The most Kaunta-HR image there is — the gate a shift actually starts
 * at. Canopy, pumps, price totem, the shop behind, an attendant
 * scanning in, and the geofence laid on the apron.
 * ------------------------------------------------------------------ */
export function ForecourtEngraving({ className, uid = "court" }: SvgProps) {
  const GROUND = 560;
  const rand = rng(9137);
  const stars = range(70).map(() => ({
    x: r2(rand() * 1600),
    y: r2(rand() * 330),
    r: r2(0.5 + rand() * 0.9),
    o: r2(0.18 + rand() * 0.5),
  }));

  return (
    <svg
      viewBox="0 0 1600 700"
      fill="none"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        <HatchDefs uid={uid} />
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="55%" stopColor="white" stopOpacity="0.55" />
          <stop offset="100%" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask id={`${uid}-topfade`}>
          <rect width="1600" height="700" fill={`url(#${uid}-sky)`} />
        </mask>
      </defs>

      <g stroke="currentColor" mask={`url(#${uid}-topfade)`}>
        {/* ── sky ── */}
        <g>
          {stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="currentColor" stroke="none" opacity={s.o} />
          ))}
          {range(13).map((i) => (
            <line
              key={i}
              x1="0"
              x2="1600"
              y1={GROUND - 210 + i * 15}
              y2={GROUND - 210 + i * 15}
              strokeWidth="0.5"
              opacity={0.05 + i * 0.012}
            />
          ))}
        </g>

        {/* ── treeline behind everything ── */}
        <Foliage cx={90} cy={505} rx={130} ry={62} seed={11} density={150} opacity={0.5} />
        <Foliage cx={1540} cy={495} rx={140} ry={70} seed={23} density={160} opacity={0.5} />
        <Foliage cx={1290} cy={470} rx={95} ry={48} seed={31} density={90} opacity={0.35} />

        {/* ── shop building, right ── */}
        <g>
          {/* mass */}
          <path d="M980 330h420v230H980z" strokeWidth="1.3" />
          <rect x="980" y="330" width="420" height="230" fill={`url(#${uid}-light)`} stroke="none" opacity="0.5" />
          {/* shaded right return */}
          <path d="M1400 330l64 34v196h-64z" strokeWidth="1.2" />
          <path d="M1400 330l64 34v196h-64z" fill={`url(#${uid}-crosshatch)`} stroke="none" opacity="0.85" />
          {/* roof + fascia */}
          <path d="M958 330h464l-22-30H980z" strokeWidth="1.2" />
          <path d="M958 330h464l-22-30H980z" fill={`url(#${uid}-mid)`} stroke="none" opacity="0.7" />
          {/* signage band */}
          <path d="M1010 352h360v46h-360z" strokeWidth="1.1" />
          {range(7).map((i) => (
            <line
              key={i}
              x1={1030 + i * 48}
              y1="375"
              x2={1064 + i * 48}
              y2="375"
              strokeWidth="4"
              opacity="0.75"
            />
          ))}
          {/* brick courses */}
          {range(9).map((i) => (
            <line
              key={i}
              x1="980"
              x2="1400"
              y1={420 + i * 16}
              y2={420 + i * 16}
              strokeWidth="0.5"
              opacity="0.35"
            />
          ))}
          {/* windows */}
          {[1020, 1180].map((x) => (
            <g key={x}>
              <path d={`M${x} 424h120v78H${x}z`} strokeWidth="1.1" />
              <rect x={x} y="424" width="120" height="78" fill={`url(#${uid}-dark)`} stroke="none" opacity="0.55" />
              <line x1={x + 60} y1="424" x2={x + 60} y2="502" strokeWidth="0.8" opacity="0.8" />
              <line x1={x} y1="463" x2={x + 120} y2="463" strokeWidth="0.8" opacity="0.8" />
            </g>
          ))}
          {/* door */}
          <path d="M1320 452h56v108h-56z" strokeWidth="1.2" />
          <rect x="1320" y="452" width="56" height="108" fill={`url(#${uid}-mid)`} stroke="none" opacity="0.6" />
        </g>

        {/* ── price totem, left ── */}
        <g>
          <path d="M58 214h134v128H58z" strokeWidth="1.3" />
          <rect x="58" y="214" width="134" height="128" fill={`url(#${uid}-light)`} stroke="none" opacity="0.45" />
          <line x1="58" y1="252" x2="192" y2="252" strokeWidth="1" opacity="0.8" />
          {range(3).map((i) => (
            <g key={i}>
              <line x1="74" y1={274 + i * 22} x2="120" y2={274 + i * 22} strokeWidth="3.4" opacity="0.55" />
              <line x1="136" y1={274 + i * 22} x2="176" y2={274 + i * 22} strokeWidth="3.4" opacity="0.85" />
            </g>
          ))}
          <path d="M112 342h26v218h-26z" strokeWidth="1.2" />
          <rect x="112" y="342" width="26" height="218" fill={`url(#${uid}-vert)`} stroke="none" opacity="0.5" />
        </g>

        {/* ── canopy ── */}
        <g>
          {/* fascia */}
          <path d="M196 150h724v58H196z" strokeWidth="1.4" />
          <line x1="196" y1="192" x2="920" y2="192" strokeWidth="0.9" opacity="0.7" />
          {/* underside, ribbed — the deepest tone in the picture */}
          <path d="M212 208h692v26H212z" strokeWidth="1" />
          <rect x="212" y="208" width="692" height="26" fill={`url(#${uid}-dark)`} stroke="none" opacity="0.9" />
          {range(34).map((i) => (
            <line
              key={i}
              x1={222 + i * 20}
              y1="208"
              x2={222 + i * 20}
              y2="234"
              strokeWidth="0.6"
              opacity="0.5"
            />
          ))}
          {/* lamps */}
          {[330, 480, 630, 780].map((x) => (
            <g key={x}>
              <path d={`M${x - 22} 234h44v9h-44z`} strokeWidth="0.9" />
              <path
                d={`M${x - 60} 560l38 -317h44l38 317z`}
                fill={`url(#${uid}-light)`}
                stroke="none"
                opacity="0.16"
              />
            </g>
          ))}
          {/* columns */}
          {[268, 836].map((x) => (
            <g key={x}>
              <path d={`M${x} 234h46v326h-46z`} strokeWidth="1.3" />
              <rect x={x + 28} y="234" width="18" height="326" fill={`url(#${uid}-mid)`} stroke="none" opacity="0.8" />
              <path d={`M${x - 12} 548h70v14h-70z`} strokeWidth="1.1" />
            </g>
          ))}
        </g>

        {/* ── pumps ── */}
        {[404, 600].map((x, i) => (
          <g key={x}>
            <path d={`M${x} 396h74v164h-74z`} strokeWidth="1.3" />
            <rect x={x + 46} y="396" width="28" height="164" fill={`url(#${uid}-mid)`} stroke="none" opacity="0.75" />
            {/* display */}
            <path d={`M${x + 10} 412h44v40h-44z`} strokeWidth="1" />
            <rect x={x + 10} y="412" width="44" height="40" fill={`url(#${uid}-dark)`} stroke="none" opacity="0.6" />
            {range(3).map((j) => (
              <line
                key={j}
                x1={x + 16}
                y1={422 + j * 11}
                x2={x + 48}
                y2={422 + j * 11}
                strokeWidth="1.6"
                opacity="0.75"
              />
            ))}
            {/* nozzle + hose */}
            <path
              d={`M${x + 74} 470c26 6 34 26 30 48`}
              strokeWidth="1.1"
              opacity="0.85"
            />
            <path d={`M${x + 98} 516h12v22h-12z`} strokeWidth="1" opacity="0.85" />
            {/* base shadow */}
            <ellipse cx={x + 37} cy="562" rx="58" ry="7" strokeWidth="0" fill={`url(#${uid}-mid)`} opacity={0.5 - i * 0.1} />
          </g>
        ))}

        {/* ── attendant scanning in at the column ── */}
        <g strokeWidth="1.3" strokeLinecap="round">
          <circle cx="880" cy="452" r="11" />
          <path d="M880 463v42" />
          <path d="M880 505l-9 55M880 505l10 55" />
          <path d="M880 474l17 -9" />
          <path d="M895 456h13v19h-13z" strokeWidth="1" />
          <rect x="895" y="456" width="13" height="19" fill={`url(#${uid}-light)`} stroke="none" opacity="0.7" />
          {/* the QR plate on the column */}
          <path d="M842 430h22v22h-22z" strokeWidth="1" />
          <rect x="842" y="430" width="22" height="22" fill={`url(#${uid}-cross)`} stroke="none" opacity="0.9" />
        </g>

        {/* ── geofence on the apron ── */}
        <g opacity="0.55">
          <ellipse cx="620" cy="596" rx="470" ry="62" strokeWidth="0.9" strokeDasharray="5 9" />
          <ellipse cx="620" cy="588" rx="300" ry="40" strokeWidth="0.8" strokeDasharray="3 7" opacity="0.8" />
        </g>

        {/* ── apron ── */}
        <line x1="0" y1={GROUND} x2="1600" y2={GROUND} strokeWidth="1.4" />
        {range(26).map((i) => (
          <line
            key={i}
            x1="0"
            x2="1600"
            y1={GROUND + 8 + i * 5.4}
            y2={GROUND + 8 + i * 5.4}
            strokeWidth="0.55"
            opacity={0.2 - i * 0.007}
          />
        ))}
        {/* forecourt bay markings */}
        {[300, 520, 740].map((x) => (
          <line key={x} x1={x} y1={GROUND + 6} x2={x - 34} y2={GROUND + 58} strokeWidth="0.7" opacity="0.28" />
        ))}

        {/* foreground scrub */}
        <Foliage cx={1470} cy={600} rx={120} ry={40} seed={57} density={80} opacity={0.4} />
        <Foliage cx={70} cy={612} rx={100} ry={34} seed={71} density={60} opacity={0.32} />
      </g>
    </svg>
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
