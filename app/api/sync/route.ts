import { NextRequest, NextResponse } from "next/server";
import { SOURCES, type Source } from "@/db/schema";
import { syncAllUsers } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel function limit headroom for multi-user sync

/**
 * Sync endpoint hit by Vercel Cron (Authorization: Bearer <CRON_SECRET> is set
 * automatically when the CRON_SECRET env var exists). Can also be triggered
 * manually with the same header.
 *
 * `?source=google` limits the run to one provider. Vercel's daily cron syncs
 * everything; the frequent job in .github/workflows/sync.yml passes
 * source=google, because Fitbit is the provider that needs polling often and
 * WHOOP is the one that should be pushing to us instead.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const requested = req.nextUrl.searchParams.get("source");
  if (requested && !SOURCES.includes(requested as Source)) {
    return NextResponse.json(
      { error: `unknown source; expected one of ${SOURCES.join(", ")}` },
      { status: 400 },
    );
  }

  const results = await syncAllUsers((requested as Source) ?? undefined);
  const failed = results.filter((r) => r.errors.length > 0);
  return NextResponse.json({
    source: requested ?? "all",
    synced: results.length,
    withErrors: failed.length,
    results,
  });
}
