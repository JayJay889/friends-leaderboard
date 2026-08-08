"use client";

import { useEffect } from "react";

/**
 * Asks the server to pull fresh Fitbit data if it has gone stale.
 *
 * Mounted on the always-on surfaces (the TV and the boards). The server decides
 * whether anything actually happens — see /api/sync/nudge — so this can fire
 * freely without coordinating between screens. Failures are ignored on purpose:
 * a missed nudge just means the next one does the work, and the daily cron is
 * still the backstop.
 */
export default function SyncNudge({ minutes = 5 }: { minutes?: number }) {
  useEffect(() => {
    const nudge = () => {
      fetch("/api/sync/nudge", { method: "POST", keepalive: true }).catch(() => {});
    };
    nudge(); // once on load, so opening the page is enough to catch up
    const t = setInterval(nudge, minutes * 60_000);
    return () => clearInterval(t);
  }, [minutes]);
  return null;
}
