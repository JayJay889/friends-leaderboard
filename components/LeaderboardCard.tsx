import Avatar from "./Avatar";
import type { Board, BoardEntry } from "@/lib/leaderboards";

const ROMAN: Record<string, string> = {
  steps: "I",
  workouts: "II",
  sleep: "III",
  health: "IV",
  calm: "V",
};

// Kept for compatibility: value color only. Boards print in ink, composite in gold.
export function accentFor(key?: string) {
  return { text: key ? "text-ink" : "text-brass" };
}

function Delta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) {
    return <span className="w-8 text-right text-xs text-faint">·</span>;
  }
  const up = delta > 0;
  return (
    <span className={`w-8 text-right text-xs font-semibold ${up ? "text-forest" : "text-brick"}`}>
      {up ? "▲" : "▼"}{Math.abs(delta)}
    </span>
  );
}

export function EntryRow({
  entry,
  accentText = "text-brass",
  isLast = false,
}: {
  entry: BoardEntry;
  accentText?: string;
  isLast?: boolean;
}) {
  const leader = entry.rank === 1;
  return (
    <li className={leader ? "py-2.5" : "py-1.5"}>
      <div className="flex items-center gap-2.5">
        <span className={`w-7 shrink-0 text-right font-display ${leader ? "text-lg font-semibold" : "text-sm text-faint"}`}>
          {entry.rank}.
        </span>
        <Avatar name={entry.displayName} charm={entry.avatarEmoji} size={leader ? 36 : 28} ring={leader} />
        <span className={`shrink truncate ${leader ? "font-display text-xl font-semibold text-ink" : "text-[15px] text-sub"}`}>
          {leader && <span className="mr-1.5 text-brass">♛</span>}
          {entry.displayName}
        </span>
        {isLast && (
          <span className="label-caps shrink-0 !text-[9px] !text-brick">red lantern</span>
        )}
        <span className="dotlead" />
        <span
          className={`shrink-0 font-display font-bold tabular-nums ${
            isLast ? "text-brick" : accentText
          } ${leader ? "text-2xl" : "text-base"}`}
        >
          {entry.display}
        </span>
        <Delta delta={entry.delta} />
      </div>
      {entry.selfDetail && (
        <p className="ml-[4.7rem] text-xs text-faint">
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
  const all = board.entries;
  const hasLantern = all.length >= 3;
  const capped = maxEntries != null && all.length > maxEntries;
  const visible = capped ? all.slice(0, maxEntries) : all;
  const lantern = capped && hasLantern ? all[all.length - 1] : null;
  const hiddenCount = capped ? all.length - visible.length - (lantern ? 1 : 0) : 0;

  return (
    <section>
      <header className="border-b-2 border-ink pb-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold">
            <span className="mr-2 text-base text-faint">{ROMAN[board.key] ?? "·"}.</span>
            {board.title}
          </h2>
        </div>
        <p className="label-caps mt-0.5">{board.subtitle}</p>
      </header>
      {all.length === 0 ? (
        <p className="py-5 text-center text-sm text-faint">No entries yet — the board awaits.</p>
      ) : (
        <ol className="pt-1.5">
          {visible.map((e) => (
            <EntryRow
              key={e.userId}
              entry={e}
              accentText="text-ink"
              isLast={hasLantern && e.rank === all.length}
            />
          ))}
          {hiddenCount > 0 && (
            <li className="py-0.5 text-center text-xs tracking-widest text-faint">
              ··· {hiddenCount} more ···
            </li>
          )}
          {lantern && <EntryRow entry={lantern} accentText="text-ink" isLast />}
        </ol>
      )}
    </section>
  );
}
