import { and, gte, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DailyMetricRow, User } from "@/db/schema";
import type { AvatarOptions } from "./avatar";
import { prioritiesFor, resolveByUser } from "./resolve";
import { clubAge, healthScores, rankPercentile, strainScale, windowStats } from "./scores";
import { demoData } from "./demo";

export interface BoardEntry {
  userId: string;
  displayName: string;
  avatarEmoji: string;
  avatarOptions: AvatarOptions | null;
  rank: number;
  /** Human-readable value ("12,304", "78 pts"). Raw values only shown for steps/AZM. */
  display: string;
  /** Raw numbers behind the score — only ever set on the viewer's own row. */
  selfDetail: string | null;
  score: number; // sort key, higher = better
  delta: number | null; // previous-window rank minus current rank (positive = climbed)
  prevRank: number | null;
}

export interface StoryPerson {
  displayName: string;
  avatarEmoji: string;
  avatarOptions: AvatarOptions | null;
}

export interface Overtake {
  boardTitle: string;
  boardEmoji: string;
  winner: StoryPerson;
  loser: StoryPerson;
}

/** The week's narrative: who rules, who trails, who's on the move. */
export interface WeeklyStory {
  champion: (StoryPerson & { points: string }) | null;
  lantern: StoryPerson | null; // composite last place (needs ≥3 people)
  overtakes: Overtake[];
  climber: (StoryPerson & { spots: number }) | null;
  slider: (StoryPerson & { spots: number }) | null;
  /** Everyone with net rank movement this week, biggest climb first. */
  movers: (StoryPerson & { spots: number })[];
  formGuide: FormGuide;
}

/** Value-based (not rank-based) week-over-week change. Positive % = improved. */
export interface FormGuide {
  improved: (StoryPerson & { pct: number }) | null;
  declined: (StoryPerson & { pct: number }) | null;
  standouts: { person: StoryPerson; metric: string; pct: number }[];
}

export interface Board {
  key: string;
  title: string;
  emoji: string;
  subtitle: string;
  entries: BoardEntry[];
}

/**
 * Someone who joined minutes ago. Drives the TV's welcome moment: they scan the
 * QR while standing in front of the screen, and their name should appear on it
 * before they walk away.
 */
export interface Newcomer extends StoryPerson {
  userId: string;
  /** Composite position, or null while they have too little data to rank. */
  rank: number | null;
  fieldSize: number;
  /** Boards they already appear on — proof the connection actually worked. */
  boardsLanded: number;
  boardsTotal: number;
}

/** How long after joining someone still counts as "just joined". */
export const NEWCOMER_WINDOW_MIN = 10;

export interface LeaderboardData {
  boards: Board[];
  composite: BoardEntry[]; // "Healthiest Human"
  story: WeeklyStory;
  newcomers: Newcomer[];
  windowLabel: string;
  demo: boolean;
}

/** Full years between birth date and today. */
export function realAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) return null;
  const age = Math.floor((Date.now() - b.getTime()) / (365.2425 * 86_400_000));
  return age >= 10 && age <= 110 ? age : null;
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

  const strain: RawBoard = [];
  const sleep: RawBoard = [];
  const recovery: RawBoard = [];
  for (const u of users) {
    const s = stats.get(u.id)!;
    if (s.totalAzm != null) strain.push({ userId: u.id, score: s.totalAzm, display: strainScale(s.totalAzm).toFixed(1) });
    if (s.avgSleepScore != null) sleep.push({ userId: u.id, score: s.avgSleepScore, display: `${Math.round(s.avgSleepScore)}` });
    if (s.avgHrv != null) recovery.push({ userId: u.id, score: s.avgHrv, display: "" });
  }
  // Privacy: never show raw HRV — display an index where 100 = group average.
  if (recovery.length > 0) {
    const mean = recovery.reduce((a, e) => a + e.score, 0) / recovery.length;
    for (const e of recovery) {
      e.display = `${Math.max(10, Math.min(200, Math.round((e.score / mean) * 100)))}`;
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
    health.push({ userId, score, display: `${score}` });
  }

  // Age Defied: years your body is younger than your passport. Needs both a
  // body-age estimate and a birth date; only the DIFFERENCE is public.
  const age: RawBoard = [];
  for (const u of users) {
    const body = clubAge(stats.get(u.id)!);
    const real = realAge(u.birthDate);
    if (body != null && real != null) {
      const diff = real - body;
      age.push({ userId: u.id, score: diff, display: `${diff > 0 ? "+" : ""}${diff} yrs` });
    }
  }

  return { strain, sleep, recovery, health, age };
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
function selfDetails(
  stats: ReturnType<typeof windowStats>,
  birthDate: string | null,
): Record<string, string | null> {
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
    recovery: stats.avgHrv != null ? `${Math.round(stats.avgHrv)} ms HRV` : null,
    age:
      clubAge(stats) != null
        ? `body ${clubAge(stats)}${realAge(birthDate) != null ? ` · real ${realAge(birthDate)}` : " · add your birthday on Me"}`
        : null,
  };
  return { strain: null, ...parts };
}

/**
 * "Healthiest Human" composite for an arbitrary window: mean percentile across
 * boards with data, min 3 boards. Shared by the live page and the Hall of Fame's
 * weekly-champion computation so a crown means exactly what the board means.
 */
export function compositeScores(
  users: User[],
  rowsByUser: Map<string, DailyMetricRow[]>,
): (StoryPerson & { userId: string; score: number })[] {
  const scores = buildBoardScores(users, rowsByUser);
  const userById = new Map(users.map((u) => [u.id, u]));
  const pcts = new Map<string, number[]>();
  for (const meta of BOARD_META) {
    for (const [uid, e] of rank(scores[meta.key])) {
      if (!pcts.has(uid)) pcts.set(uid, []);
      pcts.get(uid)!.push(rankPercentile(e.rank, e.n));
    }
  }
  const out: (StoryPerson & { userId: string; score: number })[] = [];
  for (const [uid, ps] of pcts) {
    if (ps.length < 3) continue;
    const u = userById.get(uid);
    if (!u) continue;
    out.push({
      userId: uid,
      displayName: u.displayName,
      avatarEmoji: u.avatarEmoji,
      avatarOptions: u.avatarOptions ?? null,
      score: ps.reduce((a, b) => a + b, 0) / ps.length,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

const BOARD_META = [
  { key: "strain", title: "Strain", emoji: "🔥", subtitle: "Who pushed their body hardest · 0–21 this week" },
  { key: "sleep", title: "Sleep", emoji: "😴", subtitle: "Who recharged best, night after night" },
  { key: "recovery", title: "Battery", emoji: "🔋", subtitle: "Who\u2019s most recharged right now \u00b7 100 = average" },
  { key: "health", title: "Fitness", emoji: "❤️", subtitle: "Who\u2019s the fittest \u2014 strong heart, big engine \u00b7 100 = average" },
  { key: "age", title: "Age Defied", emoji: "🎂", subtitle: "Years younger than your passport — body age vs real age" },
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

  // One member can wear several devices, so collapse per-source rows into one
  // row per day before anything scores them (see lib/resolve.ts).
  const identities =
    process.env.DEMO_MODE === "1"
      ? []
      : await db().select().from(schema.identities);
  const priorities = prioritiesFor(users, identities);
  const rowsByUser = resolveByUser(rows, priorities);
  const prevByUser = resolveByUser(prevRows, priorities);
  const current = buildBoardScores(users, rowsByUser);
  const previous = buildBoardScores(users, prevByUser);
  const userById = new Map(users.map((u) => [u.id, u]));
  const viewerStats = viewerUserId ? windowStats(rowsByUser.get(viewerUserId) ?? []) : null;
  const viewerUser = viewerUserId ? users.find((u) => u.id === viewerUserId) ?? null : null;
  const viewerDetails = viewerStats ? selfDetails(viewerStats, viewerUser?.birthDate ?? null) : null;

  const boards: Board[] = [];

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
        avatarOptions: u.avatarOptions ?? null,
        rank: r.rank,
        display: r.display,
        selfDetail: userId === viewerUserId ? viewerDetails?.[meta.key] ?? null : null,
        score: r.score,
        delta: prevRank == null ? null : prevRank - r.rank,
        prevRank,
      });
    }
    entries.sort((a, b) => a.rank - b.rank);
    boards.push({ ...meta, entries });
  }

  // Composite "Healthiest Human": mean percentile across boards with data, min 3 boards.
  const composite: BoardEntry[] = compositeScores(users, rowsByUser).map((c, i) => ({
    userId: c.userId,
    displayName: c.displayName,
    avatarEmoji: c.avatarEmoji,
    avatarOptions: c.avatarOptions ?? null,
    rank: i + 1,
    display: `${Math.round(c.score * 100)} pts`,
    selfDetail: null,
    score: c.score,
    delta: null,
    prevRank: null,
  }));

  const freshSince = Date.now() - NEWCOMER_WINDOW_MIN * 60_000;
  const newcomers: Newcomer[] = users
    .filter((u) => u.createdAt.getTime() >= freshSince)
    .map((u) => {
      const seat = composite.findIndex((c) => c.userId === u.id);
      return {
        userId: u.id,
        displayName: u.displayName,
        avatarEmoji: u.avatarEmoji,
        avatarOptions: u.avatarOptions ?? null,
        rank: seat === -1 ? null : seat + 1,
        fieldSize: composite.length,
        boardsLanded: boards.filter((b) => b.entries.some((e) => e.userId === u.id)).length,
        boardsTotal: boards.length,
      };
    })
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  return {
    boards,
    composite,
    story: {
      ...buildStory(boards, composite),
      formGuide: buildFormGuide(users, rowsByUser, prevByUser),
    },
    newcomers,
    windowLabel: "Rolling 7 days",
    demo: process.env.DEMO_MODE === "1",
  };
}

/** Value-based week-over-week form: mean % improvement across available metrics. */
function buildFormGuide(
  users: User[],
  currBy: Map<string, DailyMetricRow[]>,
  prevBy: Map<string, DailyMetricRow[]>,
): FormGuide {
  const per: { person: StoryPerson; overall: number; changes: { metric: string; pct: number }[] }[] = [];
  for (const u of users) {
    const c = windowStats(currBy.get(u.id) ?? []);
    const p = windowStats(prevBy.get(u.id) ?? []);
    // [metric, current, previous, sign] — sign -1 where lower is better.
    const defs: [string, number | null, number | null, 1 | -1][] = [
      ["Steps", c.avgSteps, p.avgSteps, 1],
      ["Strain", c.totalAzm, p.totalAzm, 1],
      ["Sleep", c.avgSleepScore, p.avgSleepScore, 1],
      ["Resting HR", c.avgRestingHr, p.avgRestingHr, -1],
      ["Battery", c.avgHrv, p.avgHrv, 1],
    ];
    const changes: { metric: string; pct: number }[] = [];
    for (const [metric, curr, prev, sign] of defs) {
      if (curr == null || prev == null || prev <= 0) continue;
      const pct = Math.round(((curr - prev) / prev) * 100 * sign);
      if (Number.isFinite(pct)) changes.push({ metric, pct });
    }
    if (changes.length === 0) continue;
    per.push({
      person: { displayName: u.displayName, avatarEmoji: u.avatarEmoji, avatarOptions: u.avatarOptions ?? null },
      overall: Math.round(changes.reduce((a, b) => a + b.pct, 0) / changes.length),
      changes,
    });
  }
  per.sort((a, b) => b.overall - a.overall);

  const best = per[0];
  const worst = per[per.length - 1];
  return {
    improved: best && best.overall >= 1 ? { ...best.person, pct: best.overall } : null,
    declined: worst && worst.overall <= -1 && worst !== best ? { ...worst.person, pct: worst.overall } : null,
    standouts: per
      .flatMap((x) => x.changes.map((ch) => ({ person: x.person, ...ch })))
      .filter((s) => Math.abs(s.pct) >= 3)
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 3),
  };
}

/** Derives the week's narrative from ranked boards + composite. */
function buildStory(boards: Board[], composite: BoardEntry[]): Omit<WeeklyStory, "formGuide"> {
  const person = (e: BoardEntry): StoryPerson => ({
    displayName: e.displayName,
    avatarEmoji: e.avatarEmoji,
    avatarOptions: e.avatarOptions,
  });

  // Overtakes: on each board, A now above B but B was above A last week.
  const overtakes: Overtake[] = [];
  for (const b of boards) {
    for (const a of b.entries) {
      if (a.prevRank == null) continue;
      for (const o of b.entries) {
        if (o.prevRank == null || o.rank <= a.rank) continue;
        if (o.prevRank < a.prevRank) {
          overtakes.push({
            boardTitle: b.title,
            boardEmoji: b.emoji,
            winner: person(a),
            loser: person(o),
          });
        }
      }
    }
  }

  // Biggest climber / slider: summed rank movement across all boards.
  const movement = new Map<string, { p: StoryPerson; spots: number }>();
  for (const b of boards) {
    for (const e of b.entries) {
      if (e.delta == null) continue;
      const m = movement.get(e.userId) ?? { p: person(e), spots: 0 };
      m.spots += e.delta;
      movement.set(e.userId, m);
    }
  }
  const moves = [...movement.values()].sort((a, b) => b.spots - a.spots);
  const climber = moves[0]?.spots > 0 ? { ...moves[0].p, spots: moves[0].spots } : null;
  const last = moves[moves.length - 1];
  const slider = last && last.spots < 0 ? { ...last.p, spots: -last.spots } : null;

  return {
    champion: composite[0] ? { ...person(composite[0]), points: composite[0].display } : null,
    lantern: composite.length >= 3 ? person(composite[composite.length - 1]) : null,
    overtakes: overtakes.slice(0, 4),
    climber,
    slider,
    movers: moves.filter((m) => m.spots !== 0).map((m) => ({ ...m.p, spots: m.spots })),
  };
}
