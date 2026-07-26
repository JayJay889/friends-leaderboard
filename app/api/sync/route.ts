import { NextRequest, NextResponse } from "next/server";
import { syncAllUsers } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel function limit headroom for multi-user sync

/**
 * Sync endpoint hit by Vercel Cron (Authorization: Bearer <CRON_SECRET> is set
 * automatically when the CRON_SECRET env var exists). Can also be triggered
 * manually with the same header.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await syncAllUsers();
  const failed = results.filter((r) => r.errors.length > 0);
  return NextResponse.json({
    synced: results.length,
    withErrors: failed.length,
    results,
  });
}
