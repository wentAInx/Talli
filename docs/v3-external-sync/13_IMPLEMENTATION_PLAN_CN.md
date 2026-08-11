# V3 Implementation Plan

## Phase 0 — release baseline

- confirm V2 baseline/CI
- main + v2.0.0 preferred
- branch `feat/v3-external-sync`
- old gates green

## Phase 1 — additive schema

- Drizzle tables
- migration
- queries
- V1/V2 fact schema unchanged

## Phase 2 — domain primitives

- provider decimal validation
- source identity/hash
- mapping status
- candidate status
- exact observation→atomic conversion

## Phase 3 — Kraken auth/security

- env credential factory
- HMAC signature
- persisted monotonic nonce
- permission gate
- safe errors
- injectable HTTP

## Phase 4 — metadata

- Assets assetVersion=1
- AssetPairs assetVersion=1
- raw/canonical adapter
- suffix preserved

## Phase 5 — read-only fetch

- Balance
- Ledgers pages
- TradesHistory pages
- no write API
- HTTP outside DB tx

## Phase 6 — sync persistence

- run/state
- source upsert
- observation append
- candidate upsert
- concurrent guard
- idempotency

## Phase 7 — mappings

- asset mapping
- account mapping
- validation
- precision status
- mapping UI

## Phase 8 — candidate normalization

- trade buy/sell
- non-trade ledger suggestions
- source links
- unresolved fee

## Phase 9 — atomic import

受控 refactor V1 writer only if required：

```text
public V1 command
→ executor-scoped same writer
```

candidate lock + V1 event + import link + status in one transaction。

## Phase 10 — reconciliation

- difference
- explicit confirm
- existing snapshot path

## Phase 11 — backup v3

- schemaVersion 3
- V1/V2 upgrades
- V3 include/exclude
- atomic restore

## Phase 12 — UI

- `/sync`
- connection/permissions
- mappings
- balances
- candidate queue/review/import
- provenance/errors/responsive

## Phase 13 — E2E / CI

- deterministic fixtures
- no real Kraken
- desktop Chromium
- mobile WebKit
- all 8 gates
- Actions green

## Phase 14 — final audit handoff

输出：

- final SHA
- migration list
- changed files
- test counts
- CI run ID
- known limitations

交给独立 Final Audit。
