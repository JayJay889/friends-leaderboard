import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { currentUserId } from "@/lib/session";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
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
    <html lang="en" className={inter.variable}>
      <body className={`min-h-screen ${inter.className}`}>
        <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink text-xs font-bold text-white">
              F
            </span>
            Friends Leaderboard
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium">
            <Link href="/" className="rounded-lg px-3 py-1.5 text-sub hover:bg-ivory hover:text-ink">
              Boards
            </Link>
            <Link href="/hall" className="rounded-lg px-3 py-1.5 text-sub hover:bg-ivory hover:text-ink">
              Hall of Fame
            </Link>
            <Link href="/tv" className="rounded-lg px-3 py-1.5 text-sub hover:bg-ivory hover:text-ink">
              TV
            </Link>
            {loggedIn ? (
              <Link href="/me" className="rounded-lg px-3 py-1.5 text-sub hover:bg-ivory hover:text-ink">
                Me
              </Link>
            ) : (
              <Link
                href="/connect"
                className="ml-2 rounded-lg bg-ink px-4 py-2 font-semibold text-white shadow-card transition-opacity hover:opacity-85"
              >
                Join
              </Link>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-16 pt-4">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-faint">
          <Link href="/privacy" className="underline decoration-hairline underline-offset-2 hover:text-sub">
            Privacy
          </Link>
          <span className="mx-2">·</span>
          No analytics, no trackers. Just friends and step counts.
          <span className="mx-2">·</span>
          Avatars: Notionists by Zoish (CC0), generated locally
        </footer>
      </body>
    </html>
  );
}
