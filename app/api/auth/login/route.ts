import { NextRequest, NextResponse } from "next/server";
import { randomToken } from "@/lib/crypto";
import { buildAuthUrl, makePkce } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const invite = req.nextUrl.searchParams.get("invite") ?? "";
  const expected = process.env.INVITE_CODE;
  if (!expected || invite !== expected) {
    return NextResponse.redirect(new URL("/connect?error=invite", req.url));
  }

  const state = randomToken(24);
  const { verifier, challenge } = makePkce();

  const res = NextResponse.redirect(buildAuthUrl(state, challenge));
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  res.cookies.set("fl_oauth_state", state, cookieOpts);
  res.cookies.set("fl_pkce_verifier", verifier, cookieOpts);
  return res;
}
