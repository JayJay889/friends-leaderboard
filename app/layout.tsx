import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import Link from "next/link";
import { currentUserId } from "@/lib/session";
import "./globals.css";

const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Friends Leaderboard",
  description: "A private fitness leaderboard for friends",
  robots: { index: false, follow: false },
};

function dateline(): string {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  // ISO week number
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  const m = now.getMonth() + 1;
  const semester =
    m >= 4 && m <= 9
      ? `Summer ${now.getFullYear()}`
      : `Winter ${m >= 10 ? now.getFullYear() : now.getFullYear() - 1}`;
  return `${date} · Week ${week} · ${semester} Championship`;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const loggedIn = Boolean(currentUserId());
  return (
    <html lang="en" className={display.variable}>
      <body className="min-h-screen">
        <header className="mx-auto max-w-4xl px-4 pt-8 text-center">
          <p className="label-caps">Est. 2026 · Members only</p>
          <Link href="/" className="mt-1 block font-display text-5xl font-bold tracking-tight">
            Friends Leaderboard
          </Link>
          <div className="rule-double mt-4" />
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2 text-left">
            <p className="label-caps !text-sub">{dateline()}</p>
            <nav className="label-caps flex items-center gap-5 !text-sub">
              <Link href="/" className="hover:!text-ink">Boards</Link>
              <Link href="/hall" className="hover:!text-ink">Hall of Fame</Link>
              <Link href="/tv" className="hover:!text-ink">TV</Link>
              {loggedIn ? (
                <Link href="/me" className="hover:!text-ink">Me</Link>
              ) : (
                <Link href="/connect" className="!text-forest hover:!text-forest-soft">
                  Join the club →
                </Link>
              )}
            </nav>
          </div>
          <div className="border-t border-ink" />
        </header>
        <main className="mx-auto max-w-4xl px-4 pb-16 pt-8">{children}</main>
        <footer className="mx-auto max-w-4xl px-4 pb-10 text-xs text-faint">
          <div className="mb-3 border-t border-hairline" />
          <Link href="/privacy" className="underline decoration-hairline underline-offset-2 hover:text-sub">
            Privacy
          </Link>
          <span className="mx-2">·</span>
          No analytics, no trackers. Just friends and step counts.
          <span className="mx-2">·</span>
          Portraits: Lorelei by Lisa Wischofsky (CC BY 4.0), generated locally
        </footer>
      </body>
    </html>
  );
}
