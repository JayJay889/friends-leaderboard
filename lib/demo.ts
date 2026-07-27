import type { DailyMetricRow, User } from "@/db/schema";

/**
 * Deterministic fake data for DEMO_MODE=1 — lets you preview the UI with no
 * database or Google connection. Seeded PRNG so every render looks the same.
 * Generates 10 weeks of history with per-friend trajectories so the story
 * and trend features have something to chew on.
 */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

// `trend` = how much this friend improves (+) or slips (-) over the 10 weeks.
const FRIENDS = [
  { name: "Mira", emoji: "🦊", fitness: 0.9, trend: 0.15 },
  { name: "Jonas", emoji: "🐻", fitness: 0.45, trend: 0.9 }, // comeback story
  { name: "Lea", emoji: "🦉", fitness: 0.8, trend: -0.5 },
  { name: "Sam", emoji: "🐸", fitness: 0.4, trend: 0.3 },
  { name: "Nadia", emoji: "🐬", fitness: 0.65, trend: -0.15 },
];

const DAYS = 70; // 10 weeks

export function demoData(): {
  users: User[];
  rows: DailyMetricRow[]; // current 7-day window
  prevRows: DailyMetricRow[]; // the 7 days before that
  allRows: DailyMetricRow[]; // full history for trends
} {
  const users: User[] = FRIENDS.map((f, i) => ({
    id: `demo-${i}`,
    displayName: f.name,
    avatarEmoji: f.emoji,
    googleUserId: `demo-google-${i}`,
    createdAt: new Date("2026-05-01T00:00:00Z"),
  }));

  const allRows: DailyMetricRow[] = [];
  for (let i = 0; i < FRIENDS.length; i++) {
    const f = FRIENDS[i];
    const rand = lcg(42 + i * 7);
    for (let d = 0; d < DAYS; d++) {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - d);
      // 0 for the oldest day, 1 for today — drives the per-friend trajectory.
      const progress = (DAYS - 1 - d) / (DAYS - 1);
      const level = Math.min(1.1, Math.max(0.15, f.fitness + f.trend * 0.35 * progress));
      const sleepMin = Math.round(360 + level * 90 + rand() * 90);
      const row: DailyMetricRow = {
        userId: users[i].id,
        date: date.toISOString().slice(0, 10),
        steps: Math.round(4000 + level * 9000 + rand() * 4000),
        activeZoneMinutes: Math.round(10 + level * 60 + rand() * 30),
        restingHeartRate: Math.round(72 - level * 16 + rand() * 4),
        sleepMinutes: sleepMin,
        sleepEfficiency: Math.round((85 + level * 8 + rand() * 5) * 10) / 10,
        deepMinutes: Math.round(sleepMin * (0.12 + level * 0.06)),
        remMinutes: Math.round(sleepMin * (0.16 + level * 0.06)),
        hrvDailyRmssd: Math.round((25 + level * 45 + rand() * 15) * 10) / 10,
        breathingRate: Math.round((13 + rand() * 3) * 10) / 10,
        vo2maxEstimate: Math.round((35 + level * 18 + rand() * 2) * 10) / 10,
        syncedAt: new Date(),
      };
      // Sam declined heart-rate scopes — demos the partial-grant path.
      if (i === 3) {
        row.restingHeartRate = null;
        row.hrvDailyRmssd = null;
        row.vo2maxEstimate = null;
      }
      allRows.push(row);
    }
  }

  const today = new Date();
  const daysAgo = (r: DailyMetricRow) =>
    Math.floor((today.getTime() - new Date(`${r.date}T00:00:00Z`).getTime()) / 86_400_000);
  return {
    users,
    rows: allRows.filter((r) => daysAgo(r) < 7),
    prevRows: allRows.filter((r) => daysAgo(r) >= 7 && daysAgo(r) < 14),
    allRows,
  };
}
