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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const loggedIn = Boolean(currentUserId());
  return (
    <html lang="en" className={display.variable}>
      <body className="min-h-screen">
        <header className="mx-auto flex max-w-5xl items-end justify-between px-4 pb-4 pt-7">
          <Link href="/" className="group">
            <span className="font-display text-2xl font-bold tracking-tight">
              Friends Leaderboard
            </span>
            <span className="label-caps mt-0.5 block group-hover:text-sub">
              Est. 2026 · Members only
            </span>
          </Link>
          <nav className="flex items-center gap-5 pb-1 text-sm text-sub">
            <Link href="/" className="hover:text-ink">Boards</Link>
            <Link href="/tv" className="hover:text-ink">TV</Link>
            {loggedIn ? (
              <Link href="/me" className="hover:text-ink">Me</Link>
            ) : (
              <Link
                href="/connect"
                className="rounded-full bg-forest px-5 py-2 font-semibold text-ivory shadow-card transition-colors hover:bg-forest-soft"
              >
                Join
              </Link>
            )}
          </nav>
        </header>
        <div className="mx-auto max-w-5xl px-4">
          <div className="border-t border-hairline" />
        </div>
        <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-faint">
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
