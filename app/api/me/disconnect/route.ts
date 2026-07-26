import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/crypto";
import { revokeToken } from "@/lib/google";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Full disconnect (GDPR-style): revokes the Google token, then deletes the
 * user row — oauth_tokens and daily_metrics cascade-delete with it.
 */
export async function POST(req: NextRequest) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tokens = await db()
    .select()
    .from(schema.oauthTokens)
    .where(eq(schema.oauthTokens.userId, userId));

  if (tokens.length > 0) {
    try {
      await revokeToken(decrypt(tokens[0].refreshToken));
    } catch (e) {
      // Still delete local data even if Google revocation hiccups.
      console.error("Token revocation failed (continuing with deletion):", e);
    }
  }

  await db().delete(schema.users).where(eq(schema.users.id, userId));

  const res = NextResponse.redirect(new URL("/?disconnected=1", req.url), { status: 303 });
  res.cookies.delete("fl_session");
  return res;
}
