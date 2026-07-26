import { desc, eq, gte } from "drizzle-orm";
import { redirect } from "next/navigation";
import DisconnectButton from "@/components/DisconnectButton";
import Sparkline from "@/components/Sparkline";
import { db, schema } from "@/db";
import { getLeaderboardData } from "@/lib/leaderboards";
import { SCOPE } from "@/lib/google";
import { sleepScore } from "@/lib/scores";
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

  const boards = await getLeaderboardData();
  const myRanks =
    boards?.boards
      .map((b) => ({
        board: `${b.emoji} ${b.title}`,
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

  return (
    <div className="space-y-8">
      {searchParams.welcome && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          🎉 Connected! Pick a name and emoji below — that&apos;s what friends will see. First
          data appears after the next sync (a few times a day).
        </p>
      )}

      <section className="flex items-center gap-4">
        <span className="text-5xl">{user.avatarEmoji}</span>
        <div>
          <h1 className="text-2xl font-extrabold">{user.displayName}</h1>
          <p className="text-sm text-zinc-400">Your private dashboard</p>
        </div>
      </section>

      {/* Profile */}
      <section className="rounded-2xl border border-white/5 bg-surface-raised p-5">
        <h2 className="mb-3 font-bold">Profile</h2>
        <form method="post" action="/api/me/profile" className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-zinc-400">
            Display name
            <input
              name="displayName"
              defaultValue={user.displayName}
              maxLength={40}
              required
              className="mt-1 block rounded-lg border border-white/10 bg-surface px-3 py-2 text-zinc-100"
            />
          </label>
          <label className="text-sm text-zinc-400">
            Emoji
            <input
              name="avatarEmoji"
              defaultValue={user.avatarEmoji}
              maxLength={8}
              className="mt-1 block w-20 rounded-lg border border-white/10 bg-surface px-3 py-2 text-center text-xl"
            />
          </label>
          <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-soft">
            Save
          </button>
        </form>
      </section>

      {/* Ranks */}
      <section className="rounded-2xl border border-white/5 bg-surface-raised p-5">
        <h2 className="mb-3 font-bold">Your ranks</h2>
        {myRanks.length === 0 ? (
          <p className="text-sm text-zinc-500">No ranked data yet — check back after a sync.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {myRanks.map((r) => (
              <li key={r.board} className="flex justify-between rounded-lg bg-surface px-3 py-2 text-sm">
                <span>{r.board}</span>
                <span className="font-semibold tabular-nums">
                  #{r.entry!.rank} <span className="text-zinc-500">/ {r.total}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Trends */}
      <section className="rounded-2xl border border-white/5 bg-surface-raised p-5">
        <h2 className="mb-1 font-bold">Trends</h2>
        <p className="mb-4 text-xs text-zinc-500">Last 7 and 30 days · only you can see raw values</p>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {trends.map((t) => (
            <div key={t.label}>
              <h3 className="mb-1 text-sm text-zinc-400">{t.label}</h3>
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">7d</p>
                  <Sparkline values={series(rows, 7, t.pick)} width={140} formatValue={t.fmt} />
                </div>
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">30d</p>
                  <Sparkline values={series(rows, 30, t.pick)} width={240} formatValue={t.fmt} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Connection */}
      <section className="rounded-2xl border border-white/5 bg-surface-raised p-5">
        <h2 className="mb-3 font-bold">Connection &amp; data</h2>
        {token ? (
          <>
            <p className="mb-2 text-sm text-zinc-400">
              Connected since {token.connectedAt.toISOString().slice(0, 10)}. Granted access:
            </p>
            <ul className="mb-4 list-inside list-disc text-sm text-zinc-300">
              {token.grantedScopes
                .filter((s) => SCOPE_LABELS[s])
                .map((s) => (
                  <li key={s}>{SCOPE_LABELS[s]}</li>
                ))}
            </ul>
            <DisconnectButton />
          </>
        ) : (
          <p className="text-sm text-zinc-500">Not connected.</p>
        )}
        <form method="post" action="/api/auth/logout" className="mt-4">
          <button className="text-sm text-zinc-500 underline hover:text-zinc-300">
            Log out (keeps data)
          </button>
        </form>
      </section>
    </div>
  );
}
