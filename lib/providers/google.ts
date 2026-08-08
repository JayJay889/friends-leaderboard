import { SCOPE } from "../google";
import { civilToIso, dailyRollUp, pickNumber, reconcile } from "../health";
import { addDays, type PartialMetrics, type ProviderFetch } from "./types";

/**
 * Google Health API (Fitbit) provider.
 *
 * Lifted verbatim out of lib/sync.ts when multi-provider support landed — the
 * request shapes, filter strings and date-attribution rules are unchanged, and
 * deliberately so: they were verified against the live v4 discovery doc and real
 * Fitbit payloads. Any behaviour change here is a bug, not a refactor.
 */

/** Reconcile helper for "daily" record types: returns map of isoDate -> data object. */
async function reconcileDaily(
  accessToken: string,
  dataType: string,
  dataKey: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, any>> {
  // Filter field pattern per API spec: `{daily_summary_data_type}.date` (snake_case).
  const field = `${dataType.replace(/-/g, "_")}.date`;
  const filter = `${field} >= "${startDate}" AND ${field} < "${addDays(endDate, 1)}"`;
  const points = await reconcile(accessToken, dataType, filter);
  const byDate = new Map<string, any>();
  for (const p of points) {
    const d = p.data ?? p; // reconcile wraps values in `data`; tolerate both shapes
    const value = d[dataKey];
    if (!value) continue;
    const date = typeof value.date === "string" ? value.date : value.date ? civilToIso(value.date) : null;
    if (date && date >= startDate && date <= endDate) byDate.set(date, value);
  }
  return byDate;
}

function stageMinutes(summary: any, type: string): number {
  const entry = (summary?.stagesSummary ?? []).find((s: any) => s.type === type);
  return pickNumber(entry, ["minutes", "minutesInStage"]) ?? 0;
}

export const fetchGoogleDaily: ProviderFetch = async (accessToken, grantedScopes, dates) => {
  const errors: string[] = [];
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const endExclusive = addDays(endDate, 1);
  const has = (s: string) => grantedScopes.includes(s);

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

  if (has(SCOPE.activity)) {
    await attempt("steps", async () => {
      for (const p of await dailyRollUp(accessToken, "steps", startDate, endExclusive)) {
        const date = p.civilStartTime?.date ? civilToIso(p.civilStartTime.date) : null;
        const count = pickNumber(p.steps, ["countSum"]);
        if (date && count != null) metric(date).steps = Math.round(count);
      }
    });
    await attempt("active-zone-minutes", async () => {
      for (const p of await dailyRollUp(accessToken, "active-zone-minutes", startDate, endExclusive)) {
        const date = p.civilStartTime?.date ? civilToIso(p.civilStartTime.date) : null;
        // AZM rollup is split per heart-rate zone; the total is their sum.
        const zones = ["sumInFatBurnHeartZone", "sumInCardioHeartZone", "sumInPeakHeartZone"]
          .map((k) => pickNumber(p.activeZoneMinutes, [k]) ?? 0);
        const azm = zones.reduce((a, b) => a + b, 0);
        if (date && p.activeZoneMinutes) metric(date).activeZoneMinutes = Math.round(azm);
      }
    });
    await attempt("daily-vo2-max", async () => {
      const byDate = await reconcileDaily(accessToken, "daily-vo2-max", "dailyVo2Max", startDate, endDate);
      for (const [date, v] of byDate) {
        const vo2 = pickNumber(v, ["vo2Max", "vo2max", "value"]);
        if (vo2 != null) metric(date).vo2maxEstimate = vo2;
      }
    });
  }

  if (has(SCOPE.metrics)) {
    await attempt("daily-resting-heart-rate", async () => {
      const byDate = await reconcileDaily(
        accessToken,
        "daily-resting-heart-rate",
        "dailyRestingHeartRate",
        startDate,
        endDate,
      );
      for (const [date, v] of byDate) {
        const bpm = pickNumber(v, ["beatsPerMinute", "value"]);
        if (bpm != null) metric(date).restingHeartRate = Math.round(bpm);
      }
    });
    await attempt("daily-respiratory-rate", async () => {
      const byDate = await reconcileDaily(
        accessToken,
        "daily-respiratory-rate",
        "dailyRespiratoryRate",
        startDate,
        endDate,
      );
      for (const [date, v] of byDate) {
        const rate = pickNumber(v, ["breathsPerMinute", "breathingRate", "rate", "value"]);
        if (rate != null) metric(date).breathingRate = rate;
      }
    });
    await attempt("hrv", async () => {
      // Prefer the daily aggregate; fall back to averaging raw samples per night.
      try {
        const byDate = await reconcileDaily(
          accessToken,
          "daily-heart-rate-variability",
          "dailyHeartRateVariability",
          startDate,
          endDate,
        );
        if (byDate.size === 0) throw new Error("no daily HRV points");
        for (const [date, v] of byDate) {
          const rmssd = pickNumber(v, [
            "averageHeartRateVariabilityMilliseconds",
            "rootMeanSquareOfSuccessiveDifferencesMilliseconds",
            "value",
          ]);
          if (rmssd != null) metric(date).hrvDailyRmssd = rmssd;
        }
      } catch {
        const filter = `heart_rate_variability.sample_time.physical_time >= "${startDate}T00:00:00Z" AND heart_rate_variability.sample_time.physical_time < "${endExclusive}T00:00:00Z"`;
        const points = await reconcile(accessToken, "heart-rate-variability", filter);
        const byDate = new Map<string, number[]>();
        for (const p of points) {
          const d = p.data ?? p;
          const hrv = d.heartRateVariability ?? d;
          const rmssd = pickNumber(hrv, ["rootMeanSquareOfSuccessiveDifferencesMilliseconds", "rmssd"]);
          // ObservationSampleTime: { physicalTime, civilTime, utcOffset }
          const st = hrv?.sampleTime;
          const date =
            typeof st?.civilTime === "string"
              ? st.civilTime.slice(0, 10)
              : st?.civilTime?.date
                ? civilToIso(st.civilTime.date)
                : typeof st?.physicalTime === "string"
                  ? st.physicalTime.slice(0, 10)
                  : null;
          if (rmssd != null && date && date >= startDate && date <= endDate) {
            if (!byDate.has(date)) byDate.set(date, []);
            byDate.get(date)!.push(rmssd);
          }
        }
        for (const [date, vals] of byDate) {
          metric(date).hrvDailyRmssd = vals.reduce((a, b) => a + b, 0) / vals.length;
        }
      }
    });
  }

  if (has(SCOPE.sleep)) {
    await attempt("sleep", async () => {
      // Sleep supports filtering on session end (wake-up) time — civil variant matches
      // the user's local calendar date.
      const filter = `sleep.interval.civil_end_time >= "${startDate}" AND sleep.interval.civil_end_time < "${endExclusive}"`;
      const points = await reconcile(accessToken, "sleep", filter);
      const mainByDate = new Map<string, any>();
      for (const p of points) {
        const s = (p.data ?? p).sleep ?? (p.data ?? p);
        if (!s?.interval || !s.summary) continue;
        if (s.metadata?.nap === true) continue;
        // Attribute to wake-up date; prefer the civil end time when present.
        const date = s.interval.civilEndTime?.date
          ? civilToIso(s.interval.civilEndTime.date)
          : typeof s.interval.endTime === "string"
            ? s.interval.endTime.slice(0, 10)
            : null;
        if (!date || date < startDate || date > endDate) continue;
        const minutes = pickNumber(s.summary, ["minutesAsleep"]) ?? 0;
        const prev = mainByDate.get(date);
        const prevMinutes = prev ? pickNumber(prev.summary, ["minutesAsleep"]) ?? 0 : -1;
        if (minutes > prevMinutes) mainByDate.set(date, s);
      }
      for (const [date, s] of mainByDate) {
        const asleep = pickNumber(s.summary, ["minutesAsleep"]);
        const inBed = pickNumber(s.summary, ["minutesInSleepPeriod"]);
        const m = metric(date);
        m.sleepMinutes = asleep != null ? Math.round(asleep) : null;
        m.sleepEfficiency =
          asleep != null && inBed ? Math.round((asleep / inBed) * 1000) / 10 : null;
        m.deepMinutes = Math.round(stageMinutes(s.summary, "DEEP"));
        m.remMinutes = Math.round(stageMinutes(s.summary, "REM"));
      }
    });
  }

  return { perDate, errors };
};
