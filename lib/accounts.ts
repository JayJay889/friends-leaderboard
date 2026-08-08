import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Source } from "@/db/schema";

export interface ResolvedAccount {
  userId: string;
  isNew: boolean;
  /** True when this connection was attached to an already-signed-in member. */
  linked: boolean;
}

/**
 * Turns "someone just authorized provider X" into a user id.
 *
 * Three cases, in priority order:
 *
 *  1. The identity is already known → that member is signing in again.
 *  2. Nobody owns the identity but the request carries a valid session → the
 *     signed-in member is ADDING a device. Without this branch, connecting a
 *     WHOOP after a Fitbit would silently create a second account and the
 *     member would appear twice on the boards.
 *  3. Otherwise → a genuinely new member.
 *
 * Identities are never matched on email: it is unreliable across providers and
 * a poor thing to key accounts on. Being signed in is the only link signal.
 */
export async function resolveAccount(opts: {
  provider: Source;
  providerUserId: string;
  givenName?: string | null;
  sessionUserId?: string | null;
}): Promise<ResolvedAccount> {
  const { provider, providerUserId, givenName, sessionUserId } = opts;

  const [existing] = await db()
    .select()
    .from(schema.identities)
    .where(
      and(
        eq(schema.identities.provider, provider),
        eq(schema.identities.providerUserId, providerUserId),
      ),
    );
  if (existing) return { userId: existing.userId, isNew: false, linked: false };

  if (sessionUserId) {
    const [user] = await db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, sessionUserId));
    if (user) {
      await db()
        .insert(schema.identities)
        .values({ provider, providerUserId, userId: user.id })
        .onConflictDoNothing();
      return { userId: user.id, isNew: false, linked: true };
    }
  }

  const userId = crypto.randomUUID();
  await db()
    .insert(schema.users)
    .values({
      id: userId,
      displayName: givenName?.slice(0, 40) || "New Friend",
      avatarEmoji: "🐣",
      // First device connected becomes the default winner in resolveRows().
      primarySource: provider,
      ...(provider === "google" ? { googleUserId: providerUserId } : {}),
    });
  await db().insert(schema.identities).values({ provider, providerUserId, userId });
  return { userId, isNew: true, linked: false };
}
