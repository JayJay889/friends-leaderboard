import Avatar from "./Avatar";
import type { BoardEntry } from "@/lib/leaderboards";

const STEP: Record<number, { h: string; label: string }> = {
  1: { h: "h-24", label: "1st" },
  2: { h: "h-16", label: "2nd" },
  3: { h: "h-11", label: "3rd" },
};

function Spot({ entry, size }: { entry: BoardEntry; size: number }) {
  const step = STEP[entry.rank];
  const first = entry.rank === 1;
  return (
    <div className="flex w-28 flex-col items-center gap-1.5 sm:w-36">
      <Avatar name={entry.displayName} charm={entry.avatarEmoji} size={size} ring={first} />
      <p className="max-w-full truncate text-sm font-semibold tracking-tight text-ink">
        {entry.displayName}
      </p>
      <p className={`font-semibold tabular-nums tracking-tight ${first ? "text-xl text-brass" : "text-base text-sub"}`}>
        {entry.display}
      </p>
      <div
        className={`flex w-full items-start justify-center rounded-t-xl border border-b-0 border-hairline pt-2 text-xs font-semibold ${step.h} ${
          first ? "bg-brass-wash text-brass" : "bg-ivory text-faint"
        }`}
      >
        {step.label}
      </div>
    </div>
  );
}

/** Olympic-style podium for the composite top 3 (order on screen: 2, 1, 3). */
export default function Podium({ entries }: { entries: BoardEntry[] }) {
  const byRank = new Map(entries.map((e) => [e.rank, e]));
  const first = byRank.get(1);
  if (!first) return null;
  const second = byRank.get(2);
  const third = byRank.get(3);

  return (
    <div className="flex items-end justify-center gap-3 border-b border-hairline sm:gap-6">
      {second ? <Spot entry={second} size={56} /> : <div className="w-28 sm:w-36" />}
      <Spot entry={first} size={76} />
      {third ? <Spot entry={third} size={48} /> : <div className="w-28 sm:w-36" />}
    </div>
  );
}
