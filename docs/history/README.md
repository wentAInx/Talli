# Historical design material

This directory preserves selected V1–V6 product, architecture, provider,
security, migration, test, fixture, and decision documents that explain how
Talli evolved.

These files are **historical design material**. They are not current operational
documentation and do not override current behavior.

Use this precedence:

1. Current source and runtime behavior
2. `src/db/schema.ts` and `src/db/migrations/**`
3. Current automated tests
4. `docs/architecture/**`
5. Files in this directory

Historical `*_DRAFT.sql`, `*_REFERENCE.sql`, and TypeScript contract sketches
are non-executable reference material. They may omit later constraints or use
superseded names. Never apply historical SQL to a database or treat a historical
contract sketch as the current API/schema.

AI implementation prompts, handoff prompts, package manifests, package
validation transcripts, duplicated consolidated engineering packages, and
release-audit prompts were intentionally removed from the current tree. Git
history still preserves them; history was not rewritten for repository cleanup.

| History | Product milestone | Tagged release |
| --- | --- | --- |
| [`v1/`](v1/) | Exact multi-asset Ledger foundation | No V1 release tag exists |
| [`v2-price-valuation/`](v2-price-valuation/) | Current price and Home Asset valuation | `v2.0.0` |
| [`v3-external-sync/`](v3-external-sync/) | Kraken read-only sync and candidate review | `v3.0.0` |
| [`v4-evm-wallet/`](v4-evm-wallet/) | Ethereum public-address observations | `v4.0.0` |
| [`v4.1-evm-l2/`](v4.1-evm-l2/) | Base/Arbitrum observations and L2 fee provenance | `v4.1.0` |
| [`v5-financial-file-import/`](v5-financial-file-import/) | CSV/OFX/QFX/camt.053 import foundation | `v5.0.0` |
| [`v5.1-rules-recurring/`](v5.1-rules-recurring/) | Deterministic rules and recurring expectations | `v5.1.0` |
| [`v6-historical-analytics/`](v6-historical-analytics/) | Historical valuation and analytics | `v6.0.0` |

The synthetic file-import fixtures used by automated tests remain at
`docs/v5-financial-file-import/fixtures/` because current tests reference that
path directly.
