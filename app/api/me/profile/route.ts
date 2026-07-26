import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const EMOJI_MAX_LEN = 8; // some emoji are multi-codepoint

export async function POST(req: NextRequest) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const displayName = String(form.get("displayName") ?? "").trim().slice(0, 40);
  const avatarEmoji = String(form.get("avatarEmoji") ?? "").trim().slice(0, EMOJI_MAX_LEN);
  if (!displayName) {
    return NextResponse.redirect(new URL("/me?error=name", req.url), { status: 303 });
  }

  await db()
    .update(schema.users)
    .set({ displayName, avatarEmoji: avatarEmoji || "🙂" })
    .where(eq(schema.users.id, userId));

  return NextResponse.redirect(new URL("/me", req.url), { status: 303 });
}
