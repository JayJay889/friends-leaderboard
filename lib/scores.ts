import type { DailyMetricRow } from "@/db/schema";

/**
 * Custom sleep score, WHOOP-style scored against a personal sleep NEED:
 *   score = 0.5 * duration_score + 0.3 * stage_score + 0.2 * efficiency
 *
 * duration_score: 100 at `need`; linear dip to 85 at need ± 2h, then steep
 * falloff to 0 at need ± 4h. `need` defaults to 8h when no baseline exists.
 * stage_score: (deep + REM) / total asleep, normalized so 40% combined = 100.
 */
export function sleepScore(
  row: {
    sleepMinutes: number | null;
    sleepEfficiency: number | null;
    deepMinutes: number | null;
    remMinutes: number | null;
  },
  needMinutes = 480,
): number | null {
  const minutes = row.sleepMinutes;
  if (minutes == null || minutes <= 0) return null;

  const diffH = Math.abs(minutes - needMinutes) / 60;
  const durationScore =
    diffH <= 2 ? 100 - (diffH / 2) * 15 : Math.max(0, 85 * (1 - (diffH - 2) / 2));

  const stageRatio = ((row.deepMinutes ?? 0) + (row.remMinutes ?? 0)) / minutes;
  const stageScore = Math.min(100, (stageRatio / 0.4) * 100);

  const efficiency = Math.min(100, row.sleepEfficiency ?? 0);

  return Math.round(0.5 * durationScore + 0.3 * stageScore + 0.2 * efficiency);
}

export interface UserWindowStats {
  daysWithData: number;
  /** Personal sleep need (min): baseline duration clamped to 7–9.5 h. */
  sleepNeed: number;
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
  const sleepVals = nums((r) => r.sleepMinutes);
  const sleepNeed =
    sleepVals.length >= 3
      ? Math.max(420, Math.min(570, sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length))
      : 480;
  const sleepScores = rows
    .map((r) => sleepScore(r, sleepNeed))
    .filter((v): v is number => v != null);

  return {
    daysWithData: rows.length,
    sleepNeed,
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

  // Index scale: 100 = group average (readable at a glance, nobody pinned).
  const rhrs = withRhr.map((e) => e.rhr!);
  const vo2s = entries.filter((e) => e.vo2 != null).map((e) => e.vo2!);
  const rhrMean = rhrs.reduce((a, b) => a + b, 0) / rhrs.length;
  const vo2Mean = vo2s.length ? vo2s.reduce((a, b) => a + b, 0) / vo2s.length : 0;
  const clamp = (v: number) => Math.max(10, Math.min(200, v));

  for (const e of withRhr) {
    const rhrScore = clamp((rhrMean / e.rhr!) * 100); // lower HR = higher score
    if (e.vo2 != null && vo2s.length > 1) {
      out.set(e.userId, Math.round(0.6 * rhrScore + 0.4 * clamp((e.vo2 / vo2Mean) * 100)));
    } else {
      out.set(e.userId, Math.round(rhrScore));
    }
  }
  return out;
}

/**
 * "Body Age" — a playful body-age estimate (WHOOP-style, heavily simplified).
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

/**
 * WHOOP-style logarithmic strain scale, 0–21: early minutes count most and
 * each further point is harder to earn. `k` sets the curve's appetite —
 * 300 for weekly Active Zone Minutes, 60 for a single day.
 */
export function strainScale(azm: number, k = 300): number {
  return Math.round(21 * (1 - Math.exp(-Math.max(0, azm) / k)) * 10) / 10;
}

/** Percentile of a rank within a board: 1st of n → 1.0, last → 0.0, solo → 1.0. */
export function rankPercentile(rank: number, n: number): number {
  if (n <= 1) return 1;
  return (n - rank) / (n - 1);
}
