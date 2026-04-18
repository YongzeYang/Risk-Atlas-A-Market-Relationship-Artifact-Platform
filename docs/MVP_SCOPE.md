# Risk Atlas HK Scope Status And Phase 2 Plan


## 1. Product definition

Risk Atlas HK is no longer just a narrow MVP artifact builder.

The current platform already supports:

- Hong Kong EOD dataset seeding and import,
- universe resolution from static and rule-driven definitions,
- correlation build creation and artifact persistence,
- build detail inspection through a web workspace,
- rolling build series,
- cross-build drift comparison,
- sector-aware research coverage through SecurityMaster metadata.

At the same time, the product is still **not yet** a full quant analytics platform.

The next phase is to turn it into a more valuable **BSM-backed market-structure analysis workspace** without diluting the scope into a generic quant terminal.

---

## 2. Current shipped status

As of 2026-04-18, the platform has already delivered more than the original V1 document assumed.

### 2.1 Backend capabilities already complete

- Dataset, universe, EOD price, build run, artifact, build series, invite code, and SecurityMaster tables exist.
- Build runs validate input, resolve symbols, compute Pearson correlation matrices, and persist artifact bundles.
- Artifact bundles still use the fixed three-file layout:
  - `matrix.bsm`
  - `preview.json`
  - `manifest.json`
- The API already supports:
  - build creation,
  - build list and detail,
  - pair score lookup,
  - top neighbors lookup,
  - heatmap subset lookup,
  - binary artifact download,
  - rolling build series,
  - compare-build drift analysis,
  - catalog access for datasets, universes, and SecurityMaster.

### 2.2 Frontend capabilities already complete

- The web app is live and is no longer out of scope.
- The current shell includes:
  - Home,
  - Builds,
  - Build Detail,
  - New Build,
  - Series,
  - Series Detail,
  - Compare.
- The Build Detail workspace already provides:
  - heatmap subset analysis,
  - strongest-pair browsing,
  - pair lookup,
  - top-neighbor lookup.

### 2.3 Current platform constraints

- Build creation is currently invite-code gated.
- The build universe cap in code is currently `500` symbols, not `50`.
- The current runtime query path still depends mainly on dense `preview.json` reads.
- The C++ BSM layer is already used for artifact writing and has a standalone query CLI, but the main API does not yet lean on it as the default runtime path.

---

## 3. What the current platform is

The platform today should be described as:

- a Hong Kong correlation build system,
- an artifact browser and comparison workspace,
- a rolling market-structure research tool,
- a sector-aware exploratory analytics surface.

It should **not** yet be described as:

- a live risk system,
- a portfolio optimizer,
- a real-time monitoring product,
- a multi-tenant SaaS,
- a cross-market platform,
- a generic factor research platform.

---

## 4. Current bottleneck

The largest product and systems bottleneck is now clear:

- `matrix.bsm` exists as the canonical artifact,
- but most API read paths still serve users through dense `preview.json`.

That means the current system still behaves like a small-matrix explorer even though it already has a better storage engine underneath.

This is the main reason the platform is not yet extracting enough value from the C++ `bsm` runtime.

### 4.1 Implication

The next phase should not start by adding isolated UI widgets.

It should start by:

- moving the runtime query path toward BSM-backed reads,
- shrinking `preview.json` from dense matrix dump into lightweight summary/cache for new builds,
- computing reusable analytics summaries during build completion,
- then exposing new research surfaces on top of those summaries.

---

## 5. Stable contracts that remain in force

The following product rules remain stable in the next phase unless explicitly changed:

- score method remains `pearson_corr`,
- supported windows remain `60`, `120`, and `252`,
- artifact bundle filenames remain:
  - `matrix.bsm`
  - `preview.json`
  - `manifest.json`
- the public build-and-query workflow remains build-centric,
- legacy artifacts under `artifacts/build-runs/{buildRunId}` must remain readable.

### 5.1 Build request contract

A build request is still defined by:

| Field | Type | Current rule |
|---|---|---|
| `datasetId` | string | must exist in `Dataset` |
| `universeId` | string | must exist in `Universe` |
| `asOfDate` | string | must be ISO date `YYYY-MM-DD` and exist in dataset trading dates |
| `windowDays` | integer | must be one of `60`, `120`, `252` |
| `scoreMethod` | string | must be exactly `pearson_corr` |
| `inviteCode` | string | currently required by the running system |

### 5.2 Build validation rules

For a build request to be valid:

1. `datasetId` must exist.
2. `universeId` must exist.
3. `scoreMethod` must be `pearson_corr`.
4. `windowDays` must be one of `60`, `120`, `252`.
5. `asOfDate` must be a valid ISO date and must be present in the selected dataset.
6. the resolved universe must contain between `2` and `500` symbols.
7. every selected symbol must have at least `windowDays + 1` price rows up to and including `asOfDate`.
8. no selected symbol may produce `NaN` or undefined correlation values in the final matrix.

If any rule fails, the build must end in `failed` with a human-readable `errorMessage`.

---

## 6. Phase 2 objective

Phase 2 is the first real platform expansion step.

Its goal is:

> turn Risk Atlas HK from a correlation artifact browser into a BSM-backed market-structure analysis platform for medium-to-large Hong Kong universes.

### 6.1 Phase 2 scale target

- target universe size: `300` to `1000` symbols,
- first migration step: keep current `500` cap while the new query path ships,
- then raise the cap once BSM-backed reads and analytics latency are verified.

### 6.2 Phase 2 design principles

- use BSM and server-side analytics as the primary runtime path for new builds,
- preserve backward compatibility for existing dense-preview artifacts,
- compute expensive reusable summaries once at build time when the matrix is already materialized,
- keep the frontend focused on user workflows and interpretation, not client-side heavy computation,
- preserve the current product language: research workspace first, infrastructure detail second.

---

## 7. Phase 2 functional scope

Phase 2 must deliver three new research surfaces.

### 7.1 Pair Divergence Candidates

This is the first new feature to ship.

The user need is:

- find pairs whose relationship changed enough to deserve investigation,
- avoid manual build-to-build pair scanning,
- combine correlation change with short-horizon return dislocation.

The first release must support at least:

- long-window corr,
- recent corr,
- corr delta,
- recent relative-return gap,
- simple spread z-score.

The product output should be a ranked candidate list rather than a raw compare dump.

### 7.2 Co-movement Exposure View

The user need is:

- start from one symbol,
- see its strongest co-movement neighborhood,
- judge whether exposure is concentrated or diversified,
- understand whether those neighbors cluster by sector.

The first release must support at least:

- top neighbors for one symbol,
- strength banding,
- sector overlay,
- basic exposure concentration summary.

For this phase, sector overlay is in scope and custom group taxonomy is deferred.

### 7.3 Clustered Structure View

The user need is:

- stop reading the market as an unordered matrix,
- surface clustered market structure directly,
- compare whether clusters are stable or drifting between builds.

The first release must support at least:

- cluster ordering,
- cluster summary,
- compare cluster drift.

The first visualization priority is an ordered heatmap plus summaries, not a network graph.

---

## 8. Phase 2 backend work

Backend work comes first in this phase.

### 8.1 Artifact and read-model evolution

- keep the three-file artifact bundle shape unchanged,
- introduce a lightweight `preview` evolution for new builds,
- preserve dense preview compatibility for old artifacts,
- store metadata and analytics summaries needed for the new pages.

### 8.2 Runtime query path migration

- move pair score, neighbors, and heatmap subset toward BSM-backed reads for new builds,
- keep symbol-order and metadata lookup in the JSON summary layer,
- avoid re-materializing full dense matrices in the API for medium-to-large universes.

### 8.3 Build-time analytics summaries

When a build finishes, the system should compute reusable summaries while the matrix is already in memory.

That work should include:

- pair divergence inputs,
- symbol-level exposure summaries,
- cluster ordering and cluster summary outputs,
- metadata joins required for sector-aware overlays.

### 8.4 New API surfaces

Phase 2 adds build-scoped analytics endpoints for:

- pair divergence candidates,
- co-movement exposure,
- clustered structure summary,
- cluster drift comparison.

The compare surface should expand from pair delta only into a broader structure-drift API family.

---

## 9. Phase 2 frontend work

Frontend work comes after the backend contracts are stable.

### 9.1 New pages

The web app should expose new top-level routes for:

- Pair Divergence,
- Exposure,
- Structure.

These should not remain buried as future ideas on the home page.

### 9.2 UX priority order

Frontend delivery order should be:

1. implement the backend,
2. ship the first usable frontend for each new research surface,
3. optimize layout, filtering, responsiveness, and readability.

### 9.3 UX rules

- design from the research user's question first,
- keep the shell calm and analytical,
- prioritize ranking, context, and interpretability over decorative graphics,
- push heavy numerical work to the server,
- keep large-universe rendering bounded and intentional.

---

## 10. Phase 2 execution order

The implementation order for this phase is:

1. update scope docs so the platform is described accurately,
2. evolve contracts and artifact read models,
3. move runtime query paths toward BSM-backed access,
4. ship Pair Divergence backend,
5. ship Co-movement Exposure backend,
6. ship Clustered Structure backend,
7. expose the new frontend routes and pages,
8. finish with frontend polish and scale validation.

This phase should not invert the order by starting with UI-only mock features.

---

## 11. Explicitly out of scope for Phase 2

Do **not** expand Phase 2 into the following:

- live market data,
- intraday analytics,
- portfolio optimization,
- multi-market support,
- multiple score methods,
- generic factor modeling,
- scheduler or worker-platform redesign,
- S3 migration as a prerequisite,
- custom group taxonomy,
- graph-network visualization as the primary structure view,
- a full authentication and account system.

These may matter later, but they are not the highest-value next step right now.

---

## 12. Definition of done for this phase

This phase is complete when:

1. the scope document reflects the platform honestly,
2. new builds can use a lighter preview/read model without breaking old builds,
3. the main query path for new builds leans on BSM rather than dense preview,
4. Pair Divergence Candidates is usable end-to-end,
5. Co-movement Exposure View is usable end-to-end,
6. Clustered Structure View is usable end-to-end,
7. the web app exposes those workflows directly,
8. medium-to-large universe latency is measured and acceptable.

---

## 13. One-sentence description

Risk Atlas HK is a BSM-backed Hong Kong market-structure research platform that builds, stores, compares, and analyzes correlation artifacts across single builds, rolling series, and next-phase divergence, exposure, and clustering workflows.

Risk Atlas HK V1 is a build-and-browse system for Hong Kong equity market-correlation artifacts.

Its purpose is narrow and explicit:

- ingest or seed Hong Kong EOD adjusted-close data,
- build a pairwise correlation artifact for a selected universe and date window,
- persist build metadata,
- store the artifact bundle,
- expose a small API surface for inspection,
- support a web UI that browses build results.

This is **not** a full risk platform.
It is an **artifact builder and explorer**.

---

## 2. Single user story

> Build a Hong Kong market correlation artifact from EOD data and inspect it via a web UI.

This is the only user story for V1.

If a feature does not directly support this story, it is out of scope for V1.

---

## 3. Scope guardrail

### V1 is

- a Hong Kong EOD dataset browser,
- a build-run launcher,
- a correlation artifact generator,
- an artifact metadata browser,
- a pair score / neighbors / heatmap-subset query API,
- a web UI for build list and build detail.

### V1 is not

- a portfolio analytics platform,
- a live market data system,
- a risk monitoring system,
- a user-authenticated SaaS,
- a scheduled batch platform,
- a multi-market system,
- a generic quant research platform.

---

## 4. Repo fit for V1

This scope is intentionally aligned with the current repo structure.

### Current directories that matter for V1

- `apps/api`
  - backend API runtime
  - Prisma schema and seed/import scripts
- `cpp/tools`
  - future CLI writer for `matrix.bsm`
- `data/sample`
  - deterministic fallback CSV location
- `docs`
  - scope and architecture notes
- `artifacts`
  - local generated artifact output directory (gitignored)

### Directories intentionally untouched in Unit 1

- `apps/web`
- `infra`
- any cloud deployment files
- build runner implementation details
- C++/Node integration details

---

## 5. V1 frozen input contract

A build request is defined by exactly these fields:

| Field | Type | V1 Rule |
|---|---|---|
| `datasetId` | string | must exist in `Dataset` |
| `universeId` | string | must exist in `Universe` |
| `asOfDate` | string | must be ISO date `YYYY-MM-DD` and must exist in dataset trading dates |
| `windowDays` | integer | must be one of `60`, `120`, `252` |
| `scoreMethod` | string | must be exactly `pearson_corr` |

### V1 score method semantics

`pearson_corr` means:

- build daily log returns from adjusted close prices,
- use the selected `windowDays` return observations ending at `asOfDate`,
- compute the Pearson correlation matrix over those aligned return series.

### V1 build validation rules

For a build request to be valid:

1. `datasetId` must exist.
2. `universeId` must exist.
3. `scoreMethod` must be `pearson_corr`.
4. `windowDays` must be one of `60`, `120`, `252`.
5. `asOfDate` must be a valid ISO date and must be present in the selected dataset.
6. the universe must contain between `2` and `50` symbols.
7. every selected symbol must have at least `windowDays + 1` price rows up to and including `asOfDate`.
8. no selected symbol may produce `NaN` / undefined correlation values in the final matrix.

If any rule fails, the build must end in `failed` with a human-readable `errorMessage`.

---

## 6. V1 frozen output contract

Each successful build produces exactly one artifact bundle containing exactly three files:

- `matrix.bsm`
- `preview.json`
- `manifest.json`

The filenames are fixed and are part of the V1 contract.

### 6.1 Local development layout

```text
artifacts/
  build-runs/
    {buildRunId}/
      matrix.bsm
      preview.json
      manifest.json
```

### 6.2 Logical storage prefix

The logical storage prefix for a build is:

```text
build-runs/{buildRunId}
```

This prefix is backend-independent.

- local filesystem adapter:
  - root dir: `artifacts/`
  - resolved local path: `artifacts/build-runs/{buildRunId}/...`
- future S3 adapter:
  - object keys under `build-runs/{buildRunId}/...`

---

## 7. Artifact contract details

### 7.1 `matrix.bsm`

Purpose:

- the canonical binary artifact for the correlation matrix,
- written using the custom C++ blocked symmetric matrix engine.

Semantic contract:

- matrix shape is `N x N`, where `N = symbolCount`,
- row/column order must exactly match `symbolOrder`,
- diagonal values must be `1.0`,
- matrix must be symmetric,
- off-diagonal values are Pearson correlation scores for the selected build request.

`matrix.bsm` is the file exposed by the public download endpoint in V1.

---

### 7.2 `preview.json`

Purpose:

- a JSON read model used by the Node API and web UI,
- avoids direct V1 querying against `.bsm`.

`preview.json` must contain at least:

| Field | Type | Meaning |
|---|---|---|
| `format` | string | must be `risk_atlas_preview_v1` |
| `buildRunId` | string | build id |
| `datasetId` | string | dataset id |
| `universeId` | string | universe id |
| `asOfDate` | string | ISO date |
| `windowDays` | integer | one of `60/120/252` |
| `scoreMethod` | string | `pearson_corr` |
| `symbolOrder` | string[] | exact symbol order used by matrix |
| `scores` | number[][] | full dense score matrix in `symbolOrder` order |
| `topPairs` | object[] | precomputed strongest off-diagonal pairs |
| `minScore` | number | minimum score in full matrix |
| `maxScore` | number | maximum score in full matrix |

Rules:

- `scores[i][i] == 1.0`
- `scores[i][j] == scores[j][i]`
- `symbolOrder.length == scores.length`

### `topPairs` contract

Each item:

| Field | Type |
|---|---|
| `left` | string |
| `right` | string |
| `score` | number |

Sorting rule:

- sort by `abs(score)` descending,
- tie-break by `left` ascending,
- then `right` ascending.

V1 limit:

- store top `20` pairs.

---

### 7.3 `manifest.json`

Purpose:

- a small metadata descriptor for the bundle.

`manifest.json` must contain at least:

| Field | Type | Meaning |
|---|---|---|
| `format` | string | must be `risk_atlas_manifest_v1` |
| `artifactBundleVersion` | integer | must be `1` |
| `buildRunId` | string | build id |
| `datasetId` | string | dataset id |
| `universeId` | string | universe id |
| `asOfDate` | string | ISO date |
| `windowDays` | integer | one of `60/120/252` |
| `scoreMethod` | string | `pearson_corr` |
| `symbolCount` | integer | matrix dimension |
| `symbolOrder` | string[] | exact symbol order |
| `files.matrix.filename` | string | `matrix.bsm` |
| `files.preview.filename` | string | `preview.json` |
| `files.manifest.filename` | string | `manifest.json` |
| `files.*.byteSize` | integer or null | file size |
| `stats.minScore` | number | minimum score |
| `stats.maxScore` | number | maximum score |
| `stats.topPairCount` | integer | number of stored top pairs |
| `createdAt` | string | ISO datetime |

---

## 8. Database contract for V1

### Existing tables that remain central

- `Dataset`
- `Universe`
- `EodPrice`
- `BuildRun`

### New/required table

- `Artifact`

### V1 database principle

PostgreSQL stores:

- build metadata,
- artifact metadata,
- storage location metadata.

PostgreSQL does **not** store:

- the full pairwise score matrix,
- a `pair_scores` table,
- a `neighbors` table.

Those live in the artifact bundle, especially `preview.json`.

---

## 9. API contract (frozen for V1)

The following endpoints are part of V1 and must be treated as the public API surface.

---

### `POST /build-runs`

Create a build run request.

#### Request body

```json
{
  "datasetId": "hk_eod_demo_v1",
  "universeId": "hk_top_20",
  "asOfDate": "2026-04-15",
  "windowDays": 252,
  "scoreMethod": "pearson_corr"
}
```

#### Success response

- HTTP `202 Accepted`

```json
{
  "id": "cm_build_run_id",
  "datasetId": "hk_eod_demo_v1",
  "universeId": "hk_top_20",
  "asOfDate": "2026-04-15",
  "windowDays": 252,
  "scoreMethod": "pearson_corr",
  "status": "pending",
  "createdAt": "2026-04-17T10:00:00.000Z",
  "startedAt": null,
  "finishedAt": null,
  "errorMessage": null
}
```

#### Error behavior

- `400` invalid input
- `404` dataset or universe not found

---

### `GET /build-runs`

List build runs.

#### V1 behavior

- no pagination in V1
- return newest first by `createdAt desc`

#### Success response

- HTTP `200 OK`
- array of build run list items

Each item contains:

- `id`
- `datasetId`
- `universeId`
- `asOfDate`
- `windowDays`
- `scoreMethod`
- `status`
- `createdAt`
- `startedAt`
- `finishedAt`
- `errorMessage`

---

### `GET /build-runs/:id`

Get build detail.

#### Success response

- HTTP `200 OK`

Response contains:

- build run core fields
- `artifact` summary or `null`
- `symbolOrder` as ordered symbol list for the built artifact
- `topPairs`

Rules:

- if build is not `succeeded`, `artifact` is `null`, `symbolOrder` is `[]`, `topPairs` is `[]`
- if build is `succeeded`, `artifact` must be present

---

### `GET /build-runs/:id/pair-score`

Query one pair score.

#### Querystring

- `left`
- `right`

Example:

```text
GET /build-runs/:id/pair-score?left=0700.HK&right=0941.HK
```

#### Success response

```json
{
  "buildRunId": "cm_build_run_id",
  "left": "0700.HK",
  "right": "0941.HK",
  "score": 0.4281
}
```

#### Rules

- valid only for `succeeded` builds
- symbols must both exist in `symbolOrder`
- score is symmetric, but response preserves input order

#### Error behavior

- `404` build not found or symbol not found
- `409` build not ready

---

### `GET /build-runs/:id/neighbors`

Query top-k neighbors for one symbol.

#### Querystring

- `symbol`
- optional `k` with default `10`
- `k` max is `20`

Example:

```text
GET /build-runs/:id/neighbors?symbol=0700.HK&k=5
```

#### Success response

```json
{
  "buildRunId": "cm_build_run_id",
  "symbol": "0700.HK",
  "k": 5,
  "neighbors": [
    { "symbol": "0175.HK", "score": 0.8210 },
    { "symbol": "0388.HK", "score": 0.6123 }
  ]
}
```

#### Rules

- valid only for `succeeded` builds
- exclude self
- sort by `score` descending
- tie-break by `symbol` ascending

#### Error behavior

- `404` build not found or symbol not found
- `409` build not ready

---

### `POST /build-runs/:id/heatmap-subset`

Return a small matrix subset for UI heatmap rendering.

#### Request body

```json
{
  "symbols": ["0700.HK", "0388.HK", "0005.HK", "0939.HK"]
}
```

#### Success response

```json
{
  "buildRunId": "cm_build_run_id",
  "symbolOrder": ["0700.HK", "0388.HK", "0005.HK", "0939.HK"],
  "scores": [
    [1.0, 0.51, 0.33, 0.29],
    [0.51, 1.0, 0.48, 0.55],
    [0.33, 0.48, 1.0, 0.77],
    [0.29, 0.55, 0.77, 1.0]
  ]
}
```

#### Rules

- valid only for `succeeded` builds
- request size must be between `2` and `12`
- all symbols must exist in artifact symbol set
- response order must preserve request order

#### Error behavior

- `400` invalid subset size or malformed body
- `404` build not found or symbol not found
- `409` build not ready

---

### `GET /build-runs/:id/download`

Download the binary artifact.

#### V1 behavior

- returns `matrix.bsm` only
- does **not** return a zip bundle in V1
- `preview.json` and `manifest.json` remain internal support outputs in V1

#### Success response

- HTTP `200 OK`
- binary stream
- filename should be a friendly `.bsm` filename

#### Error behavior

- `404` build not found
- `409` build not ready

---

## 10. Data source strategy

### Preferred source

A small real Hong Kong EOD CSV, provided it can be normalized into the current import contract already enforced by:

- `apps/api/prisma/import-eod.ts`

The normalized CSV must have header:

```text
tradeDate,symbol,adjClose
```

and rows satisfying:

- `tradeDate` = `YYYY-MM-DD`
- `symbol` = zero-padded HK symbol such as `0700.HK`
- `adjClose > 0`

### Fallback source

Use the deterministic demo CSV already supported by:

- `apps/api/prisma/generate-sample-eod.ts`
- `apps/api/prisma/seed.ts`

Expected fallback path:

```text
data/sample/hk_eod_demo_v1.csv
```

### Hard rule

Spend at most **3 hours** looking for a real HK EOD CSV.

If a suitable real CSV is not found and normalized within that budget:

- stop searching,
- use the deterministic demo CSV,
- continue with implementation.

No more indecision after that point.

---

## 11. Definition of done for Unit 1

Unit 1 is complete when:

1. this file is written and committed,
2. Prisma schema includes `Artifact`,
3. migration passes locally,
4. code-level build/artifact/API contract exists in backend source,
5. the project can be described in one sentence without hand-waving.

---

## 12. Explicitly out of scope for V1

Do **not** start these in Unit 1:

- frontend implementation
- S3 integration
- AWS deployment
- build runner implementation
- queue system / Redis / worker system
- direct `.bsm` query engine in Node
- N-API / native binding / FFI
- CSV upload UI
- authentication
- pagination / advanced filtering
- live market data
- scheduled jobs
- multiple score methods
- multiple markets
- portfolio analytics
- optimization of the numerical algorithm

---

## 13. Overview

Risk Atlas HK builds pairwise market-correlation artifacts for Hong Kong equity universes from EOD data and lets users inspect the results through a TypeScript API and web UI.
