# Risk Atlas HK Scope Status And Phase 2 Execution Plan

## 1. Product definition

Risk Atlas HK is no longer a narrow MVP artifact builder.

The platform already ships:

- Hong Kong EOD dataset seeding and curated CSV import,
- static and rule-driven universe resolution,
- asynchronous correlation build creation,
- matrix artifact persistence in matrix.bsm plus JSON companions,
- build detail browsing in the web workspace,
- rolling build series,
- cross-build pair-drift comparison,
- pair divergence analysis,
- sector-aware metadata through SecurityMaster.

At the same time, the system is still not yet a full research platform because its most important interactive reads still depend on dense preview.json.

The next phase is to turn Risk Atlas HK into a BSM-backed Hong Kong market-structure research workspace without diluting the scope into a generic quant terminal.

---

## 2. Current state as of 2026-04-18

### 2.1 Backend capabilities already shipped

- Dataset, Universe, EodPrice, BuildRun, Artifact, BuildSeries, InviteCode, and SecurityMaster models are all live.
- Build runs validate input, resolve universes, compute Pearson correlation matrices, and persist the fixed artifact bundle layout:
  - matrix.bsm
  - preview.json
  - manifest.json
- The API already supports:
  - build creation,
  - build list and detail,
  - pair score lookup,
  - top neighbors lookup,
  - heatmap subset lookup,
  - matrix.bsm download,
  - rolling build series,
  - compare-build pair drift,
  - pair divergence,
  - dataset, universe, and security catalog access.

### 2.2 Frontend capabilities already shipped

- The web app is in scope and actively used.
- The current shell includes:
  - Home,
  - Builds,
  - Build Detail,
  - New Build,
  - Series,
  - Series Detail,
  - Compare,
  - Divergence.
- Build Detail already exposes:
  - strongest-pair browsing,
  - pair lookup,
  - top-neighbor lookup,
  - heatmap subset analysis.

### 2.3 Current scale baseline

- The currently loaded demo dataset contains 60 symbols.
- The hard build-universe cap in code is 500 symbols.
- The target for the next step is 300 to 1000 Hong Kong equity symbols, but the cap should not be raised until BSM-backed reads are validated.

### 2.4 Current bottleneck

- matrix.bsm already exists as the canonical artifact,
- but the main interactive read path still serves users through dense preview.json.

This is the primary reason the platform still behaves like a small-matrix explorer instead of extracting enough value from the C++ BSM runtime.

---

## 3. What the current platform is

The platform today should be described as:

- a Hong Kong correlation build system,
- an artifact browser and comparison workspace,
- a rolling market-structure research tool,
- a sector-aware exploratory analytics surface.

It should not yet be described as:

- a live risk system,
- a portfolio optimizer,
- a real-time monitoring product,
- a multi-tenant SaaS,
- a cross-market platform,
- a generic factor research platform.

---

## 4. Stable contracts that remain in force

The following rules remain stable unless explicitly changed:

- score method remains pearson_corr,
- supported windows remain 60, 120, and 252,
- artifact bundle filenames remain matrix.bsm, preview.json, and manifest.json,
- the public build-and-query workflow remains build-centric,
- legacy artifacts under artifacts/build-runs/{buildRunId} must remain readable,
- build creation remains invite-code gated in the running system.

### 4.1 Build request contract

| Field | Type | Current rule |
|---|---|---|
| datasetId | string | must exist in Dataset |
| universeId | string | must exist in Universe |
| asOfDate | string | must be ISO date YYYY-MM-DD and exist in dataset trading dates |
| windowDays | integer | must be one of 60, 120, 252 |
| scoreMethod | string | must be exactly pearson_corr |
| inviteCode | string | currently required |

### 4.2 Build validation rules

For a build request to be valid:

1. datasetId must exist.
2. universeId must exist.
3. scoreMethod must be pearson_corr.
4. windowDays must be one of 60, 120, 252.
5. asOfDate must be a valid ISO date and must be present in the selected dataset.
6. the resolved universe must contain between 2 and 500 symbols.
7. every selected symbol must have at least windowDays + 1 price rows up to and including asOfDate.
8. no selected symbol may produce NaN or undefined correlation values in the final matrix.

If any rule fails, the build must end in failed with a human-readable errorMessage.

---

## 5. Data expansion strategy for this phase

This phase stays focused on larger Hong Kong equity datasets only.

### 5.1 In scope

- evaluate and prepare a larger real Hong Kong equity EOD source,
- adapt the existing importer contract where needed,
- keep the current CSV normalization model centered on:
  - tradeDate,
  - symbol,
  - adjClose,
  - optional volume,
- validate the pipeline on medium-to-large Hong Kong equity universes.

### 5.2 Current importer contract

The existing importer already accepts:

- tradeDate,symbol,adjClose
- tradeDate,symbol,adjClose,volume

with the following rules:

- tradeDate must be YYYY-MM-DD,
- symbol must match the Hong Kong zero-padded form such as 0700.HK,
- adjClose must be positive,
- volume, when present, must be non-negative.

### 5.3 Out of scope for this phase

- crypto datasets,
- non-Hong Kong markets,
- multi-market abstractions,
- new symbol taxonomies beyond the current Hong Kong contract.

Those expansions require broader market and symbol-contract changes and are not the highest-value next step right now.

---

## 6. Phase 2 objective

Phase 2 turns Risk Atlas HK from a correlation artifact browser into a BSM-backed market-structure analysis platform for medium-to-large Hong Kong universes.

### 6.1 Design principles

- use BSM and server-side analytics as the primary runtime path for interactive numeric queries,
- preserve backward compatibility for existing dense-preview artifacts,
- compute reusable analytics summaries once at build completion when the matrix is already materialized,
- keep the frontend focused on interpretation rather than client-side heavy computation,
- keep the product language centered on research workflow rather than infrastructure detail.

### 6.2 Scale target

- target universe size: 300 to 1000 symbols,
- immediate migration step: keep the 500-symbol cap while BSM-backed reads ship,
- cap increase happens only after latency is measured on realistic larger Hong Kong builds.

---

## 7. Phase 2 execution tracks

### 7.1 Phase 2A: move the main read path to BSM

This is the first mandatory implementation track.

The goal is to make the interactive single-build query path lean on matrix.bsm rather than dense preview.json.

This track includes:

- pair-score on BSM pair lookup,
- neighbors on BSM row-topk,
- heatmap-subset on BSM submatrix,
- keeping preview.json primarily for symbol order, top pairs, compatibility, and summary metadata,
- preserving old artifacts without rebuilds.

### 7.2 Phase 2B: Co-movement Exposure View

The goal is to turn neighbors into a real exposure workflow.

The first usable release must support:

- one anchor symbol,
- top co-movement neighbors,
- strength banding,
- sector overlay,
- sector aggregation,
- a basic exposure concentration summary.

### 7.3 Phase 2C: Clustered Structure View

The goal is to stop reading the market as an unordered matrix.

The first usable release must support:

- build-time cluster ordering,
- cluster summaries,
- ordered heatmap metadata,
- compare cluster drift between builds.

For this phase, build-time clustering in Node/TypeScript is acceptable. A dedicated C++ clustering command is an optimization seam, not a prerequisite.

---

## 8. Backend work for this phase

### 8.1 Read-model evolution

- keep the three-file artifact bundle shape unchanged,
- preserve preview compatibility for old artifacts,
- allow preview to evolve into a lighter summary layer for new builds,
- store reusable exposure and structure summaries during build completion.

### 8.2 Query-path migration

- move pair score, neighbors, and heatmap subset toward BSM-backed reads,
- keep symbol-order and lightweight metadata lookup in the preview layer,
- avoid rematerializing full dense matrices in the API for medium-to-large universes.

### 8.3 Build-time summary generation

When a build finishes, the system should compute reusable summaries while the matrix is already in memory.

That work should include:

- pair-divergence support data,
- exposure-side metadata and aggregation inputs,
- cluster ordering and cluster summaries,
- metadata joins required for sector-aware overlays.

### 8.4 New API surfaces

This phase adds build-scoped analytics endpoints for:

- co-movement exposure,
- clustered structure summary,
- cluster drift comparison.

Pair divergence is already shipped and should be aligned with the new BSM-backed read path where appropriate.

---

## 9. Frontend work for this phase

Frontend work follows stable backend contracts.

### 9.1 New top-level routes

The web app should expose:

- Divergence,
- Exposure,
- Structure.

These workflows should be directly discoverable rather than remaining buried in build detail or home-page roadmap copy.

### 9.2 UX rules

- design from the research question first,
- keep the shell calm and analytical,
- prioritize ranking, context, and interpretability over decorative graphics,
- push heavy numerical work to the server,
- keep large-universe rendering bounded and intentional.

---

## 10. Implementation order

The implementation order for this phase is:

1. rewrite scope docs so the platform is described accurately,
2. migrate the main interactive read path to BSM,
3. add reusable exposure summaries and the Exposure View,
4. add clustered structure summaries and cluster-drift compare,
5. expose the new frontend routes and pages,
6. finish with latency validation and scale expansion.

This phase should not start with UI-only mock features.

---

## 11. Explicitly out of scope for this phase

Do not expand this phase into:

- live market data,
- intraday analytics,
- portfolio optimization,
- multi-market support,
- crypto integration,
- multiple score methods,
- generic factor modeling,
- scheduler or worker-platform redesign,
- S3 migration as a prerequisite,
- custom group taxonomy,
- graph-network visualization as the primary structure view,
- a full authentication and account system.

---

## 12. Definition of done

This phase is complete when:

1. this document reflects the platform honestly,
2. the main single-build interactive query path leans on BSM rather than dense preview,
3. old builds remain readable without rebuilds,
4. Pair Divergence remains usable end to end,
5. Co-movement Exposure View is usable end to end,
6. Clustered Structure View is usable end to end,
7. the web app exposes those workflows directly,
8. medium-to-large Hong Kong universe latency is measured and acceptable,
9. the universe cap is raised only after those measurements pass.

---

## 13. One-sentence description

Risk Atlas HK is a BSM-backed Hong Kong market-structure research platform that builds, stores, compares, and analyzes correlation artifacts across single builds, rolling series, divergence, exposure, and clustered-structure workflows.
