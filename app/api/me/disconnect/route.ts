import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/crypto";
import { revokeToken } from "@/lib/google";
import { currentUserId } from "@/lib/session";
import { revokeToken as revokeWhoop } from "@/lib/whoop";

export const dynamic = "force-dynamic";

/**
 * Full disconnect (GDPR-style): revokes every connected provider, then deletes
 * the user row — identities, oauth_tokens, apple_pairings and daily_metrics all
 * cascade-delete with it. WHOOP's developer terms require this to be reachable
 * in-app, which it is, from /me.
 */
export async function POST(req: NextRequest) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tokens = await db()
    .select()
    .from(schema.oauthTokens)
    .where(eq(schema.oauthTokens.userId, userId));

  for (const token of tokens) {
    try {
      if (token.provider === "whoop") {
        // WHOOP revokes by access token, not refresh token.
        if (token.accessToken) await revokeWhoop(decrypt(token.accessToken));
      } else {
        await revokeToken(decrypt(token.refreshToken));
      }
    } catch (e) {
      // Still delete local data even if a provider's revocation hiccups.
      console.error(`${token.provider} revocation failed (continuing with deletion):`, e);
    }
  }

  await db().delete(schema.users).where(eq(schema.users.id, userId));

  const res = NextResponse.redirect(new URL("/?disconnected=1", req.url), { status: 303 });
  res.cookies.delete("fl_session");
  return res;
}
