# Talli documentation

These documents describe the current product and its engineering invariants.
For implementation details, current source, migrations, and tests remain the
final authority.

## Current architecture

- [Ledger and money](architecture/ledger-and-money.md)
- [Current valuation](architecture/valuation.md)
- [Historical analytics](architecture/historical-analytics.md)
- [External sync and import](architecture/external-sync.md)
- [Backup and migrations](architecture/backup-and-migrations.md)

## Project documents

- [Repository overview](../README.md)
- [Contributing](../CONTRIBUTING.md)
- [Security policy](../SECURITY.md)
- [Roadmap](../ROADMAP.md)
- [Changelog](../CHANGELOG.md)
- [Historical design material](history/README.md)

## Source-of-truth order

Use this order when documents and implementation appear to differ:

1. Current runtime behavior and safety boundaries in `src/**`
2. Current schema in `src/db/schema.ts` and executable migrations in
   `src/db/migrations/**`
3. Current tests in `src/tests/**` and `e2e/**`
4. Current architecture documents listed above
5. Historical design material

An apparent disagreement in the first four layers should be reported as a bug
or documentation issue. Never apply SQL from `docs/history/` to a live database.
