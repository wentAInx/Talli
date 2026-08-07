# Service-layer Codex rules

- Services own application use-cases and transaction orchestration; they do not render UI.
- Revalidate untrusted inputs at the server/application boundary and call domain rules rather than reproducing them ad hoc.
- Ledger event create/update/delete operations own a single explicit DB transaction covering event metadata, entries, and tags.
- Reconciliation creates/updates/deletes snapshots according to canonical semantics; never synthesizes balancing income/expense.
- Services may coordinate concrete DB query modules, but should not leak Drizzle row shapes to React where a stable application/domain DTO is clearer.
- Avoid service-to-service cycles and hidden transaction nesting.
- Do not add network integrations, background jobs, auth systems, or valuation services in V1.
