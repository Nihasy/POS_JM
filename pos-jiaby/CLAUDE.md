# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

JIABY POS — offline-first point-of-sale desktop app (Tauri 2 + React 19 + TypeScript + SQLite) for a retail/semi-wholesale shop in Andapa, Madagascar. UI, comments, and docs are in **French**. Reference spec: `docs/cdc-pos-jiaby-v2.md`; the TypeScript domain logic is a faithful port of the Python prototype `docs/pos_proto.py`, validated against 36 scenarios (`docs/test_scenarios.py`, IDs S01–S36 referenced throughout tests and comments).

## Commands

```sh
npm run dev            # Vite dev server, port 1420 (strict) — browser mode with sql.js in-memory DB + demo data
npm run tauri dev      # full desktop app (Rust backend + real SQLite)
npm run build          # tsc -b && vite build
npm run lint           # oxlint

npm test               # vitest run (tests/domain + tests/robustness)
npm run test:watch     # vitest watch
npx vitest run tests/domain/pmp.test.ts          # single test file
npx vitest run -t "S07"                          # tests matching a name
npm run test:e2e       # Playwright (starts/reuses dev server on 1420; browser mode, fresh in-memory DB per test)
```

Sync server (separate package in `server/`):

```sh
cd server
npm run dev            # tsx index.ts — Fastify on :3001; without DATABASE_URL falls back to in-memory storage
npm run db:generate    # drizzle-kit generate
npm run db:migrate     # drizzle-kit migrate
```

Historical data import: `npx tsx scripts/import-historique/index.ts --catalogue ... --stock ... --ventes ...`

## Architecture

Strict layering, dependencies point inward:

- **`src/core/domain/`** — pure business rules. No React, no Tauri, no DB. Functions mirror the Python proto signatures. All money math (PMP, pricing tiers, finalize, cashup) lives here and is unit-tested in `tests/domain/`.
- **`src/core/db/`** — SQLite access. `index.ts` exposes `openDatabase()/getDb()/withTransaction()`. Two backends behind one `Db` interface: Tauri `plugin-sql` (production, WAL mode) and `browserDb.ts` (sql.js in-memory, used automatically outside Tauri — dev server and E2E). `setDb()` injects mocks in tests. Migrations are plain SQL in `src/core/db/migrations/` but are **registered and executed on the Rust side** (`src-tauri/src/lib.rs`, `add_migrations`) — adding a migration requires touching both.
- **`src/app/services.ts`** — service layer: wires screens to domain + SQLite. Every critical write (sale, receiving, adjustment, cashup) runs inside ONE `withTransaction()` (`BEGIN IMMEDIATE`, all-or-nothing — "règle n°6").
- **`src/app/App.tsx`** — single top-level component that owns navigation, loads all app data (`AppData`), and passes callbacks into module screens.
- **`src/modules/{auth,caisse,cashup,catalogue,clients,rapports,stock}/`** — UI screens per functional module; state via zustand stores (e.g. `caisse/cartStore.ts`, `auth/authStore.ts`).
- **`src/core/sync/`** — client sync worker: pushes `sync_queue` events in batches of 100 with retry/backoff to the server, then pulls catalogue updates. Conflict rule: **shop is source of truth for sales/stock, server for catalogue**. Push is idempotent by UUID (S35).
- **`server/`** — independent npm package: Fastify + Drizzle + PostgreSQL sync server (`/sync/push`, `/sync/pull`, `/dashboard/summary`). Auth via `SHOP_TOKENS` env var (disabled without it — dev only).
- **`src-tauri/`** — Rust shell: SQL plugin migrations plus commands `hash_pin`/`verify_pin` (bcrypt) and `prepare_backup_dir` (backup rotation; the copy itself is done in TS via `VACUUM INTO`).

Path alias: `@/` → `src/` (configured in both vite and vitest configs).

## Non-negotiable domain conventions

- **Money is INTEGER Ariary** — no decimals, no floats, no other currency. PMP rounds to nearest integer.
- **Quantities are REAL** (sale by the meter).
- **All IDs are client-generated UUID v4** (required for offline sync).
- **Stock is never a mutable field**: it is the sum of the `inventory` ledger (signed movements). Corrections are counter-entries, never edits. `item_quantities` is a recalculable cache.
- **Soft delete everywhere** (`deleted = 1`), nothing is physically removed.
- `cost_price` is **frozen on the sale line** at sale time (exact margin, S07); `catalog_price` vs `applied_price` traces negotiation (S12).
- Pricing order is contractual: tier (détail/semi-gros/gros) → negotiated override → line discount → global discount (see `pricing.ts`).
- Document numbering per year: `V-2026-00001` (sales), `D-2026-00001` (quotes).

## Tests

- `tests/domain/` — vitest, node environment, pure domain functions. Scenario tests (`scenarios.test.ts`) map 1:1 to the S01–S36 Python scenarios; keep IDs in test names.
- `tests/e2e/` — Playwright against the browser build (sql.js), 1 worker, no parallelism.
- `tests/robustness/` — power-cut simulation: spawns a child process (`finalize-child.cjs`, better-sqlite3) mid-transaction and SIGKILLs it ×50, asserting the DB stays intact with no partial sale.

Coverage is only tracked for `src/core/domain/` and `src/core/format/`.
