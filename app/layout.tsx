import type { Metadata } from "next";
import Link from "next/link";
import { currentUserId } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Friends Leaderboard",
  description: "A private fitness leaderboard for friends",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const loggedIn = Boolean(currentUserId());
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen font-display">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
          <Link href="/" className="text-lg font-bold tracking-tight">
            🏆 Friends Leaderboard
          </Link>
          <nav className="flex items-center gap-4 text-sm text-zinc-400">
            <Link href="/" className="hover:text-zinc-100">Boards</Link>
            {loggedIn ? (
              <Link href="/me" className="hover:text-zinc-100">Me</Link>
            ) : (
              <Link
                href="/connect"
                className="rounded-full bg-accent px-4 py-1.5 font-semibold text-white hover:bg-accent-soft"
              >
                Connect
              </Link>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-16">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-zinc-500">
          <Link href="/privacy" className="hover:text-zinc-300">Privacy</Link>
          <span className="mx-2">·</span>
          No analytics, no trackers. Just friends and step counts.
        </footer>
      </body>
    </html>
  );
}
