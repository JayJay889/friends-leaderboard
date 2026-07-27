import Sparkline from "./Sparkline";
import type { GroupTrends } from "@/lib/trends";

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-faint">·</span>;
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.05;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        flat
          ? "bg-cream text-sub"
          : up
            ? "bg-forest-wash text-forest"
            : "bg-brick/10 text-brick"
      }`}
    >
      {flat ? "±0%" : `${up ? "▲" : "▼"} ${Math.abs(pct)}%`}
    </span>
  );
}

export default function GroupTrendsCard({ trends }: { trends: GroupTrends }) {
  const weeksShown = trends.weekStarts.length;
  return (
    <section className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-hairline pb-3">
        <div>
          <p className="label-caps">
            Weekly group averages · last {weeksShown} {weeksShown === 1 ? "week" : "weeks"}
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold">Group Pulse</h2>
        </div>
        {trends.overallChangePct != null && (
          <div className="flex items-center gap-2 pb-0.5 text-sm">
            <span className="text-sub">
              {trends.overallChangePct > 0.05
                ? "The club is improving"
                : trends.overallChangePct < -0.05
                  ? "The club is slacking"
                  : "The club is holding steady"}
            </span>
            <ChangeBadge pct={trends.overallChangePct} />
          </div>
        )}
      </header>
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
        {trends.series.map((s) => (
          <div key={s.key}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="label-caps">{s.label}</h3>
              <ChangeBadge pct={s.changePct} />
            </div>
            <Sparkline values={s.values} width={190} height={40} formatValue={s.format} />
          </div>
        ))}
      </div>
    </section>
  );
}
