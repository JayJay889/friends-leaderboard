import Avatar from "./Avatar";
import type { Board, BoardEntry } from "@/lib/leaderboards";

const MEDAL_STYLES: Record<number, string> = {
  1: "bg-brass text-ivory",
  2: "bg-silverware text-ivory",
  3: "bg-bronzeware text-ivory",
};

// One signature neon per board — the same hue follows the metric everywhere.
// Full class strings so Tailwind can see them.
const BOARD_ACCENT: Record<string, { text: string; border: string; dot: string }> = {
  steps: { text: "text-neon-lime", border: "border-t-neon-lime", dot: "bg-neon-lime" },
  workouts: { text: "text-neon-coral", border: "border-t-neon-coral", dot: "bg-neon-coral" },
  sleep: { text: "text-neon-violet", border: "border-t-neon-violet", dot: "bg-neon-violet" },
  health: { text: "text-neon-pink", border: "border-t-neon-pink", dot: "bg-neon-pink" },
  calm: { text: "text-neon-cyan", border: "border-t-neon-cyan", dot: "bg-neon-cyan" },
};
const GOLD = { text: "text-neon-gold", border: "border-t-neon-gold", dot: "bg-neon-gold" };

export function accentFor(key?: string) {
  return (key && BOARD_ACCENT[key]) || GOLD;
}

export function RankBadge({ rank }: { rank: number }) {
  const medal = MEDAL_STYLES[rank];
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold ${
        medal ?? "text-faint"
      }`}
    >
      {rank}
    </span>
  );
}

function Delta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) {
    return <span className="w-10 text-right text-xs text-faint">·</span>;
  }
  const up = delta > 0;
  return (
    <span className={`w-10 text-right text-xs font-semibold ${up ? "text-forest" : "text-brick"}`}>
      {up ? "▲" : "▼"} {Math.abs(delta)}
    </span>
  );
}

export function EntryRow({
  entry,
  accentText = GOLD.text,
  isLast = false,
}: {
  entry: BoardEntry;
  accentText?: string;
  isLast?: boolean;
}) {
  const leader = entry.rank === 1;
  return (
    <li
      className={
        leader
          ? "-mx-2 rounded-xl bg-ivory px-2 py-2.5"
          : isLast
            ? "-mx-2 rounded-xl border border-brick/25 bg-brick/5 px-2 py-2"
            : "py-2"
      }
    >
      <div className="flex items-center gap-3">
        <RankBadge rank={entry.rank} />
        <Avatar name={entry.displayName} charm={entry.avatarEmoji} size={leader ? 38 : 34} ring={leader} />
        <span className={`min-w-0 flex-1 truncate ${leader ? "font-semibold text-ink" : "font-medium text-sub"}`}>
          {entry.displayName}
          {isLast && (
            <span className="label-caps ml-2 rounded-full border border-brick/40 px-2 py-0.5 !text-[9px] text-brick">
              red lantern
            </span>
          )}
        </span>
        <span
          className={`font-display font-bold tabular-nums ${accentText} ${leader ? "text-2xl" : "text-lg opacity-80"}`}
        >
          {entry.display}
        </span>
        <Delta delta={entry.delta} />
      </div>
      {entry.selfDetail && (
        <p className="ml-[4.6rem] mt-0.5 text-xs text-faint">
          you: <span className="tabular-nums text-sub">{entry.selfDetail}</span>
        </p>
      )}
    </li>
  );
}

export default function LeaderboardCard({ board }: { board: Board }) {
  const accent = accentFor(board.key);
  return (
    <section className={`rounded-2xl border border-hairline border-t-2 ${accent.border} bg-card p-5 shadow-card`}>
      <header className="mb-3 border-b border-hairline pb-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${accent.dot}`} />
          <h2 className="font-display text-xl font-semibold">{board.title}</h2>
        </div>
        <p className="label-caps mt-1">{board.subtitle}</p>
      </header>
      {board.entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-faint">No entries yet — the board awaits.</p>
      ) : (
        <ol className="divide-y divide-hairline/60">
          {board.entries.map((e) => (
            <EntryRow
              key={e.userId}
              entry={e}
              accentText={accent.text}
              isLast={board.entries.length >= 3 && e.rank === board.entries.length}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
