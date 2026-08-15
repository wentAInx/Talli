# V6 Implementation Plan

## Phase 0 — Canonical docs / AGENTS

1. 创建 branch from `dd39ff06aa52c681f42a0165b2e7a0552c022d09`。
2. 把本 package 放入 `docs/v6-historical-analytics/`。
3. 更新 root `AGENTS.md`：
   - project identity through V6；
   - old `No historical pricing` 改为 `V1 Ledger does not store historical valuation; V6 derived layer is allowed`；
   - no tax/cost basis仍保留。
4. 更新 `src/services/AGENTS.md`：
   - allow explicit historical refresh service；
   - provider I/O outside tx；
   - no background collector；
   - analytics resolver cache-only。
5. 检查其他 nested AGENTS，仅修冲突文字。

先跑 format/lint。

## Phase 1 — Domain + schema

- historical quote types/resolver domain
- date cutoff helper
- SQL/Drizzle migration
- DB queries
- manual quote domain validation
- Backup V8 model skeleton
- unit/migration tests

## Phase 2 — Provider historical adapters

CoinGecko：
- add pro mode support without breaking current demo/keyless
- range historical method
- hourly/daily parse

ECB：
- range historical method

- deterministic injected transport tests
- no real HTTP

## Phase 3 — Refresh orchestration

- run/unit tables
- planner
- start/step/cancel
- mapping fingerprint
- outside-transaction HTTP
- idempotent upsert
- resume/failure/cooldown tests

## Phase 4 — Historical balance + resolver

- `queryBalancesAtInstants`
- differential test against existing query
- observation batch reader
- historical resolver
- archived account/asset support

## Phase 5 — Net worth + allocation

- daily service
- completeness/provenance
- gross assets/liabilities
- allocation
- API reads

## Phase 6 — Cash flow + decomposition

- event-time flow valuation
- month buckets
- day bridge
- snapshot reconciliation effect
- exact identity tests

## Phase 7 — Backup V8 + Security

- export/restore
- V1–V7 upgrades
- manual history only
- cache exclusion
- extend security script

## Phase 8 — UI

- `/analytics`
- data status
- refresh/resume
- net worth
- allocation
- cash flow
- bridge
- manual historical quote
- source attribution
- mobile/accessibility

Use installed frontend/React/design skills.

## Phase 9 — Full regression

Targeted first, then full gate。

## Phase 10 — Codex self-review

报告：
- exact SHA
- changed files
- migrations
- commands actually run
- test counts
- residual risks
- provider-policy assumptions

Push feature branch only after full local gate where runnable。

**不要 merge main / tag。**
Final source audit由独立 ChatGPT 完成。
