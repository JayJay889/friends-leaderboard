import Link from "next/link";
import LeaderboardCard, { EntryRow } from "@/components/LeaderboardCard";
import Podium from "@/components/Podium";
import { getLeaderboardData } from "@/lib/leaderboards";
import { getHallOfFame } from "@/lib/seasons";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [data, hall] = await Promise.all([
    getLeaderboardData(currentUserId()),
    getHallOfFame(),
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
        <p className="rounded-lg border border-brass-soft/30 bg-brass-wash py-1.5 text-center text-xs font-medium text-brass">
          Demo mode — showing fake friends. Set DEMO_MODE=0 once real data flows.
        </p>
      )}

      {/* Composite hero: the podium */}
      <section className="rounded-2xl border border-hairline bg-card p-6 pb-0 shadow-card">
        <header className="mb-5 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">The Healthiest Human</h1>
          <p className="mt-1 text-xs text-faint">
            Mean percentile across all boards · min 3 boards · {data.windowLabel.toLowerCase()}
          </p>
        </header>
        {data.composite.length === 0 ? (
          <p className="pb-6 text-center text-sm text-sub">
            Nobody qualifies yet — sync data on at least 3 boards to enter the running.
          </p>
        ) : (
          <>
            <Podium entries={data.composite} />
            {data.composite.length > 3 && (
              <ol className="mx-auto max-w-xl py-4">
                {data.composite.slice(3).map((e) => (
                  <EntryRow
                    key={e.userId}
                    entry={e}
                    isLast={data.composite.length >= 3 && e.rank === data.composite.length}
                  />
                ))}
              </ol>
            )}
            {data.composite.length <= 3 && <div className="pb-6" />}
          </>
        )}
      </section>

      {/* Semester championship strip */}
      {hall && hall.tally[0] && (
        <Link
          href="/hall"
          className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-hairline bg-card px-5 py-2.5 text-sm text-sub shadow-card transition-colors hover:text-ink"
        >
          <span>
            <span className="font-semibold text-brass">♛</span> <span className="font-semibold text-ink">{hall.tally[0].displayName}</span> leads the{" "}
            {hall.semesterName} championship with {hall.tally[0].crowns}{" "}
            {hall.tally[0].crowns === 1 ? "crown" : "crowns"}
          </span>
          <span className="shrink-0 font-semibold text-brass">Hall of Fame →</span>
        </Link>
      )}

      {/* Five boards */}
      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
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
