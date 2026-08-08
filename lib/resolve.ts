import type { DailyMetricRow, Source } from "@/db/schema";

/**
 * Multi-source resolution.
 *
 * `daily_metrics` holds one row per (user, date, SOURCE), because a member can
 * wear a WHOOP and carry an iPhone, or have Fitbit writing into Apple Health.
 * Everything that scores — boards, crowns, /me, trends — wants exactly one row
 * per day, so resolution happens once at the read boundary and the scoring code
 * never learns that sources exist.
 *
 * The model is Apple Health's: sources are ranked, and each metric is taken from
 * the highest-ranked source that actually reported it. Per *metric*, not per row —
 * a day can take sleep from the WHOOP and steps from the phone when only one of
 * them has each.
 */

/** Fallback ranking when a user has expressed no preference. */
const DEFAULT_ORDER: Source[] = ["whoop", "google", "apple"];

/**
 * Ranks a user's sources: their chosen primary first, then any source they have
 * connected (earliest connection first), then the default order as a backstop for
 * sources that wrote rows without a live identity.
 */
export function sourcePriority(
  primarySource: Source | null,
  connectedInOrder: Source[] = [],
): Source[] {
  const ranked: Source[] = [];
  const push = (s: Source | null | undefined) => {
    if (s && !ranked.includes(s)) ranked.push(s);
  };
  push(primarySource);
  connectedInOrder.forEach(push);
  DEFAULT_ORDER.forEach(push);
  return ranked;
}

/** Every metric column that resolution picks over. `syncedAt` is handled separately. */
const METRICS = [
  "steps",
  "activeZoneMinutes",
  "restingHeartRate",
  "sleepMinutes",
  "sleepEfficiency",
  "deepMinutes",
  "remMinutes",
  "hrvDailyRmssd",
  "hrvSdnn",
  "breathingRate",
  "vo2maxEstimate",
  "strainNative",
  "recoveryNative",
] as const satisfies readonly (keyof DailyMetricRow)[];

/**
 * Collapses multi-source rows into one row per date.
 *
 * Sleep is resolved as a *unit* rather than column-by-column: taking duration
 * from one device and stage minutes from another would produce stage shares that
 * describe no real night, and `sleepScore()` divides stages by duration. So the
 * winning source for `sleepMinutes` also supplies efficiency, deep and REM.
 */
export function resolveRows(rows: DailyMetricRow[], priority: Source[]): DailyMetricRow[] {
  const byDate = new Map<string, DailyMetricRow[]>();
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date)!.push(row);
  }

  const rank = (s: Source) => {
    const i = priority.indexOf(s);
    return i === -1 ? priority.length : i;
  };

  const out: DailyMetricRow[] = [];
  for (const [date, sameDay] of byDate) {
    if (sameDay.length === 1) {
      out.push(sameDay[0]);
      continue;
    }
    const ordered = [...sameDay].sort((a, b) => rank(a.source) - rank(b.source));
    const resolved: DailyMetricRow = { ...ordered[0], date };

    for (const key of METRICS) {
      const winner = ordered.find((r) => r[key] != null);
      (resolved as Record<string, unknown>)[key] = winner ? winner[key] : null;
    }

    // Sleep travels together, so stage shares always describe one real night.
    const sleepSource = ordered.find((r) => r.sleepMinutes != null);
    resolved.sleepMinutes = sleepSource?.sleepMinutes ?? null;
    resolved.sleepEfficiency = sleepSource?.sleepEfficiency ?? null;
    resolved.deepMinutes = sleepSource?.deepMinutes ?? null;
    resolved.remMinutes = sleepSource?.remMinutes ?? null;

    resolved.syncedAt = ordered
      .map((r) => r.syncedAt)
      .reduce((a, b) => (a > b ? a : b));
    out.push(resolved);
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Builds each user's ranked source list from their `primary_source` and the
 * providers they have connected. Pure, so it can be unit-tested without a DB.
 */
export function prioritiesFor(
  users: { id: string; primarySource: Source | null }[],
  identities: { userId: string; provider: Source; createdAt: Date }[],
): Map<string, Source[]> {
  const connected = new Map<string, { provider: Source; createdAt: Date }[]>();
  for (const i of identities) {
    if (!connected.has(i.userId)) connected.set(i.userId, []);
    connected.get(i.userId)!.push(i);
  }
  const out = new Map<string, Source[]>();
  for (const u of users) {
    const inOrder = (connected.get(u.id) ?? [])
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((i) => i.provider);
    out.set(u.id, sourcePriority(u.primarySource, inOrder));
  }
  return out;
}

/**
 * Groups raw rows by user and resolves each user's with their own priority.
 * `priorities` maps userId -> ranked sources; users missing from it get the default.
 */
export function resolveByUser(
  rows: DailyMetricRow[],
  priorities: Map<string, Source[]>,
): Map<string, DailyMetricRow[]> {
  const byUser = new Map<string, DailyMetricRow[]>();
  for (const row of rows) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    byUser.get(row.userId)!.push(row);
  }
  const out = new Map<string, DailyMetricRow[]>();
  for (const [userId, userRows] of byUser) {
    out.set(userId, resolveRows(userRows, priorities.get(userId) ?? DEFAULT_ORDER));
  }
  return out;
}
