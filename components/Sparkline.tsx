/**
 * Minimal single-series sparkline (server component, inline SVG).
 * Nulls create gaps; latest value is direct-labeled in ink, not series color.
 */
export default function Sparkline({
  values,
  width = 240,
  height = 48,
  formatValue = (v: number) => String(Math.round(v)),
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const present = values.filter((v): v is number => v != null);
  if (present.length < 2) {
    return <p className="text-xs text-zinc-500">Not enough data yet</p>;
  }
  const min = Math.min(...present);
  const max = Math.max(...present);
  const pad = 4;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) =>
    max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2);

  // Build path segments, breaking at nulls.
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    pen = true;
  });

  const lastIdx = values.length - 1 - [...values].reverse().findIndex((v) => v != null);
  const last = values[lastIdx]!;

  return (
    <div className="flex items-end gap-2">
      <svg width={width} height={height} role="img" aria-label={`Trend, latest ${formatValue(last)}`}>
        <path d={d.trim()} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(lastIdx)} cy={y(last)} r="3" fill="#a78bfa" stroke="#12141c" strokeWidth="2" />
      </svg>
      <span className="pb-0.5 text-sm font-semibold tabular-nums text-zinc-100">{formatValue(last)}</span>
    </div>
  );
}
