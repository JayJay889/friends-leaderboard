import Avatar from "./Avatar";
import Ring, { bandColor } from "./Ring";
import type { Board, BoardEntry } from "@/lib/leaderboards";

// WHOOP metric colors per pillar (recovery scores are additionally band-colored).
const ACCENT: Record<string, { hex: string; text: string }> = {
  strain: { hex: "#0093E7", text: "text-metric-strain" },
  sleep: { hex: "#7BA1BB", text: "text-metric-sleep" },
  recovery: { hex: "#67AEE6", text: "text-metric-recovery" },
  health: { hex: "#00F19F", text: "text-metric-health" },
  age: { hex: "#9FB0BA", text: "text-metric-age" },
};
const GOLD = { hex: "#00F19F", text: "text-brass" };

export function accentFor(key?: string) {
  return (key && ACCENT[key]) || GOLD;
}

function Delta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) {
    return <span className="w-5 text-right text-xs text-faint">–</span>;
  }
  const up = delta > 0;
  return (
    <span className={`w-5 text-right font-num text-xs font-semibold ${up ? "text-forest" : "text-brick"}`}>
      {up ? "▲" : "▼"}{Math.abs(delta)}
    </span>
  );
}

/** Value color: recovery-style boards band their scores WHOOP-style. */
function valueColor(boardKey: string | undefined, entry: BoardEntry, fallback: string): string {
  if (boardKey === "recovery") {
    const n = parseInt(entry.display, 10);
    if (!Number.isNaN(n)) return bandColor(n);
  }
  return fallback;
}

export function EntryRow({
  entry,
  boardKey,
  isLast = false,
}: {
  entry: BoardEntry;
  boardKey?: string;
  isLast?: boolean;
}) {
  const accent = accentFor(boardKey);
  const leader = entry.rank === 1;
  return (
    <li className={`rounded-xl px-2.5 ${leader ? "bg-white/5 py-2.5" : isLast ? "bg-brick/10 py-2" : "py-2"}`}>
      <div className="flex items-center gap-2.5">
        <span className={`w-6 shrink-0 text-center font-num text-sm font-semibold ${leader ? "text-ink" : "text-faint"}`}>
          {entry.rank}
        </span>
        <Avatar name={entry.displayName} charm={entry.avatarEmoji} size={leader ? 36 : 30} ring={leader} />
        <span
          className={`min-w-[3.5rem] flex-1 truncate ${leader ? "font-display text-[15px] font-semibold text-ink" : "text-sm font-medium text-sub"}`}
        >
          {entry.displayName}
        </span>
        {isLast && (
          <span className="hl shrink-0 rounded-full bg-brick/15 px-2 py-0.5 !text-[9px] text-brick">
            red lantern
          </span>
        )}
        <span
          className={`shrink-0 font-num font-bold tabular-nums ${leader ? "text-2xl" : "text-base"}`}
          style={{ color: isLast ? "#FF0026" : valueColor(boardKey, entry, leader ? accent.hex : "#FFFFFF") }}
        >
          {entry.display}
        </span>
        <Delta delta={entry.delta} />
      </div>
      {entry.selfDetail && (
        <p className="ml-[4.6rem] pb-0.5 text-xs text-faint">
          you: <span className="font-num tabular-nums text-sub">{entry.selfDetail}</span>
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

  const leader = all[0];
  const maxScore = leader ? Math.max(...all.map((e) => e.score)) : 0;
  // Ring fill: score-boards fill with the score itself; open-ended boards
  // (strain) fill relative to the leader. Age is rank-only — no ring.
  const ringValue =
    leader == null
      ? 0
      : board.key === "strain"
        ? 100
        : Math.max(0, Math.min(100, parseInt(leader.display, 10) || (maxScore ? (leader.score / maxScore) * 100 : 0)));
  const ringColor =
    board.key === "recovery" && leader ? bandColor(parseInt(leader.display, 10) || 0) : accent.hex;
  const showRing = leader != null && board.key !== "age";

  return (
    <section className="rounded-2xl border border-hairline bg-card p-4 shadow-card">
      <header className="mb-3 px-1">
        <h2 className="hl text-xs" style={{ color: accent.hex }}>
          {board.title}
        </h2>
        <p className="mt-1 text-xs text-faint">{board.subtitle}</p>
      </header>
      {all.length === 0 ? (
        <p className="py-5 text-center text-sm text-faint">No entries yet.</p>
      ) : (
        <>
          {showRing && (
            <div className="mb-2 flex items-center gap-4 px-1 pb-3">
              <Ring value={ringValue} color={ringColor} size={92}>
                <span className="font-num text-2xl font-bold tabular-nums text-ink">
                  {leader.display.split(" ")[0]}
                </span>
                {leader.display.includes(" ") && (
                  <span className="text-[10px] text-faint">{leader.display.split(" ").slice(1).join(" ")}</span>
                )}
              </Ring>
              <div className="min-w-0">
                <p className="label-caps">Leader</p>
                <p className="flex items-center gap-2 truncate font-display text-lg font-semibold text-ink">
                  <Avatar name={leader.displayName} charm={leader.avatarEmoji} size={26} ring />
                  {leader.displayName}
                </p>
                {leader.selfDetail && (
                  <p className="text-xs text-faint">
                    you: <span className="font-num text-sub">{leader.selfDetail}</span>
                  </p>
                )}
              </div>
            </div>
          )}
          <ol className="divide-y divide-hairline/50 border-t border-hairline/50">
            {(showRing ? visible.slice(1) : visible).map((e) => (
              <EntryRow key={e.userId} entry={e} boardKey={board.key} isLast={hasLantern && e.rank === all.length} />
            ))}
            {hiddenCount > 0 && (
              <li className="py-1 text-center text-xs text-faint">+ {hiddenCount} more</li>
            )}
            {lantern && <EntryRow entry={lantern} boardKey={board.key} isLast />}
          </ol>
        </>
      )}
    </section>
  );
}
