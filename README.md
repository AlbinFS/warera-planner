# WarEra build planner

A build planner and optimizer for WarEra: gear, skills, food and costs, including armor and dodge breakpoints. Everything is computed in the browser.

## Rules for this repository

- **No names.** No author, credit, Discord handle, donation link or player name in code, docs, test data or commit messages. Test data uses made-up players.
- **No secrets.** The WarEra API key is only used by the scheduled price job, and is stored in the host's secret store. Locally it goes in `.env`, which git ignores.
- **Leak check before every commit.** `.githooks/pre-commit` runs `tools/check-leaks.mjs` on the staged files and blocks the commit if it finds a secret or a blocked term.

## Setup after cloning

```bash
git config core.hooksPath .githooks
```

Set a neutral commit identity for this repository, so commits don't carry your personal name or email:

```bash
git config user.name "WarEra Tools"
```

```bash
git config user.email "<the anonymous account's noreply address>"
```

The leak check also reads an optional private term list from outside the repository: see `tools/check-leaks.mjs`.

## Check the whole repository

```bash
node tools/check-leaks.mjs --all
```

## Develop

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` serves the front end only. To run the Worker and the built site together, as Cloudflare does:

```bash
npm run preview
```

## Layout

- `src/`: the site (Svelte). `src/lib/warera.js` calls the official API from the browser; `src/lib/settings.svelte.js` holds the fight settings shared by every page.
- `worker/index.js`: the Cloudflare Worker. It serves `dist/` and answers `/api/*` from D1.
- `worker/job.js`: the scheduled job (every minute). It stores game config (hourly) and item prices (every 5 minutes), and keeps the equipment trade history and per-roll prices, a few items per run.
- `worker/prices.js`: the pricing rules (median of the last 15 trades in 7 days, else the last 5 of any age; single-stat items smoothed so a better roll is never cheaper).
- `wrangler.jsonc`: Worker config: D1 binding, cron. `public/_headers`: cache and security headers.

## Hosting (Cloudflare)

- **D1 database** `warera-prices`, bound as `DB`. The job creates its tables itself.
- **Secret** `WARERA_API_KEY`: set it on the Worker in the dashboard (Settings → Variables and Secrets, type Secret). Without it the job still stores game config and item prices, but no equipment prices.
- Every `/api` data route answers `{ fetchedAt, stale, ... }`. When the official API is down, the job keeps the last good copy and the site shows a notice with each source's age.

## Free-plan limits

A scheduled run gets 10 ms of CPU. Each run handles items up to about 350 KB of stored trades. Check a change against real data with:

```bash
node tools/bench-job.mjs <trade-store.json> <game-config.json>
```

The worst run measured 7.2 ms, with a full page of new trades for every item.
