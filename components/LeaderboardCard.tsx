import type { Board, BoardEntry } from "@/lib/leaderboards";

const MEDALS = ["🥇", "🥈", "🥉"];

function Delta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) {
    return <span className="w-10 text-right text-xs text-zinc-500">—</span>;
  }
  const up = delta > 0;
  return (
    <span className={`w-10 text-right text-xs font-semibold ${up ? "text-emerald-400" : "text-rose-400"}`}>
      {up ? "▲" : "▼"} {Math.abs(delta)}
    </span>
  );
}

export function EntryRow({ entry }: { entry: BoardEntry }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="w-7 text-center text-sm">
        {entry.rank <= 3 ? MEDALS[entry.rank - 1] : <span className="text-zinc-500">{entry.rank}</span>}
      </span>
      <span className="text-xl leading-none">{entry.avatarEmoji}</span>
      <span className="flex-1 truncate font-medium">{entry.displayName}</span>
      <span className="tabular-nums text-sm text-zinc-300">{entry.display}</span>
      <Delta delta={entry.delta} />
    </li>
  );
}

export default function LeaderboardCard({ board }: { board: Board }) {
  return (
    <section className="rounded-2xl border border-white/5 bg-surface-raised p-5 shadow-lg">
      <header className="mb-2">
        <h2 className="text-lg font-bold">
          <span className="mr-2">{board.emoji}</span>
          {board.title}
        </h2>
        <p className="text-xs text-zinc-500">{board.subtitle}</p>
      </header>
      {board.entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">No data yet — connect a Fitbit!</p>
      ) : (
        <ol className="divide-y divide-white/5">
          {board.entries.map((e) => (
            <EntryRow key={e.userId} entry={e} />
          ))}
        </ol>
      )}
    </section>
  );
}
