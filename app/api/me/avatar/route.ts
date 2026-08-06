import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sanitizeAvatarOptions } from "@/lib/avatar";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Saves character-builder picks. Unknown fields and values are dropped. */
export async function POST(req: NextRequest) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const options = sanitizeAvatarOptions(body);
  await db()
    .update(schema.users)
    // No picks at all = back to the seeded portrait.
    .set({ avatarOptions: Object.keys(options).length ? options : null })
    .where(eq(schema.users.id, userId));

  return NextResponse.json({ ok: true, options });
}
