import type { DailyMetricRow, User } from "@/db/schema";

/**
 * Deterministic fake data for DEMO_MODE=1 — lets you preview the UI with no
 * database or Google connection. Seeded PRNG so every render looks the same.
 */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

const FRIENDS = [
  { name: "Mira", emoji: "🦊", fitness: 0.9 },
  { name: "Jonas", emoji: "🐻", fitness: 0.55 },
  { name: "Lea", emoji: "🦉", fitness: 0.75 },
  { name: "Sam", emoji: "🐸", fitness: 0.4 },
  { name: "Nadia", emoji: "🐬", fitness: 0.65 },
];

export function demoData(): { users: User[]; rows: DailyMetricRow[]; prevRows: DailyMetricRow[] } {
  const users: User[] = FRIENDS.map((f, i) => ({
    id: `demo-${i}`,
    displayName: f.name,
    avatarEmoji: f.emoji,
    googleUserId: `demo-google-${i}`,
    createdAt: new Date("2026-07-01T00:00:00Z"),
  }));

  const rows: DailyMetricRow[] = [];
  const prevRows: DailyMetricRow[] = [];
  for (let i = 0; i < FRIENDS.length; i++) {
    const f = FRIENDS[i];
    const rand = lcg(42 + i * 7);
    for (let d = 0; d < 14; d++) {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - d);
      const sleepMin = Math.round(360 + f.fitness * 90 + rand() * 90);
      const row: DailyMetricRow = {
        userId: users[i].id,
        date: date.toISOString().slice(0, 10),
        steps: Math.round(4000 + f.fitness * 9000 + rand() * 4000),
        activeZoneMinutes: Math.round(10 + f.fitness * 60 + rand() * 30),
        restingHeartRate: Math.round(72 - f.fitness * 16 + rand() * 4),
        sleepMinutes: sleepMin,
        sleepEfficiency: Math.round((85 + f.fitness * 8 + rand() * 5) * 10) / 10,
        deepMinutes: Math.round(sleepMin * (0.12 + f.fitness * 0.06)),
        remMinutes: Math.round(sleepMin * (0.16 + f.fitness * 0.06)),
        hrvDailyRmssd: Math.round((25 + f.fitness * 45 + rand() * 15) * 10) / 10,
        breathingRate: Math.round((13 + rand() * 3) * 10) / 10,
        vo2maxEstimate: Math.round((35 + f.fitness * 18 + rand() * 2) * 10) / 10,
        syncedAt: new Date(),
      };
      // Sam declined heart-rate scopes — demos the partial-grant path.
      if (i === 3) {
        row.restingHeartRate = null;
        row.hrvDailyRmssd = null;
        row.vo2maxEstimate = null;
      }
      (d < 7 ? rows : prevRows).push(row);
    }
  }
  return { users, rows, prevRows };
}
