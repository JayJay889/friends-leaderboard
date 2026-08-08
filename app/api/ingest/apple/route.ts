import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { hashToken, parseAppleDays, readPayload } from "@/lib/apple";
import { writeMetrics } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Where an iPhone posts its Health data.
 *
 * Apple exposes no server API, so this is the only inbound-write path in the
 * app. It goes through exactly the same merge-and-upsert as the pull providers
 * (writeMetrics), which is what keeps a second device from overwriting a first:
 * rows are keyed by source, and lib/resolve.ts decides which one wins at read
 * time.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "missing bearer token" }, { status: 401 });
  }

  const [pairing] = await db()
    .select()
    .from(schema.applePairings)
    .where(
      and(
        eq(schema.applePairings.tokenHash, hashToken(token)),
        isNull(schema.applePairings.revokedAt),
      ),
    );
  if (!pairing) {
    return NextResponse.json({ error: "unknown or revoked token" }, { status: 401 });
  }

  let days;
  try {
    days = readPayload(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not read body" },
      { status: 400 },
    );
  }

  const { perDate, warnings } = parseAppleDays(days);
  const updatedDates = await writeMetrics(
    pairing.userId,
    "apple",
    perDate,
    [...perDate.keys()],
  );

  await db()
    .update(schema.applePairings)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.applePairings.id, pairing.id));

  return NextResponse.json({ accepted: updatedDates.length, dates: updatedDates, warnings });
}
