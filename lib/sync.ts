import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OauthTokenRow, User } from "@/db/schema";
import { decrypt, encrypt } from "./crypto";
import { SCOPE, refreshAccessToken } from "./google";
import { civilToIso, dailyRollUp, pickNumber, reconcile } from "./health";

const SYNC_DAYS = 3; // devices can sync late; re-pull a rolling window

type Partial_Metrics = {
  steps?: number | null;
  activeZoneMinutes?: number | null;
  restingHeartRate?: number | null;
  sleepMinutes?: number | null;
  sleepEfficiency?: number | null;
  deepMinutes?: number | null;
  remMinutes?: number | null;
  hrvDailyRmssd?: number | null;
  breathingRate?: number | null;
  vo2maxEstimate?: number | null;
};

export interface SyncResult {
  userId: string;
  updatedDates: string[];
  errors: string[];
}

function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    out.push(isoDateUTC(d));
  }
  return out.reverse();
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDateUTC(d);
}

/** Returns a fresh access token, refreshing (and persisting) if near expiry. */
async function validAccessToken(token: OauthTokenRow): Promise<string> {
  const expiresAt = token.tokenExpiresAt?.getTime() ?? 0;
  if (token.accessToken && expiresAt > Date.now() + 5 * 60_000) {
    return decrypt(token.accessToken);
  }
  const refreshed = await refreshAccessToken(decrypt(token.refreshToken));
  const update: Record<string, unknown> = {
    accessToken: encrypt(refreshed.access_token),
    tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  };
  // Google occasionally rotates refresh tokens on refresh.
  if (refreshed.refresh_token) update.refreshToken = encrypt(refreshed.refresh_token);
  await db().update(schema.oauthTokens).set(update).where(eq(schema.oauthTokens.userId, token.userId));
  return refreshed.access_token;
}

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

export async function syncUser(user: User, token: OauthTokenRow): Promise<SyncResult> {
  const errors: string[] = [];
  const dates = lastNDates(SYNC_DAYS);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const endExclusive = addDays(endDate, 1);
  const scopes = token.grantedScopes;
  const has = (s: string) => scopes.includes(s);

  const accessToken = await validAccessToken(token);
  const perDate = new Map<string, Partial_Metrics>();
  const metric = (date: string): Partial_Metrics => {
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

  // Merge with existing rows so a metric that failed this run never nulls out
  // previously synced data.
  const existing = await db()
    .select()
    .from(schema.dailyMetrics)
    .where(
      and(
        eq(schema.dailyMetrics.userId, user.id),
        gte(schema.dailyMetrics.date, startDate),
        inArray(schema.dailyMetrics.date, dates),
      ),
    );
  const existingByDate = new Map(existing.map((r) => [r.date, r]));

  const updatedDates: string[] = [];
  for (const [date, fresh] of perDate) {
    const prev = existingByDate.get(date);
    const row = {
      userId: user.id,
      date,
      steps: fresh.steps ?? prev?.steps ?? null,
      activeZoneMinutes: fresh.activeZoneMinutes ?? prev?.activeZoneMinutes ?? null,
      restingHeartRate: fresh.restingHeartRate ?? prev?.restingHeartRate ?? null,
      sleepMinutes: fresh.sleepMinutes ?? prev?.sleepMinutes ?? null,
      sleepEfficiency: fresh.sleepEfficiency ?? prev?.sleepEfficiency ?? null,
      deepMinutes: fresh.deepMinutes ?? prev?.deepMinutes ?? null,
      remMinutes: fresh.remMinutes ?? prev?.remMinutes ?? null,
      hrvDailyRmssd: fresh.hrvDailyRmssd ?? prev?.hrvDailyRmssd ?? null,
      breathingRate: fresh.breathingRate ?? prev?.breathingRate ?? null,
      vo2maxEstimate: fresh.vo2maxEstimate ?? prev?.vo2maxEstimate ?? null,
      syncedAt: new Date(),
    };
    await db()
      .insert(schema.dailyMetrics)
      .values(row)
      .onConflictDoUpdate({
        target: [schema.dailyMetrics.userId, schema.dailyMetrics.date],
        set: row,
      });
    updatedDates.push(date);
  }

  return { userId: user.id, updatedDates, errors };
}

export async function syncAllUsers(): Promise<SyncResult[]> {
  const rows = await db()
    .select({ user: schema.users, token: schema.oauthTokens })
    .from(schema.users)
    .innerJoin(schema.oauthTokens, eq(schema.oauthTokens.userId, schema.users.id));

  const results: SyncResult[] = [];
  for (const { user, token } of rows) {
    try {
      results.push(await syncUser(user, token));
    } catch (e) {
      results.push({
        userId: user.id,
        updatedDates: [],
        errors: [e instanceof Error ? e.message : String(e)],
      });
    }
  }
  return results;
}
