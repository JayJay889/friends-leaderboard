"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const REFRESH_MS = 5 * 60_000; // silent data refresh

/**
 * Full-screen slide rotator for kiosk/TV use. Server-rendered slides come in
 * as children; this only handles timing, fade, and input.
 */
export default function TvRotator({
  slides,
  titles,
  intervalSec,
}: {
  slides: React.ReactNode[];
  titles: string[];
  intervalSec: number;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);

  const go = useCallback(
    (next: number) => setIndex(((next % slides.length) + slides.length) % slides.length),
    [slides.length],
  );

  useEffect(() => {
    const t = setInterval(() => go(index + 1), intervalSec * 1000);
    return () => clearInterval(t);
  }, [index, go, intervalSec]);

  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

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

      {/* Rotation progress toward the next slide */}
      <div className="relative mx-auto mb-2.5 h-0.5 w-44 overflow-hidden rounded-full bg-white/10">
        <div
          key={index}
          className="tv-progress h-full rounded-full bg-brass/80"
          style={{ animationDuration: `${intervalSec}s` }}
        />
      </div>
      <nav className="relative flex items-center justify-center gap-6 pb-5">
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
