# Contributing to Talli

Thank you for helping improve Talli. Contributions must preserve exact
accounting behavior, user privacy, and the boundary between external evidence
and Ledger facts.

## Project scope

Talli is a single-user, self-hosted multi-asset personal ledger. Read the
[roadmap](ROADMAP.md) before proposing a large feature. Multi-user SaaS,
transaction signing, custody, private-key handling, tax-lot accounting, and
write-capable banking automation are outside the current scope.

Security reports do not belong in public issues. Follow [SECURITY.md](SECURITY.md).

## Protect real data

Never include any of the following in an issue, discussion, fixture, test,
screenshot, log, commit, or pull request:

- API keys, secrets, tokens, cookies, signed requests, or environment files;
- wallet private keys, mnemonics, or seed phrases;
- real backup JSON, SQLite databases, or raw application data;
- real bank statements or transaction exports;
- full bank, card, exchange, or brokerage account numbers; or
- personally identifying financial information.

Use deterministic synthetic fixtures. A realistic format is acceptable only
when every identifier and financial record is demonstrably synthetic.

## Architecture invariants

Read [AGENTS.md](AGENTS.md) and the [current architecture docs](docs/README.md)
before editing. At minimum:

- Ledger quantities are the source of truth.
- Money is SQLite integer `TEXT` at rest and `bigint` in domain code.
- Do not introduce floating-point money or silent rounding.
- Do not assume a stablecoin peg.
- Provider, statement, and on-chain data do not write Ledger facts directly.
- Provider I/O stays server-only and outside database write transactions.
- Financial mutations preserve their defined atomic transaction boundary.
- Migrations and backups remain compatible with supported earlier versions.

If a change affects the financial core, add deterministic tests for the exact
quantity, sign, snapshot, report, migration, and backup behavior involved.

## Local setup

Use Node.js 22 and pnpm 10.11.0.

```bash
pnpm install --frozen-lockfile
DATABASE_PATH=./data/finance.db pnpm db:setup
DATABASE_PATH=./data/finance.db pnpm dev
```

Do not run tests against a development or production database.

## Branch and pull-request workflow

1. Branch from the current `main` using a focused prefix such as `feat/`,
   `fix/`, `docs/`, or `chore/`.
2. Keep one coherent concern per branch. Do not mix release operations or
   unrelated cleanup with a functional change.
3. Update tests and current documentation in the same pull request as behavior.
4. Explain affected financial invariants, database/backup impact, provider or
   security impact, validation commands, and residual risk.
5. Include screenshots for UI changes, using synthetic data only.
6. Wait for review and required CI. Do not rewrite shared or released history.

## Database and backup changes

- Change the current Drizzle schema and add an explicit forward migration.
- Never edit an already released migration to simulate a new state.
- Test clean setup and upgrade from the relevant earlier schema.
- Preserve exact `TEXT`/`bigint` semantics and foreign-key behavior.
- Update backup validation, upgrade, export, restore, and round-trip tests when
  the supported user-fact contract changes.
- Historical SQL under `docs/history/` is non-executable reference material.

## Validation

Run targeted tests while developing, then the complete gate before requesting
review:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm security:check
pnpm test:e2e
docker compose config
```

Do not skip, delete, relax, or mark an existing check non-blocking to obtain a
green result. If a command cannot run, state that explicitly in the pull request.

## Documentation

Current behavior belongs in `README.md` or `docs/architecture/`. Historical
design context belongs in `docs/history/` and must be labeled non-authoritative.
Do not add model-specific prompts, private maintainer handoffs, chat transcripts,
or package-validation manifests to the public project documentation.

## License of contributions

Unless otherwise stated, contributions accepted into Talli are licensed under
Apache-2.0. See [LICENSE](LICENSE) for the full license text.
