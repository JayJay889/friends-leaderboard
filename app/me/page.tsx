import { and, desc, eq, gte } from "drizzle-orm";
import { redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import AvatarStudio from "@/components/AvatarStudio";
import DisconnectButton from "@/components/DisconnectButton";
import Ring, { bandColor } from "@/components/Ring";
import Sparkline from "@/components/Sparkline";
import { db, schema } from "@/db";
import { formatHours, getLeaderboardData, realAge, stalenessByUser } from "@/lib/leaderboards";
import { SCOPE } from "@/lib/google";
import { PROVIDER_LABELS } from "@/lib/providers/types";
import { prioritiesFor, resolveRows } from "@/lib/resolve";
import { clubAge, nightNeed, nightlyNeeds, recoveryScore, sleepScore, strainScale, windowStats } from "@/lib/scores";
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

  const tokens = await db()
    .select()
    .from(schema.oauthTokens)
    .where(eq(schema.oauthTokens.userId, userId));
  const token = tokens[0];

  const identities = await db()
    .select()
    .from(schema.identities)
    .where(eq(schema.identities.userId, userId));

  // Bounded by date, not by row count: with several devices a single day can
  // produce several rows, and a LIMIT would slice one of them off mid-day.
  const rawRows = await db()
    .select()
    .from(schema.dailyMetrics)
    .where(
      and(eq(schema.dailyMetrics.userId, userId), gte(schema.dailyMetrics.date, isoDaysAgo(35))),
    )
    .orderBy(desc(schema.dailyMetrics.date));
  const rows = resolveRows(rawRows, prioritiesFor([user], identities).get(userId)!).reverse();

  const boards = await getLeaderboardData(userId);
  // Freshness of MY own data, for the connection panel below.
  const newestDay = rows.length ? rows[0].date : null;
  const myStaleDays = newestDay
    ? (() => {
        const d = stalenessByUser(rows).get(userId);
        return d ?? null;
      })()
    : null;
  // Sleep restoration is judged against your own 30-day normal, so the number
  // means the same thing whichever watch you wear.
  const effValues = rows.map((r) => r.sleepEfficiency).filter((v): v is number => v != null);
  const effBaseline =
    effValues.length >= 3 ? effValues.reduce((a, b) => a + b, 0) / effValues.length : null;
  const week = windowStats(rows.filter((r) => r.date >= isoDaysAgo(7)), effBaseline);
  const month = windowStats(rows, effBaseline);

  // "Your day" hero: latest sleep night, latest strain day, recovery vs your
  // own 30-day HRV baseline (WHOOP-style personal banding).
  const sleepRow = rows.find((r) => r.sleepMinutes != null) ?? null;
  const strainRow = rows.find((r) => r.activeZoneMinutes != null) ?? null;
  // Apple reports SDNN where the others report RMSSD. Safe to fall through here
  // because this is all one person measured one way, and recovery only ever uses
  // the ratio to their own baseline.
  const hrvOf = (r: { hrvDailyRmssd: number | null; hrvSdnn: number | null }) =>
    r.hrvDailyRmssd ?? r.hrvSdnn;
  const hrvRow = rows.find((r) => hrvOf(r) != null) ?? null;
  const hrvVals = rows.map(hrvOf).filter((v): v is number => v != null);
  const hrvBaseline = hrvVals.length > 2 ? hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length : null;
  const needBase = month.sleepNeed;
  const perNightNeeds = nightlyNeeds(rows, needBase);
  const lastSleepScore = sleepRow
    ? sleepScore(sleepRow, perNightNeeds.get(sleepRow.date) ?? needBase, effBaseline)
    : null;
  const rhrRow = rows.find((r) => r.restingHeartRate != null) ?? null;
  const recoveryPct = recoveryScore(
    {
      hrv: hrvRow ? hrvOf(hrvRow) : null,
      restingHr: rhrRow?.restingHeartRate ?? null,
      sleepScore: lastSleepScore,
    },
    { hrv: hrvBaseline, restingHr: month.avgRestingHr },
  );
  const azmVals = rows.map((r) => r.activeZoneMinutes).filter((v): v is number => v != null);
  const azmDailyAvg = azmVals.length ? azmVals.reduce((a, b) => a + b, 0) / azmVals.length : null;
  const dailyStrainScore =
    strainRow?.activeZoneMinutes != null ? strainScale(strainRow.activeZoneMinutes, 60) : null;
  // Tonight's need, from the same function that grades the nights already slept,
  // so the target shown here and the target scored against cannot drift apart.
  const sleepNeedTonight = Math.round(
    nightNeed(
      needBase,
      rows.map((r) => r.sleepMinutes).filter((v): v is number => v != null),
      strainRow?.activeZoneMinutes ?? null,
      azmDailyAvg,
    ),
  );
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
    { label: "Sleep score", color: "text-metric-sleep", pick: (r) => sleepScore(r, perNightNeeds.get(r.date) ?? month.sleepNeed, effBaseline) },
    { label: "Resting HR", color: "text-metric-health", pick: (r) => r.restingHeartRate, fmt: (v) => `${Math.round(v)} bpm` },
    { label: "Battery (HRV)", color: "text-metric-recovery", pick: (r) => r.hrvDailyRmssd ?? r.hrvSdnn, fmt: (v) => `${Math.round(v)} ms` },
  ];

  const numbers: [string, string | null, number | null][] = [
    ["Steps / day", week.avgSteps != null ? new Intl.NumberFormat("en-US").format(Math.round(week.avgSteps)) : null, pctDelta(week.avgSteps, month.avgSteps)],
    ["Zone minutes", week.totalAzm != null ? `${Math.round(week.totalAzm)} min` : null, null],
    ["Sleep / night", week.avgSleepMinutes != null ? formatHours(week.avgSleepMinutes) : null, pctDelta(week.avgSleepMinutes, month.avgSleepMinutes)],
    ["Resting HR", week.avgRestingHr != null ? `${Math.round(week.avgRestingHr)} bpm` : null, null],
    ["VO₂ max", week.avgVo2max != null ? week.avgVo2max.toFixed(1) : null, pctDelta(week.avgVo2max, month.avgVo2max)],
    ["Body Age", clubAge(week) != null ? `${clubAge(week)} yrs` : null, null],
    [
      "Age Defied",
      clubAge(week) != null && realAge(user.birthDate) != null
        ? `${realAge(user.birthDate)! - clubAge(week)! > 0 ? "+" : ""}${realAge(user.birthDate)! - clubAge(week)!} yrs`
        : null,
      null,
    ],
  ];

  const isWelcome = !!searchParams.welcome;

  const profileCard = (
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
        <label className="text-sm text-sub">
          Birthday
          <input
            type="date"
            name="birthDate"
            defaultValue={user.birthDate ?? ""}
            className={inputClass}
          />
        </label>
        <button className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-[#101518] hover:bg-brass-soft">
          Save
        </button>
        <p className="basis-full text-xs text-faint">Birthday powers the Age Defied board (only the difference is public).</p>
      </form>

      <details className="mt-5 border-t border-hairline pt-4" open={isWelcome}>
        <summary className="cursor-pointer text-sm font-medium text-lagoon">Design your portrait</summary>
        <div className="mt-4">
          <AvatarStudio
            name={user.displayName}
            charm={user.avatarEmoji}
            initial={user.avatarOptions ?? null}
          />
        </div>
      </details>
    </section>
  );

  return (
    <div className="space-y-6">
      {isWelcome && (
        <p className="rounded-xl border border-forest-soft/40 bg-forest-wash px-4 py-3 text-sm text-forest">
          Welcome to the club, {user.displayName} — your data is already on the boards. Fix your
          name if Google got it wrong, and add your birthday to enter the Age Defied board.
        </p>
      )}

      <section className="flex items-center gap-4">
        <Avatar name={user.displayName} charm={user.avatarEmoji} options={user.avatarOptions} size={64} ring />
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{user.displayName}</h1>
          <p className="label-caps mt-1">Private member dashboard</p>
        </div>
      </section>

      {isWelcome && profileCard}

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
                <p className="hl !text-[10px] text-metric-sleep">Sleep</p>
                <p className="text-sm font-medium text-sub">How well you recharged last night</p>
                <p className="mt-0.5 font-num text-xs text-faint">
                  {sleepRow?.sleepMinutes != null ? formatHours(sleepRow.sleepMinutes) : "no data"} · aim for{" "}
                  {formatHours(sleepNeedTonight)} tonight
                </p>
                <DeltaChip pct={pctDelta(lastSleepScore, month.avgSleepScore)} />
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
                <p className="hl !text-[10px] text-metric-recovery">Battery</p>
                <p className="text-sm font-medium text-sub">
                  {recoveryPct == null
                    ? "How ready your body is — needs a few days"
                    : recoveryPct >= 67
                      ? "Your body is fully charged — go hard"
                      : recoveryPct >= 34
                        ? "Ready for a normal day, not a max effort"
                        : "Your body wants an easy day"}
                </p>
                <p className="mt-0.5 font-num text-xs text-faint">
                  {[
                    hrvRow?.hrvDailyRmssd != null && hrvBaseline
                      ? `HRV ${Math.round(hrvRow.hrvDailyRmssd)} vs ${Math.round(hrvBaseline)} ms`
                      : null,
                    rhrRow?.restingHeartRate != null && month.avgRestingHr
                      ? `pulse ${Math.round(rhrRow.restingHeartRate)} vs ${Math.round(month.avgRestingHr)} bpm`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "building your baseline"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Ring
                value={dailyStrainScore != null ? (dailyStrainScore / 21) * 100 : 0}
                color="#0093E7"
                size={116}
                stroke={8}
              >
                <span className="font-num text-3xl font-bold tabular-nums text-ink">
                  {dailyStrainScore != null ? dailyStrainScore.toFixed(1) : "–"}
                </span>
                <span className="text-[10px] text-faint">of 21</span>
              </Ring>
              <div className="min-w-0">
                <p className="hl !text-[10px] text-metric-strain">Strain</p>
                <p className="text-sm font-medium text-sub">How hard your body worked today</p>
                <p className="mt-0.5 font-num text-xs text-faint">
                  {strainRow?.activeZoneMinutes ?? 0} min with your heart rate up · {day(strainRow?.date)}
                </p>
                <DeltaChip pct={pctDelta(strainRow?.activeZoneMinutes, azmDailyAvg)} />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Profile (shown up top instead when welcoming a new member) */}
      {!isWelcome && profileCard}

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
        <p className="mb-4 mt-1 text-xs text-faint">7-day averages · only you see these</p>
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
        {week.daysWithData === 0 && (
          <p className="text-sm text-faint">No data yet — first sync is on its way.</p>
        )}
      </section>

      {/* Trends */}
      <section className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold">Trends</h2>
        <p className="mb-4 mt-1 text-xs text-faint">Last 30 days</p>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {trends.map((t) => (
            <div key={t.label} className={t.color}>
              <h3 className="label-caps mb-1.5">{t.label}</h3>
              <Sparkline values={series(rows, 30, t.pick)} width={260} formatValue={t.fmt} />
            </div>
          ))}
        </div>
      </section>

      {/* Connection */}
      <section className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <h2 className="mb-3 font-display text-lg font-semibold">Connection &amp; data</h2>
        {/*
          The failure that matters is silent: a connection breaks, the boards keep
          showing the last number, and nobody notices for weeks. Measured on the
          newest DAY of data, because a sync that succeeds and returns nothing new
          still looks healthy by its own timestamp.
        */}
        <p className={`mb-3 text-sm ${myStaleDays != null ? "text-brick" : "text-sub"}`}>
          {newestDay == null ? (
            "No data yet."
          ) : myStaleDays != null ? (
            <>
              <strong className="font-semibold">Nothing new since {day(newestDay)}.</strong>{" "}
              Your watch may have stopped reaching us — check it has synced with its own app, and
              reconnect below if that does not fix it.
            </>
          ) : (
            <>Up to date — newest data {day(newestDay)}.</>
          )}
        </p>
        {tokens.length > 0 ? (
          <>
            <ul className="mb-4 space-y-1 text-sm text-sub">
              {tokens.map((t) => (
                <li key={t.provider}>
                  <strong className="font-semibold text-ink">{PROVIDER_LABELS[t.provider]}</strong>{" "}
                  since {t.connectedAt.toISOString().slice(0, 10)}
                  {t.provider === "google" &&
                    ` · ${t.grantedScopes.filter((sc) => SCOPE_LABELS[sc]).length}/3 data scopes granted`}
                  {tokens.length > 1 && user.primarySource === t.provider && " · leads"}
                </li>
              ))}
            </ul>
            <DisconnectButton />
          </>
        ) : (
          <p className="text-sm text-faint">Not connected.</p>
        )}
        {process.env.INVITE_CODE && (
          <p className="mt-4 text-sm">
            <a
              href={`/connect?invite=${encodeURIComponent(process.env.INVITE_CODE)}`}
              className="text-sub underline decoration-hairline underline-offset-2 hover:text-ink"
            >
              Add another device
            </a>
            <span className="ml-2 text-xs text-faint">
              — fills gaps your main one misses; nothing gets double-counted
            </span>
          </p>
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
