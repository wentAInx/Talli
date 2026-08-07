---
name: backend-architecture
description: Design or review backend modules, services, server actions/route handlers, dependency boundaries, transactions, validation, and repository/query structure for this Multi-Asset Ledger V1. Use for backend architecture decisions and refactors; do not use to introduce microservices or generic architecture frameworks.
---

# Backend Architecture — Multi-Asset Ledger V1

## Goal

Keep the application a small, explicit, testable modular monolith whose dependency structure makes the financial invariants difficult to bypass.

Read `AGENTS.md`, then the relevant sections of `01_CODEX_MASTER_INSTRUCTION_CN.md`, `03_DOMAIN_LEDGER_SPEC_CN.md`, and `08_IMPLEMENTATION_PLAN_CN.md` before consequential architecture changes.

## Baseline shape

```text
src/app/**                  UI + server boundaries
src/components/**           reusable presentation
src/services/**             application use-cases / transaction orchestration
src/domain/**               pure financial rules and calculations
src/db/schema.ts            Drizzle schema
src/db/queries/**           concrete persistence/query operations
src/db/migrations/**        migrations
src/lib/**                  non-domain infrastructure utilities
```

Exact filenames may evolve, but dependency direction must remain explicit.

## Rules

1. **UI is not the domain.** React components may collect/display values but do not decide event validity, calculate balances, aggregate reports, or mutate ledger entries directly.
2. **Services own use-cases.** Creating/updating/deleting events and reconciliation should have an application service/command boundary responsible for server-side validation and DB transaction scope.
3. **Domain is pure.** `money`, event invariant builders/validators, balance semantics, report classification, and executed exchange ratio logic remain deterministic and infrastructure-free where practical.
4. **Persistence is concrete.** Prefer narrow query/repository modules over an abstract generic repository framework. Do not wrap Drizzle just to hide Drizzle if there is no semantic benefit.
5. **Transactions are explicit.** One service operation owns one transaction for event + entries + tag changes. Avoid transaction nesting hidden across helpers.
6. **Server boundary is explicit.** Prefer Server Actions for in-app mutations. Use Route Handlers for downloads/uploads or a genuinely HTTP-shaped concern. Either path must call the same service/domain rules.
7. **Reads stay bounded.** Transaction history uses cursor/keyset pagination. Dashboard/report queries are scoped. Avoid loading all events for convenience.
8. **No speculative infrastructure.** No microservices, Redis, queues, message bus, GraphQL, CQRS framework, event sourcing framework, worker fleet, or network cache in V1.
9. **No speculative auth system.** V1 is single-user and must instead document trusted-network/reverse-proxy access expectations.
10. **No valuation seams that execute.** A future `PriceProvider` may exist only as documentation/type-level design if the canonical V1 spec allows it; no runtime provider, API key, scheduled job, or quote cache.

## Preferred service boundaries

Use explicit capabilities such as:

- `LedgerCommandService`
- `BalanceService`
- `ReportService`
- `AccountService`
- `ReconciliationService`
- `BackupService`

Do not force class-based DI. Functions or concrete service objects are fine when dependencies and transaction ownership remain obvious.

## Validation strategy

- Browser/form validation: UX only.
- Server boundary schema validation: malformed/untrusted input.
- Domain/application validation: financial invariants that must hold regardless of caller.
- DB constraints/FKs: final structural defense.

Never rely on only one layer for money/event correctness.

## Review checklist

Before finishing a backend change, answer:

- Can a React component bypass a financial invariant?
- Is any money converted through `number`?
- Is the transaction owner obvious?
- Can partial event/entry writes survive a failure?
- Does this add infrastructure or abstraction not needed by a single-user SQLite app?
- Is history read bounded?
- Did the change accidentally implement V2 valuation, sync, auth, or AI features?
- Are behavior changes covered by the canonical acceptance cases?
