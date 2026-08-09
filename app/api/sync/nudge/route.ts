import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { syncAllUsers, syncUser } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Never pull Fitbit more often than this, however many screens are watching. */
const MIN_MINUTES_BETWEEN_SYNCS = 20;

/** How often to re-check a WHOOP member whose night has not landed yet. */
const WHOOP_RETRY_MINUTES = 30;

/**
 * Pulls fresh Fitbit data, but only if it is already stale.
 *
 * The problem this solves: the daily cron runs at 07:30 local, and a member who
 * wakes at 09:00 has no sleep data in Fitbit yet when it looks, so their night
 * would not appear until the next morning. They would permanently be reading
 * yesterday.
 *
 * The obvious fix is an external job on a timer, which means a scheduler, a
 * shared secret and something else to keep alive. This does the same work from
 * the screens that are already open: the TV refreshes itself all day, so asking
 * it to nudge the sync costs nothing and keeps data fresh exactly when somebody
 * is looking. If nobody is looking, nobody needs it, and the daily cron remains
 * the backstop.
 *
 * Deliberately unauthenticated, which is safe because it is not a lever anyone
 * can pull harder: the staleness check below is the rate limit, so a thousand
 * callers a minute still produce at most one sync every twenty minutes, and the
 * only possible effect is this group's own data being up to date.
 *
 * Fitbit is the one polled on a timer. WHOOP arrives by webhook, with a
 * demand-driven catch-up below for when that does not happen. Apple pushes from
 * the phone and needs nothing here.
 */
export async function POST() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ skipped: "not configured" });
  }

  // A provider webhook said this member has something new, so they jump the
  // staleness rule. This is how WHOOP data arrives without ever being polled.
  const requested = await db()
    .select({ user: schema.users, token: schema.oauthTokens })
    .from(schema.oauthTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.oauthTokens.userId))
    .where(isNotNull(schema.oauthTokens.syncRequestedAt));

  const pushed: { userId: string; source: string; errors: number }[] = [];
  for (const { user, token } of requested) {
    // Cleared first: a sync that fails should not strand the flag and retry on
    // every page load for the rest of the day. The next webhook re-raises it.
    await db()
      .update(schema.oauthTokens)
      .set({ syncRequestedAt: null })
      .where(
        and(
          eq(schema.oauthTokens.userId, token.userId),
          eq(schema.oauthTokens.provider, token.provider),
        ),
      );
    try {
      const result = await syncUser(user, token);
      pushed.push({ userId: user.id, source: token.provider, errors: result.errors.length });
    } catch (e) {
      console.error(`Webhook-triggered sync failed for ${token.provider}:`, e);
      pushed.push({ userId: user.id, source: token.provider, errors: 1 });
    }
  }

  /*
   * Safety net for WHOOP.
   *
   * WHOOP is meant to arrive by webhook, which is why it is left out of the
   * frequent Fitbit pull. But a webhook that is misconfigured, or simply never
   * sent, fails silently and leaves a member reading yesterday — which is
   * exactly what happened: the daily cron ran at 05:30 before her night was
   * scored, and nothing came along afterwards to pick it up.
   *
   * So: if a WHOOP member has no sleep recorded for today, try again, at most
   * every half hour. It stops as soon as their night lands, so a member costs a
   * handful of calls on a late morning and nothing at all once they are current.
   */
  const catchUp: { userId: string; source: string; errors: number }[] = [];
  const whoopMembers = await db()
    .select({ user: schema.users, token: schema.oauthTokens })
    .from(schema.oauthTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.oauthTokens.userId))
    .where(eq(schema.oauthTokens.provider, "whoop"));

  if (whoopMembers.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const recent = await db()
      .select()
      .from(schema.dailyMetrics)
      .where(
        and(eq(schema.dailyMetrics.source, "whoop"), eq(schema.dailyMetrics.date, today)),
      );
    const lastTried = await db()
      .select({ userId: schema.dailyMetrics.userId, syncedAt: schema.dailyMetrics.syncedAt })
      .from(schema.dailyMetrics)
      .where(eq(schema.dailyMetrics.source, "whoop"));

    const newestAttempt = new Map<string, number>();
    for (const r of lastTried) {
      const t = r.syncedAt.getTime();
      if (t > (newestAttempt.get(r.userId) ?? 0)) newestAttempt.set(r.userId, t);
    }
    const hasTonight = new Set(
      recent.filter((r) => r.sleepMinutes != null).map((r) => r.userId),
    );

    for (const { user, token } of whoopMembers) {
      if (hasTonight.has(user.id)) continue;
      if (pushed.some((p) => p.userId === user.id)) continue; // already done above
      const since = Date.now() - (newestAttempt.get(user.id) ?? 0);
      if (since < WHOOP_RETRY_MINUTES * 60_000) continue;
      try {
        const result = await syncUser(user, token);
        catchUp.push({ userId: user.id, source: "whoop", errors: result.errors.length });
      } catch (e) {
        console.error("WHOOP catch-up sync failed:", e);
        catchUp.push({ userId: user.id, source: "whoop", errors: 1 });
      }
    }
  }

  const [newest] = await db()
    .select({ syncedAt: schema.dailyMetrics.syncedAt })
    .from(schema.dailyMetrics)
    .where(eq(schema.dailyMetrics.source, "google"))
    .orderBy(desc(schema.dailyMetrics.syncedAt))
    .limit(1);

  const ageMinutes = newest
    ? Math.floor((Date.now() - newest.syncedAt.getTime()) / 60_000)
    : Infinity;

  if (ageMinutes < MIN_MINUTES_BETWEEN_SYNCS) {
    return NextResponse.json({ synced: false, ageMinutes, pushed, catchUp });
  }

  const results = await syncAllUsers("google");
  return NextResponse.json({
    synced: true,
    members: results.length,
    withErrors: results.filter((r) => r.errors.length > 0).length,
    pushed,
    catchUp,
  });
}
