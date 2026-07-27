import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import DisconnectButton from "@/components/DisconnectButton";
import Ring, { bandColor } from "@/components/Ring";
import Sparkline from "@/components/Sparkline";
import { db, schema } from "@/db";
import { formatHours, getLeaderboardData } from "@/lib/leaderboards";
import { SCOPE } from "@/lib/google";
import { clubAge, sleepScore, windowStats } from "@/lib/scores";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const SCOPE_LABELS: Record<string, string> = {
  [SCOPE.activity]: "Activity & fitness (steps, Active Zone Minutes, VO₂ max)",
  [SCOPE.metrics]: "Health metrics (resting heart rate, HRV, breathing rate)",
  [SCOPE.sleep]: "Sleep (duration, stages, efficiency)",
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Aligns rows into a dense day-by-day series (nulls for missing days). */
function series(
  rows: { date: string }[],
  days: number,
  pick: (r: any) => number | null,
): (number | null)[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: (number | null)[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const row = byDate.get(isoDaysAgo(i));
    out.push(row ? pick(row) : null);
  }
  return out;
}

function DeltaChip({ pct }: { pct: number | null }) {
  if (pct == null || pct === 0) return null;
  const up = pct > 0;
  return (
    <span className={`font-num text-xs font-semibold ${up ? "text-forest" : "text-brick"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% <span className="font-sans font-normal text-faint">vs 30d</span>
    </span>
  );
}

const inputClass =
  "mt-1 block rounded-lg border border-hairline bg-ivory px-3 py-2 text-ink focus:border-forest-soft focus:outline-none";

export default async function MePage({
  searchParams,
}: {
  searchParams: { welcome?: string };
}) {
  const userId = currentUserId();
  if (!userId) redirect("/connect");

  const [user] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) redirect("/connect");

  const [token] = await db()
    .select()
    .from(schema.oauthTokens)
    .where(eq(schema.oauthTokens.userId, userId));

  const rows = await db()
    .select()
    .from(schema.dailyMetrics)
    .where(eq(schema.dailyMetrics.userId, userId))
    .orderBy(desc(schema.dailyMetrics.date))
    .limit(35);

  const boards = await getLeaderboardData(userId);
  const week = windowStats(rows.filter((r) => r.date >= isoDaysAgo(7)));
  const month = windowStats(rows);

  // "Your day" hero: latest sleep night, latest strain day, recovery vs your
  // own 30-day HRV baseline (WHOOP-style personal banding).
  const sleepRow = rows.find((r) => r.sleepMinutes != null) ?? null;
  const strainRow = rows.find((r) => r.activeZoneMinutes != null) ?? null;
  const hrvRow = rows.find((r) => r.hrvDailyRmssd != null) ?? null;
  const hrvVals = rows.map((r) => r.hrvDailyRmssd).filter((v): v is number => v != null);
  const hrvBaseline = hrvVals.length > 2 ? hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length : null;
  const recoveryPct =
    hrvRow?.hrvDailyRmssd != null && hrvBaseline
      ? Math.round(Math.max(1, Math.min(99, 50 + (hrvRow.hrvDailyRmssd / hrvBaseline - 1) * 250)))
      : null;
  const lastSleepScore = sleepRow ? sleepScore(sleepRow) : null;
  const azmVals = rows.map((r) => r.activeZoneMinutes).filter((v): v is number => v != null);
  const azmDailyAvg = azmVals.length ? azmVals.reduce((a, b) => a + b, 0) / azmVals.length : null;
  const DAILY_STRAIN_TARGET = 30; // Active Zone Minutes per day
  const day = (iso?: string | null) =>
    iso
      ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
          new Date(`${iso}T00:00:00Z`),
        )
      : "";
  const pctDelta = (curr: number | null | undefined, avg: number | null): number | null => {
    if (curr == null || avg == null || avg === 0) return null;
    return Math.round(((curr - avg) / avg) * 100);
  };
  const myRanks =
    boards?.boards
      .map((b) => ({
        board: b.title,
        entry: b.entries.find((e) => e.userId === userId),
        total: b.entries.length,
      }))
      .filter((r) => r.entry) ?? [];

  const trends: { label: string; color: string; pick: (r: any) => number | null; fmt?: (v: number) => string }[] = [
    { label: "Steps", color: "text-metric-strain", pick: (r) => r.steps, fmt: (v) => new Intl.NumberFormat("en-US").format(Math.round(v)) },
    { label: "Active Zone Minutes", color: "text-metric-strain", pick: (r) => r.activeZoneMinutes },
    { label: "Sleep score", color: "text-metric-sleep", pick: (r) => sleepScore(r) },
    { label: "Resting HR", color: "text-metric-health", pick: (r) => r.restingHeartRate, fmt: (v) => `${Math.round(v)} bpm` },
    { label: "HRV (RMSSD)", color: "text-metric-recovery", pick: (r) => r.hrvDailyRmssd, fmt: (v) => `${Math.round(v)} ms` },
  ];

  const numbers: [string, string | null, number | null][] = [
    ["Steps / day", week.avgSteps != null ? new Intl.NumberFormat("en-US").format(Math.round(week.avgSteps)) : null, pctDelta(week.avgSteps, month.avgSteps)],
    ["Zone minutes (total)", week.totalAzm != null ? `${Math.round(week.totalAzm)} min` : null, null],
    ["Sleep / night", week.avgSleepMinutes != null ? formatHours(week.avgSleepMinutes) : null, pctDelta(week.avgSleepMinutes, month.avgSleepMinutes)],
    [
      "Deep + REM",
      week.avgDeepMinutes != null && week.avgRemMinutes != null && week.avgSleepMinutes
        ? `${formatHours(week.avgDeepMinutes + week.avgRemMinutes)} (${Math.round(((week.avgDeepMinutes + week.avgRemMinutes) / week.avgSleepMinutes) * 100)}%)`
        : null,
      null,
    ],
    ["Sleep efficiency", week.avgSleepEfficiency != null ? `${Math.round(week.avgSleepEfficiency)}%` : null, null],
    ["Sleep score", week.avgSleepScore != null ? `${Math.round(week.avgSleepScore)} pts` : null, pctDelta(week.avgSleepScore, month.avgSleepScore)],
    ["Resting HR", week.avgRestingHr != null ? `${Math.round(week.avgRestingHr)} bpm` : null, null],
    ["HRV (RMSSD)", week.avgHrv != null ? `${Math.round(week.avgHrv)} ms` : null, pctDelta(week.avgHrv, month.avgHrv)],
    ["Breathing rate", week.avgBreathingRate != null ? `${week.avgBreathingRate.toFixed(1)} br/min` : null, null],
    ["VO₂ max", week.avgVo2max != null ? week.avgVo2max.toFixed(1) : null, pctDelta(week.avgVo2max, month.avgVo2max)],
    ["Club Age", clubAge(week) != null ? `${clubAge(week)} yrs` : null, null],
  ];

  return (
    <div className="space-y-6">
      {searchParams.welcome && (
        <p className="rounded-xl border border-forest-soft/40 bg-forest-wash px-4 py-3 text-sm text-forest">
          Welcome to the club. Pick a name below — that&apos;s what friends will see. First data
          appears after the next sync.
        </p>
      )}

      <section className="flex items-center gap-4">
        <Avatar name={user.displayName} charm={user.avatarEmoji} size={64} ring />
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{user.displayName}</h1>
          <p className="label-caps mt-1">Private member dashboard</p>
        </div>
      </section>

      {/* Your day — WHOOP-style personal overview */}
      {(sleepRow || strainRow || recoveryPct != null) && (
        <section className="anim-fade-up rounded-2xl border border-hairline bg-card p-5 shadow-card">
          <h2 className="hl mb-4 text-xs text-faint">Your day</h2>
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
            <div className="flex items-center gap-4">
              <Ring value={lastSleepScore ?? 0} color="#7BA1BB" size={116} stroke={8}>
                <span className="font-num text-3xl font-bold tabular-nums text-ink">{lastSleepScore ?? "–"}</span>
                <span className="text-[10px] text-faint">sleep</span>
              </Ring>
              <div className="min-w-0">
                <p className="hl !text-[10px] text-metric-sleep">Last night</p>
                <p className="font-num text-sm font-semibold text-sub">
                  {sleepRow?.sleepMinutes != null ? formatHours(sleepRow.sleepMinutes) : "no data yet"}
                </p>
                <p className="mb-1 text-xs text-faint">{day(sleepRow?.date)}</p>
                <DeltaChip pct={pctDelta(lastSleepScore, month.avgSleepScore)} />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Ring
                value={strainRow?.activeZoneMinutes != null ? Math.min(100, (strainRow.activeZoneMinutes / DAILY_STRAIN_TARGET) * 100) : 0}
                color="#0093E7"
                size={116}
                stroke={8}
              >
                <span className="font-num text-3xl font-bold tabular-nums text-ink">
                  {strainRow?.activeZoneMinutes ?? "–"}
                </span>
                <span className="text-[10px] text-faint">min</span>
              </Ring>
              <div className="min-w-0">
                <p className="hl !text-[10px] text-metric-strain">Strain</p>
                <p className="font-num text-sm font-semibold text-sub">of {DAILY_STRAIN_TARGET} min goal</p>
                <p className="mb-1 text-xs text-faint">{day(strainRow?.date)}</p>
                <DeltaChip pct={pctDelta(strainRow?.activeZoneMinutes, azmDailyAvg)} />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Ring value={recoveryPct ?? 0} color={recoveryPct != null ? bandColor(recoveryPct) : "#67AEE6"} size={116} stroke={8}>
                <span className="font-num text-3xl font-bold tabular-nums text-ink">
                  {recoveryPct != null ? `${recoveryPct}%` : "–"}
                </span>
                <span className="text-[10px] text-faint">recovery</span>
              </Ring>
              <div className="min-w-0">
                <p className="hl !text-[10px] text-metric-recovery">Vs your baseline</p>
                <p className="font-num text-sm font-semibold text-sub">
                  {hrvRow?.hrvDailyRmssd != null ? `HRV ${Math.round(hrvRow.hrvDailyRmssd)} ms` : "needs a few days"}
                </p>
                <p className="text-xs text-faint">
                  {hrvBaseline ? `30-day baseline ${Math.round(hrvBaseline)} ms` : "building baseline…"}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Profile */}
      <section className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <h2 className="mb-3 font-display text-lg font-semibold">Profile</h2>
        <form method="post" action="/api/me/profile" className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-sub">
            Display name
            <input name="displayName" defaultValue={user.displayName} maxLength={40} required className={inputClass} />
          </label>
          <label className="text-sm text-sub">
            Lucky charm
            <input name="avatarEmoji" defaultValue={user.avatarEmoji} maxLength={8} className={`${inputClass} w-24 text-center`} />
          </label>
          <button className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-[#101518] hover:bg-brass-soft">
            Save
          </button>
          <p className="basis-full text-xs text-faint">
            The charm is any few characters — changing it re-rolls your portrait.
          </p>
        </form>
      </section>

      {/* Ranks */}
      <section className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <h2 className="mb-3 font-display text-lg font-semibold">Your standings</h2>
        {myRanks.length === 0 ? (
          <p className="text-sm text-faint">No ranked data yet — check back after a sync.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {myRanks.map((r) => (
              <li key={r.board} className="flex items-center justify-between rounded-lg bg-ivory px-3 py-2 text-sm">
                <span>{r.board}</span>
                <span className="font-display font-semibold tabular-nums">
                  #{r.entry!.rank} <span className="text-faint">/ {r.total}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* This week in numbers */}
      <section className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold">This week in numbers</h2>
        <p className="mb-4 mt-1 text-xs text-faint">7-day averages behind your scores — only you see these</p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {numbers
            .filter(([, v]) => v != null)
            .map(([label, value, d]) => (
              <div key={label} className="rounded-lg bg-ivory px-3 py-2">
                <dt className="label-caps">{label}</dt>
                <dd className="mt-1 font-num text-lg font-semibold tabular-nums">{value}</dd>
                {d != null && d !== 0 && <DeltaChip pct={d} />}
              </div>
            ))}
        </dl>
        {week.daysWithData === 0 ? (
          <p className="text-sm text-faint">No data this week yet — check back after a sync.</p>
        ) : (
          <p className="mt-3 text-xs text-faint">
            Sleep score = 50% duration (best at 8 h) + 30% deep+REM share (40% = full marks) + 20%
            efficiency. Club Age is a playful estimate from VO₂ max, resting HR, HRV, sleep and
            activity — only you can see the number; the board shows ranks only.
          </p>
        )}
      </section>

      {/* Trends */}
      <section className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold">Trends</h2>
        <p className="mb-4 mt-1 text-xs text-faint">Last 7 and 30 days · only you can see raw values</p>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {trends.map((t) => (
            <div key={t.label} className={t.color}>
              <h3 className="label-caps mb-1.5">{t.label}</h3>
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-faint">7d</p>
                  <Sparkline values={series(rows, 7, t.pick)} width={140} formatValue={t.fmt} />
                </div>
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-faint">30d</p>
                  <Sparkline values={series(rows, 30, t.pick)} width={240} formatValue={t.fmt} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Connection */}
      <section className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <h2 className="mb-3 font-display text-lg font-semibold">Connection &amp; data</h2>
        {token ? (
          <>
            <p className="mb-2 text-sm text-sub">
              Connected since {token.connectedAt.toISOString().slice(0, 10)}. Granted access:
            </p>
            <ul className="mb-4 list-inside list-disc text-sm text-sub">
              {token.grantedScopes
                .filter((s) => SCOPE_LABELS[s])
                .map((s) => (
                  <li key={s}>{SCOPE_LABELS[s]}</li>
                ))}
            </ul>
            <DisconnectButton />
          </>
        ) : (
          <p className="text-sm text-faint">Not connected.</p>
        )}
        <form method="post" action="/api/auth/logout" className="mt-4">
          <button className="text-sm text-faint underline decoration-hairline underline-offset-2 hover:text-sub">
            Log out (keeps data)
          </button>
        </form>
      </section>
    </div>
  );
}
