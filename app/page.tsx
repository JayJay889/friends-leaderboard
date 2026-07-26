import Link from "next/link";
import LeaderboardCard, { EntryRow } from "@/components/LeaderboardCard";
import { getLeaderboardData } from "@/lib/leaderboards";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getLeaderboardData(currentUserId());

  if (!data) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-surface-raised p-8 text-center">
        <p className="text-3xl">🔌</p>
        <h1 className="mt-2 text-xl font-bold">Almost there</h1>
        <p className="mt-2 text-sm text-zinc-400">
          The app isn&apos;t configured yet — set <code>DATABASE_URL</code> (or{" "}
          <code>DEMO_MODE=1</code> for a preview) and reload.
        </p>
      </div>
    );
  }

  const hasAnyData = data.boards.some((b) => b.entries.length > 0);

  return (
    <div className="space-y-6">
      {data.demo && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-300">
          Demo mode — showing fake friends. Set DEMO_MODE=0 once real data flows.
        </p>
      )}

      {/* Composite hero */}
      <section className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/20 to-surface-raised p-6 shadow-xl">
        <header className="mb-2">
          <h1 className="text-2xl font-extrabold tracking-tight">👑 Healthiest Human</h1>
          <p className="text-xs text-zinc-400">
            Mean percentile across all boards · needs data on at least 3 boards · {data.windowLabel.toLowerCase()}
          </p>
        </header>
        {data.composite.length === 0 ? (
          <p className="py-4 text-sm text-zinc-400">
            Nobody qualifies yet — sync some data on at least 3 boards to enter the throne room.
          </p>
        ) : (
          <ol className="divide-y divide-white/5">
            {data.composite.map((e) => (
              <EntryRow key={e.userId} entry={e} />
            ))}
          </ol>
        )}
      </section>

      {/* Five boards */}
      <div className="grid gap-6 sm:grid-cols-2">
        {data.boards.map((b) => (
          <LeaderboardCard key={b.key} board={b} />
        ))}
      </div>

      {!hasAnyData && !data.demo && (
        <div className="rounded-2xl border border-white/10 bg-surface-raised p-8 text-center">
          <p className="text-3xl">🌱</p>
          <h2 className="mt-2 text-lg font-bold">No data yet</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Be the first:{" "}
            <Link href="/connect" className="text-accent-soft underline">
              connect your Fitbit
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
