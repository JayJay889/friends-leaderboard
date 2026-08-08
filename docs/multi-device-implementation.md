# Implementation plan: WHOOP + Apple Watch

Companion to [multi-device-concept.md](./multi-device-concept.md), which holds the
*why*. This is the *how*: file-by-file, in the order it should be built, with the
verification step for each phase.

Written 2026-08-07.

**Status: Phases 0 and 1 are BUILT** (2026-08-07), not yet deployed and not yet
verified against a real WHOOP account. Phase 2 (fairness) and Phase 3 (Apple) are
still plans. What exists:

| | |
|---|---|
| Schema | `identities`, `apple_pairings`, `oauth_tokens(user_id, provider)`, `daily_metrics(user_id, date, source)` + `hrv_sdnn` / `strain_native` / `recovery_native`, `users.primary_source` |
| Migration | `db/migrations/0001_multi_device.sql` — rehearsed on a scratch DB, idempotent, **not run against prod** |
| Resolution | `lib/resolve.ts` — priority-ranked, per-metric, sleep resolved as a unit |
| Providers | `lib/providers/{types,google,whoop}.ts`; `lib/sync.ts` is now dispatch + merge + upsert only |
| WHOOP | `lib/whoop.ts` (OAuth, paging, revoke), `/api/auth/whoop/{login,callback}` |
| Accounts | `lib/accounts.ts` — links a new provider to the signed-in member instead of duplicating them |
| UI | device picker on `/connect`, per-provider list on `/me`, per-provider revoke on disconnect |
| Demo | `npm run dev:demo` — the fake group now spans Fitbit, WHOOP and Apple |

Verified: 10 fixture checks (resolution, strain inversion, HRV unit detection,
timezone date attribution), migration rehearsal on a scratch Postgres, all routes
200 in demo mode, `tsc --noEmit` clean, production build clean.

---

## 0. Before any code

### 0.1 Unblock the slow things now

- **Submit the WHOOP app for approval.** Dev apps are capped at 10 members and
  approval has lead time. Create the app at
  [developer-dashboard.whoop.com](https://developer-dashboard.whoop.com/), register
  `https://friends-leaderboard.vercel.app/api/auth/whoop/callback` and
  `http://localhost:3000/api/auth/whoop/callback` as redirect URLs, then submit.
  Everything else can be built against the 10-member dev cap in the meantime.
- **Find a WHOOP tester.** There is no WHOOP sandbox — verifying the mapper needs one
  real WHOOP member. Build against recorded fixtures, but budget a session with a real
  account before shipping Phase 1.

### 0.2 The database footgun

`.env.local`'s `DATABASE_URL` points at **production Supabase**, so `npm run db:push`
writes to prod. That is how `avatar_options` got there.

For this project that is not acceptable — Phase 0 changes a primary key. Rules for
every migration below:

1. Spin up a local Postgres and point a separate `.env.migrate` at it. Test the
   migration there first.
2. Use `npx drizzle-kit generate` to produce reviewable SQL, **not** `push`.
   `push` on a PK change against a live DB is how tables get recreated.
3. Take a Supabase backup before running anything against prod.
4. Drizzle needs the env loaded: `set -a; . ./.env.local; set +a` first.

Every schema step below is **additive-first**: add, backfill, verify, and only drop old
columns in a later deploy. That keeps the running Vercel deployment valid at every
point.

---

## 0.3 Structural decisions that must be made before Phase 0

These four are not implementation details — each one changes the schema or the product,
and finding them mid-build means rework.

### A. What happens when one person connects two devices?

`daily_metrics` is keyed `(user_id, date)` with `source` as a plain column. If someone
connects a Fitbit *and* an Apple Watch, the two writers fight over the same row and
`source` flips back and forth on every sync. Silent, and the boards go unstable.

**DECIDED: support both properly.** PK becomes `(user_id, date, source)`, and a
resolution step collapses the rows per date. This mirrors what Apple Health itself
does — it accepts writes from many apps and resolves them by source priority rather
than picking one device.

Design:

- `users.primary_source text` (nullable). Resolution prefers it, then falls back to
  remaining sources ordered by `identities.created_at`.
- `resolveRows(rows, priority)` collapses multi-source rows into one virtual row per
  date, **per metric** — so a day can take sleep from a WHOOP and steps from an
  iPhone if only one source has each. Called at the read boundaries
  (`leaderboards.ts`, `seasons.ts`, `me/page.tsx`), which keeps every scoring
  function unchanged.

**Consequence worth knowing:** if Fitbit already writes into Apple Health on your
phone, connecting both means the same underlying data arrives twice by two routes.
Priority resolution de-duplicates it correctly — but it also means `source: 'apple'`
means "arrived via HealthKit", **not** "measured by an Apple Watch". That matters for
HRV specifically: HealthKit HRV originating from a Fitbit is RMSSD, not SDNN. So the
ingest records per-sample origin when the exporter provides it, and the pairing screen
asks which watch you actually wear as the fallback.

### B. Linking a second provider to an existing account

Sign-in is find-or-create by provider identity. So if you (already a Google/Fitbit
member) later tap WHOOP, you get a **second account** and appear twice on the boards.

Rule to implement: **if a valid `fl_session` cookie is present when an OAuth callback
runs, attach the new identity to the signed-in user instead of creating one.** No email
matching — it is unreliable across providers and privacy-touchy. This is a handful of
lines, but only if it goes in with Phase 0.

### C. Formula changes rewrite history

`getHallOfFame()` recomputes **every past weekly crown from raw `daily_metrics` on
every page load** — there is no crowns table. So any change in Phase 2 retroactively
re-decides past weeks. Someone can lose a crown they already won and saw on the TV.

**DECIDED: accept the rewrite.** Past crowns recompute under whatever formulas are
current, as they did through the scoring recalibration. No `weekly_honors` table.

Two things follow: when Phase 2 ships, expect the Hall of Fame to shift, and say so in
the group rather than letting someone notice a crown went missing. If that turns out to
sting, freezing completed weeks is still a ~2 hour change at any later point.

### D. Apple data is self-reported and unverifiable

Fitbit and WHOOP data arrives from the vendor's own API. Apple data arrives as whatever
JSON is POSTed to the ingest endpoint with a bearer token — a friend who wants to top
the Strain board only needs curl.

For a friends group this is probably fine, but decide it deliberately: accept it,
or add plausibility caps on ingest (a hard ceiling on daily steps/exercise minutes,
rejecting physiologically absurd values). Caps are cheap and worth doing regardless.

---

## Phase 0 — Foundations

No user-visible change. Everything after this depends on it.

### 0.1 Schema (`db/schema.ts`)

```ts
export const identities = pgTable("identities", {
  provider: text("provider").notNull(),           // 'google' | 'whoop' | 'apple'
  providerUserId: text("provider_user_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.provider, t.providerUserId] }) }));
```

`oauth_tokens`: add `provider text not null default 'google'`, PK becomes
`(user_id, provider)`.

`daily_metrics`: add
- `source text not null default 'google'`
- `hrv_sdnn real` — Apple's HRV. **Never written into `hrv_daily_rmssd`.**
- `strain_native real`, `recovery_native integer` — WHOOP's own scores, for `/me` only.

`users.google_user_id`: keep as-is this phase. It gets backfilled *into* identities,
made nullable in Phase 1, and dropped in Phase 3.

### 0.2 Migration SQL (generated, then hand-checked)

```sql
-- additive
create table identities (...);
insert into identities (provider, provider_user_id, user_id, created_at)
  select 'google', google_user_id, id, created_at from users;

alter table oauth_tokens add column provider text not null default 'google';
alter table oauth_tokens drop constraint oauth_tokens_pkey;
alter table oauth_tokens add primary key (user_id, provider);

alter table daily_metrics add column source text not null default 'google';
alter table daily_metrics add column hrv_sdnn real;
alter table daily_metrics add column strain_native real;
alter table daily_metrics add column recovery_native integer;
```

Verify: `select count(*) from identities` equals `select count(*) from users`, and
every existing row still syncs cleanly.

### 0.3 Provider interface (`lib/providers/`)

```ts
// lib/providers/types.ts
export interface HealthProvider {
  id: "google" | "whoop" | "apple";
  /** Pull-based providers only. Apple pushes, so it omits this. */
  fetchDaily?(user: User, token: OauthTokenRow, dates: string[]): Promise<Map<string, PartialMetrics>>;
  revoke?(refreshToken: string): Promise<void>;
}
```

- Move the Google Health pull out of `syncUser()` into
  `lib/providers/google.ts#fetchDaily` **verbatim** — no behaviour change, so a
  regression here is obvious.
- `lib/sync.ts` keeps the parts that are provider-agnostic: the rolling window, the
  merge-with-existing logic, the upsert. `syncUser()` becomes: look up the identity,
  pick the provider, call `fetchDaily`, merge, upsert with `source`.
- `syncAllUsers()`'s join moves from `users ⋈ oauth_tokens` to
  `users ⋈ identities ⋈ oauth_tokens`, so a user with two providers syncs both.

`PartialMetrics` grows `hrvSdnn`, `strainNative`, `recoveryNative`, and the merge block
in `syncUser` grows the matching `fresh.x ?? prev?.x ?? null` lines.

**Verification:** existing Fitbit sync produces byte-identical rows before and after.
Diff a `daily_metrics` dump taken before the refactor against one taken after.

**Effort:** ~1 day. Most of it is the careful `syncUser` extraction.

---

## Phase 1 — WHOOP end-to-end

### 1.1 `lib/whoop.ts` — OAuth client

Mirrors `lib/google.ts`. Endpoints:

```
authorize  https://api.prod.whoop.com/oauth/oauth2/auth
token      https://api.prod.whoop.com/oauth/oauth2/token
api base   https://api.prod.whoop.com/developer/v2
scopes     read:profile read:cycles read:recovery read:sleep
           read:workout read:body_measurement offline
```

Two differences from Google that matter:

- **No PKCE** in WHOOP's docs. Keep the `state` cookie (WHOOP requires ≥8 chars) and
  drop the verifier for this path.
- **`offline` scope is mandatory** or no refresh token comes back at all.

**The critical one — rotating refresh tokens.** WHOOP invalidates the old refresh token
the moment you use it. `validAccessToken()` currently treats rotation as optional
("Google occasionally rotates"). For WHOOP a lost write is a permanently dead
connection that only a re-consent fixes.

```ts
// Persist the rotated refresh token BEFORE the access token is used for anything.
const refreshed = await whoopRefresh(decrypt(token.refreshToken));
if (!refreshed.refresh_token) throw new Error("WHOOP refresh returned no new refresh token");
await db().update(schema.oauthTokens).set({
  refreshToken: encrypt(refreshed.refresh_token),
  accessToken: encrypt(refreshed.access_token),
  tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
}).where(and(eq(oauthTokens.userId, token.userId), eq(oauthTokens.provider, "whoop")));
```

Also guard concurrent refreshes — the inline sync in the OAuth callback can race the
cron. A `select … for update` on the token row, or simply accepting that a rare race
costs one re-consent, is a decision to make explicitly rather than by accident.

### 1.2 `lib/providers/whoop.ts` — the mapper

Three calls per sync window (`limit` max 25, so paginate on `nextToken` for backfills):

| Endpoint | Fills |
|---|---|
| `GET /cycle?start&end` | `strain_native` from `score.strain`; AZM-equivalent |
| `GET /activity/sleep?start&end` | sleep minutes, efficiency, deep, REM, breathing rate |
| `GET /recovery?start&end` | `resting_heart_rate`, `hrv_daily_rmssd`, `recovery_native` |

**Date attribution must match the Google path exactly** or the boards silently
misalign by a day. The existing rule is: *sleep is attributed to the local wake-up
date, naps excluded, longest session wins.* So:

- Sleep → local date of `end` using `timezone_offset`; skip `nap: true`; when two
  sessions land on one date keep the longer.
- Cycles/recovery → local date of the cycle `start` using `timezone_offset`. Skip
  cycles where `end` is absent (still in progress) and any record with
  `score_state !== "SCORED"`.

Field mapping:

```
sleepMinutes    = (total_in_bed_time_milli − total_awake_time_milli) / 60000
sleepEfficiency = sleep_efficiency_percentage
deepMinutes     = total_slow_wave_sleep_time_milli / 60000
remMinutes      = total_rem_sleep_time_milli / 60000
breathingRate   = respiratory_rate
restingHeartRate= recovery.score.resting_heart_rate
hrvDailyRmssd   = recovery.score.hrv_rmssd_milli          // already ms — see below
recoveryNative  = recovery.score.recovery_score
strainNative    = cycle.score.strain
activeZoneMinutes = −60 × ln(1 − strain/21)                // inverse of strainScale
```

**HRV unit — do not hardcode a conversion.** The docs' own examples show
`hrv_rmssd_milli` around 58, and WHOOP's published member average is ~64 ms, so the
field is milliseconds and matches Fitbit's RMSSD directly. But several community
wrappers report v1 returning values like `0.0709`, i.e. seconds. Rather than pick a
side, **assert the range on ingest**: values in 10–200 are ms and pass through; values
under 1 are seconds and get ×1000; anything else throws loudly. A silent 1000× error
here corrupts every recovery baseline invisibly.

Also unconfirmed: whether **steps and VO₂ max** appear for WHOOP 5.0 members. No VO₂
max means WHOOP users sit off Fitness and Age Defied, exactly like Julian does today.

**The strain inversion is exact arithmetic but an inexact equivalence.** Inverting
`strainScale` is mathematically clean, and it makes WHOOP users perfectly rankable
*against each other*. What it does not prove is that a WHOOP strain of 12 represents
the same effort as the AZM total that produces 12 on a Fitbit — WHOOP derives strain
from all-day cardiovascular load, while AZM only counts elevated-HR minutes. Treat the
result as calibrated-by-assumption, same status as the Apple constant, and check the
per-source medians once there is real data. Guard `strain ≥ 21` (divide by zero) by
clamping to 20.99.

### 1.3 Auth routes

- `app/api/auth/whoop/login/route.ts` — same invite-gate as the Google login route,
  sets `fl_oauth_state`, redirects to WHOOP.
- `app/api/auth/whoop/callback/route.ts` — mirrors the Google callback: exchange,
  `GET /user/profile/basic` for the identity and `first_name` (the WHOOP equivalent of
  the `given_name` prefill), find-or-create user, write identity + token, **inline
  sync**, set `fl_session`, redirect to `/me?welcome=1`.

Keep `maxDuration = 60`.

### 1.4 UI

- `/connect`: three device buttons — Fitbit · WHOOP · Apple Watch. The
  wrong-Google-account warning line moves onto the Fitbit path only. Explainer copy
  stays inside the existing `<details>`; the lean bar still applies.
- `/me`: one line showing which device is connected, plus WHOOP's native recovery and
  strain when present.
- `app/api/me/disconnect/route.ts`: revoke per provider. Google's revoke URL stays;
  WHOOP has `revokeUserOauthAccess`, which also stops webhook delivery. WHOOP's
  developer terms require an easy in-app way to disconnect, so this is not optional if
  the app goes for approval.

### 1.5 Verification

1. Demo mode (`lib/demo.ts`) gains a WHOOP-sourced fake friend so the UI can be built
   without an account.
2. Fixture test: recorded WHOOP JSON → mapper → expected `daily_metrics` rows,
   including the date-attribution edge cases (a sleep ending 00:30 local, a nap, an
   unscored cycle).
3. Real account: connect, confirm rows appear within seconds, confirm the numbers match
   the WHOOP app by hand for one day.
4. Confirm a token refresh works *twice* in a row — that is what catches a broken
   rotation write.

**Effort:** ~2 days. This is the phase with the best value-per-day of the whole plan.

---

## Phase 2 — The fairness pass

Do this **before** Apple, so Apple lands into a codebase that already handles mixed
sources. All of it is `lib/scores.ts` + `lib/leaderboards.ts`; no schema, no UI.

### 2.1 Sleep restoration: blended floor, not a personal one

`EFFICIENCY_FLOOR = 90` was tuned on Fitbit's 97–99% reporting and would penalise every
WHOOP and Apple user for their hardware.

The obvious fix — score efficiency against the user's own baseline — **repeats a
mistake this codebase already made and corrected.** `windowStats()` carries the scar:
a pure personal sleep-need average let chronic under-sleepers score 100 for six hours,
which is why need is now `0.6 × adult norm + 0.4 × personal`. A purely personal
efficiency floor has exactly the same failure — someone with chronically broken sleep
gets scored "normal for them" and the component stops meaning anything.

**Use the same blend the codebase already settled on:**

```
floor = 0.6 × SOURCE_FLOOR[source] + 0.4 × personal 30-day efficiency
```

with per-source constants (Fitbit ~90, WHOOP/Apple lower, set from real data). That
keeps an absolute health anchor, removes the hardware penalty, and stays consistent
with how sleep need already works.

`sleepScore()` gains an optional baseline argument; callers in `leaderboards.ts`,
`trends.ts` and `me/page.tsx` pass `windowStats().avgSleepEfficiency`. Without a
baseline it must fall back to today's behaviour — `trends.ts` calls `sleepScore(r)`
bare.

**This changes existing Fitbit scores**, so re-run the distribution check that the last
recalibration taught us to run: compare mean and spread across all 27+ real nights
before and after, not one example night.

### 2.2 VO₂ max normalizes within source

`healthScores()` currently normalizes VO₂ max against the group mean, which compares
vendor algorithms as much as people. Change to: z-score VO₂ max within each `source`,
rank on z-scores. With fewer than 2 users on a source, fall back to the existing
RHR-only path. Resting HR stays group-normalized — it is a real measurement.

`healthScores()`'s input type grows a `source` field; `leaderboards.ts:111` supplies it.

### 2.3 `clubAge()` — the subtle one

`clubAge()` nudges body age by `(45 − avgHrv) × 0.05`, an **absolute** HRV comparison.
Apple's SDNN runs on a different scale from RMSSD, so Apple users would come out
systematically younger. The nudge is capped at ±3 years, so it is bounded, not
catastrophic — but it is wrong.

Fix: make the HRV nudge relative to the user's own baseline, or skip it entirely for
SDNN sources. Same applies to the VO₂ max anchor, which inherits 2.2.

### 2.4 HRV column selection

`windowStats()` reads `hrv_daily_rmssd`. It becomes `hrvDailyRmssd ?? hrvSdnn`.

This is safe **only** because a user has one source, so every value in their baseline is
the same metric, and recovery uses the ratio. Add a comment saying exactly that —
someone will later be tempted to average HRV across users, and this is where that bug
gets born.

### 2.5 Recovery spread per source — the concept doc got this half wrong

The concept doc says Battery needs no changes because it is baseline-relative. That
holds for WHOOP (same RMSSD metric) but **not for Apple.** `recoveryScore()` maps HRV
through `50 + (today/baseline − 1) × 250`. SDNN is less volatile day-to-day than
RMSSD, so the same person on an Apple Watch produces ratios closer to 1, lands nearer
50, and rarely tops *or* bottoms the board. Not "worse scores" — "can't win, can't
lose," which on a leaderboard is worse.

Fix: make the 250 multiplier per-source, calibrated so each source's recovery scores
have comparable spread. It cannot be calibrated without real Apple data, so ship with
the Fitbit constant and check the spread after two weeks — the same
measure-then-calibrate pattern as the AZM constant.

**Effort:** ~1 day, most of it re-validating score distributions on real data. Add
half a day if the crown-freezing table (decision C) lands here.

---

## Phase 3 — Apple Watch

### 3.1 Pairing (no Apple Developer account)

New table:

```
apple_pairings(token_hash text pk, user_id, created_at, last_seen_at, revoked_at)
```

Store a hash, never the token. Tapping "Apple Watch" on `/connect`:

1. Creates the user (`displayName: "New Friend"` — no OAuth to prefill from) and an
   `identities` row with `provider: 'apple'`.
2. Mints a pairing token, shows a **6-character code**.
3. Sets `fl_session` immediately, so they land on `/me?welcome=1` and can set their
   name and birthday while the phone side is being set up.

`GET /api/pair/:code` exchanges the short code for the bearer token — that is what
keeps the Shortcut to one typed code instead of a 40-character paste. Codes expire in
15 minutes and are single-use.

### 3.2 Ingest endpoint

```
POST /api/ingest/apple
Authorization: Bearer <pairing token>
[{ date: "2026-08-07", steps, exerciseMinutes, restingHeartRate, sleepMinutes,
   sleepEfficiency, deepMinutes, remMinutes, hrvSdnn, breathingRate, vo2max }, …]
```

- Reuses the same merge-with-existing + upsert path as the cron, with
  `source: 'apple'`.
- Idempotent on `(user_id, date)`; re-posting a day overwrites cleanly.
- Reject dates more than 90 days old or in the future; cap the array length.
- Rate-limit per token.
- Accept the **Health Auto Export** JSON shape as a second accepted body format, so
  friends can use an off-the-shelf app instead of the Shortcut.

Apple sleep must follow the same wake-up-date rule as everything else. Apple's "Core"
maps to light sleep, so `deepMinutes` comes from Deep only — not Core + Deep.

`activeZoneMinutes = exerciseMinutes × 1.4`, defined as a single named constant with a
comment saying it is a placeholder pending calibration. After two weeks of real data,
compare median weekly AZM per source and adjust it once.

### 3.3 The Shortcut

An iCloud-linked Shortcut that reads the previous day's samples, POSTs them, and stores
the token from the 6-character code on first run.

Be upfront in the UI: **Shortcuts cannot read Health data while the phone is locked**,
so a scheduled automation may fire and fail. For a daily leaderboard "syncs next time
you unlock your phone" is fine, and saying so beats a friend wondering why they are
missing.

### 3.4 Cleanup

Now that nothing depends on it: drop `users.google_user_id` (identities has been the
source of truth since Phase 0).

**Effort:** ~2 days for pairing + ingest + connect UI, plus a fiddly half-day on the
Shortcut itself.

---

## Phase 4 — Optional

- **WHOOP webhooks** → recovery on the TV minutes after a friend wakes up, which the
  60-second refresh already makes visible. Needs a public webhook route with signature
  verification.
- **Companion iOS app** → only if Apple users actually stick. $99/yr, and it replaces
  the Shortcut's unlock caveat with real background delivery.
- **Steps** are still synced and shown on `/me` even though the board was retired;
  WHOOP may not supply them at all. Decide whether `/me` hides the tile per source.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| WHOOP refresh-token rotation write fails | **High** — connection dies permanently | Write before use; fail loudly; test two consecutive refreshes |
| Migration run against prod by accident | **High** | `generate` not `push`; backup first; local DB rehearsal |
| HRV unit wrong by 1000× | **High** — corrupts every recovery baseline | Range-detect on ingest (10–200 → ms, <1 → seconds, else throw); docs say ms, some wrappers say seconds |
| Two devices on one account fight over the same row | **High** — silent, unstable boards | Decision A |
| Second provider creates a duplicate account | **High** — appears twice on the TV | Decision B: link when a session cookie is present |
| Phase 2 rewrites past crowns | Medium — corrosive to the competition | Decision C: freeze completed weeks first |
| Apple ingest is trivially spoofable | Medium | Decision D: plausibility caps at minimum |
| Date attribution off by one | Medium — silent, wrong boards | Fixture tests on the edge cases |
| Apple AZM constant is a guess | Medium | Ship it, label it, calibrate after two weeks |
| WHOOP 10-member cap | Medium | Submit for approval now |
| Cron `maxDuration = 60` with more providers | Low now, grows with the group | Sequential sync is fine for <15 users; parallelize when it isn't |

---

## New environment variables

```
WHOOP_CLIENT_ID
WHOOP_CLIENT_SECRET
APPLE_INGEST_RATE_LIMIT   # optional, defaults fine
```

`APP_URL` and `INVITE_CODE` are already set and are reused by both new flows.

---

## Suggested sequencing

Phase 0 → 1 → 2 → 3, one deploy each. Phase 1 alone is a complete, shippable feature:
WHOOP friends can join, and the fairness caveats only bite once the group actually
mixes hardware — which cannot happen before somebody joins with a WHOOP anyway.

Total: roughly **6 working days** to the end of Phase 3, front-loaded so the first two
days deliver the most.
