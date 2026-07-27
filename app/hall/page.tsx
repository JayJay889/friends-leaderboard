import Avatar from "@/components/Avatar";
import GroupTrendsCard from "@/components/GroupTrendsCard";
import { formatWeek, getHallOfFame } from "@/lib/seasons";
import { getGroupTrends } from "@/lib/trends";

export const dynamic = "force-dynamic";

export default async function HallPage() {
  const [hall, trends] = await Promise.all([getHallOfFame(), getGroupTrends()]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="text-center">
        <p className="label-caps">Every completed week crowns a champion</p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">Hall of Fame</h1>
      </header>

      {!hall ? (
        <p className="rounded-2xl border border-hairline bg-card p-8 text-center text-sm text-sub shadow-card">
          No completed weeks yet — the first crown is handed out after the first full Monday-to-Sunday
          week of data.
        </p>
      ) : (
        <>
          {/* Current semester championship */}
          <section className="rounded-2xl border border-brass-soft/40 border-t-2 border-t-brass bg-card p-6 shadow-glow">
            <header className="mb-3 border-b border-hairline pb-3 text-center">
              <p className="label-caps">
                {hall.semesterName} championship · {hall.weeksCompleted}{" "}
                {hall.weeksCompleted === 1 ? "week" : "weeks"} decided
              </p>
            </header>
            {hall.tally.length === 0 ? (
              <p className="py-3 text-center text-sm text-sub">No crowns awarded this semester yet.</p>
            ) : (
              <ol className="divide-y divide-hairline/60">
                {hall.tally.map((t, i) => (
                  <li key={t.displayName} className={`flex items-center gap-4 ${i === 0 ? "-mx-2 rounded-xl bg-ivory px-2 py-3" : "py-2.5"}`}>
                    <Avatar name={t.displayName} charm={t.avatarEmoji} size={i === 0 ? 44 : 36} ring={i === 0} />
                    <span className={`flex-1 truncate ${i === 0 ? "font-display text-xl font-semibold text-ink" : "font-medium text-sub"}`}>
                      {t.displayName}
                      {i === 0 && <span className="label-caps ml-3 !text-brass">leading the semester</span>}
                    </span>
                    <span className={`font-display font-bold tabular-nums text-brass ${i === 0 ? "text-3xl" : "text-xl opacity-80"}`}>
                      ♛ {t.crowns}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-center text-xs text-faint">
              Most weekly crowns when the semester ends takes the title.
            </p>
          </section>

          {/* Weekly honours */}
          <section className="rounded-2xl border border-hairline bg-card p-6 shadow-card">
            <h2 className="label-caps mb-3 border-b border-hairline pb-3">Weekly honours</h2>
            <ol className="divide-y divide-hairline/60">
              {hall.weeklyHonors.slice(0, 12).map((h) => (
                <li key={h.weekStart} className="flex items-center gap-3 py-2">
                  <span className="w-28 shrink-0 text-xs tabular-nums text-faint">{formatWeek(h.weekStart)}</span>
                  <Avatar name={h.person.displayName} charm={h.person.avatarEmoji} size={28} />
                  <span className="flex-1 truncate font-medium">{h.person.displayName}</span>
                  <span className="font-display font-semibold tabular-nums text-brass">{h.points} pts</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Past semesters */}
          {hall.pastSemesters.length > 0 && (
            <section className="rounded-2xl border border-hairline bg-card p-6 shadow-card">
              <h2 className="label-caps mb-3 border-b border-hairline pb-3">Semester champions</h2>
              <ol className="divide-y divide-hairline/60">
                {hall.pastSemesters.map((s) => (
                  <li key={s.name} className="flex items-center gap-3 py-2.5">
                    <span className="w-28 shrink-0 text-xs text-faint">{s.name}</span>
                    <Avatar name={s.champion.displayName} charm={s.champion.avatarEmoji} size={32} />
                    <span className="flex-1 truncate font-display text-lg font-semibold">{s.champion.displayName}</span>
                    <span className="font-display font-bold tabular-nums text-brass">♛ {s.crowns}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {trends && <GroupTrendsCard trends={trends} />}
        </>
      )}
    </div>
  );
}
