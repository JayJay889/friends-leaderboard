import type { DailyMetricRow } from "@/db/schema";

/**
 * Custom sleep score (we deliberately do not depend on Fitbit's proprietary score):
 *   score = 0.5 * duration_score + 0.3 * stage_score + 0.2 * efficiency
 *
 * duration_score: 100 at 8h; gentle linear dip to 85 at 6h and 10h,
 * then steep falloff to 0 at 4h / 12h ("linear falloff below 6h and above 10h").
 * stage_score: (deep + REM) / total asleep, normalized so 40% combined = 100.
 */
export function sleepScore(row: {
  sleepMinutes: number | null;
  sleepEfficiency: number | null;
  deepMinutes: number | null;
  remMinutes: number | null;
}): number | null {
  const minutes = row.sleepMinutes;
  if (minutes == null || minutes <= 0) return null;

  const h = minutes / 60;
  let durationScore: number;
  if (h >= 6 && h <= 10) {
    durationScore = 100 - (Math.abs(h - 8) / 2) * 15; // 100 at 8h → 85 at 6h/10h
  } else if (h < 6) {
    durationScore = Math.max(0, 85 * ((h - 4) / 2)); // 85 at 6h → 0 at 4h
  } else {
    durationScore = Math.max(0, 85 * ((12 - h) / 2)); // 85 at 10h → 0 at 12h
  }

  const stageRatio = ((row.deepMinutes ?? 0) + (row.remMinutes ?? 0)) / minutes;
  const stageScore = Math.min(100, (stageRatio / 0.4) * 100);

  const efficiency = Math.min(100, row.sleepEfficiency ?? 0);

  return Math.round(0.5 * durationScore + 0.3 * stageScore + 0.2 * efficiency);
}

export interface UserWindowStats {
  daysWithData: number;
  avgSteps: number | null;
  totalAzm: number | null;
  avgSleepScore: number | null;
  avgSleepMinutes: number | null;
  avgSleepEfficiency: number | null;
  avgDeepMinutes: number | null;
  avgRemMinutes: number | null;
  avgRestingHr: number | null;
  avgVo2max: number | null;
  avgHrv: number | null;
  avgBreathingRate: number | null;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Aggregates one user's daily rows (already restricted to the window). */
export function windowStats(rows: DailyMetricRow[]): UserWindowStats {
  const nums = (pick: (r: DailyMetricRow) => number | null) =>
    rows.map(pick).filter((v): v is number => v != null);

  const stepsVals = nums((r) => r.steps);
  const azmVals = nums((r) => r.activeZoneMinutes);
  const sleepScores = rows
    .map((r) => sleepScore(r))
    .filter((v): v is number => v != null);

  return {
    daysWithData: rows.length,
    avgSteps: avg(stepsVals),
    totalAzm: azmVals.length ? azmVals.reduce((a, b) => a + b, 0) : null,
    avgSleepScore: avg(sleepScores),
    avgSleepMinutes: avg(nums((r) => r.sleepMinutes)),
    avgSleepEfficiency: avg(nums((r) => r.sleepEfficiency)),
    avgDeepMinutes: avg(nums((r) => r.deepMinutes)),
    avgRemMinutes: avg(nums((r) => r.remMinutes)),
    avgRestingHr: avg(nums((r) => r.restingHeartRate)),
    avgVo2max: avg(nums((r) => r.vo2maxEstimate)),
    avgHrv: avg(nums((r) => r.hrvDailyRmssd)),
    avgBreathingRate: avg(nums((r) => r.breathingRate)),
  };
}

/**
 * Health composite: resting HR (lower = better, normalized within the group, 60%)
 * + VO2 max (higher = better, normalized, 40%). Weights renormalize if a user
 * lacks VO2 max data but has resting HR.
 */
export function healthScores(
  entries: { userId: string; rhr: number | null; vo2: number | null }[],
): Map<string, number> {
  const withRhr = entries.filter((e) => e.rhr != null);
  const out = new Map<string, number>();
  if (withRhr.length === 0) return out;

  // Components score 50 at the group average (nobody is pinned to 100).
  const rhrs = withRhr.map((e) => e.rhr!);
  const vo2s = entries.filter((e) => e.vo2 != null).map((e) => e.vo2!);
  const rhrMean = rhrs.reduce((a, b) => a + b, 0) / rhrs.length;
  const vo2Mean = vo2s.length ? vo2s.reduce((a, b) => a + b, 0) / vo2s.length : 0;
  const clamp = (v: number) => Math.max(5, Math.min(100, v));

  for (const e of withRhr) {
    const rhrScore = clamp((rhrMean / e.rhr!) * 50); // lower HR = higher score
    if (e.vo2 != null && vo2s.length > 1) {
      out.set(e.userId, Math.round(0.6 * rhrScore + 0.4 * clamp((e.vo2 / vo2Mean) * 50)));
    } else {
      out.set(e.userId, Math.round(rhrScore));
    }
  }
  return out;
}

/**
 * "Club Age" — a playful body-age estimate (WHOOP-style, heavily simplified).
 * Anchored on VO₂ max via a rough unisex population decline (~0.4 ml/kg/min
 * per year from ~45 at age 20), then nudged by resting HR, HRV, sleep score
 * and weekly activity volume. A wellness toy, not a medical measurement —
 * requires VO₂ max data, returns null without it.
 */
export function clubAge(s: UserWindowStats): number | null {
  if (s.avgVo2max == null) return null;
  let age = 20 + (45 - s.avgVo2max) / 0.4;
  const nudge = (v: number, cap = 3) => Math.max(-cap, Math.min(cap, v));
  if (s.avgRestingHr != null) age += nudge((s.avgRestingHr - 60) * 0.15);
  if (s.avgHrv != null) age += nudge((45 - s.avgHrv) * 0.05);
  if (s.avgSleepScore != null) age += nudge((80 - s.avgSleepScore) * 0.08);
  if (s.totalAzm != null) age += nudge((150 - s.totalAzm) * 0.005, 2);
  return Math.round(Math.max(18, Math.min(80, age)));
}

/** Percentile of a rank within a board: 1st of n → 1.0, last → 0.0, solo → 1.0. */
export function rankPercentile(rank: number, n: number): number {
  if (n <= 1) return 1;
  return (n - rank) / (n - 1);
}
