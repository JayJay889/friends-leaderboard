import Avatar from "@/components/Avatar";
import LeaderboardCard from "@/components/LeaderboardCard";
import TvRotator from "@/components/TvRotator";
import { getLeaderboardData, type BoardEntry, type StoryPerson } from "@/lib/leaderboards";
import { formatWeek, getHallOfFame } from "@/lib/seasons";

export const dynamic = "force-dynamic";

function PodiumRow({ entry, isLast }: { entry: BoardEntry; isLast: boolean }) {
  const leader = entry.rank === 1;
  return (
    <li className={leader ? "py-3" : "py-2"}>
      <div className="flex items-center gap-4">
        <span className={`w-10 shrink-0 text-right font-display ${leader ? "text-3xl font-semibold" : "text-xl text-faint"}`}>
          {entry.rank}.
        </span>
        <Avatar name={entry.displayName} charm={entry.avatarEmoji} size={leader ? 64 : 48} ring={leader} />
        <span className={`shrink truncate font-display ${leader ? "text-4xl font-bold text-ink" : "text-2xl text-sub"}`}>
          {leader && <span className="mr-2 text-brass">♛</span>}
          {entry.displayName}
        </span>
        {isLast && <span className="label-caps shrink-0 !text-brick">red lantern</span>}
        <span className="dotlead" />
        <span
          className={`shrink-0 font-display font-bold tabular-nums ${isLast ? "text-brick" : "text-brass"} ${
            leader ? "text-5xl" : "text-3xl opacity-90"
          }`}
        >
          {entry.display}
        </span>
      </div>
    </li>
  );
}

function MoverRow({ mover }: { mover: StoryPerson & { spots: number } }) {
  const up = mover.spots > 0;
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar name={mover.displayName} charm={mover.avatarEmoji} size={40} />
      <span className="shrink truncate font-display text-xl text-ink">{mover.displayName}</span>
      <span className="dotlead" />
      <span className={`shrink-0 font-display text-3xl font-bold tabular-nums ${up ? "text-forest" : "text-brick"}`}>
        {up ? "▲" : "▼"} {Math.abs(mover.spots)}
      </span>
    </li>
  );
}

export default async function TvPage({
  searchParams,
}: {
  searchParams: { interval?: string; top?: string };
}) {
  const [data, hall] = await Promise.all([getLeaderboardData(), getHallOfFame()]);
  const intervalSec = Math.max(5, Number(searchParams.interval) || 20);
  const top = Math.min(10, Math.max(3, Number(searchParams.top) || 5));

  if (!data) {
    return (
      <p className="p-10 text-center text-sub">App not configured — set DATABASE_URL or DEMO_MODE=1.</p>
    );
  }

  // Podium: top N, then the lantern pinned after an ellipsis if hidden.
  const composite = data.composite;
  const podiumCapped = composite.length > top;
  const podiumVisible = podiumCapped ? composite.slice(0, top) : composite;
  const podiumLantern =
    podiumCapped && composite.length >= 3 ? composite[composite.length - 1] : null;
  const podiumHidden = podiumCapped
    ? composite.length - podiumVisible.length - (podiumLantern ? 1 : 0)
    : 0;

  const podium = (
    <div className="mx-auto flex h-full max-w-4xl flex-col justify-center">
      <header className="mb-6 text-center">
        <p className="label-caps">Mean percentile across all boards · {data.windowLabel.toLowerCase()}</p>
        <h1 className="mt-2 font-display text-6xl font-bold tracking-tight">The Healthiest Human</h1>
      </header>
      {composite.length === 0 ? (
        <p className="text-center text-sub">Nobody qualifies yet — connect and sync to enter the running.</p>
      ) : (
        <ol className="space-y-2">
          {podiumVisible.map((e) => (
            <PodiumRow
              key={e.userId}
              entry={e}
              isLast={!podiumCapped && composite.length >= 3 && e.rank === composite.length}
            />
          ))}
          {podiumHidden > 0 && (
            <li className="py-1 text-center text-sm tracking-widest text-faint">
              ··· {podiumHidden} more ···
            </li>
          )}
          {podiumLantern && <PodiumRow entry={podiumLantern} isLast />}
        </ol>
      )}
    </div>
  );

  const boards = (
    <div className="mx-auto flex h-full max-w-7xl flex-col justify-center">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {data.boards.map((b) => (
          <LeaderboardCard key={b.key} board={b} maxEntries={top} />
        ))}
      </div>
    </div>
  );

  const climbing = data.story.movers.filter((m) => m.spots > 0);
  const sliding = data.story.movers.filter((m) => m.spots < 0).reverse();

  const movers = (
    <div className="mx-auto flex h-full max-w-5xl flex-col justify-center">
      <header className="mb-8 text-center">
        <p className="label-caps">Net rank movement vs last week, all boards combined</p>
        <h1 className="mt-2 font-display text-6xl font-bold tracking-tight">The Movers</h1>
      </header>
      {data.story.movers.length === 0 ? (
        <p className="text-center text-sub">No movement this week — everyone holds their ground.</p>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          <section>
            <h2 className="label-caps mb-3 !text-forest">▲ Climbing</h2>
            {climbing.length === 0 ? (
              <p className="text-sm text-faint">Nobody climbed this week.</p>
            ) : (
              <ol className="space-y-2">
                {climbing.map((m) => (
                  <MoverRow key={m.displayName} mover={m} />
                ))}
              </ol>
            )}
          </section>
          <section>
            <h2 className="label-caps mb-3 !text-brick">▼ Sliding</h2>
            {sliding.length === 0 ? (
              <p className="text-sm text-faint">Nobody slipped this week.</p>
            ) : (
              <ol className="space-y-2">
                {sliding.map((m) => (
                  <MoverRow key={m.displayName} mover={m} />
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
      {(data.story.formGuide.improved || data.story.formGuide.declined) && (
        <section className="mt-10 border-t border-hairline pt-6">
          <h2 className="label-caps mb-4 text-center">Form guide — actual numbers vs last week</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {data.story.formGuide.improved && (
              <div className="flex items-center gap-4 rounded-2xl bg-ivory px-5 py-4 ring-1 ring-forest/30">
                <Avatar
                  name={data.story.formGuide.improved.displayName}
                  charm={data.story.formGuide.improved.avatarEmoji}
                  size={52}
                />
                <div className="min-w-0 flex-1">
                  <p className="label-caps !text-forest">Most improved</p>
                  <p className="truncate font-display text-2xl text-ink">
                    {data.story.formGuide.improved.displayName}
                  </p>
                </div>
                <span className="font-display text-4xl font-bold tabular-nums text-forest">
                  +{data.story.formGuide.improved.pct}%
                </span>
              </div>
            )}
            {data.story.formGuide.declined && (
              <div className="flex items-center gap-4 rounded-2xl bg-ivory px-5 py-4 ring-1 ring-brick/30">
                <Avatar
                  name={data.story.formGuide.declined.displayName}
                  charm={data.story.formGuide.declined.avatarEmoji}
                  size={52}
                />
                <div className="min-w-0 flex-1">
                  <p className="label-caps !text-brick">Biggest decline</p>
                  <p className="truncate font-display text-2xl text-ink">
                    {data.story.formGuide.declined.displayName}
                  </p>
                </div>
                <span className="font-display text-4xl font-bold tabular-nums text-brick">
                  {data.story.formGuide.declined.pct}%
                </span>
              </div>
            )}
          </div>
          {data.story.formGuide.standouts.length > 0 && (
            <p className="mt-4 text-center text-lg text-sub">
              {data.story.formGuide.standouts.map((s, i) => (
                <span key={i}>
                  {i > 0 && <span className="mx-3 text-faint">·</span>}
                  <span className="font-semibold text-ink">{s.person.displayName}</span>{" "}
                  {s.metric}{" "}
                  <span className={`font-display font-bold ${s.pct > 0 ? "text-forest" : "text-brick"}`}>
                    {s.pct > 0 ? "+" : ""}
                    {s.pct}%
                  </span>
                </span>
              ))}
            </p>
          )}
        </section>
      )}
      {data.story.overtakes.length > 0 && (
        <ul className="mt-6 space-y-2 border-t border-hairline pt-6">
          {data.story.overtakes.map((o, i) => (
            <li key={i} className="flex items-baseline justify-center gap-2 text-lg text-sub">
              <span className="font-semibold text-ink">{o.winner.displayName}</span> swept past{" "}
              <span className="font-semibold text-ink">{o.loser.displayName}</span> in {o.boardTitle}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const championship = hall && (
    <div className="mx-auto flex h-full max-w-4xl flex-col justify-center">
      <header className="mb-8 text-center">
        <p className="label-caps">
          {hall.semesterName} · {hall.weeksCompleted} {hall.weeksCompleted === 1 ? "week" : "weeks"} decided ·
          most crowns takes the title
        </p>
        <h1 className="mt-2 font-display text-6xl font-bold tracking-tight">The Championship</h1>
      </header>
      <ol className="space-y-2">
        {hall.tally.slice(0, top).map((t, i) => (
          <li key={t.displayName} className={i === 0 ? "py-3" : "py-2"}>
            <div className="flex items-center gap-4">
              <Avatar name={t.displayName} charm={t.avatarEmoji} size={i === 0 ? 64 : 48} ring={i === 0} />
              <span className={`shrink truncate font-display ${i === 0 ? "text-4xl font-bold text-ink" : "text-2xl text-sub"}`}>
                {t.displayName}
              </span>
              <span className="dotlead" />
              <span className={`shrink-0 font-display font-bold tabular-nums text-brass ${i === 0 ? "text-5xl" : "text-3xl opacity-90"}`}>
                ♛ {t.crowns}
              </span>
            </div>
          </li>
        ))}
      </ol>
      {hall.weeklyHonors[0] && (
        <p className="mt-8 text-center text-lg text-sub">
          Last week ({formatWeek(hall.weeklyHonors[0].weekStart)}):{" "}
          <span className="font-semibold text-ink">{hall.weeklyHonors[0].person.displayName}</span> took the
          crown with{" "}
          <span className="font-display font-bold text-brass">{hall.weeklyHonors[0].points} pts</span>
        </p>
      )}
    </div>
  );

  const slides = [podium, boards, movers, ...(championship ? [championship] : [])];
  const titles = ["The Podium", "The Boards", "The Movers", ...(championship ? ["The Championship"] : [])];

  return <TvRotator slides={slides} titles={titles} intervalSec={intervalSec} />;
}
