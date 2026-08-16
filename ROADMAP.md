# Roadmap

This roadmap describes direction, not a delivery promise. A proposal still
requires design review, privacy review, migration/backup analysis, tests, and a
separate release decision.

## Current scope

The current released scope is `v6.0.0`:

- exact single-user, multi-asset Ledger accounting;
- self-hosted SQLite persistence and backup/restore;
- current valuation and historical net-worth analytics;
- explicit file import, matching, and reconciliation;
- deterministic rules and recurring expectations; and
- read-only Kraken and public-address EVM observations.

## Supported direction

Future work may improve:

- correctness, accessibility, performance, and operational diagnostics;
- backup verification, migration confidence, and recovery documentation;
- privacy-preserving deployment guidance and external access-control examples;
- additional deterministic import formats or mappings with explicit review;
- read-only provider coverage that preserves the candidate/Ledger boundary;
- analytics transparency, quote provenance, and incomplete-data explanations;
- contributor documentation, synthetic fixtures, and reproducible tests; and
- compatibility and maintenance of the current single-user self-hosted model.

No item above authorizes a feature release or changes an existing financial
invariant by itself.

## Not currently supported

- Multi-user SaaS or shared household tenancy
- Transaction signing or broadcasting
- Custodial wallets or custody of user assets
- Private-key, mnemonic, or seed-phrase storage
- Full DeFi accounting or automatic cross-chain bridge correlation
- Tax lots, FIFO, LIFO, or specific-lot accounting
- Realized tax profit/loss reporting
- Automatic write-capable banking or exchange sync
- Implicit stablecoin-to-fiat pegs
- Background provider collectors or hidden scheduled Ledger writes

## How to propose work

Open a feature request using synthetic examples. Explain the user problem,
scope, affected invariants, data/privacy impact, migration and backup impact,
failure behavior, and evidence needed for acceptance. Do not include real
financial data or credentials.
