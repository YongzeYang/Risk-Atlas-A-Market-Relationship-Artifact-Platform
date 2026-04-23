# Risk Atlas

Chinese versions: [Simplified Chinese](README.zh-CN.md) | [Traditional Chinese (Hong Kong)](README.zh-HK.md)

Risk Atlas is a market-structure research product for Hong Kong equities and crypto markets. It turns end-of-day price history into offline relationship artifacts, then exposes question-led workflows for snapshots, snapshot series, drift comparison, relationship checks, spillover reads, and hidden-group views.

The public UI branding still says "Risk Atlas HK", but the current product scope is HK plus crypto.

## Live example

You can view the deployed example at <https://risk-atlas.org>.

- It is the actual hosted version of the product and the fastest way to see the current UI in action.
- Use it as the reference deployment for the landing page, snapshot browsing flow, and snapshot detail experience.
- The repository can move ahead of the hosted site, but this URL is still the clearest example of a running production-style environment.

## Screenshots

### Home page

![Risk Atlas home page](imgs/home_page.png)

### Snapshot detail page

![Risk Atlas snapshot detail page](imgs/snapshot_detail_page.png)

## Who this is for

- Researchers who want point-in-time structure reads instead of only raw price charts.
- Teams comparing diversification, crowding, drift, and hidden grouping across a basket.
- Users who need a practical example of offline artifact builds, persisted matrix reads, and lightweight hosted delivery.

## What users can do today

- Browse saved snapshot builds for Hong Kong and crypto markets.
- Open snapshot detail pages backed by `matrix.bsm`, `preview.json`, and `manifest.json`.
- Compare builds across time, lookback windows, and universe choice.
- Inspect relationship structure, pair drift, spillover, and grouped market structure reads.
- Queue new builds and build series behind invite-code gates while keeping read paths open.
- Run on either local filesystem artifacts or S3-backed artifacts with a local matrix cache.

## Latest validated state

Validated locally on 2026-04-23:

- `pnpm bootstrap:local` completed end to end with exit code 0.
- The bootstrap reused repository baselines in `data/real-hk` and `data/crypto`, overlap-refreshed both markets to 2026-04-23, and finished all 8 default full-market snapshots at `windowDays=252`.
- HK snapshots succeeded for all 4 score methods with 2471 resolved symbols from the current real-HK surface.
- Crypto snapshots succeeded for all 4 score methods with 654 resolved symbols from the market-map universe.
- The HK catalog currently holds 1,408,608 EOD rows and the crypto catalog currently holds 248,371 EOD rows.
- First-run build records now persist `sourceDatasetMaxTradeDate`, `symbolSetHash`, and `symbolStateHashesJson`.
- A manual same-config rerun of the latest HK `pearson_corr` snapshot reused 2471 prefix rows from its parent and finished with `buildStrategy=incremental`.

## Current default catalog surface

- HK dataset: `hk_eod_yahoo_real_v1`.
- HK default market-wide universe: `hk_all_common_equity`.
- Crypto dataset: `crypto_market_map_yahoo_v2`.
- Crypto default market-wide universe: `crypto_market_map_all`.
- Additional crypto universes include market-cap baskets and liquidity-driven universes such as `crypto_top_50_liquid`, `crypto_top_100_liquid`, and `crypto_top_200_liquid`.
- The default bootstrap output is the latest 8 market-wide snapshots: 4 score methods for HK and the same 4 score methods for crypto, all at `windowDays=252`.

## Build surface and workflows

### Supported build inputs

- Markets: HK and crypto.
- Score methods: `pearson_corr`, `ewma_corr`, `tail_dep_05`, `nmi_hist_10`.
- Build windows: `60`, `120`, `252`.
- Build series frequencies: `daily`, `weekly`, `monthly`.
- Artifact backends: `local_fs`, `s3`.
- Current hard cap: 4000 resolved symbols in one build.

### Main product workflows

- Snapshot list and detail pages for saved full-market or basket-specific reads.
- Snapshot series scheduling with real trading-date alignment.
- Compare Builds for time-vs-time, window-vs-window, and universe-vs-universe reads.
- Relationship and pair-level inspection from saved artifacts.
- Spillover analysis from one anchor symbol outward.
- Hidden-group and clustered-structure reads for crowded or fragmented baskets.

### Access model

- Creating build runs requires an invite code.
- Creating build series requires an invite code.
- Queueing new analysis runs requires an invite code.
- Reading existing builds, analysis runs, compare results, and artifact-backed queries stays open.

## How the system works

1. Import end-of-day prices into PostgreSQL and refresh dataset metadata.
2. Resolve the requested universe for one as-of date and lookback window.
3. Prepare aligned return inputs and feed them into the C++ matrix builder.
4. Persist the canonical artifact bundle: `matrix.bsm`, `preview.json`, and `manifest.json`.
5. Serve web and API reads from metadata plus artifact-backed queries.

## Artifact bundle

- `matrix.bsm` is the numerical source of truth for matrix-style reads.
- `preview.json` carries symbol order, top pairs, and lightweight summary data for fast UI reads.
- `manifest.json` records bundle metadata, byte sizes, bounds, and preview format details.

The C++ incremental builder supports both same-build resume and cross-build prefix seeding. When symbol order and per-symbol state hashes still match a previous succeeded build, a new build can seed reusable rows instead of recomputing the entire matrix from scratch.

## One-command local startup

### Prerequisites

- Node.js 20+.
- pnpm 10+.
- Docker with Compose support.
- CMake 3.20+.
- A C++20-capable compiler.

### Fastest path from a fresh clone

```bash
git clone <your-repo-url>
cd risk-atlas
cp .env.example .env
pnpm quickstart
```

`pnpm quickstart` will:

- install workspace dependencies.
- sync the root `.env` into `apps/api/.env` and `apps/web/.env`.
- start PostgreSQL through Docker Compose.
- configure and build the C++ targets.
- run Prisma generate and migrations.
- run the market-state bootstrap.
- start the API and web dev servers.

Default local addresses:

- Web: http://localhost:5173.
- API: http://localhost:3000.
- Swagger UI: http://localhost:3000/docs.

If you prefer to separate bootstrap from daily development startup:

```bash
pnpm bootstrap:local
pnpm dev:stack
```

## What bootstrap gives you

`pnpm bootstrap:local` now defaults to the market-state bootstrap path controlled by `RISK_ATLAS_BOOTSTRAP_MARKET_STATE=1`.

That flow:

- reuses repository baselines already checked into `data/real-hk` and `data/crypto` when they exist.
- seeds missing Hong Kong prerequisites only when necessary.
- overlap-refreshes both Hong Kong and crypto data to the latest available trade date instead of rebuilding everything from scratch.
- builds or reuses the latest 8 full-market snapshots at `windowDays=252` across 4 score methods and 2 markets.
- leaves you with a usable local data catalog plus ready-to-query artifact bundles.

The same market refresh logic also powers the recurring daily job:

```bash
pnpm --dir apps/api db:refresh-daily-market-state
```

The AWS deployment guide includes a systemd timer that runs this refresh every 24 hours.

## Useful commands

```bash
pnpm env:sync
pnpm bootstrap:local
pnpm dev:stack
pnpm real-hk:refresh
pnpm real-hk:taxonomy
pnpm crypto:market-map:import
pnpm crypto:coinbase:import
pnpm --dir apps/api db:refresh-daily-market-state
```

What they do:

- `pnpm env:sync`: copy root env values into the app-local env files.
- `pnpm bootstrap:local`: prepare the local database, datasets, artifacts, and latest snapshot set.
- `pnpm dev:stack`: run the API and web dev servers against the local stack.
- `pnpm real-hk:refresh`: refresh the real HK dataset and coverage audit report.
- `pnpm real-hk:taxonomy`: refresh only the HK sector taxonomy overlay.
- `pnpm crypto:market-map:import`: import the larger best-effort crypto market-map dataset.
- `pnpm crypto:coinbase:import`: import the smaller Coinbase proof-of-concept crypto dataset.
- `pnpm --dir apps/api db:refresh-daily-market-state`: manually run the 24-hour market refresh job.

## Configuration highlights

Edit the root `.env` before bootstrap or deployment. The most important keys are:

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`.
- `API_PORT`, `WEB_PORT`.
- `VITE_API_BASE_URL`, `CORS_ALLOWED_ORIGINS`.
- `ARTIFACT_STORAGE_BACKEND`, `ARTIFACT_ROOT_DIR`, `ARTIFACT_CACHE_DIR`.
- `AWS_REGION`, `S3_ARTIFACT_BUCKET`, `S3_ARTIFACT_PREFIX`, `S3_SIGNED_URL_TTL_SECONDS`.
- `RISK_ATLAS_INVITE_CODES`, `RISK_ATLAS_INVITE_SALT`.
- `RISK_ATLAS_BOOTSTRAP_MARKET_STATE`.
- `RISK_ATLAS_BOOTSTRAP_REAL_HK`.

Artifact backend behavior:

- `local_fs`: keep artifact bundles under the local artifact root.
- `s3`: upload artifact bundles to S3 while keeping a local matrix cache for the current C++ query path.

After editing the root env file, resync app env files:

```bash
pnpm env:sync
```

## Data pipelines

### Hong Kong real-market pipeline

- Uses the repository baseline under `data/real-hk` when present.
- Can refresh the dataset from source and regenerate the benchmark report with `pnpm real-hk:refresh`.
- Maintains taxonomy overlays in `security_master` for sector-aware reads.

### Crypto market-map pipeline

- Ranks candidates from CoinGecko market metadata.
- Pulls the actual daily candles from Yahoo chart history in batches.
- Runs in best-effort mode by default and proceeds as long as the surviving asset count clears the minimum floor.
- Writes CSV, symbols, and taxonomy outputs under `data/crypto`.

The larger market-map importer creates:

- dataset: `crypto_market_map_yahoo_v2`.
- static universes: `crypto_market_map_all`, `crypto_market_cap_50`, `crypto_market_cap_100`, `crypto_market_cap_200`.
- dynamic universes such as `crypto_top_50_liquid`, `crypto_top_100_liquid`, `crypto_top_200_liquid`, plus sector baskets when populated.

## AWS deployment

The recommended production shape for this repository is:

- one Ubuntu EC2 host.
- host-level Nginx on ports 80 and 443.
- Docker Compose for API and PostgreSQL.
- one public domain with same-origin routing.
- optional S3 artifact storage plus a small local EC2 matrix cache.
- a 24-hour refresh timer for market-state updates and snapshot rebuilds.

For the full production guide, environment template, Compose file, Nginx config, and S3 refresh notes, see [aws/README.md](aws/README.md).

## Research boundary

Risk Atlas is research support, not direct trading advice.

- It describes co-movement and structure rather than causality.
- It can highlight concentration, drift, spillover, and clustering, but it does not guarantee persistence.
- It is end-of-day and artifact-driven, not a real-time execution or risk engine.
