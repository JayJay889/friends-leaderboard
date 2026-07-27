import type { Metadata } from "next";
import { Barlow, Montserrat } from "next/font/google";
import Link from "next/link";
import { currentUserId } from "@/lib/session";
import "./globals.css";

// Free stand-ins for WHOOP's pairing: Proxima Nova (words) + DINPro (numbers).
const words = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-words",
});
const num = Barlow({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-num",
});

export const metadata: Metadata = {
  title: "Friends Leaderboard",
  description: "A private fitness leaderboard for friends",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const loggedIn = Boolean(currentUserId());
  return (
    <html lang="en" className={`${words.variable} ${num.variable}`}>
      <body className="min-h-screen">
        <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-6">
          <Link href="/" className="hl text-sm text-ink">
            Friends<span className="text-brass">/</span>Leaderboard
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
                className="hl ml-2 rounded-full bg-brass px-4 py-2 !text-xs text-[#101518] transition-colors hover:bg-brass-soft"
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
          No analytics, no trackers. Just friends and health scores.
          <span className="mx-2">·</span>
          Avatars: Notionists by Zoish (CC0), generated locally
        </footer>
      </body>
    </html>
  );
}
