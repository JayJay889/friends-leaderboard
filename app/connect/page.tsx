export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invite: "That invite code isn't right — ask the group for the current one.",
  denied: "Google sign-in was cancelled. Try again whenever you like.",
  state: "The sign-in flow expired or got mixed up. Please try again.",
  exchange: "Google rejected the sign-in. Please try again.",
  no_refresh_token: "Google didn't return offline access — try again (you may need to re-approve).",
  no_id_token: "Google didn't identify your account — please try again.",
};

export default function ConnectPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const error = searchParams.error ? ERRORS[searchParams.error] ?? "Something went wrong — try again." : null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Join the leaderboard 🏃</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Connect your Fitbit through your Google account. Takes about a minute.
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-white/5 bg-surface-raised p-5 text-sm leading-relaxed text-zinc-300">
        <h2 className="mb-2 font-bold text-zinc-100">What we read</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>👟 Steps &amp; Active Zone Minutes</li>
          <li>😴 Sleep duration, stages &amp; efficiency</li>
          <li>❤️ Resting heart rate, HRV, breathing rate &amp; VO₂ max</li>
        </ul>
        <p className="mt-3">
          You can untick any of these on Google&apos;s consent screen — you&apos;ll simply not appear
          on boards that need that data.
        </p>

        <h2 className="mb-2 mt-5 font-bold text-zinc-100">What friends see</h2>
        <p>
          Steps and Active Zone Minutes are shown as numbers. Sleep, heart and calm boards show{" "}
          <strong>scores and ranks only</strong> — nobody sees your raw sleep or heart data.
        </p>

        <h2 className="mb-2 mt-5 font-bold text-zinc-100">Before you start</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>
            Your Fitbit account must already be{" "}
            <strong>migrated to your Google account</strong> (the Fitbit app prompts for this;
            legacy Fitbit-only logins can&apos;t use the new API).
          </li>
          <li>
            Google will warn that the app is &quot;unverified&quot; — that&apos;s expected for a
            private friends app. Click <em>Continue</em>.
          </li>
          <li>You can disconnect anytime; that deletes all your stored data.</li>
        </ul>
      </section>

      <form action="/api/auth/login" method="get" className="rounded-2xl border border-accent/30 bg-surface-raised p-5">
        <label className="block text-sm text-zinc-400">
          Invite code
          <input
            name="invite"
            required
            autoComplete="off"
            placeholder="ask the group chat"
            className="mt-1 block w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-zinc-100"
          />
        </label>
        <button className="mt-4 w-full rounded-xl bg-accent px-4 py-3 font-bold text-white hover:bg-accent-soft">
          Connect with Google
        </button>
      </form>
    </div>
  );
}
