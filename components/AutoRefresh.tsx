"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-pulls the server component every few seconds. Used on the Apple setup page
 * so "waiting for your first data" turns into "it arrived" on its own — the
 * person is watching that line to find out whether their phone is configured
 * correctly, and asking them to pull-to-refresh to find out is a poor answer.
 */
export default function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
