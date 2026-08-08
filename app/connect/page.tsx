import { isConfigured as whoopConfigured } from "@/lib/whoop";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invite: "That invite code isn't right — ask the group for the current one.",
  denied: "Sign-in was cancelled. Try again whenever you like.",
  state: "The sign-in flow expired or got mixed up. Please try again.",
  exchange: "The provider rejected the sign-in. Please try again.",
  no_refresh_token: "No offline access was returned — try again (you may need to re-approve).",
  no_id_token: "Google didn't identify your account — please try again.",
  whoop_profile: "WHOOP wouldn't share your profile — please try again.",
  whoop_unconfigured: "WHOOP isn't set up on this deployment yet.",
};

function Explainers() {
  return (
    <div className="text-sm leading-relaxed text-sub">
      <h2 className="label-caps mb-2">What we read</h2>
      <ul className="list-inside list-disc space-y-1">
        <li>Steps &amp; Active Zone Minutes</li>
        <li>Sleep duration, stages &amp; efficiency</li>
        <li>Resting heart rate, HRV, breathing rate &amp; VO₂ max</li>
      </ul>
      <p className="mt-3">
        You can untick any of these on Google&apos;s consent screen — you&apos;ll simply not appear
        on boards that need that data.
      </p>

      <h2 className="label-caps mb-2 mt-6">What friends see</h2>
      <p>
        Steps and Active Zone Minutes are shown as numbers. Sleep, heart and calm boards show{" "}
        <strong className="text-ink">scores and ranks only</strong> — nobody sees your raw sleep
        or heart data.
      </p>

      <h2 className="label-caps mb-2 mt-6">Before you start</h2>
      <ul className="list-inside list-disc space-y-1">
        <li>
          Your Fitbit account must already be{" "}
          <strong className="text-ink">migrated to your Google account</strong> (the Fitbit app
          prompts for this; legacy Fitbit-only logins can&apos;t use the new API).
        </li>
        <li>
          Google will warn that the app is &quot;unverified&quot; — expected for a private friends
          app. Click <em>Continue</em>.
        </li>
        <li>You can disconnect anytime; that deletes all your stored data.</li>
      </ul>
    </div>
  );
}

/**
 * One card per device, all three equal weight. No user-agent guessing: a WHOOP
 * wearer is on either platform, and guessing wrong costs more than a deliberate
 * tap. Each card carries only the caveat that applies to it — the Google account
 * warning belongs to Fitbit, the extra setup belongs to Apple.
 */
function DevicePicker({ invite }: { invite: string }) {
  const q = `?invite=${encodeURIComponent(invite)}`;
  const card =
    "block rounded-xl border border-hairline bg-ivory px-4 py-3.5 transition-colors hover:border-brass/60";

  return (
    <div className="space-y-3">
      <a href={`/api/auth/login${q}`} className={card}>
        <span className="font-display text-lg font-semibold text-ink">Fitbit</span>
        <span className="mt-0.5 block text-sm text-sub">
          Sign in with the Google account your Fitbit is on — any other account lands here
          empty.
        </span>
      </a>

      {whoopConfigured() && (
        <a href={`/api/auth/whoop/login${q}`} className={card}>
          <span className="font-display text-lg font-semibold text-ink">WHOOP</span>
          <span className="mt-0.5 block text-sm text-sub">
            Sign in with WHOOP. One tap, nothing to install.
          </span>
        </a>
      )}

      <a href={`/api/auth/apple/start${q}`} className={card}>
        <span className="font-display text-lg font-semibold text-ink">Apple Watch</span>
        <span className="mt-0.5 block text-sm text-sub">
          A few extra steps on your iPhone — Apple keeps health data on the phone, so the phone
          has to send it.
        </span>
      </a>

      {/*
        Honest guidance rather than an upsell: a second device only earns its
        keep when it fills a gap. WHOOP reports no VO₂ max, which is what the
        Fitness and Age Defied boards are built on.
      */}
      <p className="rounded-lg border-l-2 border-lagoon bg-lagoon/5 px-3.5 py-2.5 text-sm leading-snug text-sub">
        <strong className="font-semibold text-lagoon">Wearing more than one?</strong> Connect
        one now — you can add another later from your profile. Worth it mainly for WHOOP
        wearers: adding your iPhone fills in VO₂ max, which unlocks the Fitness and Age Defied
        boards. We keep the better number for each measurement, never double-count.
      </p>
    </div>
  );
}

export default function ConnectPage({
  searchParams,
}: {
  searchParams: { error?: string; invite?: string };
}) {
  const error = searchParams.error ? ERRORS[searchParams.error] ?? "Something went wrong — try again." : null;
  // A correct code in the URL (the TV QR encodes one) unlocks the one-tap page.
  const invited =
    !!process.env.INVITE_CODE && !error && searchParams.invite === process.env.INVITE_CODE;

  if (invited) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <header className="text-center">
          <p className="label-caps">You&apos;re invited</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Join the leaderboard</h1>
          <p className="mt-2 text-sm text-sub">Pick your device. Takes about a minute.</p>
        </header>

        <div className="rounded-2xl border border-brass/30 bg-card p-6 shadow-card">
          <DevicePicker invite={searchParams.invite!} />
          <ul className="mt-4 space-y-1 text-xs leading-relaxed text-faint">
            <li>Friends see scores and ranks only — never your raw data.</li>
            <li>Disconnect anytime; that deletes all your stored data.</li>
          </ul>
        </div>

        <details className="rounded-2xl border border-hairline bg-card p-6 shadow-card">
          <summary className="cursor-pointer text-sm font-medium text-sub">
            The fine print — what we read &amp; what friends see
          </summary>
          <div className="mt-4">
            <Explainers />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="text-center">
        <p className="label-caps">Membership application</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Join the leaderboard</h1>
        <p className="mt-2 text-sm text-sub">
          Connect your Fitbit through your Google account. Takes about a minute.
        </p>
      </header>

      {error && (
        <p className="rounded-xl border border-brick/30 bg-brick/5 px-4 py-3 text-sm text-brick">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-hairline bg-card p-6 shadow-card">
        <Explainers />
      </section>

      <form action="/api/auth/login" method="get" className="rounded-2xl border border-brass/30 bg-card p-6 shadow-card">
        <label className="block text-sm text-sub">
          Invite code
          <input
            name="invite"
            required
            autoComplete="off"
            defaultValue={searchParams.invite ?? ""}
            placeholder="ask the group chat"
            className="mt-1 block w-full rounded-lg border border-hairline bg-ivory px-3 py-2 text-ink focus:border-forest-soft focus:outline-none"
          />
        </label>
        <p className="mt-4 rounded-lg border-l-2 border-lagoon bg-lagoon/5 px-3.5 py-2.5 text-sm leading-snug text-sub">
          <strong className="font-semibold text-lagoon">
            Use the Google account your Fitbit is on.
          </strong>{" "}
          Any other account lands here empty.
        </p>
        <button className="mt-4 w-full rounded-xl bg-brass px-4 py-3 font-semibold text-[#101518] shadow-card transition-colors hover:bg-brass-soft">
          Connect Fitbit
        </button>
        {whoopConfigured() && (
          <p className="mt-3 text-center text-xs text-faint">
            On a WHOOP? Enter the code, then use the link the group sent you.
          </p>
        )}
      </form>
    </div>
  );
}
