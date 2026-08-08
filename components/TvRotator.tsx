"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import SyncNudge from "./SyncNudge";

/**
 * Full-screen slide rotator for kiosk/TV use. Server-rendered slides come in
 * as children; this only handles timing, fade, and input.
 */
export default function TvRotator({
  slides,
  titles,
  intervalSec,
  refreshSec = 30,
  alertKey,
  corner,
}: {
  slides: React.ReactNode[];
  titles: string[];
  intervalSec: number;
  /** How often to silently re-pull the boards, so new joiners show up fast. */
  refreshSec?: number;
  /**
   * Identifies a slide worth interrupting the rotation for — currently whoever
   * just joined. When this changes to a new value the rotator jumps to slide 0
   * so the person watching sees themselves, instead of waiting out the cycle.
   */
  alertKey?: string;
  corner?: React.ReactNode;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const shownAlert = useRef<string | undefined>(undefined);

  const go = useCallback(
    (next: number) => setIndex(((next % slides.length) + slides.length) % slides.length),
    [slides.length],
  );

  useEffect(() => {
    const t = setInterval(() => go(index + 1), intervalSec * 1000);
    return () => clearInterval(t);
  }, [index, go, intervalSec]);

  // A refresh can add or drop the welcome slide, which shifts every index.
  // Jump to a newly arrived newcomer; otherwise just stay in range.
  useEffect(() => {
    if (alertKey && alertKey !== shownAlert.current) {
      shownAlert.current = alertKey;
      setIndex(0);
      return;
    }
    if (!alertKey) shownAlert.current = undefined;
    setIndex((i) => (i < slides.length ? i : 0));
  }, [alertKey, slides.length]);

  useEffect(() => {
    const t = setInterval(() => router.refresh(), refreshSec * 1000);
    return () => clearInterval(t);
  }, [router, refreshSec]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go]);

  return (
    <div className="fixed inset-0 z-50 flex cursor-none flex-col overflow-hidden bg-cream">
      {/* Ambient aurora */}
      <div className="aurora aurora-a left-[-12%] top-[-18%] h-[55vh] w-[55vw]" />
      <div className="aurora aurora-b bottom-[-20%] right-[-12%] h-[60vh] w-[55vw]" />

      <div className="relative min-h-0 flex-1">
        {slides.map((slide, i) => (
          <div
            key={i}
            className={`absolute inset-0 overflow-y-auto px-10 py-8 transition-all duration-700 ease-out ${
              i === index
                ? "tv-active translate-y-0 scale-100 opacity-100"
                : "pointer-events-none translate-y-3 scale-[0.985] opacity-0"
            }`}
          >
            {slide}
          </div>
        ))}
      </div>

      <SyncNudge />

      {corner && <div className="absolute bottom-6 right-8 z-10">{corner}</div>}

      {/* Rotation progress toward the next slide */}
      <div className="relative mx-auto mb-2.5 h-0.5 w-44 overflow-hidden rounded-full bg-white/10">
        <div
          key={index}
          className="tv-progress h-full rounded-full bg-brass/80"
          style={{ animationDuration: `${intervalSec}s` }}
        />
      </div>
      {/* Padded clear of the corner badge so the tabs never run underneath it. */}
      <nav className="relative flex flex-wrap items-center justify-center gap-x-6 gap-y-1 px-36 pb-5">
        {titles.map((title, i) => (
          <button
            key={title}
            onClick={() => go(i)}
            className={`label-caps cursor-pointer transition-colors ${
              i === index ? "!text-brass" : "hover:!text-sub"
            }`}
          >
            {title}
          </button>
        ))}
      </nav>
    </div>
  );
}
