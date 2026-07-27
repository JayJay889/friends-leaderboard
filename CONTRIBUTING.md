# Contributing

Contributions are welcome — this is a small, friendly codebase.

## Develop without any accounts

You don't need a Fitbit, a Google Cloud project, or even a database to work on
the UI:

```bash
npm install
echo "DEMO_MODE=1\nAUTH_SECRET=dev-only" > .env.local
npm run dev
```

`DEMO_MODE=1` renders the whole app with deterministic fake friends
([lib/demo.ts](lib/demo.ts)) — leaderboards, story, trends, Hall of Fame, and
the `/tv` kiosk all work.

## Develop against real data

1. Create your own Google Cloud project, enable the **Google Health API**, and
   create an OAuth web client (see README → Google Cloud setup).
2. Set up a Postgres database (local, Neon, or Supabase) and fill `.env.local`
   per `.env.example`.
3. `npm run db:push`, then `npm run dev` and connect your own account.

The Google Health API request/response shapes used here were verified against
the live v4 API and its discovery document — see the table in the README before
changing anything in [lib/sync.ts](lib/sync.ts) or [lib/health.ts](lib/health.ts).

## Ground rules

- **Privacy is the product.** Raw sleep/heart/HRV values are never shown to the
  group — only scores and ranks. Don't add features that leak raw values, and
  keep "Disconnect deletes everything" true.
- No analytics, no third-party trackers, no external requests at runtime
  (avatars are generated locally for this reason).
- `npx tsc --noEmit` and `npm run build` must pass.
- Keep the scoring formulas documented in the README in sync with the code.

## Pull requests

Small, focused PRs with a screenshot for UI changes (demo mode makes this
easy). For bigger ideas, open an issue first.
