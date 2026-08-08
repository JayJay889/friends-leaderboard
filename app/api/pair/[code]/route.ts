import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { hashToken, newToken } from "@/lib/apple";

export const dynamic = "force-dynamic";

/**
 * Redeems a pairing code for the bearer token the phone will post with.
 *
 * Called once, by the phone, during setup. The token is generated here rather
 * than at pairing time so the raw value exists only in this response and on the
 * phone — the database only ever holds its hash.
 *
 * Single use: the code is cleared in the same update that stores the hash, and
 * that update is conditional on the code still being unredeemed, so two phones
 * racing the same code cannot both win.
 */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = (params.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });

  const token = newToken();
  const claimed = await db()
    .update(schema.applePairings)
    .set({ tokenHash: hashToken(token), pairCode: null, pairCodeExpiresAt: null })
    .where(
      and(
        eq(schema.applePairings.pairCode, code),
        gt(schema.applePairings.pairCodeExpiresAt, new Date()),
        isNull(schema.applePairings.tokenHash),
        isNull(schema.applePairings.revokedAt),
      ),
    )
    .returning({ id: schema.applePairings.id });

  if (claimed.length === 0) {
    return NextResponse.json(
      { error: "That code is not valid any more. Start again from the join page." },
      { status: 404 },
    );
  }

  const base = (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  return NextResponse.json({ token, endpoint: `${base}/api/ingest/apple` });
}
