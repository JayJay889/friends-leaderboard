import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { encrypt } from "@/lib/crypto";
import { exchangeCode, googleUserIdFromIdToken } from "@/lib/google";
import { sessionCookieValue } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const storedState = req.cookies.get("fl_oauth_state")?.value;
  const verifier = req.cookies.get("fl_pkce_verifier")?.value;

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/connect?error=${reason}`, req.url));

  if (params.get("error")) return fail("denied");
  if (!code || !state || !storedState || state !== storedState || !verifier) return fail("state");

  let tokens;
  try {
    tokens = await exchangeCode(code, verifier);
  } catch (e) {
    console.error("Token exchange failed:", e);
    return fail("exchange");
  }

  if (!tokens.refresh_token) return fail("no_refresh_token");
  if (!tokens.id_token) return fail("no_id_token");
  const googleUserId = googleUserIdFromIdToken(tokens.id_token);
  const grantedScopes = tokens.scope.split(" ").filter((s) => s.startsWith("https://"));

  const existing = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.googleUserId, googleUserId));

  let userId: string;
  let isNew = false;
  if (existing.length > 0) {
    userId = existing[0].id;
  } else {
    userId = crypto.randomUUID();
    isNew = true;
    await db().insert(schema.users).values({
      id: userId,
      displayName: "New Friend",
      avatarEmoji: "🐣",
      googleUserId,
    });
  }

  const tokenRow = {
    userId,
    refreshToken: encrypt(tokens.refresh_token),
    accessToken: encrypt(tokens.access_token),
    tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    grantedScopes,
    connectedAt: new Date(),
  };
  await db()
    .insert(schema.oauthTokens)
    .values(tokenRow)
    .onConflictDoUpdate({ target: schema.oauthTokens.userId, set: tokenRow });

  const res = NextResponse.redirect(new URL(isNew ? "/me?welcome=1" : "/me", req.url));
  res.cookies.set("fl_session", sessionCookieValue(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  res.cookies.delete("fl_oauth_state");
  res.cookies.delete("fl_pkce_verifier");
  return res;
}
