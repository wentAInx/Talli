# Changelog

This file summarizes Talli's tagged product milestones. Existing tags are
lightweight tags. Dates below are the target commit dates recorded in Git, not
separately recorded tag-creation dates.

## Unreleased

- Repository documentation, community files, and publication hygiene are being
  prepared separately from product behavior.

## v6.0.0 — 2026-08-16

Commit: `152004674b830330d37abe2fad7e9bf86f9090c5`

- Added cache-backed historical net worth, allocation, external cash flow, and
  exact period decomposition over completed app-timezone days.
- Added bounded, foreground historical quote refresh and manual historical
  exact-pair quotes.
- Added backup `schemaVersion=8` support for manual historical quotes while
  excluding provider cache and refresh-operation state.

## v5.1.0 — 2026-08-15

Commit: `dd39ff06aa52c681f42a0165b2e7a0552c022d09`

- Added deterministic file-import rule projections.
- Added exact recurring expense/income expectations, matching, linking, and
  explicit posting.
- Added backup `schemaVersion=7` support for rule and recurring user facts.

## v5.0.0 — 2026-08-14

Commit: `d8afd71eea85abf05121b79b6d6c499b0272f19f`

- Added bounded CSV, OFX/QFX, and ISO 20022 camt.053 import and preview.
- Added source/candidate provenance, exact matching, explicit Import, and
  statement-balance Reconcile boundaries.
- Added backup `schemaVersion=6` support for file-import user facts.

## v4.1.0 — 2026-08-13

Commit: `ef968976510e04f0532715c1e73f88595a607e89`

- Extended public-address read-only observations to Base Mainnet and Arbitrum
  One.
- Added trace-gated movement review and chain-specific exact L2 fee provenance.
- Added backup `schemaVersion=5` support for L2 fee evidence.

## v4.0.0 — 2026-08-13

Commit: `f981e3e0e454f4d7a8ce0111323c9aceebc2483b`

- Added Ethereum Mainnet public-address balance and finalized activity
  observations.
- Added reviewable movement and separate gas candidates with explicit import.
- Added backup `schemaVersion=4` support for EVM user facts.

## v3.0.0 — 2026-08-12

Commit: `51a7f0c346c10c8bcd4e29261730eee5eb360df5`

- Added Kraken Spot read-only balance, ledger, and trade observations.
- Added mapping, candidate review, explicit Import/Reconcile, provenance, and
  idempotent re-sync behavior.
- Added backup `schemaVersion=3` support for selected external user facts.

## v2.0.0 — 2026-08-11

Commit: `ad0de1d26d060fd391449f869a5c99a36f1901ed`

- Added explicit fiat Home Asset configuration and current portfolio valuation.
- Added CoinGecko market observations, ECB reference legs, manual quote
  override, freshness, provenance, and completeness semantics.
- Added backup `schemaVersion=2` with V1 in-memory upgrade compatibility.

## V1 foundation — untagged

The repository has no V1 release tag. The initial V1 milestone commit is
`777e9cec4ca3c321dd620080a735249e494e9ed3` (commit date 2026-08-08), followed
by final V1 audit fixes through
`9345d8516aaa78495e408d53bb74e03f2f5eaa57`.

- Established exact multi-asset Ledger quantities, accounts, events, entries,
  snapshots, reports, settings, JSON backup/restore, CSV export, and responsive
  web flows.
- Established SQLite `TEXT` atomic-unit storage and `bigint` domain arithmetic.
