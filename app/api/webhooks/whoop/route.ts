import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { isConfigured, verifyWebhookSignature, type WhoopWebhookEvent } from "@/lib/whoop";

export const dynamic = "force-dynamic";

/**
 * WHOOP tells us the moment a member's night is scored.
 *
 * This is why WHOOP is not polled: the daily cron would leave a member reading
 * yesterday, and polling every twenty minutes would be hundreds of wasted calls
 * a day against a limit we declared as four. A push costs one request, and only
 * when there is actually something new.
 *
 * WHOOP wants a 2XX within about a second, which is less than a sync takes
 * (token refresh plus three reads). So this verifies, records that the member
 * has something new, and returns. The nudge that the TV already fires does the
 * pull, and treats a flagged member as urgent rather than waiting out the
 * twenty-minute staleness rule.
 */
export async function POST(req: NextRequest) {
  // The raw bytes, not a re-serialised object: the signature covers exactly what
  // was sent, and JSON.stringify of a parsed body is not byte-identical.
  const rawBody = await req.text();

  if (!isConfigured() || !process.env.DATABASE_URL) {
    // Nothing we can verify against. Refuse rather than accept blindly.
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const ok = verifyWebhookSignature(
    rawBody,
    req.headers.get("x-whoop-signature"),
    req.headers.get("x-whoop-signature-timestamp"),
  );
  if (!ok) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event: WhoopWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "malformed body" }, { status: 400 });
  }

  // Only sleep and recovery change anything we display. Workouts feed strain,
  // which we take from the daily cycle rather than individual workouts, so
  // acknowledging them without work is correct rather than lazy.
  const interesting = event.type?.startsWith("sleep.") || event.type?.startsWith("recovery.");
  if (!interesting) {
    return NextResponse.json({ received: event.type, action: "none" });
  }

  const [identity] = await db()
    .select()
    .from(schema.identities)
    .where(
      and(
        eq(schema.identities.provider, "whoop"),
        eq(schema.identities.providerUserId, String(event.user_id)),
      ),
    );

  // A member who disconnected is not an error on WHOOP's side. Acknowledge, or
  // they will keep retrying something we will never act on.
  if (!identity) {
    return NextResponse.json({ received: event.type, action: "unknown member" });
  }

  await db()
    .update(schema.oauthTokens)
    .set({ syncRequestedAt: new Date() })
    .where(
      and(
        eq(schema.oauthTokens.userId, identity.userId),
        eq(schema.oauthTokens.provider, "whoop"),
      ),
    );

  return NextResponse.json({ received: event.type, action: "sync queued" });
}
