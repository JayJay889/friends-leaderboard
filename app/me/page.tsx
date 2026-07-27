import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import DisconnectButton from "@/components/DisconnectButton";
import Sparkline from "@/components/Sparkline";
import { db, schema } from "@/db";
import { formatHours, getLeaderboardData } from "@/lib/leaderboards";
import { SCOPE } from "@/lib/google";
import { sleepScore, windowStats } from "@/lib/scores";
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
  const myRanks =
    boards?.boards
      .map((b) => ({
        board: b.title,
        entry: b.entries.find((e) => e.userId === userId),
        total: b.entries.length,
      }))
      .filter((r) => r.entry) ?? [];

  const trends: { label: string; pick: (r: any) => number | null; fmt?: (v: number) => string }[] = [
    { label: "Steps", pick: (r) => r.steps, fmt: (v) => new Intl.NumberFormat("en-US").format(Math.round(v)) },
    { label: "Active Zone Minutes", pick: (r) => r.activeZoneMinutes },
    { label: "Sleep score", pick: (r) => sleepScore(r) },
    { label: "Resting HR", pick: (r) => r.restingHeartRate, fmt: (v) => `${Math.round(v)} bpm` },
    { label: "HRV (RMSSD)", pick: (r) => r.hrvDailyRmssd, fmt: (v) => `${Math.round(v)} ms` },
  ];

  const numbers: [string, string | null][] = [
    ["Steps / day", week.avgSteps != null ? new Intl.NumberFormat("en-US").format(Math.round(week.avgSteps)) : null],
    ["Zone minutes (total)", week.totalAzm != null ? `${Math.round(week.totalAzm)} min` : null],
    ["Sleep / night", week.avgSleepMinutes != null ? formatHours(week.avgSleepMinutes) : null],
    [
      "Deep + REM",
      week.avgDeepMinutes != null && week.avgRemMinutes != null && week.avgSleepMinutes
        ? `${formatHours(week.avgDeepMinutes + week.avgRemMinutes)} (${Math.round(((week.avgDeepMinutes + week.avgRemMinutes) / week.avgSleepMinutes) * 100)}%)`
        : null,
    ],
    ["Sleep efficiency", week.avgSleepEfficiency != null ? `${Math.round(week.avgSleepEfficiency)}%` : null],
    ["Sleep score", week.avgSleepScore != null ? `${Math.round(week.avgSleepScore)} pts` : null],
    ["Resting HR", week.avgRestingHr != null ? `${Math.round(week.avgRestingHr)} bpm` : null],
    ["HRV (RMSSD)", week.avgHrv != null ? `${Math.round(week.avgHrv)} ms` : null],
    ["Breathing rate", week.avgBreathingRate != null ? `${week.avgBreathingRate.toFixed(1)} br/min` : null],
    ["VO₂ max", week.avgVo2max != null ? week.avgVo2max.toFixed(1) : null],
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
          <button className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-ivory hover:bg-forest-soft">
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
            .map(([label, value]) => (
              <div key={label} className="rounded-lg bg-ivory px-3 py-2">
                <dt className="label-caps">{label}</dt>
                <dd className="mt-1 font-display text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
        </dl>
        {week.daysWithData === 0 ? (
          <p className="text-sm text-faint">No data this week yet — check back after a sync.</p>
        ) : (
          <p className="mt-3 text-xs text-faint">
            Sleep score = 50% duration (best at 8 h) + 30% deep+REM share (40% = full marks) + 20% efficiency.
          </p>
        )}
      </section>

      {/* Trends */}
      <section className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold">Trends</h2>
        <p className="mb-4 mt-1 text-xs text-faint">Last 7 and 30 days · only you can see raw values</p>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {trends.map((t) => (
            <div key={t.label}>
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
