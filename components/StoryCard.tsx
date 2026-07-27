import type { WeeklyStory } from "@/lib/leaderboards";

function Line({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-1.5">
      <span className="mt-0.5 text-lg leading-none">{icon}</span>
      <span className="text-sm text-zinc-300">{children}</span>
    </li>
  );
}

function Name({ p }: { p: { displayName: string; avatarEmoji: string } }) {
  return (
    <span className="font-semibold text-zinc-100">
      {p.avatarEmoji} {p.displayName}
    </span>
  );
}

export default function StoryCard({ story }: { story: WeeklyStory }) {
  const hasAnything =
    story.champion || story.lantern || story.overtakes.length > 0 || story.climber || story.slider;
  if (!hasAnything) return null;

  return (
    <section className="rounded-2xl border border-white/5 bg-surface-raised p-5">
      <header className="mb-2">
        <h2 className="text-lg font-bold">📣 This week&apos;s story</h2>
        <p className="text-xs text-zinc-500">The drama, summarized</p>
      </header>
      <ul>
        {story.champion && (
          <Line icon="🏆">
            <Name p={story.champion} /> rules the group with {story.champion.points}
          </Line>
        )}
        {story.climber && (
          <Line icon="🚀">
            <Name p={story.climber} /> is on the rise — up {story.climber.spots}{" "}
            {story.climber.spots === 1 ? "spot" : "spots"} across the boards
          </Line>
        )}
        {story.overtakes.map((o, i) => (
          <Line key={i} icon="⚔️">
            <Name p={o.winner} /> overtook <Name p={o.loser} /> in {o.boardEmoji} {o.boardTitle}
          </Line>
        ))}
        {story.slider && (
          <Line icon="🫠">
            <Name p={story.slider} /> slipped {story.slider.spots}{" "}
            {story.slider.spots === 1 ? "spot" : "spots"} — rough week
          </Line>
        )}
        {story.lantern && (
          <Line icon="🏮">
            <Name p={story.lantern} /> carries the red lantern. Underdog arc loading…
          </Line>
        )}
      </ul>
    </section>
  );
}
