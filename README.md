# Risk Atlas

Risk Atlas is a plain-English financial research product for reading how a basket of Hong Kong stocks is really behaving beneath the surface.

Instead of starting from technical market-structure jargon, the product starts from five questions a human can actually ask:

- Am I really diversified, or do these names still move like one trade?
- Which relationships are strong enough, weak enough, or different enough to deserve a closer look?
- If this stock drops, who tends to move with it?
- What hidden groups already exist inside this basket?
- What changed between one snapshot and another?

The current release is HK-first. It builds point-in-time snapshots, rolling snapshot series, snapshot-to-snapshot comparison, relationship screening, spillover reads, and hidden-group views on top of offline relationship artifacts.

## Research boundary

Risk Atlas is for research support, not direct trading advice.

- it describes co-movement and structure; it does not explain causality
- it can highlight concentration, drift, spillover, and hidden groups; it does not guarantee persistence
- it helps narrow where to look next; it does not replace judgment, portfolio context, or execution discipline

## What the product does today

- creates single market snapshots for one basket, one date, and one lookback
- runs repeated snapshot series across daily, weekly, or monthly cadence
- compares ready snapshots across time, lookback, and basket choice
- surfaces relationships worth a closer look through persisted screening runs
- shows spillover from one anchor name through neighbor ladders and concentration summaries
- reveals hidden groups through ordered heatmaps, clustering summaries, and group-drift comparison
- keeps reads and comparison open while gating create and queue actions behind invite codes

## Under the hood

Under the hood, Risk Atlas imports end-of-day prices, resolves a basket for one date and lookback, computes a symmetric relationship matrix offline, stores the result as matrix.bsm plus metadata, and exposes read/query workflows through APIs and a web UI.

## Strict status

As of the latest real-HK verification on 2026-04-19, the system is complete against the user's full 1-7 target set.

- 1. Full HK / very large universe support: complete
- 2. Build Series as a first-class model: complete
- 3. Compare Builds across time/window/universe: complete
- 4. Invite-code mode with open queries and gated writes: complete
- 5. Pair Divergence Candidates: complete
- 6. Co-movement Exposure View: complete
- 7. Clustered Structure View: complete

What closed item 1:

- the official filtered HKEX common-equity universe is 2670 names
- the real dataset currently imports 2515 names and 1399094 EOD rows
- build preparation now uses pairwise-overlap correlation instead of requiring one globally aligned date set across the entire universe
- hk_all_common_equity now validates on 2026-04-17 with 2515 coverage-qualified symbols and 2470 matrix-ready symbols
- a real one-shot full-market build has been verified end to end at 2470 symbols with a succeeded matrix.bsm artifact
- compare-build drift no longer depends on dense preview scores and now reads drift directly from BSM artifacts

What closed items 6 and 7:

- the neighbor, exposure, cluster ordering, cluster summary, and drift workflows all exist
- real-HK security_master broad-sector coverage is now backfilled from cached Yahoo search taxonomy plus name heuristics
- HK common-equity rows with populated sector now measure 2609 of 2701, which makes exposure and structure overlays usable across the real market build surface
- exposure and structure queries have been verified on the succeeded 2470-symbol real full-market build

## Real HK data scale

Latest audited numbers from the real benchmark pipeline:

- official filtered HKEX equity universe: 2670
- HK common-equity rows in security_master: 2701
- HK common-equity rows with populated sector: 2609
- imported real dataset symbols: 2515
- imported real dataset rows: 1399094
- dataset date range: 2024-01-02 to 2026-04-17
- coverage-qualified symbols on 2026-04-17: 2515
- matrix-ready symbols on 2026-04-17: 2470
- filtered out near-flat symbols on 2026-04-17: 45
- verified real full-market build artifact sizes: matrix 24760448 bytes, preview 667983 bytes, manifest 37904 bytes

The build and benchmark flows now prove that both medium-to-large and full-market real universes are buildable:

- HK Real Yahoo 300: succeeded
- HK Real Yahoo 500: succeeded
- HK Real Yahoo 1000: succeeded
- HK All Common Equity real build on 2026-04-17: succeeded at 2470 symbols

## What the product does today

- builds single HK correlation snapshots into matrix.bsm, preview.json, and manifest.json
- validates requests using coverage-qualified and matrix-ready symbol counts rather than raw requested counts
- computes large-universe matrices with pairwise-overlap correlation instead of whole-universe aligned-date gating
- supports rolling Build Series scheduled on real dataset trading dates
- compares succeeded builds across time, window, and universe changes
- runs Pair Divergence, Co-movement Exposure, and Clustered Structure analysis workflows
- keeps queued analysis runs reopenable through persisted run ids
- resolves both static and rule-driven HK universes
- backfills real-HK broad-sector taxonomy into security_master for overlay-heavy workflows

## One-click local startup

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker with docker compose
- CMake 3.20+
- a C++20-capable compiler

### Fastest path from fresh clone

```bash
git clone <your-repo-url>
cd risk-atlas
cp .env.example .env
bash scripts/quickstart.sh
```

What that does:

- installs workspace dependencies
- generates apps/api/.env and apps/web/.env from the root .env
- starts PostgreSQL through docker compose
- configures and builds the C++ BSM writer
- runs Prisma generate, Prisma migrate deploy, and seed
- seed prefers the local real-HK CSV at data/real-hk/hk_eod_yahoo_real_v1.csv when it exists and only falls back to regenerating the demo CSV when real-HK files are absent
- starts the API and web dev servers together

Default local addresses after startup:

- web: http://localhost:5173
- api: http://localhost:3000
- swagger: http://localhost:3000/docs

In local dev, the web app now uses relative API paths by default, so browser requests stay same-origin with Vite and flow through the configured proxy. Set an explicit absolute VITE_API_BASE_URL only when you intentionally want the browser to call the API directly.

Stop the stack by pressing Ctrl+C in the terminal that is running quickstart or dev:stack.

### First-time bootstrap and daily start as separate commands

```bash
pnpm bootstrap:local
pnpm dev:stack
```

### Regenerate app env files after changing root config

```bash
pnpm env:sync
```

## Configuration you can customize

Edit the root .env before running bootstrap or quickstart.

Important keys:

- POSTGRES_DB: database name
- POSTGRES_USER: database user
- POSTGRES_PASSWORD: database password
- POSTGRES_HOST: database host used by the API
- POSTGRES_PORT: host port mapped by docker compose
- API_PORT: Fastify port
- WEB_PORT: Vite dev port
- VITE_API_BASE_URL: optional absolute web-to-api base URL; leave blank for default local proxy behavior
- CORS_ALLOWED_ORIGINS: optional comma-separated origins allowed when the browser calls the API directly
- RISK_ATLAS_INVITE_CODES: comma-separated invite code list used by seed
- RISK_ATLAS_INVITE_SALT: salt used to hash invite codes into the database
- RISK_ATLAS_BOOTSTRAP_REAL_HK: set to 1 if you want bootstrap:local to run the real-HK benchmark import immediately after seed

Example:

```dotenv
POSTGRES_DB=risk_atlas_prod
POSTGRES_USER=atlas
POSTGRES_PASSWORD=replace-this-password
POSTGRES_PORT=5544
API_PORT=3100
WEB_PORT=5174
VITE_API_BASE_URL=
CORS_ALLOWED_ORIGINS=http://localhost:5174
RISK_ATLAS_INVITE_CODES=team-alpha-2026,team-beta-2026
```

After editing the root .env, run:

```bash
pnpm env:sync
```

## Optional: refresh the larger real HK dataset from source

If the repository already contains the local real-HK CSV under data/real-hk, seed will reuse it automatically. If you want to refresh that dataset from upstream sources and rewrite the coverage audit report, run:

```bash
pnpm real-hk:refresh
```

That command refreshes the real Yahoo HK dataset, imports it, upserts benchmark universes, and writes an audit report into artifacts/benchmark-reports.

If you only want to refresh the real-HK security-master taxonomy overlay without reimporting prices, run:

```bash
pnpm real-hk:taxonomy
```

## Optional: import a real crypto POC dataset

The repository now includes a static-universe crypto proof-of-concept importer that pulls public daily candles from Coinbase, writes a local CSV under data/crypto, imports the dataset, and runs one verification build:

```bash
pnpm crypto:coinbase:import
```

What it creates:

- dataset: crypto_usd_coinbase_daily_v1
- universe: crypto_usd_top_10
- market: CRYPTO

That Coinbase path is still the lightweight proof of concept.

## Optional: import a crypto market-map dataset

The repository also includes a larger crypto market-map importer. It uses CoinGecko market metadata for candidate ranking and taxonomy hints, then switches to Yahoo chart history for the actual daily time series so the import can scale to a much larger batch. It writes taxonomy files under data/crypto, imports the dataset, and runs one verification build on the imported market-map universe:

```bash
pnpm crypto:market-map:import
```

What it creates:

- dataset: crypto_market_map_yahoo_v2
- static universes: crypto_market_map_all, crypto_market_cap_50, crypto_market_cap_100, crypto_market_cap_200
- dynamic universes: crypto_top_50_liquid, crypto_top_100_liquid, crypto_top_200_liquid, plus populated crypto sector baskets
- market: CRYPTO

Important scope notes:

- the importer now uses Yahoo chart history with batched/concurrent fetching instead of the much slower CoinGecko public history endpoint
- the importer intentionally excludes stablecoins, wrapped or bridged assets, leveraged tokens, and liquid-staking derivatives so the market map behaves more like a spot risk-asset universe
- crypto dynamic universes are now market-aware for liquidity and sector-filter rules; the legacy all-common-equity rule remains HK-oriented
- the default importer now runs in best-effort mode: it scans 5 CoinGecko candidate pages, tries to pull as many Yahoo history series as possible, and proceeds with whatever clears the build window as long as at least 50 assets survive; you can still override the upper bound and floor with `CRYPTO_MARKET_MAP_TARGET_COUNT`, `CRYPTO_MARKET_MAP_MIN_COUNT`, `CRYPTO_MARKET_MAP_CANDIDATE_PAGE_COUNT`, `CRYPTO_MARKET_MAP_REQUEST_DELAY_MS`, `CRYPTO_MARKET_MAP_HISTORY_BATCH_SIZE`, `CRYPTO_MARKET_MAP_HISTORY_CONCURRENCY`, `CRYPTO_MARKET_MAP_PROGRESS_EVERY`, and `CRYPTO_MARKET_MAP_ENRICH_DETAILS=1`

## HK universe support

The current catalog includes:

- static demo universes such as hk_top_20 and hk_financials_10
- liquidity universes: hk_top_50_liquid and hk_top_200_liquid
- market-wide universe: hk_all_common_equity, displayed as HK All Tradable Common Equities
- sector universes for financials, property, tech, energy, consumer, industrial, telecom, and utilities

Catalog compatibility is dataset-aware:

- static universes are only advertised for datasets that fully cover all required symbols with the minimum build history
- liquidity, all-common-equity, and sector universes remain dataset-resolved at request time

Important scope note:

The all-common-equity and sector universes resolve against the selected dataset, as-of date, and minimum-history requirement. They represent the dataset-covered tradable HK common-equity set that is actually buildable for that request, not a promise that every security-master row has usable data on every date.

## Analysis workflows

### Build and series

- single snapshot builds
- rolling Build Series across daily, weekly, or monthly cadence
- weekly and monthly series snap to the last real trading date in each bucket
- every scheduled Build Series run is validated before the series is created

### Compare

- time vs time: same universe and window, different dates
- window vs window: same universe and date, different lookback windows
- universe vs universe: same date and window, different resolved scopes

### Pair Divergence Candidates

- long-window correlation
- recent correlation
- correlation delta
- recent relative-return gap
- spread z-score

### Co-movement Exposure View

- anchor symbol to top-neighbor view
- similarity strength banding
- sector overlay and sector weight share
- concentration summary and effective-neighbor count

### Clustered Structure View

- ordered symbol layout for heatmap reading
- cluster summaries and sector composition
- cluster drift comparison across builds

## Access model

- creating build runs requires an invite code
- creating Build Series requires an invite code
- queueing new analysis runs requires an invite code
- browsing builds, reading build-scoped analysis queries, listing analysis runs, and compare queries are open read paths

## Artifact model

The canonical bundle remains:

- matrix.bsm
- preview.json
- manifest.json

The BSM artifact is the numerical source of truth for matrix-style reads. Preview metadata remains useful for symbol order, top pairs, and summary fields, while large-build compare queries now read drift directly from BSM instead of relying on dense preview score matrices.

## Stack

- C++20 for the BSM writer/query engine
- TypeScript + Fastify for the API
- PostgreSQL + Prisma for metadata and dataset state
- React + Vite for the web app

## Current boundaries

- HK only
- end-of-day data only
- pearson_corr only
- windows limited to 60, 120, and 252
- current single-build guardrail is 4000 symbols
- offline artifact builds, not real-time risk monitoring
- research workflows, not portfolio construction or execution