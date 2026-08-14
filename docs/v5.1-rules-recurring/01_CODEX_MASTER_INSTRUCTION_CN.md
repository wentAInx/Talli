# Codex Master Instruction — Talli V5.1

## Frozen baseline

```text
Repository: wentAInx/Talli
Tag:        v5.0.0
SHA:        d8afd71eea85abf05121b79b6d6c499b0272f19f
```

开工前：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git tag --points-at HEAD
git log --oneline --decorate -12
```

推荐：

```bash
git checkout main
git pull --ff-only
git switch -c feat/v5.1-rules-recurring
```

如果不是 `d8afd71eea85abf05121b79b6d6c499b0272f19f`，停止并报告。

## 冻结语义

不得改变：

- V1 exact bigint Ledger / Expense / Income / Transfer / Exchange；
- snapshot/reconciliation；
- V2 valuation derived boundary；
- V3 Kraken candidate/provenance；
- V4/V4.1 EVM read-only/exact fee；
- V5 file source↔candidate exact provenance；
- V5 Match Existing；
- Backup 1..6 compatibility。

## V5.1 Hard Red Lines

1. Rule 只产生 derived projection。
2. Rule 不修改 V5 source/candidate rows。
3. Rule 不修改 amount/date/account/source identity。
4. Rule 不调用 Ledger writer。
5. V5.1 rules 只处理 file_import candidates。
6. 不支持 user regex。
7. evaluator deterministic、无 HTTP。
8. Recurring item 是 expectation，不是 Ledger。
9. No auto-post。
10. No auto-link。
11. Future occurrences 不持久化成 fake Ledger。
12. Explicit Post/Import 必须复用 V1 writer。
13. Recurring native asset only，不做 V2 conversion。
14. 所有金额 bigint atomic。
15. No cron/background notification。
16. Backup V7 不包含 derived projections/suggestions。

Allowed rule actions：

```text
set_payee
set_category
add_tag
set_note
append_note
suggest_event_type   # expense|income only
```

Forbidden：

```text
set_amount
set_date
set_account
create_transfer
create_ledger_event
delete_transaction
change_source_identity
```

Recurring:

```text
expense|income
daily|weekly|monthly|yearly
exact|approx|range
```

Final gate：

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
```

不要 merge/tag。
