# AGENTS.md — contributor guidance

This file describes repository-wide engineering constraints for human and
AI-assisted contributors. It is tool-independent. Current source, migrations,
tests, and the documents under `docs/architecture/` are authoritative; material
under `docs/history/` records design evolution only.

## Product boundary

Talli is a single-user, self-hosted Next.js application backed by SQLite. It is
not a multi-user service, transaction signer, custodial wallet, tax engine, or
write-capable banking client.

Talli currently has no built-in authentication. Do not expose it directly to
the Internet. Use a trusted private network or VPN, or an external
authentication and access-control proxy.

## Ledger and money invariants

- Ledger quantities are the source of truth. Prices, provider observations,
  imported files, rule projections, recurring expectations, and analytics are
  separate facts.
- Persist monetary quantities as signed base-10 integer `TEXT` atomic units and
  use `bigint` in domain code.
- Never use JavaScript `number`, `Number()`, `parseFloat()`, SQLite `REAL`, or
  floating-point arithmetic for money, balances, fees, or executed quantities.
- Reject excess fractional digits. Never silently round financial input.
- A transfer moves the same asset between distinct accounts with equal absolute
  quantities. An exchange moves different assets with independently entered
  quantities.
- A balance snapshot at `T` covers events with `occurredAt <= T`; only entries
  in `(snapshot.asOf, queryTime]` are added after the latest applicable snapshot.
- Transfer and exchange principal are excluded from income/expense reports.
  Explicit fee entries remain expenses in their own asset.
- Event metadata, entries, tags, imports, links, and snapshots must preserve the
  transaction boundaries defined by the current service layer.
- Referenced accounts and assets are archived rather than destructively removed.

## Valuation and provider boundaries

- Price and rate facts use validated positive decimal strings and `decimal.js`.
  They do not reuse ledger atomic-unit semantics.
- Home Asset valuation requires an active fiat asset and explicit quote legs.
- Never assume `USDT`, `USDC`, or another stablecoin equals a fiat currency.
- Missing quotes for a nonzero position make the result incomplete; they never
  become zero.
- Provider HTTP is server-only, explicit, and outside SQLite write transactions.
  Resolvers, server rendering, reports, and analytics reads are cache-only.
- Provider, exchange, on-chain, and imported-file data never write Ledger facts
  directly. Only an explicit Import may invoke Ledger writers; only an explicit
  Reconcile may invoke snapshot writers.
- Accept only public EVM addresses. Never accept, persist, display, or request
  private keys, mnemonics, seed phrases, signing, or transaction broadcasting.
- Chain and contract identity, not a display symbol, identifies an ERC-20 asset.

## Architecture and dependency direction

```text
React / App Router UI
        ↓
server boundary
        ↓
application services
        ↓
pure domain rules
        ↓
concrete queries and persistence
        ↓
SQLite via Drizzle
```

- UI code does not own ledger rules, balance algorithms, report semantics, money
  arithmetic, or database transaction orchestration.
- Domain modules remain deterministic and independent of React, HTTP, Drizzle,
  SQLite, filesystem, and network access.
- Database access stays under `src/db/**` and application services.
- Validate untrusted data at server boundaries and again where domain invariants
  require it.
- Store timestamps as UTC ISO strings. Natural-day and natural-month behavior
  uses the configured application timezone, never an implicit server timezone.
- Prefer the smallest concrete design that preserves these boundaries. Do not
  add distributed infrastructure or generic framework layers without a current
  product requirement.

## Database, migrations, and backups

- The current schema is `src/db/schema.ts`; executable history is
  `src/db/migrations/**`. Historical SQL under `docs/history/` is not executable.
- Keep SQLite foreign keys and WAL enabled.
- Use explicit forward migrations. Do not mutate schema at runtime.
- Preserve backup wire compatibility and validate the full payload before any
  restore write.
- Restore writes all accepted facts atomically to an eligible empty or seed-only
  database and runs foreign-key verification before commit.
- Credentials, provider caches, cursors, and operational refresh state stay out
  of backups unless a future version explicitly changes the wire contract.

## Security and privacy

- Keep secrets in server runtime environment variables. Never commit or log
  credentials, signed requests, full statement account numbers, real backups,
  or real financial fixtures.
- Kraken credentials must be dedicated and read-only. EVM integrations use a
  fixed chain registry and read-method allowlist.
- File parsing is bounded and rejects dangerous XML constructs. Provider and
  file parsing work stays outside database write transactions.
- Same-origin request checks are defense in depth; they are not authentication.

## Change workflow

1. Inspect current source, migrations, architecture documentation, and affected
   tests before editing.
2. State the affected invariants, files, validation, impact, and rollback.
3. Make the smallest coherent change. Do not mix feature work with repository,
   security, or release maintenance.
4. Add deterministic tests with behavior changes, especially for exact money,
   snapshots, provider boundaries, migrations, and backup compatibility.
5. Run targeted checks, then the full repository gate.
6. Review the final diff for floating-point money, implicit pegs, provider-to-
   Ledger writes, client credential exposure, hidden database access, and
   unintended migration or backup changes.

## Validation gate

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm security:check
pnpm test:e2e
```

Report commands actually run, exact failures, untested boundaries, and residual
risks. Do not weaken, skip, or delete existing checks to obtain a green result.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
