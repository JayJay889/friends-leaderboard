import Avatar from "./Avatar";
import type { Board, BoardEntry } from "@/lib/leaderboards";

const MEDAL_STYLES: Record<number, string> = {
  1: "bg-brass text-ivory",
  2: "bg-silverware text-ivory",
  3: "bg-bronzeware text-ivory",
};

export function RankBadge({ rank }: { rank: number }) {
  const medal = MEDAL_STYLES[rank];
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full font-display text-sm font-semibold ${
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
    <span className={`w-10 text-right text-xs font-semibold ${up ? "text-forest-soft" : "text-brick"}`}>
      {up ? "▲" : "▼"} {Math.abs(delta)}
    </span>
  );
}

export function EntryRow({ entry }: { entry: BoardEntry }) {
  return (
    <li className="py-2">
      <div className="flex items-center gap-3">
        <RankBadge rank={entry.rank} />
        <Avatar name={entry.displayName} charm={entry.avatarEmoji} size={34} ring={entry.rank === 1} />
        <span className="flex-1 truncate font-medium">{entry.displayName}</span>
        <span className="font-display text-base font-semibold tabular-nums">{entry.display}</span>
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
  return (
    <section className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
      <header className="mb-3 border-b border-hairline pb-3">
        <p className="label-caps">{board.subtitle}</p>
        <h2 className="mt-1 font-display text-xl font-semibold">{board.title}</h2>
      </header>
      {board.entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-faint">No entries yet — the board awaits.</p>
      ) : (
        <ol className="divide-y divide-hairline/60">
          {board.entries.map((e) => (
            <EntryRow key={e.userId} entry={e} />
          ))}
        </ol>
      )}
    </section>
  );
}
