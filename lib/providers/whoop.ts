import { SCOPE, whoopCollect } from "../whoop";
import { localDateOf, type PartialMetrics, type ProviderFetch } from "./types";

/**
 * WHOOP → daily_metrics mapper.
 *
 * Date attribution follows the rules the Google provider already established,
 * because the boards compare across providers and an off-by-one day is silent:
 *   • sleep is attributed to the LOCAL WAKE-UP date, naps excluded, longest wins
 *   • cycles and recoveries are attributed to the local date the cycle STARTED
 * Everything uses each record's own `timezone_offset`, never the server's clock.
 */

/** WHOOP scores that are still computing, or that it could not score at all. */
const SCORED = "SCORED";

/**
 * WHOOP's strain is a 0–21 logarithmic scale — the same shape as `strainScale()`
 * in lib/scores.ts, which is modelled on it. Inverting that curve converts a day
 * strain into the Active-Zone-Minute total that would have produced it, so WHOOP
 * days can be summed into the weekly board alongside Fitbit days.
 *
 * The arithmetic is exact; the EQUIVALENCE is an assumption. WHOOP derives strain
 * from all-day cardiovascular load while AZM counts elevated-heart-rate minutes,
 * so treat this like the Apple constant: calibrate against per-source medians
 * once there is real data from both.
 */
export function strainToAzm(strain: number, k = 60): number {
  const s = Math.max(0, Math.min(20.99, strain)); // 21 would divide by zero
  return Math.round(-k * Math.log(1 - s / 21));
}

/**
 * WHOOP's docs show `hrv_rmssd_milli` in the tens (their published member
 * average is ~64 ms), but several community wrappers report v1 returning
 * seconds (0.0709). Rather than hardcode a guess that fails silently — a 1000×
 * error would poison every recovery baseline invisibly — detect the unit and
 * throw on anything that is neither.
 */
export function normalizeHrv(raw: number): number {
  if (raw >= 5 && raw <= 300) return raw; // already milliseconds
  if (raw > 0 && raw < 1) return raw * 1000; // seconds
  throw new Error(`WHOOP HRV out of every plausible range: ${raw}`);
}

const minutes = (milli: number | null | undefined): number | null =>
  milli == null ? null : Math.round(milli / 60000);

export const fetchWhoopDaily: ProviderFetch = async (accessToken, grantedScopes, dates) => {
  const errors: string[] = [];
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const has = (s: string) => grantedScopes.length === 0 || grantedScopes.includes(s);

  // WHOOP filters on instants; widen by a day at each end so a cycle that began
  // late on the previous evening (local) is still considered.
  const start = `${startDate}T00:00:00.000Z`;
  const end = `${endDate}T23:59:59.999Z`;
  const window = (d: string) => d >= startDate && d <= endDate;

  const perDate = new Map<string, PartialMetrics>();
  const metric = (date: string): PartialMetrics => {
    if (!perDate.has(date)) perDate.set(date, {});
    return perDate.get(date)!;
  };

  const attempt = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // cycle id -> local date, so recoveries (which reference a cycle) can be dated.
  const cycleDate = new Map<number, string>();

  if (has(SCOPE.cycles)) {
    await attempt("whoop-cycles", async () => {
      const cycles = await whoopCollect(accessToken, "/cycle", { start, end });
      for (const c of cycles) {
        if (!c?.start) continue;
        const date = localDateOf(c.start, c.timezone_offset);
        cycleDate.set(c.id, date);
        if (!window(date)) continue;
        /*
         * Today's cycle is still open and its strain is still climbing. Record
         * it anyway.
         *
         * This used to skip open cycles, on the reasoning that a partial value
         * would undercount the day. That was wrong twice over: every sync
         * overwrites the value, so it corrects itself as the day goes on and
         * settles when the cycle closes; and skipping meant a WHOOP member's
         * app showed today while ours showed yesterday, which reads as broken
         * rather than cautious. It also matches Fitbit, whose Active Zone
         * Minutes for today have always been a partial figure.
         */
        if (c.score_state !== SCORED || c.score?.strain == null) continue;
        const m = metric(date);
        m.strainNative = c.score.strain;
        m.activeZoneMinutes = strainToAzm(c.score.strain);
      }
    });
  }

  if (has(SCOPE.recovery)) {
    await attempt("whoop-recovery", async () => {
      const recoveries = await whoopCollect(accessToken, "/recovery", { start, end });
      for (const r of recoveries) {
        if (r?.score_state !== SCORED || !r.score) continue;
        const date = cycleDate.get(r.cycle_id);
        if (!date || !window(date)) continue;
        const m = metric(date);
        if (r.score.resting_heart_rate != null) {
          m.restingHeartRate = Math.round(r.score.resting_heart_rate);
        }
        if (r.score.hrv_rmssd_milli != null) {
          m.hrvDailyRmssd = Math.round(normalizeHrv(r.score.hrv_rmssd_milli) * 10) / 10;
        }
        if (r.score.recovery_score != null) m.recoveryNative = Math.round(r.score.recovery_score);
      }
    });
  }

  if (has(SCOPE.sleep)) {
    await attempt("whoop-sleep", async () => {
      const sleeps = await whoopCollect(accessToken, "/activity/sleep", { start, end });
      const mainByDate = new Map<string, any>();
      for (const s of sleeps) {
        if (s?.nap === true || s?.score_state !== SCORED || !s.score?.stage_summary) continue;
        if (!s.end) continue;
        const date = localDateOf(s.end, s.timezone_offset);
        if (!window(date)) continue;
        const asleep =
          (s.score.stage_summary.total_in_bed_time_milli ?? 0) -
          (s.score.stage_summary.total_awake_time_milli ?? 0);
        const prev = mainByDate.get(date);
        const prevAsleep = prev
          ? (prev.score.stage_summary.total_in_bed_time_milli ?? 0) -
            (prev.score.stage_summary.total_awake_time_milli ?? 0)
          : -1;
        if (asleep > prevAsleep) mainByDate.set(date, s);
      }

      for (const [date, s] of mainByDate) {
        const st = s.score.stage_summary;
        const m = metric(date);
        m.sleepMinutes = minutes(
          (st.total_in_bed_time_milli ?? 0) - (st.total_awake_time_milli ?? 0),
        );
        m.sleepEfficiency = s.score.sleep_efficiency_percentage ?? null;
        m.deepMinutes = minutes(st.total_slow_wave_sleep_time_milli);
        m.remMinutes = minutes(st.total_rem_sleep_time_milli);
        if (s.score.respiratory_rate != null) m.breathingRate = s.score.respiratory_rate;
      }
    });
  }

  return { perDate, errors };
};
