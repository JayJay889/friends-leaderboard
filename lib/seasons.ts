import { db, schema } from "@/db";
import type { DailyMetricRow, User } from "@/db/schema";
import { demoData } from "./demo";
import { compositeScores, efficiencyBaselines, type StoryPerson } from "./leaderboards";
import { prioritiesFor, resolveByUser } from "./resolve";
import { mondayOf } from "./trends";

/**
 * Seasons & Hall of Fame — everything is derived from daily_metrics history:
 * each completed week (Mon–Sun) crowns a weekly champion (composite #1),
 * crowns accumulate, most crowns wins the semester
 * (Summer = Apr–Sep, Winter = Oct–Mar, German university style).
 */

export interface WeeklyHonor {
  weekStart: string; // ISO Monday
  person: StoryPerson;
  points: number; // composite score 0–100
}

export interface HallOfFame {
  semesterName: string;
  weeksCompleted: number;
  tally: (StoryPerson & { crowns: number })[];
  weeklyHonors: WeeklyHonor[]; // newest first
  pastSemesters: { name: string; champion: StoryPerson; crowns: number }[];
}

function semesterOf(isoDate: string): { name: string; key: string } {
  const [y, m] = isoDate.split("-").map(Number);
  if (m >= 4 && m <= 9) return { name: `Summer ${y}`, key: `${y}-S` };
  const startYear = m >= 10 ? y : y - 1;
  return { name: `Winter ${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`, key: `${startYear}-W` };
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getHallOfFame(): Promise<HallOfFame | null> {
  let users: User[];
  let rows: DailyMetricRow[];
  if (process.env.DEMO_MODE === "1") {
    ({ users } = demoData());
    rows = demoData().allRows;
  } else {
    if (!process.env.DATABASE_URL) return null;
    users = await db().select().from(schema.users);
    rows = await db().select().from(schema.dailyMetrics);
    // Collapse multi-device rows before any week is scored, so crowns are decided
    // on the same resolved numbers the boards show.
    const identities = await db().select().from(schema.identities);
    rows = [...resolveByUser(rows, prioritiesFor(users, identities)).values()].flat();
  }
  if (rows.length === 0) return null;

  // Baselines come from the whole history rather than the week being judged, so
  // a week is scored against how that person usually sleeps.
  const baselines = efficiencyBaselines(rows);

  const currentWeekStart = mondayOf(new Date().toISOString().slice(0, 10));

  // Bucket rows into completed weeks only.
  const byWeek = new Map<string, Map<string, DailyMetricRow[]>>();
  for (const r of rows) {
    const wk = mondayOf(r.date);
    if (wk >= currentWeekStart) continue; // current week isn't decided yet
    if (!byWeek.has(wk)) byWeek.set(wk, new Map());
    const perUser = byWeek.get(wk)!;
    if (!perUser.has(r.userId)) perUser.set(r.userId, []);
    perUser.get(r.userId)!.push(r);
  }

  const honors: WeeklyHonor[] = [];
  for (const wk of [...byWeek.keys()].sort()) {
    const winner = compositeScores(users, byWeek.get(wk)!, baselines)[0];
    if (!winner) continue;
    honors.push({
      weekStart: wk,
      person: { displayName: winner.displayName, avatarEmoji: winner.avatarEmoji, avatarOptions: winner.avatarOptions },
      points: Math.round(winner.score * 100),
    });
  }
  if (honors.length === 0) return null;

  const currentSemester = semesterOf(currentWeekStart);
  const tallyFor = (list: WeeklyHonor[]) => {
    const m = new Map<string, StoryPerson & { crowns: number }>();
    for (const h of list) {
      const e = m.get(h.person.displayName) ?? { ...h.person, crowns: 0 };
      e.crowns += 1;
      m.set(h.person.displayName, e);
    }
    return [...m.values()].sort((a, b) => b.crowns - a.crowns);
  };

  const bySemester = new Map<string, { name: string; honors: WeeklyHonor[] }>();
  for (const h of honors) {
    const s = semesterOf(h.weekStart);
    if (!bySemester.has(s.key)) bySemester.set(s.key, { name: s.name, honors: [] });
    bySemester.get(s.key)!.honors.push(h);
  }

  const pastSemesters = [...bySemester.entries()]
    .filter(([key]) => key !== currentSemester.key)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([, s]) => {
      const [champ] = tallyFor(s.honors);
      return {
        name: s.name,
        champion: { displayName: champ.displayName, avatarEmoji: champ.avatarEmoji, avatarOptions: champ.avatarOptions },
        crowns: champ.crowns,
      };
    });

  const currentHonors = bySemester.get(currentSemester.key)?.honors ?? [];
  return {
    semesterName: currentSemester.name,
    weeksCompleted: currentHonors.length,
    tally: tallyFor(currentHonors),
    weeklyHonors: [...honors].reverse(),
    pastSemesters,
  };
}

export function formatWeek(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(`${addDaysIso(weekStart, 6)}T00:00:00Z`);
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt.format(d)} – ${fmt.format(end)}`;
}
