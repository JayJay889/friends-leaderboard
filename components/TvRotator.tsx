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
    <div className="fixed inset-0 z-50 flex cursor-none flex-col bg-cream">
      <div className="relative min-h-0 flex-1">
        {slides.map((slide, i) => (
          <div
            key={i}
            className={`absolute inset-0 overflow-y-auto px-10 py-8 transition-opacity duration-700 ${
              i === index ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {slide}
          </div>
        ))}
      </div>
      <nav className="flex items-center justify-center gap-6 pb-5">
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
