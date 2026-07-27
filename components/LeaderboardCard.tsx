import Avatar from "./Avatar";
import type { Board, BoardEntry } from "@/lib/leaderboards";

// One accent per board: dot + numbers + leader wash. Cards stay white.
const ACCENT: Record<string, { text: string; dot: string; wash: string }> = {
  steps: { text: "text-neon-lime", dot: "bg-neon-lime", wash: "bg-wash-lime" },
  workouts: { text: "text-neon-coral", dot: "bg-neon-coral", wash: "bg-wash-coral" },
  sleep: { text: "text-neon-violet", dot: "bg-neon-violet", wash: "bg-wash-violet" },
  health: { text: "text-neon-pink", dot: "bg-neon-pink", wash: "bg-wash-pink" },
  calm: { text: "text-neon-cyan", dot: "bg-neon-cyan", wash: "bg-wash-cyan" },
  age: { text: "text-neon-indigo", dot: "bg-neon-indigo", wash: "bg-wash-indigo" },
};
const GOLD = { text: "text-brass", dot: "bg-brass", wash: "bg-brass-wash" };

export function accentFor(key?: string) {
  return (key && ACCENT[key]) || GOLD;
}

function Delta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) {
    return <span className="w-8 text-right text-xs text-faint">–</span>;
  }
  const up = delta > 0;
  return (
    <span className={`w-8 text-right text-xs font-semibold ${up ? "text-forest" : "text-brick"}`}>
      {up ? "↑" : "↓"}{Math.abs(delta)}
    </span>
  );
}

export function EntryRow({
  entry,
  accentText = "text-brass",
  accentWash = "bg-brass-wash",
  isLast = false,
}: {
  entry: BoardEntry;
  accentText?: string;
  accentWash?: string;
  isLast?: boolean;
}) {
  const leader = entry.rank === 1;
  return (
    <li className={`rounded-xl px-2.5 ${leader ? `${accentWash} py-2.5` : isLast ? "bg-brick/5 py-2" : "py-2"}`}>
      <div className="flex items-center gap-3">
        <span className={`w-6 shrink-0 text-center text-sm font-semibold tabular-nums ${leader ? accentText : "text-faint"}`}>
          {entry.rank}
        </span>
        <Avatar name={entry.displayName} charm={entry.avatarEmoji} size={leader ? 36 : 30} ring={leader} />
        <span className={`shrink truncate ${leader ? "text-[15px] font-semibold text-ink" : "text-sm font-medium text-sub"}`}>
          {entry.displayName}
        </span>
        {isLast && (
          <span className="shrink-0 rounded-full bg-brick/10 px-2 py-0.5 text-[10px] font-semibold text-brick">
            red lantern
          </span>
        )}
        <span className="flex-1" />
        <span className={`shrink-0 font-semibold tabular-nums tracking-tight ${isLast ? "text-brick" : accentText} ${leader ? "text-xl" : "text-sm"}`}>
          {entry.display}
        </span>
        <Delta delta={entry.delta} />
      </div>
      {entry.selfDetail && (
        <p className="ml-[4.7rem] pb-0.5 text-xs text-faint">
          you: <span className="tabular-nums text-sub">{entry.selfDetail}</span>
        </p>
      )}
    </li>
  );
}

export default function LeaderboardCard({
  board,
  maxEntries,
}: {
  board: Board;
  /** Cap the list to the top N; the red-lantern row stays pinned after an ellipsis. */
  maxEntries?: number;
}) {
  const accent = accentFor(board.key);
  const all = board.entries;
  const hasLantern = all.length >= 3;
  const capped = maxEntries != null && all.length > maxEntries;
  const visible = capped ? all.slice(0, maxEntries) : all;
  const lantern = capped && hasLantern ? all[all.length - 1] : null;
  const hiddenCount = capped ? all.length - visible.length - (lantern ? 1 : 0) : 0;

  return (
    <section className="rounded-2xl border border-hairline bg-card p-4 shadow-card">
      <header className="mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${accent.dot}`} />
          <h2 className="text-lg font-semibold tracking-tight">{board.title}</h2>
        </div>
        <p className="mt-0.5 text-xs text-faint">{board.subtitle}</p>
      </header>
      {all.length === 0 ? (
        <p className="py-5 text-center text-sm text-faint">No entries yet.</p>
      ) : (
        <ol className="divide-y divide-hairline/50">
          {visible.map((e) => (
            <EntryRow
              key={e.userId}
              entry={e}
              accentText={accent.text}
              accentWash={accent.wash}
              isLast={hasLantern && e.rank === all.length}
            />
          ))}
          {hiddenCount > 0 && (
            <li className="py-1 text-center text-xs text-faint">+ {hiddenCount} more</li>
          )}
          {lantern && (
            <EntryRow entry={lantern} accentText={accent.text} accentWash={accent.wash} isLast />
          )}
        </ol>
      )}
    </section>
  );
}
