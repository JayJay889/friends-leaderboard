import { NextRequest, NextResponse } from "next/server";
import { randomToken } from "@/lib/crypto";
import { buildAuthUrl, isConfigured } from "@/lib/whoop";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const invite = req.nextUrl.searchParams.get("invite") ?? "";
  const expected = process.env.INVITE_CODE;
  if (!expected || invite !== expected) {
    return NextResponse.redirect(new URL("/connect?error=invite", req.url));
  }
  if (!isConfigured()) {
    return NextResponse.redirect(new URL("/connect?error=whoop_unconfigured", req.url));
  }

  // WHOOP documents no PKCE support, so state is the only CSRF guard here.
  const state = randomToken(24);
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("fl_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
