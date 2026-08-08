import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import AutoRefresh from "@/components/AutoRefresh";
import { db, schema } from "@/db";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Apple Watch setup. Apple has no server to connect to, so instead of a consent
 * screen this page hands the phone an address and a code, then watches for the
 * first data to arrive — that arrival is the only honest confirmation that it
 * worked.
 */
export default async function ApplePage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  const userId = currentUserId();
  if (!userId) redirect("/connect");

  const [pairing] = await db()
    .select()
    .from(schema.applePairings)
    .where(eq(schema.applePairings.userId, userId))
    .orderBy(desc(schema.applePairings.createdAt));

  // Only Apple-sourced rows count here: a member who also wears a Fitbit would
  // otherwise be told their phone is working on the strength of Fitbit's data.
  const rows = await db()
    .select({ date: schema.dailyMetrics.date })
    .from(schema.dailyMetrics)
    .where(
      and(eq(schema.dailyMetrics.userId, userId), eq(schema.dailyMetrics.source, "apple")),
    );
  const appleDays = rows.length;

  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const code = searchParams.code ?? pairing?.pairCode ?? null;
  const claimed = !!pairing?.tokenHash;
  const receiving = !!pairing?.lastSeenAt && appleDays > 0;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {!receiving && <AutoRefresh seconds={5} />}

      <header className="text-center">
        <p className="label-caps">Apple Watch</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
          Send your health data
        </h1>
        <p className="mt-2 text-sm text-sub">
          Apple keeps your data on your iPhone, so your phone has to send it — there is no
          &quot;connect&quot; button to press.
        </p>
      </header>

      <section
        className={`rounded-2xl border p-5 shadow-card ${
          receiving ? "border-brass/50 bg-brass/5" : "border-hairline bg-card"
        }`}
      >
        <h2 className="label-caps mb-2">Status</h2>
        {receiving ? (
          <p className="text-lg font-semibold text-ink">
            ✓ Data is arriving — {appleDays} {appleDays === 1 ? "day" : "days"} stored.{" "}
            <Link href="/me" className="underline decoration-hairline underline-offset-2">
              See your numbers
            </Link>
          </p>
        ) : claimed ? (
          <p className="text-sm text-sub">
            Phone is paired. Waiting for the first data — this page updates itself.
          </p>
        ) : (
          <p className="text-sm text-sub">Waiting for your phone to pair. Follow the steps below.</p>
        )}
      </section>

      {!claimed && code && (
        <section className="rounded-2xl border border-brass/30 bg-card p-5 shadow-card">
          <h2 className="label-caps mb-2">Your pairing code</h2>
          <p className="font-display text-4xl font-bold tracking-[0.2em] text-brass">{code}</p>
          <p className="mt-2 text-xs text-faint">
            Valid for 15 minutes, and only works once. Reload the join page for a new one.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <h2 className="label-caps mb-3">Easiest way — Health Auto Export</h2>
        <ol className="list-inside list-decimal space-y-2 text-sm text-sub">
          <li>Install <strong className="text-ink">Health Auto Export</strong> from the App Store.</li>
          <li>
            In the app: <strong className="text-ink">Automations → Add Automation →</strong>{" "}
            choose <strong className="text-ink">REST API</strong>.
          </li>
          <li>
            Set the URL to:
            <code className="mt-1 block overflow-x-auto rounded-lg bg-ivory px-3 py-2 text-xs text-ink">
              {base}/api/pair/{code ?? "YOUR-CODE"}
            </code>
            Open that once in Safari — it returns your token and the address to post to.
          </li>
          <li>
            Back in the app, set the URL to the <strong className="text-ink">endpoint</strong> it
            gave you and add a header{" "}
            <code className="rounded bg-ivory px-1 text-xs text-ink">Authorization</code> with value{" "}
            <code className="rounded bg-ivory px-1 text-xs text-ink">Bearer YOUR-TOKEN</code>.
          </li>
          <li>
            Select these metrics: steps, exercise time, resting heart rate, heart rate variability,
            respiratory rate, VO₂ max, sleep analysis. Set it to run daily.
          </li>
        </ol>
        <p className="mt-3 text-xs text-faint">
          The app costs a few euros. It runs in the background, which is why it is the reliable
          option.
        </p>
      </section>

      <details className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <summary className="cursor-pointer text-sm font-medium text-sub">
          Free alternative — an iPhone Shortcut
        </summary>
        <div className="mt-3 space-y-2 text-sm text-sub">
          <p>
            A Shortcut can read Health data and post it for free, but{" "}
            <strong className="text-ink">
              it cannot read Health while your phone is locked
            </strong>
            , so a scheduled run may quietly do nothing until you next unlock. Fine for a
            once-a-day leaderboard, worse if you want it reliable.
          </p>
          <p>
            Build it with: <em>Find Health Samples</em> for each metric →{" "}
            <em>Get Contents of URL</em> (POST, JSON) to your endpoint with the{" "}
            <code className="rounded bg-ivory px-1 text-xs text-ink">Authorization</code> header,
            sending{" "}
            <code className="rounded bg-ivory px-1 text-xs text-ink">
              {`{"days":[{"date":"…","steps":…}]}`}
            </code>
            .
          </p>
        </div>
      </details>

      <p className="text-center text-sm">
        <Link href="/me" className="text-faint underline decoration-hairline underline-offset-2">
          Skip for now — set my name and birthday
        </Link>
      </p>
    </div>
  );
}
