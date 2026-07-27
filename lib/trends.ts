import { gte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DailyMetricRow } from "@/db/schema";
import { demoData } from "./demo";
import { sleepScore } from "./scores";

const WEEKS = 10;

export interface TrendSeries {
  key: "steps" | "sleepScore" | "hrv";
  label: string;
  emoji: string;
  /** Weekly group averages, oldest → newest. Null = no data that week. */
  values: (number | null)[];
  /** Latest week vs the week before, in percent. Null if either is missing. */
  changePct: number | null;
  format: (v: number) => string;
}

export interface GroupTrends {
  weekStarts: string[]; // ISO Monday dates, oldest → newest
  series: TrendSeries[];
  /** Mean of the three change percentages — the "is the group improving?" verdict. */
  overallChangePct: number | null;
}

/** ISO date of the Monday of the week containing `isoDate`. */
export function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

function avg(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export async function getGroupTrends(): Promise<GroupTrends | null> {
  let rows: DailyMetricRow[];
  if (process.env.DEMO_MODE === "1") {
    rows = demoData().allRows;
  } else {
    if (!process.env.DATABASE_URL) return null;
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - WEEKS * 7);
    rows = await db()
      .select()
      .from(schema.dailyMetrics)
      .where(gte(schema.dailyMetrics.date, since.toISOString().slice(0, 10)));
  }
  if (rows.length === 0) return null;

  // Bucket rows by week (Monday-based).
  const byWeek = new Map<string, DailyMetricRow[]>();
  for (const r of rows) {
    const wk = mondayOf(r.date);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk)!.push(r);
  }
  const weekStarts = [...byWeek.keys()].sort();

  const weekly = (pick: (r: DailyMetricRow) => number | null): (number | null)[] =>
    weekStarts.map((wk) =>
      avg(byWeek.get(wk)!.map(pick).filter((v): v is number => v != null)),
    );

  const change = (values: (number | null)[]): number | null => {
    const [prev, curr] = values.slice(-2);
    if (prev == null || curr == null || prev === 0 || values.length < 2) return null;
    return Math.round(((curr - prev) / prev) * 1000) / 10;
  };

  const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const defs: [TrendSeries["key"], string, string, (r: DailyMetricRow) => number | null, (v: number) => string][] = [
    ["steps", "Steps / day", "👟", (r) => r.steps, (v) => int.format(v)],
    ["sleepScore", "Sleep score", "😴", (r) => sleepScore(r), (v) => `${Math.round(v)} pts`],
    ["hrv", "Recovery (HRV)", "🧘", (r) => r.hrvDailyRmssd, (v) => `${Math.round(v)} ms`],
  ];

  const series: TrendSeries[] = defs.map(([key, label, emoji, pick, format]) => {
    const values = weekly(pick);
    return { key, label, emoji, values, changePct: change(values), format };
  });

  const changes = series.map((s) => s.changePct).filter((v): v is number => v != null);
  return {
    weekStarts,
    series,
    overallChangePct: changes.length
      ? Math.round((changes.reduce((a, b) => a + b, 0) / changes.length) * 10) / 10
      : null,
  };
}
