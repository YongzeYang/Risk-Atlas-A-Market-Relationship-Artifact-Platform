# Risk Atlas MVP Scope

## 1. Product definition

Risk Atlas is an HK-first market-structure research workspace centered on offline matrix artifacts.

The current MVP includes build creation, rolling series, compare workflows, and three persisted analysis surfaces on top of reusable matrix artifacts.

The product remains intentionally narrow:

- offline artifact generation, not live monitoring
- Hong Kong only
- end-of-day data only
- read/query research workflows, not trading execution

## 2. Strict completion snapshot

Against the user's requested 1-7 scope, the current system status is:

- 1. Full HK / very large universe support: complete
- 2. Build Series as a first-class model: complete
- 3. Compare Builds across time/window/universe: complete
- 4. Invite-code mode with open query reads: complete
- 5. Pair Divergence Candidates: complete
- 6. Co-movement Exposure View: complete
- 7. Clustered Structure View: complete

### 2.1 Why item 1 is now complete

- the official filtered HKEX common-equity universe currently measures 2670 names
- the expanded real dataset imports 2515 symbols and 1399094 EOD rows
- build preparation now uses pairwise-overlap correlation instead of requiring one globally aligned date set across the qualified universe
- hk_all_common_equity validates on 2026-04-17 with 2515 coverage-qualified symbols and 2470 matrix-ready symbols
- a one-shot real full-market build has been verified end to end at 2470 symbols
- compare-build drift now reads directly from BSM artifacts, so large-build compare does not depend on dense preview scores

Conclusion: the system now supports one-shot analysis of the real full HK market surface that survives the matrix-ready filter on a given request date.

### 2.2 Why items 6 and 7 are now complete

- exposure, neighbors, cluster ordering, cluster summary, and cluster drift all exist
- the expanded real-HK security master now backfills broad sector taxonomy from cached Yahoo search metadata plus name heuristics
- HK common-equity rows with populated sector now measure 2609 of 2701
- exposure and structure queries have been verified on the succeeded 2470-symbol real full-market build

## 3. Shipped MVP scope

### 3.1 Data and universe scope

The MVP supports:

- HK datasets only
- static universes
- liquidity_top_n universes
- sector_filter universes
- all_common_equity universes

The seeded HK universe catalog includes:

- hk_top_20
- hk_top_50_liquid
- hk_top_200_liquid
- hk_all_common_equity, presented as HK All Tradable Common Equities
- hk_financials
- hk_property
- hk_tech
- hk_energy
- hk_consumer
- hk_industrials
- hk_telecom
- hk_utilities

Interpretation rule:

Dynamic universes resolve against the selected dataset, as-of date, and minimum-history requirement. The all-common-equity universe therefore means the dataset-covered tradable HK common-equity set that is buildable for that request, not a promise that every security-master row is always usable.

### 3.2 Build workflows

The MVP supports:

- build request validation
- single build queueing
- artifact persistence into matrix.bsm, preview.json, and manifest.json
- build list and build detail browsing
- pair score lookup
- top-neighbor lookup
- heatmap subset lookup

Validation semantics are matrix-ready, not raw universe-size only. A valid request reflects the symbol count that survives row checks, pairwise-overlap return preparation, and flat-series filtering.

### 3.3 Rolling research workflows

Build Series is in scope as a first-class model.

The MVP includes:

- persisted BuildSeries records
- dedicated series list and detail routes
- dedicated web pages for series creation and series detail
- child build runs linked back to one series
- daily, weekly, and monthly cadence
- schedule generation from real dataset trading dates
- validation across every scheduled run before a series is accepted

Weekly cadence uses the last trading date in each week. Monthly cadence uses the last trading date in each month.

### 3.4 Compare workflows

The MVP includes compare workflows for:

- time vs time
- window vs window
- universe vs universe

These remain build-centric compare operations between two succeeded build artifacts.

### 3.5 Analysis workflows

#### Pair Divergence Candidates

In scope:

- long-window correlation
- recent correlation
- correlation delta
- recent relative-return gap
- spread z-score

#### Co-movement Exposure View

In scope:

- top neighbors for one symbol
- similarity strength banding
- sector overlay
- sector aggregation
- concentration summary

#### Clustered Structure View

In scope:

- cluster ordering
- cluster summary
- ordered heatmap metadata
- compare cluster drift

## 4. Access policy

The MVP access model is:

- invite required for creating build runs
- invite required for creating Build Series
- invite required for queueing new analysis runs
- read/query access remains open for build browsing, build-scoped analysis queries, analysis-run lookup, and compare queries

This keeps write-style compute actions gated without turning ordinary research reads into invite-gated endpoints.

## 5. Stable contracts

The following remain stable in the MVP:

- scoreMethod is pearson_corr only
- supported windows are 60, 120, and 252
- artifact filenames remain matrix.bsm, preview.json, and manifest.json
- legacy build artifacts remain readable from artifacts/build-runs/{buildRunId}
- build and analysis workflows remain build-centric

## 6. Scale envelope

The current server-side build guardrail is 4000 symbols.

The system can already build and compare medium-to-large real HK universes inside that guardrail, and it has been verified on a succeeded 2470-symbol real full-market build.

## 7. Deployment scope

The repo now includes a local one-click startup path built around:

- root .env driven configuration
- docker compose for PostgreSQL
- generated apps/api/.env and apps/web/.env files
- bootstrap:local for first-time setup
- dev:stack for daily startup
- quickstart for fresh-clone bring-up

The README is the operational source of truth for those steps.

## 8. Explicit non-goals

The MVP does not include:

- multi-market support
- crypto support
- intraday or live streaming data
- multiple score methods
- portfolio optimization
- trading execution or order workflows
- generic factor research tooling
- a full user/account/auth system

## 9. One-sentence scope statement

Risk Atlas MVP is a build-centric HK market-structure research platform for offline matrix artifacts, rolling series, compare workflows, and persisted divergence, exposure, and structure analysis, with verified real full-market HK support inside the current 4000-symbol guardrail.