import Link from "next/link";
import GroupTrendsCard from "@/components/GroupTrendsCard";
import LeaderboardCard, { EntryRow } from "@/components/LeaderboardCard";
import StoryCard from "@/components/StoryCard";
import { getLeaderboardData } from "@/lib/leaderboards";
import { getGroupTrends } from "@/lib/trends";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [data, trends] = await Promise.all([
    getLeaderboardData(currentUserId()),
    getGroupTrends(),
  ]);

  if (!data) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-hairline bg-card p-8 text-center shadow-card">
        <h1 className="font-display text-xl font-semibold">Almost there</h1>
        <p className="mt-2 text-sm text-sub">
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
        <p className="rounded-xl border border-brass-soft/40 bg-brass-wash px-4 py-2 text-center text-xs text-brass">
          Demo mode — showing fake friends. Set DEMO_MODE=0 once real data flows.
        </p>
      )}

      {/* Composite hero */}
      <section className="rounded-2xl border border-brass-soft/40 border-t-2 border-t-neon-gold bg-card p-6 shadow-glow">
        <header className="mb-3 border-b border-hairline pb-4 text-center">
          <p className="label-caps">Mean percentile across all boards · min 3 boards · {data.windowLabel.toLowerCase()}</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
            The Healthiest Human
          </h1>
        </header>
        {data.composite.length === 0 ? (
          <p className="py-4 text-center text-sm text-sub">
            Nobody qualifies yet — sync data on at least 3 boards to enter the running.
          </p>
        ) : (
          <ol className="divide-y divide-hairline/60">
            {data.composite.map((e) => (
              <EntryRow
                key={e.userId}
                entry={e}
                isLast={data.composite.length >= 3 && e.rank === data.composite.length}
              />
            ))}
          </ol>
        )}
      </section>

      {/* Weekly narrative + group trends */}
      <StoryCard story={data.story} />
      {trends && <GroupTrendsCard trends={trends} />}

      {/* Five boards */}
      <div className="grid gap-6 sm:grid-cols-2">
        {data.boards.map((b) => (
          <LeaderboardCard key={b.key} board={b} />
        ))}
      </div>

      {!hasAnyData && !data.demo && (
        <div className="rounded-2xl border border-hairline bg-card p-8 text-center shadow-card">
          <h2 className="font-display text-lg font-semibold">No data yet</h2>
          <p className="mt-1 text-sm text-sub">
            Be the first:{" "}
            <Link href="/connect" className="text-forest underline decoration-hairline underline-offset-2">
              connect your Fitbit
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
