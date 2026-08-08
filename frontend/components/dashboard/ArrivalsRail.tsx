/**
 * The shape of the morning, in one band.
 *
 * Four cards reading "0" tell an owner nothing they could not have guessed. The
 * question they actually open this app to answer is "did my people turn up, and
 * when" — which is a distribution, not a count, and a distribution wants a
 * picture.
 *
 * So: a rail spanning the hour before the shift to a few hours after, the grace
 * deadline marked on it, and one dot per arrival. Everyone bunched to the left
 * of the line is a good morning. A cluster just past it means the grace period
 * is set wrong, not that six people are slackers — which is the kind of thing a
 * number can never say.
 *
 * Server-rendered and static: no measurement, no animation, no library. It is
 * legible the instant the HTML lands.
 */

const TZ = "Africa/Nairobi";

export interface Arrival {
  employeeId: string;
  name: string;
  /** ISO instant of the clock-in. */
  at: string;
  status: string;
}

interface Props {
  arrivals: Arrival[];
  /** "08:00" — the earliest shift start at this site. */
  shiftStart: string | null;
  graceMinutes: number;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

const minutesInNairobi = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  return (
    Number(p.find((x) => x.type === "hour")?.value ?? 0) * 60 +
    Number(p.find((x) => x.type === "minute")?.value ?? 0)
  );
};

const label = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const DOT: Record<string, string> = {
  normal: "bg-aproksi-sage",
  late: "bg-aproksi-amber",
  flagged: "bg-aproksi-red",
  on_leave: "bg-aproksi-ultra",
  adjusted: "bg-aproksi-slate",
};

export function ArrivalsRail({ arrivals, shiftStart, graceMinutes }: Props) {
  if (!shiftStart || arrivals.length === 0) return null;

  const start = toMin(shiftStart);
  const deadline = start + graceMinutes;
  // An hour before the shift to four after: wide enough for the early birds and
  // the badly late, tight enough that the middle is readable.
  const from = start - 60;
  const to = start + 240;
  const span = to - from;
  const pct = (min: number) => Math.min(100, Math.max(0, ((min - from) / span) * 100));

  const ticks = [start - 60, start, start + 60, start + 120, start + 180, start + 240];

  return (
    <section className="rounded-[12px] border border-aproksi-mist bg-white p-5 shadow-[0_2px_16px_rgba(15,25,35,0.06)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg text-aproksi-ink">Arrivals</h2>
        <p className="text-xs text-aproksi-slate/60">
          Shift starts {shiftStart.slice(0, 5)} · {graceMinutes} min grace
        </p>
      </div>

      <div className="relative mt-6 h-16">
        {/* the rail */}
        <div className="absolute inset-x-0 top-7 h-px bg-aproksi-mist" />

        {/* everything before the deadline is on time — tint it so the eye reads
            "inside the line" without having to compare two numbers */}
        <div
          className="absolute top-[1.375rem] h-3 rounded-l-full bg-aproksi-sage/10"
          style={{ left: 0, width: `${pct(deadline)}%` }}
        />

        {/* the deadline itself */}
        <div
          className="absolute top-3 bottom-6 w-px bg-aproksi-amber"
          style={{ left: `${pct(deadline)}%` }}
          aria-hidden
        />
        <span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-aproksi-amber/10 px-1.5 py-0.5 text-[0.625rem] font-medium text-aproksi-amber"
          style={{ left: `${pct(deadline)}%` }}
        >
          late after {label(deadline)}
        </span>

        {/* one dot per arrival */}
        {arrivals.map((a) => {
          const at = minutesInNairobi(a.at);
          return (
            <span
              key={a.employeeId}
              title={`${a.name} · ${label(at)}`}
              className={`absolute top-[1.4375rem] h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-2 ring-white ${
                DOT[a.status] ?? DOT.normal
              }`}
              style={{ left: `${pct(at)}%` }}
            />
          );
        })}

        {/* hour ticks */}
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute bottom-0 -translate-x-1/2 text-[0.625rem] tabular-nums text-aproksi-slate/40"
            style={{ left: `${pct(t)}%` }}
          >
            {label(t)}
          </span>
        ))}
      </div>

      {/* Touch has no hover, so the names are listed rather than hidden in a
          tooltip nobody on a phone can reach. */}
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-aproksi-mist pt-3">
        {arrivals.map((a) => (
          <li key={a.employeeId} className="flex items-center gap-1.5 text-xs text-aproksi-slate">
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[a.status] ?? DOT.normal}`} />
            {a.name.split(" ")[0]}
            <span className="tabular-nums text-aproksi-slate/50">
              {label(minutesInNairobi(a.at))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ArrivalsRail;
