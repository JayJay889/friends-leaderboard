# Multi-device concept: WHOOP + Apple Watch

Status: **concept, not built.** Written 2026-08-07.

Goal: a friend with a WHOOP or an Apple Watch can join from the TV QR code in about
as few taps as a Fitbit user does today, and land on boards that rank them fairly
against people wearing something else.

---

## 1. The one rule that makes this work

> **Rank people on quantities measured against themselves, never on raw numbers
> measured against another brand's algorithm.**

Everything below follows from that. The good news: the app already leans this way.
`recoveryScore()` scores HRV and resting HR as a *ratio to that person's own 30-day
baseline*, so it is already brand-agnostic and needs no change at all. The boards
that need work are the ones comparing absolutes — Fitness (VO₂ max) and Strain
(Active Zone Minutes).

The second piece of good news is structural: `daily_metrics` is already a
device-neutral table (steps, AZM, RHR, sleep stages, HRV, VO₂ max). Only
`lib/health.ts` knows about Google. Everything downstream — `scores.ts`,
`leaderboards.ts`, `/tv` — reads normalized rows and does not care where they came
from. A new device is a new writer into the same table.

---

## 2. What each device can actually give us

| `daily_metrics` column | Fitbit (via Google Health) | WHOOP | Apple Watch |
|---|---|---|---|
| `steps` | ✅ native | ⚠️ 5.0 only; API exposure unconfirmed | ✅ native |
| `active_zone_minutes` | ✅ native | ⚠️ derive from day strain (see §4) | ⚠️ derive from exercise minutes (weakest link) |
| `resting_heart_rate` | ✅ | ✅ `resting_heart_rate` | ✅ |
| `sleep_minutes` | ✅ | ✅ | ✅ |
| `sleep_efficiency` | ✅ (reports 97–99%) | ✅ (typically 85–95%) | ✅ (derived) |
| `deep_minutes` / `rem_minutes` | ✅ | ✅ slow-wave + REM | ✅ watchOS 9+ (Core ≈ light) |
| `hrv_daily_rmssd` | ✅ RMSSD | ✅ `hrv_rmssd_milli` — **same metric** | ❌ Apple reports **SDNN** |
| `breathing_rate` | ✅ | ✅ | ✅ |
| `vo2max_estimate` | ✅ | ❓ not confirmed in API docs | ✅ "Cardio Fitness" |

Two entries in that table drive most of the work below: WHOOP hands us the *same*
HRV metric Fitbit does (RMSSD — a genuine gift), and Apple hands us a *different*
one (SDNN, different scale, not interchangeable).

---

## 3. Data model changes

### 3.1 Identity: one account, many providers

Today `users.google_user_id` is `NOT NULL UNIQUE` and `oauth_tokens` is one row per
user — both assume Google is the only way in. Generalize:

```
identities(provider, provider_user_id)  PK
  → user_id FK
  provider ∈ 'google' | 'whoop' | 'apple'

oauth_tokens  PK becomes (user_id, provider)
users.google_user_id  → migrated into identities, then dropped
```

Sign-in becomes "whichever provider you connected." WHOOP's `read:profile` scope
returns name and email, so WHOOP can create the account *and* be the login — a WHOOP
user never touches Google. Apple has no health OAuth at all, so Apple accounts are
created by a pairing token (§5.3).

### 3.2 New columns on `daily_metrics`

Keep the table lean. Only add what genuinely cannot be normalized into an existing
column:

- `source text not null default 'google'` — which device wrote this row. Needed for
  the calibration in §4 and for debugging "why is this number weird."
- `hrv_sdnn real` — Apple's HRV. **Never** written into `hrv_daily_rmssd`; the two
  are different measurements and mixing them silently would corrupt every recovery
  baseline.
- `strain_native real`, `recovery_native integer` — WHOOP's own 0–21 strain and 0–100
  recovery. Stored because they are better than anything we can derive, shown on
  `/me`, but deliberately **not** used for group ranking (§4).

`recoveryScore()` takes HRV as a ratio to the user's own baseline, so it works
unchanged on SDNN — it just needs to read whichever HRV column that user's source
populates.

---

## 4. Formula changes, board by board

### Battery (recovery) — **no change**
Already scored against personal 30-day baselines. HRV ratio, RHR ratio, own sleep
score. An Apple user's SDNN ratio and a WHOOP user's RMSSD ratio are directly
comparable *as ratios*, even though the raw numbers are not. This board is the model
for everything else.

One decision: WHOOP supplies its own recovery %. **Do not rank on it.** A board where
some people get WHOOP's algorithm and others get ours is not a leaderboard, it's two
leaderboards on one card. Compute ours uniformly for everyone; show WHOOP's number on
`/me` as a secondary line for WHOOP wearers.

### Sleep — one real fix
`sleepScore()`'s inputs all exist on all three devices, but `EFFICIENCY_FLOOR = 90`
was tuned on Fitbit, which reports 97–99% for nearly everyone. WHOOP and Apple report
genuinely lower efficiencies, so that constant would hand every non-Fitbit user a
systematically worse restoration component — a pure hardware penalty.

**Fix:** make restoration relative to the user's own 30-day efficiency baseline
instead of an absolute floor. Same trick as recovery, same justification, and it
removes the brand bias completely rather than papering over it with per-source
constants.

Stage targets (`DEEP_TARGET`, `REM_TARGET`) stay absolute — they represent a health
target, not a device reading, and it is defensible to say "22% deep is the goal
regardless of what you wear." Accept the mild residual bias from differing staging
algorithms and note it in the board copy.

### Strain — WHOOP is exact, Apple is the weak link
Keep AZM-equivalent minutes as the single canonical currency so the weekly
`strainScale(totalAzm, k=300)` board math is untouched.

- **WHOOP:** the app's strain scale is already `21·(1 − e^(−azm/k))`, modelled on
  WHOOP's. So invert it. A WHOOP day strain `s` becomes
  `azm = −60·ln(1 − s/21)`, summed across the week and pushed back through
  `strainScale(·, 300)`. Not a fudge — an exact inverse of the curve already shipped.
- **Apple:** no equivalent. Apple exercise minutes count anything at or above a brisk
  walk; AZM weights moderate ×1 and vigorous ×2. The honest options are a documented
  constant (`azm ≈ exerciseMinutes × 1.4`) or deriving zone minutes from exported
  heart-rate samples, which is much heavier.

  **Recommendation:** ship the constant, then *calibrate it against real data* — after
  two weeks, compare median weekly values per source and adjust. This is the one board
  where I would tell friends "roughly comparable" rather than "fair," and it is worth
  deciding whether Strain should rank Apple users at all until calibration lands.

### Fitness — normalize VO₂ max within source
`healthScores()` normalizes VO₂ max against the *group* mean. VO₂ max is a
vendor-specific estimate: Apple derives Cardio Fitness from outdoor walks and runs,
Fitbit from its own model, WHOOP may not expose one. Comparing them directly measures
the algorithm as much as the person.

**Fix:** z-score VO₂ max *within each source*, then rank on the z-scores. Needs ≥2
users per source; below that, fall back to the existing renormalize-to-RHR-only path,
which already exists for users with no VO₂ max. Resting HR stays group-normalized —
it is an actual measurement and comparable to within a couple of bpm.

### Age Defied — inherits the VO₂ max fix
`clubAge()` is anchored almost entirely on VO₂ max, so a systematic vendor offset
shifts the published ranking directly. Same per-source normalization applies. Users on
a source with no VO₂ max stay off the board, which is already the behaviour.

### Composite / crowns — no change
Rank-percentile across boards, so it inherits whatever fairness the boards have.

---

## 5. Onboarding — as few taps as possible

Today: scan QR → tap Connect → Google consent → land on `/me` with data already
synced (the callback syncs inline). Two taps.

### 5.1 The device picker
`/connect?invite=CODE` grows a three-way choice: **Fitbit · WHOOP · Apple Watch**,
logo-sized buttons, no explanatory paragraph (the lean bar still applies). This costs
everyone exactly one extra tap and is unavoidable — guessing the device from the user
agent gets WHOOP wrong on both platforms, and a wrong guess costs more than a
deliberate tap. The Google wrong-account warning line moves onto the Fitbit path only,
where it belongs.

### 5.2 WHOOP — genuinely as easy as Fitbit
Standard OAuth authorization-code flow, same shape as the Google one already built:

```
tap WHOOP → WHOOP consent → callback → inline sync → /me?welcome=1
```

Two taps, name prefilled from `read:profile`, data on the boards seconds later, on the
TV within a minute. Scopes: `read:profile read:cycles read:recovery read:sleep
read:workout read:body_measurement offline`.

**Implementation trap:** WHOOP rotates the refresh token on *every* refresh and
invalidates the old one immediately. `validAccessToken()` currently treats rotation as
occasional ("Google occasionally rotates"). For WHOOP, a failed write means the
connection is permanently dead. Persist the new refresh token before using the access
token, and guard against two concurrent syncs both refreshing.

**Blocker to start now:** WHOOP dev apps are capped at **10 members** until the app is
submitted and approved, and community reports suggest approval is not instant. If the
group might exceed ten WHOOP wearers, submit early.

### 5.3 Apple Watch — the honest version
There is no Apple cloud API. HealthKit lives on the phone, so something on the phone
must push. That makes Apple structurally a *push* source while the others are *pull*:

```
POST /api/ingest/apple
Authorization: Bearer <pairing token>
[{ date, steps, exerciseMinutes, restingHeartRate, sleepMinutes,
   sleepEfficiency, deepMinutes, remMinutes, hrvSdnn, breathingRate, vo2max }, …]
```

Idempotent upsert keyed on `(user_id, date)`, exactly like the cron path. Accept the
Health Auto Export JSON shape natively too, so friends can use an off-the-shelf app
instead of anything we build.

Identity without an Apple Developer account: tapping "Apple Watch" mints a pairing
token and creates the account immediately (name asked for on `/me?welcome=1`, since
there is no OAuth to prefill it). The page then shows a 6-character code and one
button.

Three ways to get data flowing, in ascending cost:

| | Friend's steps | Cost | Reliability |
|---|---|---|---|
| **iOS Shortcut** (iCloud link) | Add shortcut → run once to grant Health access → type the 6-char code → set a daily automation | Free | ⚠️ **Shortcuts cannot read Health data while the phone is locked** — a scheduled automation can fire and fail |
| **Health Auto Export** | Install app → paste endpoint + token → enable REST automation | ~€5–9, paid by the friend | Good — real background sync, ~15 min |
| **Own companion app** | Install from TestFlight → tap allow | $99/yr Apple dev account, real dev work | Best — HealthKit background delivery |

**Recommendation:** ship the Shortcut as v1 because it costs nothing and works today,
and be upfront about the unlock caveat — for a leaderboard that updates daily, "runs
next time you unlock your phone" is usually fine. Revisit a companion app only if
Apple users actually stick around.

---

## 6. Sync architecture

Introduce `lib/providers/` with one interface:

```ts
interface HealthProvider {
  id: "google" | "whoop" | "apple";
  fetchDaily(user, token, dates): Promise<PartialMetrics[]>;
}
```

`lib/health.ts` + `lib/google.ts` move behind it unchanged; `lib/whoop.ts` is new;
Apple has no `fetchDaily` at all — the ingest route writes directly. `syncUser()`
dispatches on the identity's provider and keeps its existing rolling-window and
upsert logic.

Worth noting: **WHOOP has webhooks.** Paired with the TV's 60-second refresh, a WHOOP
wearer's recovery could appear on the screen minutes after they wake up — something
Fitbit users will not get while sync is a once-daily cron.

---

## 7. Suggested order

| Phase | Work | Visible to friends |
|---|---|---|
| 0 | `identities` table, `source` column, provider interface | Nothing |
| 1 | WHOOP end-to-end: OAuth, mapper, strain inversion, connect button | WHOOP friends can join |
| 2 | Fairness pass: baseline-relative sleep efficiency, per-source VO₂ max | Numbers shift slightly for everyone |
| 3 | Apple: ingest endpoint, pairing codes, Shortcut, connect button | Apple friends can join |
| 4 | Optional: WHOOP webhooks (live TV), companion iOS app | Faster updates |

Phase 1 is by far the best value — WHOOP reuses the entire OAuth pattern already
built, and its metrics line up with the existing columns almost one-to-one.

---

## 8. Decisions needed from the owner

1. **Submit the WHOOP app for approval now?** The 10-member cap applies until it is
   approved, and approval has lead time.
2. **Which Apple path** — free Shortcut with the locked-phone caveat, a paid exporter
   app the friend buys, or a companion app you maintain?
3. **Does Strain rank Apple users before calibration?** The AZM mapping is the one
   place where "fair" is currently a guess.
4. **`source` badges on the boards?** A tiny device mark next to each name is honest
   about mixed hardware, but it is also visual noise on a lean card. Recommend: not on
   the boards, one line on `/me`.
