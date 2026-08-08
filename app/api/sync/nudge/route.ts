import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { syncAllUsers, syncUser } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Never pull Fitbit more often than this, however many screens are watching. */
const MIN_MINUTES_BETWEEN_SYNCS = 20;

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
 * only possible effect is this group's own data being up to date. Fitbit only —
 * WHOOP is meant to push to us, and Apple already does.
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
    return NextResponse.json({ synced: false, ageMinutes, pushed });
  }

  const results = await syncAllUsers("google");
  return NextResponse.json({
    synced: true,
    members: results.length,
    withErrors: results.filter((r) => r.errors.length > 0).length,
    pushed,
  });
}
