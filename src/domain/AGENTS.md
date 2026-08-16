# Domain contributor guidance

These rules override/generalize the repository instructions for `src/domain/**`.

- Domain code must be deterministic and independently testable without React, HTTP, Drizzle, SQLite, filesystem, or network access.
- Monetary quantities are `bigint`; persisted representations are converted at explicit boundaries only.
- Do not call `Number`, `parseFloat`, or floating-point math for money or executed quantities.
- Money parsing rejects excess scale and scientific notation; never silently rounds.
- Ledger entry builders enforce event cardinality, signs, roles, account/asset compatibility, and optional fee rules.
- Balance computation uses the latest snapshot `asOf <= queryTime`, then entries with `occurredAt > snapshot.asOf && <= queryTime`.
- Report logic never aggregates unlike assets and excludes transfer/exchange principal and snapshots.
- Prefer small pure functions and explicit types over pattern-heavy abstractions.
- Any semantic change requires deterministic unit/integration tests tied to the relevant acceptance case.
