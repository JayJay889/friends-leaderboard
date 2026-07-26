# 🏆 Friends Leaderboard

A private web app for a friend group: everyone connects their Fitbit (via Google),
the app syncs daily data from the **Google Health API** (`health.googleapis.com/v4/`),
and the group gets five leaderboards plus a personal dashboard.

Built against the Google Health API (July 2026 docs) — **not** the legacy Fitbit
Web API, which is being decommissioned in September 2026.

## Stack

- Next.js 14 (App Router, TypeScript), Tailwind — deployed on Vercel
- Postgres (Neon/Supabase free tier) via Drizzle
- Hand-rolled Google OAuth 2.0 (Authorization Code + PKCE) — the same flow is site
  auth and Health-scope grant; gated by an invite code
- Vercel Cron → `/api/sync`

## Setup

1. `cp .env.example .env.local` and fill in:
   - `GOOGLE_CLIENT_SECRET` — from the client-secret JSON the owner downloaded
   - `DATABASE_URL` — Neon/Supabase connection string
   - `AUTH_SECRET` — `openssl rand -base64 48`
   - `INVITE_CODE` — anything you'll share with friends
   - `CRON_SECRET` — `openssl rand -hex 24`
2. `npm install`
3. `npm run db:push` — creates the three tables
4. `npm run dev` → http://localhost:3000

No database yet? Set `DEMO_MODE=1` in `.env.local` to preview the UI with fake friends.

## Google Cloud (already registered)

Project `friends-leaderboard-503615`, OAuth client `friends-leaderboard-web`
(client id in `.env.example`). Redirect URI registered: `http://localhost:3000/api/auth/callback`.

Remaining console TODOs (owner):

1. After deploying, add `https://<vercel-domain>/api/auth/callback` as a redirect
   URI and `https://<vercel-domain>` as a JS origin on the web client.
2. Add the owner's Gmail as a test user (Zielgruppe page) for local testing.
3. Before friends join: switch publishing status **Testing → In production without
   submitting for verification** (Testing refresh tokens expire every 7 days;
   unverified production allows up to 100 users who click through the
   "unverified app" warning — fine for a known friend group).

### Scopes

The auth URL requests exactly the three registered Health scopes plus `openid`:

- `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
- `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
- `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
- `openid` — **deliberate addition to the brief**: without an identity scope,
  Google's token response contains no user identifier at all, so the app couldn't
  tell users apart. `openid` is non-sensitive, always allowed without registration,
  and only yields the stable Google user id (`sub`). No email/profile is requested.

Partial grants are handled: anyone can untick a scope on the consent screen and
simply won't appear on boards that need that data.

## Sync

`GET /api/sync` with `Authorization: Bearer $CRON_SECRET` pulls the last 3 days for
every connected user (late-syncing devices are caught by the overlap) and upserts
`daily_metrics`. Google Health API calls used:

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
`minutesAsleep / minutesInSleepPeriod`. All request/response shapes and AIP-160
filter fields were verified against the live API and its discovery document
(`https://health.googleapis.com/$discovery/rest?version=v4`) on 2026-07-26 with a
real Fitbit account — key facts: `CivilDateTime = {date:{year,month,day}}`, rollup
responses use `civilStartTime`, AZM rollups are split per heart-rate zone, filters
use snake_case data-type prefixes (e.g. `sleep.interval.civil_end_time`).

**Vercel Hobby cron caveat:** `vercel.json` schedules 4×/day, but the Hobby plan
may restrict crons to once daily. That's still fine (we re-pull 3 days each run).
For true 4×/day on Hobby, point a free external pinger (e.g. cron-job.org) at
`/api/sync` with the `Authorization: Bearer $CRON_SECRET` header.

## Leaderboards

Rolling 7-day window; deltas compare against the 7 days before that.

1. **Steps** — avg daily steps
2. **Workouts** — total Active Zone Minutes
3. **Sleep** — our own score: `0.5·duration + 0.3·stages + 0.2·efficiency`
   (duration: 100 at 8 h, gentle dip to 85 at 6 h/10 h, steep falloff outside;
   stages: (deep+REM)/asleep, 40 % = 100)
4. **Health** — 60 % resting HR (lower better, group-normalized) + 40 % VO₂ max
5. **Most Chill** — 7-day avg HRV (RMSSD); labeled as a recovery proxy, not medical

**Healthiest Human** — mean percentile across boards with data, min 3 boards.

## Privacy

- Sleep/Health/Chill boards show **scores and ranks only**; raw values are visible
  only on your own `/me`.
- Disconnect revokes the Google token and deletes the user row (tokens + metrics
  cascade). `/privacy` explains everything in plain language.
- Refresh/access tokens are AES-256-GCM encrypted at rest with `AUTH_SECRET`.
- No analytics, no trackers.

## Deploy

1. Push to GitHub, import into Vercel, set all env vars (`APP_URL` = the Vercel URL).
2. `npm run db:push` once against the production `DATABASE_URL`.
3. Add the production redirect URI in the Google console (TODO #1 above).
