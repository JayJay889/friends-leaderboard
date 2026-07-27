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

function Line({ tag, chip, children }: { tag: string; chip: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-1.5">
      <span
        className={`mt-0.5 w-24 shrink-0 rounded-full px-2 py-1 text-center text-[10px] font-semibold leading-none ${chip}`}
      >
        {tag}
      </span>
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
      <header className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight">Club Notes</h2>
        <p className="mt-0.5 text-xs text-faint">The week&apos;s drama, summarized</p>
      </header>
      <ul>
        {story.champion && (
          <Line tag="Champion" chip="bg-brass-wash text-brass">
            <Name p={story.champion} /> rules the group with {story.champion.points}
          </Line>
        )}
        {story.climber && (
          <Line tag="On the rise" chip="bg-forest-wash text-forest">
            <Name p={story.climber} /> — up {story.climber.spots}{" "}
            {story.climber.spots === 1 ? "spot" : "spots"} across the boards
          </Line>
        )}
        {story.overtakes.map((o, i) => (
          <Line key={i} tag="Overtaken" chip="bg-wash-violet text-neon-violet">
            <Name p={o.winner} /> swept past <Name p={o.loser} /> in {o.boardTitle}
          </Line>
        ))}
        {story.formGuide.improved && (
          <Line tag="In form" chip="bg-wash-cyan text-neon-cyan">
            <Name p={story.formGuide.improved} /> — {story.formGuide.improved.pct}% better than last
            week across the metrics
          </Line>
        )}
        {story.formGuide.declined && (
          <Line tag="Off form" chip="bg-wash-coral text-neon-coral">
            <Name p={story.formGuide.declined} /> — {Math.abs(story.formGuide.declined.pct)}% down on
            last week
          </Line>
        )}
        {story.formGuide.standouts.slice(0, 2).map((s, i) => (
          <Line key={`s${i}`} tag="Standout" chip="bg-wash-pink text-neon-pink">
            <Name p={s.person} /> — {s.metric} {s.pct > 0 ? "up" : "down"} {Math.abs(s.pct)}% this week
          </Line>
        ))}
        {story.slider && (
          <Line tag="Rough week" chip="bg-brick/10 text-brick">
            <Name p={story.slider} /> slipped {story.slider.spots}{" "}
            {story.slider.spots === 1 ? "spot" : "spots"}
          </Line>
        )}
        {story.lantern && (
          <Line tag="Red lantern" chip="bg-brick/10 text-brick">
            <Name p={story.lantern} /> holds the lantern — the comeback starts Monday
          </Line>
        )}
      </ul>
    </section>
  );
}
