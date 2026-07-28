# Friends Leaderboard

A private, invite-only fitness leaderboard for a friend group. Everyone
connects their Fitbit (via Google), the app syncs daily data from the
**Google Health API** (`health.googleapis.com/v4/`), and the group gets:

- **Five boards**, mirroring the classic wearable pillars — Strain (Active
  Zone Minutes), Sleep (our own score), Recovery (HRV, WHOOP-style
  green/yellow/red bands), Health (resting HR + VO₂ max), and Body Age —
  plus a **Healthiest Human** composite with an Olympic podium (steps are
  still synced and shown on the personal dashboard, just not a board)
- **Seasons** — every completed Mon–Sun week crowns a champion; most crowns
  wins the semester (Hall of Fame at `/hall`)
- **A TV kiosk mode** (`/tv`) — auto-rotating full-screen views for a wall
  screen: podium, boards, movers (rank movement + week-over-week form guide),
  championship
- **Privacy by design** — sleep/heart/HRV boards show scores and ranks only;
  raw values are visible only to their owner; disconnect deletes everything;
  no analytics, no trackers

Built against the Google Health API (launched mid-2026) — **not** the legacy
Fitbit Web API, which is being decommissioned in September 2026.

MIT licensed. See [CONTRIBUTING.md](CONTRIBUTING.md) — you can develop the
whole UI with `DEMO_MODE=1` and zero accounts.

## Stack

- Next.js 14 (App Router, TypeScript), Tailwind — deploys cleanly to Vercel
- Postgres (local, Neon, or Supabase) via Drizzle
- Hand-rolled Google OAuth 2.0 (Authorization Code + PKCE) — the same flow is
  site auth and Health-scope grant; gated by an invite code
- Vercel Cron (or any pinger) → `/api/sync`
- Locally generated DiceBear avatars (no external requests)

## Setup

1. `cp .env.example .env.local` and fill in:
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from your OAuth client (below)
   - `DATABASE_URL` — Postgres connection string
   - `AUTH_SECRET` — `openssl rand -base64 48` (signs sessions, encrypts tokens)
   - `INVITE_CODE` — anything you'll share with friends
   - `CRON_SECRET` — `openssl rand -hex 24`
   - `APP_URL` — `http://localhost:3000` locally, your domain in production
2. `npm install`
3. `npm run db:push` — creates the three tables
4. `npm run dev` → http://localhost:3000

No database yet? Set `DEMO_MODE=1` to preview the UI with fake friends.

## Google Cloud setup (once per deployment)

1. Create a project at console.cloud.google.com and enable the
   **Google Health API**
2. Configure the OAuth consent screen (External) with a privacy policy URL
   (this app serves one at `/privacy`)
3. Create an OAuth 2.0 **Web application** client with redirect URIs
   `http://localhost:3000/api/auth/callback` and
   `https://<your-domain>/api/auth/callback` (+ matching JS origins)
4. While in **Testing** status, add your Gmail as a test user
5. Before friends join, switch publishing status to **In production without
   submitting for verification** — Testing-mode refresh tokens expire every
   7 days; unverified production allows up to 100 users who click through the
   one-time "unverified app" warning (fine for a personal app)

### Scopes

The auth URL requests exactly these Health scopes plus `openid`:

- `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
- `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
- `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
- `openid` — without an identity scope Google returns no user identifier at
  all; `openid` is non-sensitive and yields only the stable user id (no
  email/profile is requested)

Partial grants are handled: anyone can untick a scope on the consent screen
and simply won't appear on boards that need that data. Note: users' Fitbit
accounts must already be migrated to Google accounts.

## Sync

`GET /api/sync` with `Authorization: Bearer $CRON_SECRET` pulls the last 3
days for every connected user (late-syncing devices are caught by the
overlap) and upserts `daily_metrics`:

| Metric | Data type | Method |
|---|---|---|
| Steps | `steps` | `dataPoints:dailyRollUp` |
| Active Zone Minutes | `active-zone-minutes` | `dataPoints:dailyRollUp` |
| Resting HR | `daily-resting-heart-rate` | `dataPoints:reconcile` |
| Sleep (duration/stages/efficiency) | `sleep` | `dataPoints:reconcile` |
| HRV (RMSSD) | `daily-heart-rate-variability`, fallback `heart-rate-variability` | `dataPoints:reconcile` |
| Breathing rate | `daily-respiratory-rate` | `dataPoints:reconcile` |
| VO₂ max | `daily-vo2-max` | `dataPoints:reconcile` |

Sleep efficiency isn't a direct API field; it's computed as
`minutesAsleep / minutesInSleepPeriod`. All request/response shapes and
AIP-160 filter fields were verified against the live API and its discovery
document (`https://health.googleapis.com/$discovery/rest?version=v4`) in July
2026 with a real Fitbit account — key facts: `CivilDateTime =
{date:{year,month,day}}`, rollup responses use `civilStartTime`, AZM rollups
are split per heart-rate zone, filters use snake_case data-type prefixes
(e.g. `sleep.interval.civil_end_time`).

**Cron note:** `vercel.json` schedules a daily sync (Vercel Hobby's limit —
safe because each run re-pulls 3 days). For fresher boards, point any free
pinger (e.g. cron-job.org) at `/api/sync` with the bearer header.

## Scoring

Rolling 7-day window; deltas compare against the 7 days before that.

- **Strain** = Active Zone Minutes on a logarithmic 0–21 scale (WHOOP-style)
- **Sleep score** = `0.5·duration + 0.3·stages + 0.2·efficiency`, with
  duration scored against a personal sleep need (your 30-day baseline,
  clamped 7–9.5 h); stages: (deep+REM)/asleep, 40% = 100
- **Battery** (recovery) = 7-day avg HRV as an index where 100 = group
  average, with green/yellow/red bands (110/90 thresholds)
- **Fitness** (health) = 60% resting HR (lower better) + 40% VO₂ max,
  indexed to 100 = group average
- **Body Age** = a playful body-age estimate anchored on VO₂ max and nudged by
  resting HR, HRV, sleep score and activity volume — ranks are public, the
  number itself is visible only to its owner
- **Healthiest Human** = mean percentile across boards with data (min 3)
- **Seasons**: weekly champions and semester titles are derived from history
  at read time (`lib/seasons.ts`) — no extra tables

## Privacy (non-negotiable)

- Steps and Active Zone Minutes are shown as numbers; sleep, heart, HRV and
  age boards show **scores and ranks only**
- Disconnect revokes the Google token and deletes the user row (tokens +
  metrics cascade)
- Refresh/access tokens are AES-256-GCM encrypted at rest with `AUTH_SECRET`
- No analytics, no trackers, no runtime requests to third parties

## Deploy

1. Push to GitHub, import into Vercel, set all env vars (`APP_URL` = your
   Vercel URL)
2. `npm run db:push` once against the production `DATABASE_URL`
3. Add the production redirect URI + origin in your Google OAuth client
