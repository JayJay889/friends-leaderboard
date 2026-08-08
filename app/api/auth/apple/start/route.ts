import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { resolveAccount } from "@/lib/accounts";
import { newPairCode, PAIR_CODE_TTL_MIN } from "@/lib/apple";
import { currentUserId, sessionCookieValue } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Starts an Apple Watch pairing.
 *
 * There is no Apple OAuth to sign in with — HealthKit has no server side at all
 * — so the account is created here and identified by a bearer token the phone
 * claims with a short code. The member is signed in immediately, so they can set
 * their name and birthday while the phone side is still being set up.
 */
export async function GET(req: NextRequest) {
  const invite = req.nextUrl.searchParams.get("invite") ?? "";
  const expected = process.env.INVITE_CODE;
  if (!expected || invite !== expected) {
    return NextResponse.redirect(new URL("/connect?error=invite", req.url));
  }

  const sessionUserId = currentUserId();
  // A signed-in member is adding a second device, not creating an account.
  const { userId } = await resolveAccount({
    provider: "apple",
    providerUserId: crypto.randomUUID(),
    sessionUserId,
  });

  const pairCode = newPairCode();
  await db()
    .insert(schema.applePairings)
    .values({
      id: crypto.randomUUID(),
      userId,
      pairCode,
      pairCodeExpiresAt: new Date(Date.now() + PAIR_CODE_TTL_MIN * 60_000),
    });

  const res = NextResponse.redirect(new URL(`/apple?code=${pairCode}`, req.url));
  res.cookies.set("fl_session", sessionCookieValue(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
