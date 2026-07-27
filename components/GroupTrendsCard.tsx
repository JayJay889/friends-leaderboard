import Sparkline from "./Sparkline";
import type { GroupTrends } from "@/lib/trends";

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-zinc-500">—</span>;
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.05;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        flat ? "bg-zinc-500/10 text-zinc-400" : up ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
      }`}
    >
      {flat ? "±0%" : `${up ? "▲" : "▼"} ${Math.abs(pct)}%`}
    </span>
  );
}

export default function GroupTrendsCard({ trends }: { trends: GroupTrends }) {
  const weeksShown = trends.weekStarts.length;
  return (
    <section className="rounded-2xl border border-white/5 bg-surface-raised p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">📈 Group pulse</h2>
          <p className="text-xs text-zinc-500">
            Weekly group averages, last {weeksShown} {weeksShown === 1 ? "week" : "weeks"}
          </p>
        </div>
        {trends.overallChangePct != null && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-400">
              {trends.overallChangePct > 0.05
                ? "The group is improving"
                : trends.overallChangePct < -0.05
                  ? "The group is slacking"
                  : "The group is holding steady"}
            </span>
            <ChangeBadge pct={trends.overallChangePct} />
          </div>
        )}
      </header>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
        {trends.series.map((s) => (
          <div key={s.key}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm text-zinc-400">
                {s.emoji} {s.label}
              </h3>
              <ChangeBadge pct={s.changePct} />
            </div>
            <Sparkline values={s.values} width={200} height={40} formatValue={s.format} />
          </div>
        ))}
      </div>
    </section>
  );
}
