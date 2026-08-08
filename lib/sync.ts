import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OauthTokenRow, Source, User } from "@/db/schema";
import { decrypt, encrypt } from "./crypto";
import * as google from "./google";
import * as whoop from "./whoop";
import { fetchGoogleDaily } from "./providers/google";
import { fetchWhoopDaily } from "./providers/whoop";
import { lastNDates, type PartialMetrics, type ProviderFetch } from "./providers/types";

const SYNC_DAYS = 3; // devices can sync late; re-pull a rolling window

export interface SyncResult {
  userId: string;
  source: Source;
  updatedDates: string[];
  errors: string[];
}

const FETCHERS: Partial<Record<Source, ProviderFetch>> = {
  google: fetchGoogleDaily,
  whoop: fetchWhoopDaily,
  // apple is push-only: data arrives at /api/ingest/apple and calls writeMetrics().
};

/**
 * Returns a fresh access token, refreshing (and persisting) if near expiry.
 *
 * The persistence order matters for WHOOP: it rotates the refresh token on every
 * refresh and invalidates the old one immediately, so the new one is written
 * BEFORE the access token is handed out. If the write fails the member has to
 * reconnect by hand, which is why this throws rather than pressing on.
 */
async function validAccessToken(token: OauthTokenRow): Promise<string> {
  const expiresAt = token.tokenExpiresAt?.getTime() ?? 0;
  if (token.accessToken && expiresAt > Date.now() + 5 * 60_000) {
    return decrypt(token.accessToken);
  }

  const refreshed =
    token.provider === "whoop"
      ? await whoop.refreshAccessToken(decrypt(token.refreshToken))
      : await google.refreshAccessToken(decrypt(token.refreshToken));

  const update: Record<string, unknown> = {
    accessToken: encrypt(refreshed.access_token),
    tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  };
  // Google rotates occasionally; WHOOP always (and its client throws if absent).
  if (refreshed.refresh_token) update.refreshToken = encrypt(refreshed.refresh_token);

  await db()
    .update(schema.oauthTokens)
    .set(update)
    .where(
      and(
        eq(schema.oauthTokens.userId, token.userId),
        eq(schema.oauthTokens.provider, token.provider),
      ),
    );
  return refreshed.access_token;
}

/**
 * Merges fresh metrics into `daily_metrics` for one (user, source).
 *
 * Merging with the existing row means a metric that failed this run never nulls
 * out previously synced data. Rows are keyed by source, so two devices never
 * overwrite each other — `lib/resolve.ts` decides which one wins at read time.
 */
export async function writeMetrics(
  userId: string,
  source: Source,
  perDate: Map<string, PartialMetrics>,
  dates: string[],
): Promise<string[]> {
  if (perDate.size === 0) return [];

  const existing = await db()
    .select()
    .from(schema.dailyMetrics)
    .where(
      and(
        eq(schema.dailyMetrics.userId, userId),
        eq(schema.dailyMetrics.source, source),
        inArray(schema.dailyMetrics.date, dates),
      ),
    );
  const existingByDate = new Map(existing.map((r) => [r.date, r]));

  const updatedDates: string[] = [];
  for (const [date, fresh] of perDate) {
    const prev = existingByDate.get(date);
    const row = {
      userId,
      date,
      source,
      steps: fresh.steps ?? prev?.steps ?? null,
      activeZoneMinutes: fresh.activeZoneMinutes ?? prev?.activeZoneMinutes ?? null,
      restingHeartRate: fresh.restingHeartRate ?? prev?.restingHeartRate ?? null,
      sleepMinutes: fresh.sleepMinutes ?? prev?.sleepMinutes ?? null,
      sleepEfficiency: fresh.sleepEfficiency ?? prev?.sleepEfficiency ?? null,
      deepMinutes: fresh.deepMinutes ?? prev?.deepMinutes ?? null,
      remMinutes: fresh.remMinutes ?? prev?.remMinutes ?? null,
      hrvDailyRmssd: fresh.hrvDailyRmssd ?? prev?.hrvDailyRmssd ?? null,
      hrvSdnn: fresh.hrvSdnn ?? prev?.hrvSdnn ?? null,
      breathingRate: fresh.breathingRate ?? prev?.breathingRate ?? null,
      vo2maxEstimate: fresh.vo2maxEstimate ?? prev?.vo2maxEstimate ?? null,
      strainNative: fresh.strainNative ?? prev?.strainNative ?? null,
      recoveryNative: fresh.recoveryNative ?? prev?.recoveryNative ?? null,
      syncedAt: new Date(),
    };
    await db()
      .insert(schema.dailyMetrics)
      .values(row)
      .onConflictDoUpdate({
        target: [schema.dailyMetrics.userId, schema.dailyMetrics.date, schema.dailyMetrics.source],
        set: row,
      });
    updatedDates.push(date);
  }
  return updatedDates;
}

/** Pulls one connected provider for one member. */
export async function syncUser(user: User, token: OauthTokenRow): Promise<SyncResult> {
  const source = token.provider;
  const fetcher = FETCHERS[source];
  if (!fetcher) {
    return { userId: user.id, source, updatedDates: [], errors: [`no fetcher for ${source}`] };
  }

  const dates = lastNDates(SYNC_DAYS);
  const accessToken = await validAccessToken(token);
  const { perDate, errors } = await fetcher(accessToken, token.grantedScopes, dates);
  const updatedDates = await writeMetrics(user.id, source, perDate, dates);
  return { userId: user.id, source, updatedDates, errors };
}

/**
 * Syncs every pull-based connection. A member with two devices yields two rows.
 *
 * `only` limits the run to one provider. That exists because the two providers
 * want opposite treatment: Fitbit has to be polled often, since someone who
 * wakes at 09:00 has no sleep data yet when a 07:30 job looks and would
 * otherwise sit a full day behind. WHOOP is the reverse — it can push to us the
 * moment a night is scored, so polling it every twenty minutes would be hundreds
 * of wasted calls a day and far more than we told them we make.
 */
export async function syncAllUsers(only?: Source): Promise<SyncResult[]> {
  const rows = await db()
    .select({ user: schema.users, token: schema.oauthTokens })
    .from(schema.users)
    .innerJoin(schema.oauthTokens, eq(schema.oauthTokens.userId, schema.users.id))
    .where(only ? eq(schema.oauthTokens.provider, only) : undefined);

  const results: SyncResult[] = [];
  for (const { user, token } of rows) {
    try {
      results.push(await syncUser(user, token));
    } catch (e) {
      results.push({
        userId: user.id,
        source: token.provider,
        updatedDates: [],
        errors: [e instanceof Error ? e.message : String(e)],
      });
    }
  }
  return results;
}
