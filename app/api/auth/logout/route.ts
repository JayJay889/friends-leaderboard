import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  res.cookies.delete("fl_session");
  return res;
}
