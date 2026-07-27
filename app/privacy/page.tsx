export const metadata = { title: "Privacy — Friends Leaderboard" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-5 text-sm leading-relaxed text-sub">
      <h1 className="font-display text-3xl font-bold text-ink">Privacy</h1>
      <p>
        This is a private, invite-only leaderboard for a group of friends. No ads, no analytics,
        no third-party trackers, no selling anything. Here is exactly what happens with your data,
        in plain language.
      </p>

      <h2 className="font-display text-lg font-semibold text-ink">What we read from Google</h2>
      <p>
        With your permission, we read the following from your Google account&apos;s health data
        (Fitbit / Pixel Watch) via the Google Health API: steps, Active Zone Minutes, sleep
        (duration, stages, efficiency), resting heart rate, heart-rate variability (HRV),
        breathing rate, and VO₂ max estimate. Daily summaries only — never your location, never
        intraday raw sensor streams beyond what&apos;s listed here.
      </p>

      <h2 className="font-display text-lg font-semibold text-ink">What we store</h2>
      <p>
        One row per person per day with the daily values above, plus your display name, chosen
        emoji, and encrypted Google tokens used for syncing. Data lives in a Postgres database
        used only by this app.
      </p>

      <h2 className="font-display text-lg font-semibold text-ink">What friends can see</h2>
      <ul className="list-inside list-disc">
        <li>Steps and Active Zone Minutes: actual numbers, ranks, and medals.</li>
        <li>
          Sleep, Health, and Most&nbsp;Chill boards: <strong>computed scores and ranks only</strong>.
          Nobody ever sees your raw sleep, heart-rate, or HRV values — only you can, on your own
          dashboard.
        </li>
      </ul>

      <h2 className="font-display text-lg font-semibold text-ink">Deleting your data</h2>
      <p>
        On your dashboard, &quot;Disconnect &amp; delete my data&quot; revokes the app&apos;s Google
        access and permanently deletes your tokens and every stored metric, immediately. You can
        also revoke access anytime at{" "}
        <a className="underline" href="https://myaccount.google.com/permissions">
          myaccount.google.com/permissions
        </a>
        .
      </p>

      <h2 className="font-display text-lg font-semibold text-ink">A note on health data</h2>
      <p>
        Scores here (including HRV / &quot;Most Chill&quot;) are playful recovery proxies computed by
        us, not medical measurements or advice.
      </p>

      <h2 className="font-display text-lg font-semibold text-ink">Contact</h2>
      <p>It&apos;s a friends app — message the group chat and the person running it will help.</p>
    </article>
  );
}
