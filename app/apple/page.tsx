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

      <section className="rounded-2xl border border-brass/30 bg-card p-5 shadow-card">
        <h2 className="label-caps mb-1">Free — the Shortcuts app you already have</h2>
        <p className="mb-3 text-sm text-sub">
          Nothing to install and nothing to pay. Somebody has to build it once; after that it can
          be shared as a link and everyone else just taps it.
        </p>
        <ol className="list-inside list-decimal space-y-2 text-sm text-sub">
          <li>
            Open this once in Safari to get your key:
            <code className="mt-1 block overflow-x-auto rounded-lg bg-ivory px-3 py-2 text-xs text-ink">
              {base}/api/pair/{code ?? "YOUR-CODE"}
            </code>
          </li>
          <li>
            In <strong className="text-ink">Shortcuts</strong>, add one{" "}
            <strong className="text-ink">Find Health Samples</strong> action per number you want:
            Sleep Analysis, Heart Rate Variability, Resting Heart Rate, Steps, Apple Exercise Time.
            Sleep alone is enough to get on two boards.
          </li>
          <li>
            Add <strong className="text-ink">Get Contents of URL</strong>, set it to{" "}
            <strong className="text-ink">POST</strong>, add header{" "}
            <code className="rounded bg-ivory px-1 text-xs text-ink">Authorization</code> ={" "}
            <code className="rounded bg-ivory px-1 text-xs text-ink">Bearer YOUR-KEY</code>, and
            send a JSON body of just the numbers:
            <code className="mt-1 block overflow-x-auto rounded-lg bg-ivory px-3 py-2 text-xs text-ink">
              {`{"sleep": 428, "hrv": 46, "rhr": 55, "steps": 9100, "exercise": 44}`}
            </code>
            No date needed — leave it out and today is assumed. Send only the fields you have.
          </li>
          <li>
            Under <strong className="text-ink">Automation</strong>, trigger it on{" "}
            <strong className="text-ink">opening an app you use every morning</strong>, and turn
            off &quot;Ask Before Running&quot;.
          </li>
        </ol>
        <p className="mt-3 rounded-lg border-l-2 border-lagoon bg-lagoon/5 px-3.5 py-2.5 text-xs leading-snug text-sub">
          <strong className="font-semibold text-lagoon">Why an app trigger, not a time?</strong>{" "}
          iPhone keeps health data locked away while the phone is locked, so a 7am automation
          quietly fails if you are still asleep. Triggering when you open something guarantees the
          phone is unlocked. Running several times a day is harmless — repeats simply overwrite.
        </p>
      </section>

      <details className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <summary className="cursor-pointer text-sm font-medium text-sub">
          Paid alternative — Health Auto Export, if you want it fully hands-off
        </summary>
        <div className="mt-3 space-y-2 text-sm text-sub">
          <p>
            It syncs in the background with no trigger and nothing to build. The REST API export
            it needs is a <strong className="text-ink">paid</strong> feature, so this only makes
            sense if the Shortcut route annoys you.
          </p>
          <ol className="list-inside list-decimal space-y-1">
            <li>Install Health Auto Export, then <strong className="text-ink">Automations → Add Automation → REST API</strong>.</li>
            <li>Open the pairing link above once in Safari to get your key and endpoint.</li>
            <li>
              Set the URL to that endpoint and add header{" "}
              <code className="rounded bg-ivory px-1 text-xs text-ink">Authorization</code> ={" "}
              <code className="rounded bg-ivory px-1 text-xs text-ink">Bearer YOUR-KEY</code>.
            </li>
            <li>
              Pick: steps, exercise time, resting heart rate, heart rate variability, respiratory
              rate, VO₂ max, sleep analysis. Its format is understood as-is.
            </li>
          </ol>
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
