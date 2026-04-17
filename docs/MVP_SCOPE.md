# Risk Atlas HK MVP Scope (V1)

## 1. Product definition

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
