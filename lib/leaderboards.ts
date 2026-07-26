import { and, gte, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DailyMetricRow, User } from "@/db/schema";
import { healthScores, rankPercentile, windowStats } from "./scores";
import { demoData } from "./demo";

export interface BoardEntry {
  userId: string;
  displayName: string;
  avatarEmoji: string;
  rank: number;
  /** Human-readable value ("12,304", "78 pts"). Raw values only shown for steps/AZM. */
  display: string;
  /** Raw numbers behind the score — only ever set on the viewer's own row. */
  selfDetail: string | null;
  score: number; // sort key, higher = better
  delta: number | null; // previous-window rank minus current rank (positive = climbed)
}

export interface Board {
  key: string;
  title: string;
  emoji: string;
  subtitle: string;
  entries: BoardEntry[];
}

export interface LeaderboardData {
  boards: Board[];
  composite: BoardEntry[]; // "Healthiest Human"
  windowLabel: string;
  demo: boolean;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

type RawBoard = { userId: string; score: number; display: string }[];

function buildBoardScores(users: User[], rowsByUser: Map<string, DailyMetricRow[]>) {
  const stats = new Map(users.map((u) => [u.id, windowStats(rowsByUser.get(u.id) ?? [])]));

  const steps: RawBoard = [];
  const workouts: RawBoard = [];
  const sleep: RawBoard = [];
  const calm: RawBoard = [];
  for (const u of users) {
    const s = stats.get(u.id)!;
    if (s.avgSteps != null) steps.push({ userId: u.id, score: s.avgSteps, display: `${fmt.format(s.avgSteps)} /day` });
    if (s.totalAzm != null) workouts.push({ userId: u.id, score: s.totalAzm, display: `${fmt.format(s.totalAzm)} min` });
    if (s.avgSleepScore != null) sleep.push({ userId: u.id, score: s.avgSleepScore, display: `${Math.round(s.avgSleepScore)} pts` });
    if (s.avgHrv != null) calm.push({ userId: u.id, score: s.avgHrv, display: "" });
  }
  // Privacy: never show raw HRV to the group — display a group-normalized score.
  if (calm.length > 0) {
    const vals = calm.map((e) => e.score);
    const [min, max] = [Math.min(...vals), Math.max(...vals)];
    for (const e of calm) {
      const norm = max === min ? 100 : Math.round(((e.score - min) / (max - min)) * 100);
      e.display = `${norm} pts`;
    }
  }

  const health: RawBoard = [];
  const healthMap = healthScores(
    users.map((u) => ({
      userId: u.id,
      rhr: stats.get(u.id)!.avgRestingHr,
      vo2: stats.get(u.id)!.avgVo2max,
    })),
  );
  for (const [userId, score] of healthMap) {
    health.push({ userId, score, display: `${score} pts` });
  }

  return { steps, workouts, sleep, health, calm };
}

function rank(raw: RawBoard): Map<string, { rank: number; display: string; score: number; n: number }> {
  const sorted = [...raw].sort((a, b) => b.score - a.score);
  const out = new Map<string, { rank: number; display: string; score: number; n: number }>();
  sorted.forEach((e, i) => out.set(e.userId, { rank: i + 1, display: e.display, score: e.score, n: sorted.length }));
  return out;
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h} h ${String(m).padStart(2, "0")} m`;
}

/** Raw numbers behind a board's score — shown only to the owner of the row. */
function selfDetails(stats: ReturnType<typeof windowStats>): Record<string, string | null> {
  const parts = {
    sleep:
      stats.avgSleepMinutes != null
        ? [
            formatHours(stats.avgSleepMinutes),
            stats.avgDeepMinutes != null && stats.avgRemMinutes != null && stats.avgSleepMinutes > 0
              ? `${Math.round(((stats.avgDeepMinutes + stats.avgRemMinutes) / stats.avgSleepMinutes) * 100)}% deep+REM`
              : null,
            stats.avgSleepEfficiency != null ? `${Math.round(stats.avgSleepEfficiency)}% efficient` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null,
    health:
      stats.avgRestingHr != null
        ? [
            `${Math.round(stats.avgRestingHr)} bpm resting`,
            stats.avgVo2max != null ? `VO₂ ${stats.avgVo2max.toFixed(1)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null,
    calm: stats.avgHrv != null ? `${Math.round(stats.avgHrv)} ms HRV` : null,
  };
  return { steps: null, workouts: null, ...parts };
}

const BOARD_META = [
  { key: "steps", title: "Steps", emoji: "👟", subtitle: "Avg daily steps, last 7 days" },
  { key: "workouts", title: "Workouts", emoji: "🔥", subtitle: "Active Zone Minutes, last 7 days" },
  { key: "sleep", title: "Sleep", emoji: "😴", subtitle: "Our own sleep score — duration, stages & efficiency" },
  { key: "health", title: "Health", emoji: "❤️", subtitle: "Resting heart rate + VO₂ max, scored within the group" },
  { key: "calm", title: "Most Chill", emoji: "🧘", subtitle: "7-day avg HRV — a recovery proxy, not a medical measurement" },
] as const;

export async function getLeaderboardData(viewerUserId?: string | null): Promise<LeaderboardData | null> {
  let users: User[];
  let rows: DailyMetricRow[];
  let prevRows: DailyMetricRow[];

  if (process.env.DEMO_MODE === "1") {
    ({ users, rows, prevRows } = demoData());
    // In demo mode pretend the first fake friend is "you" so the self-detail UI is visible.
    viewerUserId ??= users[0]?.id;
  } else {
    if (!process.env.DATABASE_URL) return null;
    const since = isoDaysAgo(7);
    const prevSince = isoDaysAgo(14);
    users = await db().select().from(schema.users);
    rows = await db().select().from(schema.dailyMetrics).where(gte(schema.dailyMetrics.date, since));
    prevRows = await db()
      .select()
      .from(schema.dailyMetrics)
      .where(and(gte(schema.dailyMetrics.date, prevSince), lt(schema.dailyMetrics.date, since)));
  }

  const byUser = (rs: DailyMetricRow[]) => {
    const m = new Map<string, DailyMetricRow[]>();
    for (const r of rs) {
      if (!m.has(r.userId)) m.set(r.userId, []);
      m.get(r.userId)!.push(r);
    }
    return m;
  };

  const rowsByUser = byUser(rows);
  const current = buildBoardScores(users, rowsByUser);
  const previous = buildBoardScores(users, byUser(prevRows));
  const userById = new Map(users.map((u) => [u.id, u]));
  const viewerDetails = viewerUserId
    ? selfDetails(windowStats(rowsByUser.get(viewerUserId) ?? []))
    : null;

  const boards: Board[] = [];
  const percentiles = new Map<string, number[]>();

  for (const meta of BOARD_META) {
    const curr = rank(current[meta.key]);
    const prev = rank(previous[meta.key]);
    const entries: BoardEntry[] = [];
    for (const [userId, r] of curr) {
      const u = userById.get(userId);
      if (!u) continue;
      const prevRank = prev.get(userId)?.rank ?? null;
      entries.push({
        userId,
        displayName: u.displayName,
        avatarEmoji: u.avatarEmoji,
        rank: r.rank,
        display: r.display,
        selfDetail: userId === viewerUserId ? viewerDetails?.[meta.key] ?? null : null,
        score: r.score,
        delta: prevRank == null ? null : prevRank - r.rank,
      });
      if (!percentiles.has(userId)) percentiles.set(userId, []);
      percentiles.get(userId)!.push(rankPercentile(r.rank, r.n));
    }
    entries.sort((a, b) => a.rank - b.rank);
    boards.push({ ...meta, entries });
  }

  // Composite "Healthiest Human": mean percentile across boards with data, min 3 boards.
  const composite: BoardEntry[] = [];
  for (const [userId, ps] of percentiles) {
    if (ps.length < 3) continue;
    const u = userById.get(userId);
    if (!u) continue;
    const score = ps.reduce((a, b) => a + b, 0) / ps.length;
    composite.push({
      userId,
      displayName: u.displayName,
      avatarEmoji: u.avatarEmoji,
      rank: 0,
      display: `${Math.round(score * 100)} pts`,
      selfDetail: null,
      score,
      delta: null,
    });
  }
  composite.sort((a, b) => b.score - a.score);
  composite.forEach((e, i) => (e.rank = i + 1));

  return {
    boards,
    composite,
    windowLabel: "Rolling 7 days",
    demo: process.env.DEMO_MODE === "1",
  };
}
