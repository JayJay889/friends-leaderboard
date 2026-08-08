import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { resolveAccount } from "@/lib/accounts";
import { encrypt } from "@/lib/crypto";
import { exchangeCode, identityFromIdToken } from "@/lib/google";
import { currentUserId, sessionCookieValue } from "@/lib/session";
import { syncUser } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const { googleUserId, givenName } = identityFromIdToken(tokens.id_token);
  const grantedScopes = tokens.scope.split(" ").filter((s) => s.startsWith("https://"));

  // A signed-in member reaching here is ADDING a device, not creating an account.
  const { userId, isNew } = await resolveAccount({
    provider: "google",
    providerUserId: googleUserId,
    givenName,
    sessionUserId: currentUserId(),
  });

  const tokenRow = {
    userId,
    provider: "google" as const,
    refreshToken: encrypt(tokens.refresh_token),
    accessToken: encrypt(tokens.access_token),
    tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    grantedScopes,
    connectedAt: new Date(),
    syncRequestedAt: null,
  };
  await db()
    .insert(schema.oauthTokens)
    .values(tokenRow)
    .onConflictDoUpdate({
      target: [schema.oauthTokens.userId, schema.oauthTokens.provider],
      set: tokenRow,
    });

  // Sync this member inline so their data is on the boards the moment they land.
  try {
    const [u] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
    if (u) await syncUser(u, { ...tokenRow, userId });
  } catch (e) {
    console.error("Initial sync failed (cron will catch up):", e);
  }

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
