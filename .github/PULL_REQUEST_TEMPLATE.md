## Summary

<!-- What changed and why? -->

## Scope

<!-- What is intentionally included and excluded? -->

## Financial invariants affected?

<!-- Ledger source of truth, exact money, snapshot/report semantics, explicit Import/Reconcile/Post boundaries. Write "None" only after checking. -->

## Database migration?

<!-- Yes/No. If yes, name the migration and upgrade tests. -->

## Backup compatibility?

<!-- Describe wire-version, validation, restore, and round-trip impact. -->

## Provider/security impact?

<!-- Credentials, outbound requests, read/write capability, parsing, privacy, and deployment exposure. -->

## Tests run

<!-- List exact commands and results. Do not claim commands that were not run. -->

## Screenshots if UI

<!-- Use synthetic data only. Never include real accounts, balances, statements, backups, keys, or personal information. -->

## Residual risks

<!-- Known limitations, untested environments, or follow-up work. -->

## Checklist

- [ ] No real financial data, credentials, databases, backups, or personal information is included.
- [ ] No floating-point money, silent rounding, implicit stablecoin peg, or direct provider-to-Ledger write was introduced.
- [ ] Documentation and tests were updated where behavior changed.
- [ ] Existing validation was not weakened, skipped, or made non-blocking.
