// Hand-rolled, dependency-free charts for the admin analytics page.
// Palette validated for the dark surface (#0f2738): found #14a99c, lost #bf8a1e.
// Text always uses text colours; colour marks carry identity; every chart has a
// native hover tooltip (<title>) on hit targets larger than the marks.
export const SERIES = { found: "#14a99c", lost: "#bf8a1e" } as const;

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-slate-300">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Horizontal bars: one series, sorted by the caller, value labels at bar ends. */
export function BarList({ rows, color = SERIES.found }: { rows: Array<{ label: string; value: number }>; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-2 text-sm" title={`${r.label}: ${r.value}`}>
          <span className="truncate text-slate-300">{r.label}</span>
          <span className="h-3 rounded-e bg-white/5">
            <span className="block h-3 rounded-e" style={{ width: `${(r.value / max) * 100}%`, background: color, minWidth: r.value ? 4 : 0 }} />
          </span>
          <span className="text-end tabular-nums text-slate-100">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Two-part share bar (lost vs found) with a 2px surface gap and direct labels. */
export function SplitBar({ a, b }: { a: { label: string; value: number; color: string }; b: { label: string; value: number; color: string } }) {
  const total = Math.max(1, a.value + b.value);
  return (
    <div>
      <div className="flex h-4 gap-[2px] overflow-hidden rounded">
        {[a, b].map((s) => s.value > 0 && (
          <span key={s.label} title={`${s.label}: ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-sm">
        {[a, b].map((s) => (
          <span key={s.label} className="text-slate-300">
            <span className="me-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: s.color }} aria-hidden />
            {s.label} <span className="font-semibold text-white tabular-nums">{s.value}</span> ({Math.round((s.value / total) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

/** Daily lost/found lines on one shared y-axis. */
export function TrendChart({ days, labels, dateFmt }: {
  days: Array<{ day: string; lost: number; found: number }>;
  labels: { lost: string; found: string };
  dateFmt: (d: string) => string;
}) {
  const W = 640, H = 200, P = { l: 28, r: 56, t: 10, b: 22 };
  const max = Math.max(2, ...days.flatMap((d) => [d.lost, d.found]));
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, days.length - 1);
  const y = (v: number) => H - P.b - (v * (H - P.t - P.b)) / max;
  const path = (k: "lost" | "found") => days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  const ticks = [0, Math.round(max / 2), max];
  const last = days[days.length - 1];
  const step = (W - P.l - P.r) / Math.max(1, days.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${labels.lost} / ${labels.found}`}>
      {ticks.map((tk) => (
        <g key={tk}>
          <line x1={P.l} x2={W - P.r} y1={y(tk)} y2={y(tk)} stroke="rgba(255,255,255,.07)" />
          <text x={P.l - 6} y={y(tk) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{tk}</text>
        </g>
      ))}
      {days.length > 0 && [0, Math.floor(days.length / 2), days.length - 1].map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">{dateFmt(days[i].day)}</text>
      ))}
      <path d={path("found")} fill="none" stroke={SERIES.found} strokeWidth="2" strokeLinejoin="round" />
      <path d={path("lost")} fill="none" stroke={SERIES.lost} strokeWidth="2" strokeLinejoin="round" />
      {last && (
        <>
          <text x={W - P.r + 6} y={y(last.found) + 3} fontSize="11" fill="#e2e8f0">{labels.found}</text>
          <text x={W - P.r + 6} y={y(last.lost) + 3 + (Math.abs(y(last.lost) - y(last.found)) < 12 ? 12 : 0)} fontSize="11" fill="#e2e8f0">{labels.lost}</text>
        </>
      )}
      {days.map((d, i) => (
        <rect key={d.day} x={x(i) - step / 2} y={P.t} width={step} height={H - P.t - P.b} fill="transparent">
          <title>{`${dateFmt(d.day)} — ${labels.lost}: ${d.lost} · ${labels.found}: ${d.found}`}</title>
        </rect>
      ))}
    </svg>
  );
}
