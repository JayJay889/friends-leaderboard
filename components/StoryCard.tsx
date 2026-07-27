import Avatar from "./Avatar";
import type { StoryPerson, WeeklyStory } from "@/lib/leaderboards";

function Name({ p }: { p: StoryPerson }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 font-semibold text-ink">
      <span className="translate-y-1">
        <Avatar name={p.displayName} charm={p.avatarEmoji} size={20} />
      </span>
      {p.displayName}
    </span>
  );
}

function Line({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-3 py-2">
      <span className="label-caps w-24 shrink-0 text-right">{tag}</span>
      <span className="text-sm leading-relaxed text-sub">{children}</span>
    </li>
  );
}

export default function StoryCard({ story }: { story: WeeklyStory }) {
  const hasAnything =
    story.champion || story.lantern || story.overtakes.length > 0 || story.climber || story.slider;
  if (!hasAnything) return null;

  return (
    <section className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
      <header className="mb-2 border-b border-hairline pb-3">
        <p className="label-caps">The week&apos;s dispatch</p>
        <h2 className="mt-1 font-display text-xl font-semibold">Club Notes</h2>
      </header>
      <ul className="divide-y divide-hairline/60">
        {story.champion && (
          <Line tag="Champion">
            <Name p={story.champion} /> rules the group with {story.champion.points}
          </Line>
        )}
        {story.climber && (
          <Line tag="On the rise">
            <Name p={story.climber} /> — up {story.climber.spots}{" "}
            {story.climber.spots === 1 ? "spot" : "spots"} across the boards
          </Line>
        )}
        {story.overtakes.map((o, i) => (
          <Line key={i} tag="Overtaken">
            <Name p={o.winner} /> swept past <Name p={o.loser} /> in {o.boardTitle}
          </Line>
        ))}
        {story.slider && (
          <Line tag="Rough week">
            <Name p={story.slider} /> slipped {story.slider.spots}{" "}
            {story.slider.spots === 1 ? "spot" : "spots"}
          </Line>
        )}
        {story.formGuide.improved && (
          <Line tag="In form">
            <Name p={story.formGuide.improved} /> — {story.formGuide.improved.pct}% better than last
            week across the metrics
          </Line>
        )}
        {story.formGuide.declined && (
          <Line tag="Off form">
            <Name p={story.formGuide.declined} /> — {Math.abs(story.formGuide.declined.pct)}% down on
            last week
          </Line>
        )}
        {story.formGuide.standouts.slice(0, 2).map((s, i) => (
          <Line key={`s${i}`} tag="Standout">
            <Name p={s.person} /> — {s.metric} {s.pct > 0 ? "up" : "down"} {Math.abs(s.pct)}% this week
          </Line>
        ))}
        {story.lantern && (
          <Line tag="Red lantern">
            <Name p={story.lantern} /> holds the lantern — the comeback starts Monday
          </Line>
        )}
      </ul>
    </section>
  );
}
