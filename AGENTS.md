# AGENTS.md — Multi-Asset Ledger V1

## Project identity

This repository implements the **Multi-Asset Personal Ledger V1** described by the canonical specification files in the repository root.

The product is a single-user, self-hosted Next.js + TypeScript application backed by SQLite. Its primary invariant is:

> Ledger quantities are source of truth. Market valuation is derived data and does not exist in V1.

Do not reinterpret the project as a portfolio tracker, market-price dashboard, banking sync product, or multi-user SaaS.

## Canonical specification and precedence

Before substantial implementation work, read the relevant canonical files. For a fresh session or a cross-cutting change, read them in the order listed in `00_README_CN.md`.

When rules conflict, use this precedence:

1. `01_CODEX_MASTER_INSTRUCTION_CN.md`
2. `03_DOMAIN_LEDGER_SPEC_CN.md`
3. `07_TEST_ACCEPTANCE_CN.md`
4. `04_DATABASE_SCHEMA.sql` and `05_TYPES_AND_SERVICE_CONTRACTS.ts`
5. UI and implementation guidance

Do not modify canonical specification files unless the user explicitly asks to change the specification.

## V1 non-negotiable invariants

- No market-price, FX, crypto-price, historical-price, quote, or valuation network calls.
- No base/home currency, unified net-worth number, cross-asset aggregation, P&L, or stablecoin peg assumption.
- Persist monetary quantities as signed base-10 integer **TEXT** atomic units. Domain arithmetic uses `bigint`.
- Never use JavaScript `number`, `Number()`, `parseFloat()`, SQLite `REAL`, or floating-point arithmetic for persisted money, balances, fees, or executed exchange quantities.
- Reject user input with fractional digits greater than the asset `scale`; never silently round.
- `transfer` means same-asset movement between distinct accounts with equal absolute source/destination quantities.
- `exchange` means different-asset movement with independently entered source/destination quantities.
- Reconciliation is a balance snapshot, not income/expense. A snapshot at T covers events with `occurredAt <= T`; only entries with `occurredAt > T` are added after it.
- Reports count `expense/main`, `income/main`, and transfer/exchange `fee` as specified. Transfer/exchange principal and snapshots are excluded.
- Event plus entries mutations are atomic SQLite transactions.
- An account belongs to exactly one asset.
- Referenced assets/accounts are archived rather than destructively removed.

When touching ledger semantics, invoke or follow `$ledger-domain-guard`.

## Architecture baseline

For implementation details not fixed by the canonical specs, also follow `CODEX_ARCHITECTURE_DEFAULTS_CN.md`.

Use a pragmatic modular monolith. Do not introduce microservices, Redis, queues, GraphQL, event buses, CQRS frameworks, generic repository frameworks, or distributed infrastructure in V1.

Preferred dependency direction:

```text
React / App Router UI
        ↓
server boundary (Server Action or Route Handler)
        ↓
application/service layer
        ↓
pure domain rules
        ↓
concrete persistence/query layer
        ↓
SQLite via Drizzle
```

Rules:

- React components do not own ledger rules, money arithmetic, balance computation, report semantics, or transaction orchestration.
- Domain modules are deterministic and independently testable; they do not import React, HTTP primitives, or Drizzle.
- DB access stays under `src/db/**` and application services. Avoid ad-hoc SQL/Drizzle calls from components.
- Validate at the server boundary and again at the domain/application invariant boundary where correctness requires it.
- Prefer Server Components for reads and minimal client state. Use Server Actions for ordinary in-app mutations; use Route Handlers only where an HTTP/file boundary is materially useful (for example backup/export/restore endpoints).
- Do not create abstraction layers merely to satisfy a pattern. Prefer concrete repositories/query modules and explicit transaction ownership.
- Use `crypto.randomUUID()` unless a stronger project requirement appears; do not add an ID dependency by default.
- Keep all date storage UTC ISO. Natural-month reporting is computed using the configured app timezone, never the server-local timezone implicitly.
- For stable transaction pagination, use deterministic ordering compatible with `occurredAt DESC`, `createdAt DESC`, then `id` and prefer keyset/cursor pagination over loading all history.

When designing backend modules, services, APIs, or dependency boundaries, invoke or follow `$backend-architecture`.

## SQLite / persistence baseline

- SQLite is the V1 source of persistence and must enable foreign keys and WAL.
- Use Drizzle schema + explicit migrations; do not rely on runtime schema mutation.
- Atomic amount columns remain TEXT even when SQL aggregation would be convenient.
- Where arbitrary-size integer TEXT cannot be safely summed by SQLite, fetch bounded rows and sum with `BigInt` in Node, as specified.
- Restore validates the complete backup first, then writes everything in one transaction to an empty business database.

When modifying schema, migrations, queries, backup/restore, or transactions, invoke or follow `$sqlite-drizzle-persistence`.

## Frontend and product UX

The globally installed frontend skills should be used when relevant:

- `$frontend-design` for visual direction and UI implementation.
- `$react-best-practices` for React/Next.js implementation quality.
- `$web-design-guidelines` for accessibility and interface review.

Also follow `$finance-ui-review` for this product's finance-specific rules.

Product-specific requirements include:

- clean, compact, finance-oriented, mobile-first responsive UI;
- tabular numerals for amounts;
- clear asset code/precision and explicit negative signs;
- never communicate sign only through color;
- never show a unified cross-asset total;
- transaction entry should minimize steps;
- transfer and exchange forms must expose their different semantics;
- destructive delete and destructive restore require explicit confirmation;
- empty states must not seed fake balances or fake transactions.

## Implementation workflow

Follow `08_IMPLEMENTATION_PLAN_CN.md`. Correctness of Money, ledger invariants, balance snapshots, and persistence comes before elaborate UI.

For non-trivial work:

1. Inspect existing code and the relevant spec sections before editing.
2. State the affected invariants and acceptance cases.
3. Make the smallest coherent change that preserves V1 scope.
4. Add/update tests together with behavior changes.
5. Run targeted checks first, then the repository validation gate.
6. Review the diff for accidental V2 features, float money, cross-asset aggregation, hidden DB access, and missing transaction boundaries.

Do not ask the user to resolve an ambiguity if the canonical specs already resolve it. For minor unspecified implementation details, choose the simplest conservative V1-compatible option and record it briefly if consequential.

## Testing and verification

Financial-core tests use deterministic timestamps and exact quantities.

Before declaring work complete, run the actual project equivalents of:

```text
lint
typecheck
unit/integration tests
build
```

Run relevant Playwright E2E when UI flows are changed or when the suite is configured.

Invoke or follow `$acceptance-gate` before claiming a phase or V1 is complete.

Never invent command results. Report commands not run, failures, and residual risks explicitly.

## Multi-agent use

Parallel agents are encouraged for **read-heavy audit work**, not concurrent edits to the same implementation.

For major milestones or final review, delegate in parallel to the project-scoped read-only agents when available:

- `domain_auditor`
- `architecture_auditor`
- `ui_auditor`
- `test_auditor`

Wait for their findings, then let the primary agent make any required fixes sequentially.

## Definition of done for a Codex turn

A task is done only when:

- requested behavior is implemented;
- relevant canonical invariants remain true;
- targeted tests exist and pass where runnable;
- relevant lint/typecheck/build checks are run where practical;
- the diff contains no unintended scope expansion;
- the final report names files changed, commands actually run, failures/limitations, and any intentionally deferred items.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
