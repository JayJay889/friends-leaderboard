import type { DailyMetricRow } from "@/db/schema";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The adult norm every personal sleep target is anchored to. */
export const ADULT_SLEEP_NEED = 480;

/**
 * Stage shares that earn full marks — set at the TOP of the healthy adult range
 * (deep 13–23%, REM 20–25%), not the middle, so the component has headroom and
 * an average night doesn't silently max out. Scored separately so a big deep
 * night can't paper over missing REM (and vice versa).
 */
const DEEP_TARGET = 0.22;
const REM_TARGET = 0.25;

/**
 * How hard a duration shortfall bites. At 1.5, sleeping 25% under need (6 h
 * against 8 h) costs 37 points rather than the 8 the old curve charged.
 * Oversleeping is never penalised — matching WHOOP, where performance caps at
 * 100 once you have met your need.
 */
const SHORTFALL_PENALTY = 1.5;

/** Efficiency band that actually varies. Fitbit staging reports 97–99% for
 *  nearly everyone, so anything below ~90% is the real signal. */
const EFFICIENCY_FLOOR = 90;

/**
 * Sleep score, 0–100, modelled on the published consumer scales:
 *   score = 0.55 * duration + 0.30 * stages + 0.15 * restoration
 *
 * duration   — WHOOP's "sleep performance": asleep / need, capped at 100. Linear
 *              and strict; oversleeping is never punished, undersleeping costs
 *              proportionally (6 h against an 8 h need scores 75, not 92).
 * stages     — deep and REM scored separately against healthy adult shares, then
 *              averaged. Null when the device reported no staging at all, so a
 *              missing-data night is renormalized rather than scored as zero.
 * restoration— efficiency, rescaled across the band that actually varies. Fitbit
 *              staging reports 97–99% for nearly everyone, so raw efficiency is
 *              almost a constant; below ~90% is where a genuinely broken night
 *              shows up, and that is what this component is for.
 *
 * Deliberately NOT a clone of Fitbit's number: their restoration input (sleeping
 * heart rate, restlessness) is never exposed by the API, so an exact match is
 * impossible. This aims for the same *shape* — a good night in the 80s, a bad
 * one in the 50s — instead of the old scale where almost everything scored 90+.
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

  const shortfall = Math.max(0, 1 - minutes / needMinutes);
  const duration = clamp(100 - shortfall * 100 * SHORTFALL_PENALTY, 0, 100);

  const deep = row.deepMinutes ?? 0;
  const rem = row.remMinutes ?? 0;
  // No staging reported at all → unknown, not "zero deep sleep".
  const stages =
    deep + rem > 0
      ? 0.5 * clamp((deep / minutes / DEEP_TARGET) * 100, 0, 100) +
        0.5 * clamp((rem / minutes / REM_TARGET) * 100, 0, 100)
      : null;

  const restoration =
    row.sleepEfficiency != null
      ? clamp(((row.sleepEfficiency - EFFICIENCY_FLOOR) / (100 - EFFICIENCY_FLOOR)) * 100, 0, 100)
      : null;

  // Fitbit's published 50/25/25 split. Renormalized over whichever components
  // this night actually has, so missing staging shrinks the divisor instead of
  // dragging the score to zero.
  let total = 0.5 * duration;
  let weight = 0.5;
  if (stages != null) {
    total += 0.25 * stages;
    weight += 0.25;
  }
  if (restoration != null) {
    total += 0.25 * restoration;
    weight += 0.25;
  }
  return Math.round(total / weight);
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
  // Need is anchored on the 8 h adult norm and only pulled part-way toward the
  // personal baseline. Using the raw personal average (as this once did) lets a
  // chronic under-sleeper's target collapse to whatever they already get, so
  // they score 100 for sleeping six hours a night.
  const sleepNeed =
    sleepVals.length >= 3
      ? clamp(
          0.6 * ADULT_SLEEP_NEED + 0.4 * (sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length),
          450,
          570,
        )
      : ADULT_SLEEP_NEED;
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
 * Recovery ("Battery"), 1–99, WHOOP-style: how ready the body is *today*
 * measured against the person's OWN 30-day baselines, never against the group.
 *
 *   0.60 * HRV  +  0.25 * resting HR  +  0.15 * last night's sleep
 *
 * HRV leads because it moves first and furthest under strain and illness;
 * resting HR corroborates it (a rise means the body is still working); sleep
 * is the input the other two are recovering from. Components renormalize when
 * a signal is missing, so a member without HRV still gets a usable number.
 * Bands (used by the ring colour): ≥67 green, 34–66 yellow, <34 red.
 */
export function recoveryScore(
  today: { hrv: number | null; restingHr: number | null; sleepScore: number | null },
  baseline: { hrv: number | null; restingHr: number | null },
): number | null {
  let total = 0;
  let weight = 0;

  if (today.hrv != null && baseline.hrv) {
    total += 0.6 * clamp(50 + (today.hrv / baseline.hrv - 1) * 250, 1, 99);
    weight += 0.6;
  }
  if (today.restingHr != null && baseline.restingHr) {
    // Lower than baseline = recovered. A 10% rise in resting HR is a big deal,
    // hence the steeper multiplier than HRV gets.
    total += 0.25 * clamp(50 + (baseline.restingHr / today.restingHr - 1) * 400, 1, 99);
    weight += 0.25;
  }
  if (today.sleepScore != null) {
    total += 0.15 * today.sleepScore;
    weight += 0.15;
  }

  if (weight === 0) return null;
  return Math.round(clamp(total / weight, 1, 99));
}

/**
 * Health composite: VO₂ max (higher = better, normalized within the group, 60%)
 * + resting HR (lower = better, normalized, 40%). VO₂ max leads because it is
 * the stronger fitness marker of the two; resting HR moves with it but is far
 * more sensitive to a bad night or a coffee. Weights renormalize if a user
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
  const clampIndex = (v: number) => clamp(v, 10, 200);

  for (const e of withRhr) {
    const rhrScore = clampIndex((rhrMean / e.rhr!) * 100); // lower HR = higher score
    if (e.vo2 != null && vo2s.length > 1) {
      out.set(e.userId, Math.round(0.4 * rhrScore + 0.6 * clampIndex((e.vo2 / vo2Mean) * 100)));
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
