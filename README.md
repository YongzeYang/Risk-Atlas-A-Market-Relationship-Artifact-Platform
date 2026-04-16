# Risk Atlas

> A financial artifact platform that turns offline pairwise market computations into reusable `.bsm` artifacts with APIs and UI for exploration.

**Risk Atlas** is a **market relationship artifact platform** for building, storing, and exploring offline pairwise market scores.

It imports end-of-day price data, computes pairwise asset relationships across a predefined universe, stores the result as a reusable `.bsm` artifact via a custom C++ out-of-core symmetric matrix engine, and exposes read-only APIs plus a lightweight web UI for analysis.

## Why this project exists

Many financial relationship tables are:

- **pairwise**
- **symmetric**
- **expensive to materialize fully in RAM**
- **built offline**
- **better treated as reusable artifacts than mutable application rows**

Risk Atlas is built around that workflow.

Instead of treating pairwise market relationships like ordinary database tables, this project treats them as **versioned analysis artifacts**:

1. import curated EOD data  
2. select universe, as-of date, window, and score method  
3. run an offline build job  
4. generate `matrix.bsm` + `manifest.json`  
5. upload artifacts to object storage  
6. query and explore the artifact through APIs and UI

## What this project demonstrates

- **Systems engineering**: a custom C++ out-of-core symmetric matrix engine (`bsm`)
- **Backend/platform engineering**: build orchestration, metadata registry, artifact publishing, query APIs
- **Full-stack delivery**: React/TypeScript UI for artifact exploration
- **Cloud deployment**: Dockerized services, S3-backed artifact storage, AWS-hosted demo

## Core workflow

```text
Curated EOD CSV
      ↓
Offline Build Job
      ↓
pairwise score computation
      ↓
bsm artifact generation (.bsm + manifest)
      ↓
artifact metadata registration
      ↓
S3 artifact storage
      ↓
read-only API + web UI
```

## MVP capabilities

- import curated Hong Kong EOD data
- choose a predefined universe
- select as-of date, lookback window, and score method
- trigger an offline build
- generate and publish `.bsm` artifacts
- list artifacts and inspect build metadata
- query pair scores
- find top-k neighbors for a symbol
- view a heatmap for a selected symbol subset

## Non-goals

Risk Atlas is **not**:

- a trading system
- a generic database
- a real-time shared-write platform
- a user/order/account management application

Its core purpose is narrower and more deliberate:

> **build reusable market relationship artifacts offline, then expose them for read-only query and analysis.**

## Stack

- **C++20**: `bsm` artifact engine
- **TypeScript / Fastify**: backend API
- **PostgreSQL**: metadata registry
- **React / TypeScript**: frontend UI
- **Docker**: local/dev packaging
- **AWS S3**: artifact storage
- **AWS-hosted demo**: deployable MVP

## Status

This repository is an MVP focused on one clear use case:

**offline financial pairwise artifact construction and exploration.**