# External sync and import

Talli treats every external source as evidence to review, not as accounting
authority.

## Shared boundary

**Design rule.** Provider data, on-chain activity, and imported statement rows
enter separate source, observation, candidate, mapping, and provenance models.

**Invariant.** Sync, preview, and file commit never create Ledger events or
balance snapshots. Only explicit Import may call Ledger writers; only explicit
Reconcile may call snapshot writers.

**Reason.** External systems can duplicate, omit, reorder, or reinterpret
activity. Reviewable candidates preserve source evidence without silently
changing balances.

**Implementation consequence.** Import and reconciliation services reuse the
same transactional Ledger boundaries as manual commands and record provenance
that prevents duplicate posting.

## Kraken Spot

- Credentials are dedicated, server-only, and limited to `query-funds`,
  `query-ledger`, and `query-closed-trades`.
- Known write permissions are rejected during permission preflight.
- Nonces are monotonic; provider calls and normalization run outside database
  write transactions.
- Balance, ledger, and trade data becomes observations or candidates. A re-sync
  cannot duplicate an already imported Ledger event.

## EVM public-address observations

- Supported networks are Ethereum Mainnet (`1`), Base Mainnet (`8453`), and
  Arbitrum One (`42161`).
- Only public addresses are accepted. Talli has no private-key, signing,
  broadcasting, or configurable write-RPC path.
- Native assets and ERC-20 tokens are identified by chain and contract identity,
  never by display symbol alone.
- Provider amounts are parsed from exact raw values. Human-formatted provider
  values are audit metadata only.
- Movement and network fee remain separate candidates. Complex DeFi stays
  unsupported, and bridge activity is not silently correlated across chains.
- Base and Arbitrum activity require the configured exact trace capability;
  unavailable trace evidence must not advance activity as if discovery were
  complete.
- Network-fee candidates have a separate integrity gate: import is refused
  unless exact L2 fee provenance is available.

## Financial file import

**Design rule.** The user selects an immutable target account profile before
preview. Asset mapping is never inferred from a filename, symbol, or account
number.

Supported inputs include CSV, OFX 1, OFX 2/QFX, and defined ISO 20022 camt.053
subsets. Parsers enforce file, row, and text limits. XML input rejects DTD,
ENTITY, and XInclude constructs and performs no network access.

Preview is read-only. Commit reparses the file, then atomically stores only
source, batch, candidate, observation, and provenance facts. Raw file bytes and
full account numbers are not persisted. Explicit Match Existing links exact
evidence without editing the matched event. Explicit Import or Reconcile is a
separate user action.

## Rules and recurring expectations

Rules project payee, category, tags, note, or an expense/income suggestion onto
unresolved file-import candidates. They cannot change source identity, amount,
date, account, normalized legs, or Ledger facts.

Recurring definitions produce date-only expectations with exact `bigint`
amounts. Generated occurrences and matches are in-memory suggestions. Explicit
Link, Post, Import, or Skip actions persist the corresponding facts; Unskip
removes an explicit skip fact.

## Current source pointers

- `src/domain/external-sync.ts`
- `src/domain/evm.ts`
- `src/domain/file-import.ts`
- `src/providers/**`
- `src/services/external-import-service.ts`
- `src/services/external-reconciliation-service.ts`
- `src/services/file-import-service.ts`
