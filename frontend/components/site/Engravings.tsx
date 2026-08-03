/* Fine-line engravings for the Kaunta-HR site.
 *
 * Every scene is drawn from the product's own subject matter — forecourts,
 * shopfronts, geofence rings, rule ladders, sealed documents — in the
 * hairline-etched register of an architectural elevation. Strokes use
 * `currentColor` so a parent can tint the whole scene.
 *
 * Node counts are kept low deliberately: `.draw-in` animates
 * stroke-dashoffset, which repaints, so only the small scenes opt into it.
 */

type SvgProps = {
  className?: string;
  /** Unique per page instance — prevents <defs> id collisions. */
  uid?: string;
};

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/* ── Shared defs ────────────────────────────────────────────────── */

function Hatch({ id, angle = 45, gap = 4 }: { id: string; angle?: number; gap?: number }) {
  return (
    <pattern
      id={id}
      width={gap}
      height={gap}
      patternUnits="userSpaceOnUse"
      patternTransform={`rotate(${angle})`}
    >
      <line x1="0" y1="0" x2="0" y2={gap} stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
    </pattern>
  );
}

/* ── Hero: three sites on one ground line ───────────────────────────
 * Fuel station forecourt, restaurant front, retail branch — each ringed
 * by its own geofence, one staff member clocking in at the first gate.
 * ------------------------------------------------------------------ */
export function SiteRowEngraving({ className, uid = "hero" }: SvgProps) {
  const skyLines = range(16);
  const shutter = range(9);

  return (
    <svg
      viewBox="0 0 1440 560"
      fill="none"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        <Hatch id={`${uid}-hatch`} angle={45} gap={5} />
        <linearGradient id={`${uid}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="30%" stopColor="white" stopOpacity="0.85" />
          <stop offset="100%" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask id={`${uid}-mask`}>
          <rect width="1440" height="560" fill={`url(#${uid}-fade)`} />
        </mask>
      </defs>

      <g mask={`url(#${uid}-mask)`} stroke="currentColor" strokeWidth="1">
        {/* Sky — horizontal engraver's hatch, densest at the horizon */}
        <g>
          {skyLines.map((i) => (
            <line
              key={i}
              x1="0"
              x2="1440"
              y1={430 - Math.pow(i, 1.62) * 2.1}
              y2={430 - Math.pow(i, 1.62) * 2.1}
              strokeWidth="0.5"
              opacity={0.20 - i * 0.011}
            />
          ))}
        </g>

        {/* Geofence rings — one per site, drawn on the ground plane */}
        <g opacity="0.5" strokeDasharray="3 6">
          <ellipse cx="268" cy="430" rx="232" ry="46" strokeWidth="0.75" />
          <ellipse cx="690" cy="430" rx="212" ry="42" strokeWidth="0.75" />
          <ellipse cx="1150" cy="430" rx="232" ry="46" strokeWidth="0.75" />
        </g>
        <g opacity="0.75" strokeDasharray="2 5">
          <ellipse cx="268" cy="430" rx="150" ry="30" strokeWidth="0.75" />
          <ellipse cx="690" cy="430" rx="138" ry="27" strokeWidth="0.75" />
          <ellipse cx="1150" cy="430" rx="150" ry="30" strokeWidth="0.75" />
        </g>

        {/* ── Site 1 — fuel station forecourt ── */}
        <g>
          {/* price board */}
          <path d="M60 196h84v66H60z" strokeWidth="0.9" />
          <line x1="60" y1="216" x2="144" y2="216" strokeWidth="0.6" opacity="0.7" />
          <line x1="102" y1="262" x2="102" y2="430" strokeWidth="0.9" />
          {/* canopy */}
          <path d="M158 150h296v30H158z" strokeWidth="1" />
          <path d="M158 180h296v9H158z" strokeWidth="0.6" opacity="0.6" />
          <line x1="196" y1="189" x2="196" y2="430" strokeWidth="1" />
          <line x1="204" y1="189" x2="204" y2="430" strokeWidth="0.5" opacity="0.55" />
          <line x1="410" y1="189" x2="410" y2="430" strokeWidth="1" />
          <line x1="418" y1="189" x2="418" y2="430" strokeWidth="0.5" opacity="0.55" />
          {/* pumps */}
          <path d="M242 356h34v74h-34z" strokeWidth="0.9" />
          <path d="M242 356h34v22h-34z" strokeWidth="0.5" opacity="0.7" fill={`url(#${uid}-hatch)`} />
          <path d="M330 356h34v74h-34z" strokeWidth="0.9" />
          <path d="M330 356h34v22h-34z" strokeWidth="0.5" opacity="0.7" fill={`url(#${uid}-hatch)`} />
          <path d="M276 372c18 6 36 2 54-8" strokeWidth="0.6" opacity="0.7" />
        </g>

        {/* Staff member clocking in at the forecourt gate */}
        <g strokeWidth="1.1" strokeLinecap="round">
          <circle cx="492" cy="366" r="8" />
          <line x1="492" y1="374" x2="492" y2="402" />
          <line x1="492" y1="402" x2="484" y2="430" />
          <line x1="492" y1="402" x2="501" y2="430" />
          <line x1="492" y1="382" x2="506" y2="374" />
          <path d="M504 366h9v13h-9z" strokeWidth="0.9" />
        </g>

        {/* ── Site 2 — restaurant / eatery ── */}
        <g>
          <path d="M548 128h284v302H548z" strokeWidth="1" />
          <path d="M548 128h284v40H548z" strokeWidth="0.9" />
          {/* upper windows */}
          {range(3).map((i) => (
            <path
              key={i}
              d={`M${582 + i * 86} 196h56v58h-56z`}
              strokeWidth="0.75"
              opacity="0.85"
            />
          ))}
          {/* scalloped awning */}
          <path
            d="M556 292h268l-14 30H570z"
            strokeWidth="0.9"
          />
          {range(9).map((i) => (
            <line
              key={i}
              x1={570 + i * 30}
              y1="292"
              x2={562 + i * 30}
              y2="322"
              strokeWidth="0.5"
              opacity="0.6"
            />
          ))}
          {/* door + frontage */}
          <path d="M660 344h60v86h-60z" strokeWidth="0.9" />
          <line x1="690" y1="344" x2="690" y2="430" strokeWidth="0.5" opacity="0.6" />
          <path d="M572 356h60v50h-60z" strokeWidth="0.7" opacity="0.8" />
          <path d="M748 356h60v50h-60z" strokeWidth="0.7" opacity="0.8" />
        </g>

        {/* ── Site 3 — retail branch, shutters half down ── */}
        <g>
          <path d="M978 186h344v244H978z" strokeWidth="1" />
          <path d="M978 186h344v44H978z" strokeWidth="0.9" />
          <line x1="1010" y1="208" x2="1290" y2="208" strokeWidth="0.6" opacity="0.55" />
          {/* rolling shutter slats */}
          <path d="M1010 254h280v104h-280z" strokeWidth="0.8" />
          {shutter.map((i) => (
            <line
              key={i}
              x1="1010"
              y1={264 + i * 11}
              x2="1290"
              y2={264 + i * 11}
              strokeWidth="0.5"
              opacity="0.55"
            />
          ))}
          <line x1="1010" y1="358" x2="1290" y2="358" strokeWidth="1.2" />
          {/* frontage below the shutter */}
          <path d="M1040 380h96v50h-96z" strokeWidth="0.7" opacity="0.8" />
          <path d="M1168 380h96v50h-96z" strokeWidth="0.7" opacity="0.8" />
        </g>

        {/* Ground line + foreground hatch */}
        <line x1="0" y1="430" x2="1440" y2="430" strokeWidth="1.2" />
        {range(22).map((i) => (
          <line
            key={i}
            x1="0"
            x2="1440"
            y1={438 + i * 5.6}
            y2={438 + i * 5.6}
            strokeWidth="0.5"
            opacity={0.16 - i * 0.006}
          />
        ))}

        {/* Registration ticks — technical-drawing furniture */}
        <g opacity="0.35" strokeWidth="0.75">
          <line x1="0" y1="430" x2="0" y2="452" />
          <line x1="268" y1="430" x2="268" y2="446" />
          <line x1="690" y1="430" x2="690" y2="446" />
          <line x1="1150" y1="430" x2="1150" y2="446" />
          <line x1="1440" y1="430" x2="1440" y2="452" />
        </g>
      </g>
    </svg>
  );
}

/* ── Geofence, plan view ────────────────────────────────────────── */
export function GeofencePlan({ className, uid = "geo" }: SvgProps) {
  return (
    <svg viewBox="0 0 320 320" fill="none" className={className} aria-hidden="true">
      <defs>
        <Hatch id={`${uid}-hatch`} angle={45} gap={6} />
      </defs>
      <g stroke="currentColor">
        <circle cx="160" cy="160" r="128" strokeWidth="0.75" strokeDasharray="4 7" opacity="0.45" />
        <circle cx="160" cy="160" r="94" strokeWidth="0.75" strokeDasharray="3 5" opacity="0.7" />
        <circle cx="160" cy="160" r="58" strokeWidth="1" />
        {/* site footprint */}
        <path d="M126 138h68v52h-68z" strokeWidth="1" />
        <path d="M126 138h68v14h-68z" strokeWidth="0.6" fill={`url(#${uid}-hatch)`} />
        {/* radius call-out */}
        <line x1="160" y1="160" x2="288" y2="160" strokeWidth="0.75" opacity="0.6" />
        <line x1="288" y1="152" x2="288" y2="168" strokeWidth="0.75" opacity="0.6" />
        {/* crosshair */}
        <line x1="160" y1="18" x2="160" y2="46" strokeWidth="0.75" opacity="0.5" />
        <line x1="160" y1="274" x2="160" y2="302" strokeWidth="0.75" opacity="0.5" />
        <line x1="18" y1="160" x2="46" y2="160" strokeWidth="0.75" opacity="0.5" />
        {/* the pin, inside the ring */}
        <path d="M160 206c-11-16-17-25-17-33a17 17 0 1 1 34 0c0 8-6 17-17 33z" strokeWidth="1.2" />
        <circle cx="160" cy="173" r="5" strokeWidth="1" />
      </g>
    </svg>
  );
}

/* ── Penalty rule ladder ────────────────────────────────────────── */
export function RuleLadder({ className, uid = "rule" }: SvgProps) {
  const steps = [
    { t: 0, label: "grace" },
    { t: 1, label: "" },
    { t: 2, label: "" },
    { t: 3, label: "" },
  ];
  return (
    <svg viewBox="0 0 320 260" fill="none" className={className} aria-hidden="true">
      <defs>
        <Hatch id={`${uid}-hatch`} angle={-45} gap={5} />
      </defs>
      <g stroke="currentColor">
        {/* time axis */}
        <line x1="28" y1="216" x2="296" y2="216" strokeWidth="1" />
        {steps.map((s, i) => (
          <line
            key={i}
            x1={28 + i * 68}
            y1="216"
            x2={28 + i * 68}
            y2="224"
            strokeWidth="0.75"
            opacity="0.6"
          />
        ))}
        {/* deduction steps, rising left to right */}
        {steps.map((_, i) => (
          <g key={i}>
            <path
              d={`M${28 + i * 68} ${216 - i * 44}h68`}
              strokeWidth={i === 0 ? 0.9 : 1.3}
              opacity={i === 0 ? 0.5 : 1}
              strokeDasharray={i === 0 ? "3 4" : undefined}
            />
            {i > 0 && (
              <line
                x1={28 + i * 68}
                y1={216 - (i - 1) * 44}
                x2={28 + i * 68}
                y2={216 - i * 44}
                strokeWidth="1.3"
              />
            )}
            {i > 0 && (
              <rect
                x={28 + i * 68}
                y={216 - i * 44}
                width="68"
                height={i * 44}
                strokeWidth="0"
                fill={`url(#${uid}-hatch)`}
                opacity="0.5"
              />
            )}
          </g>
        ))}
        {/* threshold marker */}
        <line x1="96" y1="36" x2="96" y2="216" strokeWidth="0.6" strokeDasharray="2 5" opacity="0.55" />
        <circle cx="96" cy="172" r="4" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

/* ── Sealed, tamper-evident document ────────────────────────────── */
export function SealedDocument({ className, uid = "seal" }: SvgProps) {
  return (
    <svg viewBox="0 0 260 320" fill="none" className={`draw-in ${className ?? ""}`} aria-hidden="true">
      <defs>
        <Hatch id={`${uid}-hatch`} angle={45} gap={5} />
      </defs>
      <g stroke="currentColor">
        {/* sheet with folded corner */}
        <path d="M42 26h136l40 40v228H42z" strokeWidth="1.2" />
        <path d="M178 26v40h40" strokeWidth="1" />
        {/* text rules */}
        {range(7).map((i) => (
          <line
            key={i}
            x1="68"
            y1={104 + i * 18}
            x2={i % 3 === 2 ? 150 : 192}
            y2={104 + i * 18}
            strokeWidth="0.75"
            opacity="0.55"
          />
        ))}
        {/* seal */}
        <circle cx="182" cy="248" r="30" strokeWidth="1.2" />
        <circle cx="182" cy="248" r="23" strokeWidth="0.6" strokeDasharray="2 4" opacity="0.7" />
        <path d="M170 248l8 9 17-18" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        {/* lock */}
        <path d="M62 236h34v28H62z" strokeWidth="1.1" />
        <path d="M69 236v-9a10 10 0 0 1 20 0v9" strokeWidth="1.1" />
      </g>
    </svg>
  );
}

/* ── Payslip ────────────────────────────────────────────────────── */
export function PayslipSheet({ className, uid = "slip" }: SvgProps) {
  return (
    <svg viewBox="0 0 260 320" fill="none" className={`draw-in ${className ?? ""}`} aria-hidden="true">
      <defs>
        <Hatch id={`${uid}-hatch`} angle={45} gap={6} />
      </defs>
      <g stroke="currentColor">
        <path d="M38 22h184v276H38z" strokeWidth="1.2" />
        <path d="M38 22h184v42H38z" strokeWidth="0.9" />
        <rect x="38" y="22" width="184" height="42" strokeWidth="0" fill={`url(#${uid}-hatch)`} opacity="0.45" />
        {/* line items */}
        {range(5).map((i) => (
          <g key={i}>
            <line x1="60" y1={98 + i * 30} x2="140" y2={98 + i * 30} strokeWidth="0.75" opacity="0.55" />
            <line x1="164" y1={98 + i * 30} x2="200" y2={98 + i * 30} strokeWidth="0.75" opacity="0.8" />
          </g>
        ))}
        {/* total rule */}
        <line x1="60" y1="256" x2="200" y2="256" strokeWidth="1.2" />
        <line x1="150" y1="272" x2="200" y2="272" strokeWidth="1.6" />
      </g>
    </svg>
  );
}

/* ── Phone clock-in: selfie frame + GPS lock ────────────────────── */
export function PhoneClockIn({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 220 340" fill="none" className={`draw-in ${className ?? ""}`} aria-hidden="true">
      <g stroke="currentColor">
        <rect x="34" y="14" width="152" height="312" rx="20" strokeWidth="1.3" />
        <line x1="94" y1="30" x2="126" y2="30" strokeWidth="1.4" strokeLinecap="round" />
        {/* selfie viewfinder */}
        <circle cx="110" cy="132" r="52" strokeWidth="1" strokeDasharray="5 6" opacity="0.75" />
        <circle cx="110" cy="116" r="18" strokeWidth="1.1" />
        <path d="M80 168c6-18 16-27 30-27s24 9 30 27" strokeWidth="1.1" />
        {/* corner brackets */}
        <path d="M52 92v-14h14M168 92v-14h-14M52 176v14h14M168 176v14h-14" strokeWidth="1.1" />
        {/* GPS readout */}
        <line x1="58" y1="222" x2="162" y2="222" strokeWidth="0.75" opacity="0.5" />
        <line x1="58" y1="240" x2="130" y2="240" strokeWidth="0.75" opacity="0.5" />
        <circle cx="110" cy="284" r="22" strokeWidth="1.2" />
        <path d="M110 272v24M98 284h24" strokeWidth="0.9" opacity="0.7" />
      </g>
    </svg>
  );
}

/* ── Multi-site plan — sites tied to one ledger ─────────────────── */
export function MultiSitePlan({ className, uid = "multi" }: SvgProps) {
  const sites = [
    { x: 62, y: 74 },
    { x: 190, y: 44 },
    { x: 292, y: 108 },
    { x: 116, y: 176 },
    { x: 248, y: 196 },
  ];
  return (
    <svg viewBox="0 0 360 250" fill="none" className={className} aria-hidden="true">
      <defs>
        <Hatch id={`${uid}-hatch`} angle={45} gap={6} />
      </defs>
      <g stroke="currentColor">
        {sites.map((s, i) => (
          <g key={i}>
            <circle cx={s.x} cy={s.y} r="26" strokeWidth="0.75" strokeDasharray="3 5" opacity="0.5" />
            <rect x={s.x - 11} y={s.y - 9} width="22" height="18" strokeWidth="1" />
            <rect
              x={s.x - 11}
              y={s.y - 9}
              width="22"
              height="6"
              strokeWidth="0"
              fill={`url(#${uid}-hatch)`}
              opacity="0.6"
            />
          </g>
        ))}
        {/* hairlines converging on the ledger */}
        {sites.map((s, i) => (
          <line
            key={i}
            x1={s.x}
            y1={s.y}
            x2="180"
            y2="124"
            strokeWidth="0.5"
            opacity="0.3"
            strokeDasharray="2 4"
          />
        ))}
        <circle cx="180" cy="124" r="7" strokeWidth="1.4" />
      </g>
    </svg>
  );
}

/* ── Dispute: claim, review, outcome ────────────────────────────── */
export function DisputeFlow({ className, uid = "dispute" }: SvgProps) {
  return (
    <svg viewBox="0 0 360 200" fill="none" className={className} aria-hidden="true">
      <defs>
        <Hatch id={`${uid}-hatch`} angle={-45} gap={5} />
      </defs>
      <g stroke="currentColor">
        {/* staff */}
        <circle cx="52" cy="80" r="13" strokeWidth="1.1" />
        <path d="M32 124c4-16 11-24 20-24s16 8 20 24" strokeWidth="1.1" />
        {/* appeal travelling */}
        <path d="M88 100h74" strokeWidth="0.75" strokeDasharray="3 5" opacity="0.7" />
        <path d="M156 94l8 6-8 6" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        {/* the case file */}
        <path d="M148 58h64l16 16v88h-80z" strokeWidth="1.2" />
        <path d="M212 58v16h16" strokeWidth="0.9" />
        <rect x="148" y="58" width="80" height="0" strokeWidth="0" fill={`url(#${uid}-hatch)`} />
        {[0, 1, 2].map((i) => (
          <line key={i} x1="162" y1={96 + i * 16} x2="212" y2={96 + i * 16} strokeWidth="0.7" opacity="0.55" />
        ))}
        {/* owner decision */}
        <path d="M244 100h50" strokeWidth="0.75" strokeDasharray="3 5" opacity="0.7" />
        <path d="M288 94l8 6-8 6" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="322" cy="100" r="24" strokeWidth="1.2" />
        <path d="M310 100l8 9 17-19" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/* ── Small mark used as a section divider ───────────────────────── */
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
