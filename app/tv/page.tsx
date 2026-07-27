import Avatar from "@/components/Avatar";
import GroupTrendsCard from "@/components/GroupTrendsCard";
import LeaderboardCard, { RankBadge } from "@/components/LeaderboardCard";
import StoryCard from "@/components/StoryCard";
import TvRotator from "@/components/TvRotator";
import { getLeaderboardData, type BoardEntry } from "@/lib/leaderboards";
import { getGroupTrends } from "@/lib/trends";

export const dynamic = "force-dynamic";

function PodiumRow({ entry, isLast }: { entry: BoardEntry; isLast: boolean }) {
  const leader = entry.rank === 1;
  return (
    <li
      className={`flex items-center gap-5 rounded-2xl px-5 ${
        leader
          ? "bg-ivory py-4 shadow-glow ring-1 ring-brass-soft/40"
          : isLast
            ? "border border-brick/25 bg-brick/5 py-3"
            : "py-3"
      }`}
    >
      <RankBadge rank={entry.rank} />
      <Avatar name={entry.displayName} charm={entry.avatarEmoji} size={leader ? 64 : 48} ring={leader} />
      <span className={`min-w-0 flex-1 truncate font-display ${leader ? "text-4xl font-bold text-ink" : "text-2xl text-sub"}`}>
        {entry.displayName}
        {isLast && (
          <span className="label-caps ml-3 rounded-full border border-brick/40 px-2 py-0.5 align-middle text-brick">
            red lantern
          </span>
        )}
      </span>
      <span className={`font-display font-bold tabular-nums text-neon-gold ${leader ? "text-5xl" : "text-3xl opacity-80"}`}>
        {entry.display}
      </span>
    </li>
  );
}

export default async function TvPage({
  searchParams,
}: {
  searchParams: { interval?: string };
}) {
  const [data, trends] = await Promise.all([getLeaderboardData(), getGroupTrends()]);
  const intervalSec = Math.max(5, Number(searchParams.interval) || 20);

  if (!data) {
    return (
      <p className="p-10 text-center text-sub">App not configured — set DATABASE_URL or DEMO_MODE=1.</p>
    );
  }

  const podium = (
    <div className="mx-auto flex h-full max-w-4xl flex-col justify-center">
      <header className="mb-6 text-center">
        <p className="label-caps">Mean percentile across all boards · {data.windowLabel.toLowerCase()}</p>
        <h1 className="mt-2 font-display text-6xl font-bold tracking-tight">The Healthiest Human</h1>
      </header>
      {data.composite.length === 0 ? (
        <p className="text-center text-sub">Nobody qualifies yet — connect and sync to enter the running.</p>
      ) : (
        <ol className="space-y-2">
          {data.composite.map((e) => (
            <PodiumRow
              key={e.userId}
              entry={e}
              isLast={data.composite.length >= 3 && e.rank === data.composite.length}
            />
          ))}
        </ol>
      )}
    </div>
  );

  const boards = (
    <div className="mx-auto flex h-full max-w-7xl flex-col justify-center">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {data.boards.map((b) => (
          <LeaderboardCard key={b.key} board={b} />
        ))}
      </div>
    </div>
  );

  const dispatch = (
    <div className="mx-auto flex h-full max-w-4xl flex-col justify-center gap-6">
      <StoryCard story={data.story} />
      {trends && <GroupTrendsCard trends={trends} />}
    </div>
  );

  return (
    <TvRotator
      slides={[podium, boards, dispatch]}
      titles={["The Podium", "The Boards", "The Dispatch"]}
      intervalSec={intervalSec}
    />
  );
}
