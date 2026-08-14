# Codex Master Instruction — Talli V5.0

## Frozen baseline

```text
Repository: wentAInx/Talli
Tag: v4.1.0
SHA: ef968976510e04f0532715c1e73f88595a607e89
```

开始前实际执行：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git tag --points-at HEAD
git log --oneline --decorate -10
```

推荐：

```bash
git checkout main
git pull --ff-only
git switch -c feat/v5-financial-file-import
```

如果 baseline 不匹配，停止并报告。

## 冻结语义

不得改变 V1 bigint Ledger、Expense/Income/Transfer/Exchange、snapshot/reconciliation、
V2 valuation derived boundary、V3 Kraken read-only/candidate/provenance、
V4/V4.1 EVM observation/review/import、Base/Arbitrum exact fee、Backup 1–5 兼容。

## V5.0 hard red lines

1. File import 是 external observation，不是 Ledger。
2. Preview 零 financial DB write。
3. Commit 只创建 import provenance/source/candidate/observation。
4. Explicit Import 使用同一个 V1 writer。
5. Explicit Match Existing 不修改被匹配的 Ledger event。
6. V5.0 不 auto-match / auto-import。
7. 不做 Rules/Recurring/Historical valuation/direct bank API。
8. raw file bytes 不进 DB/Backup。
9. full bank account number 不进 source/Backup。
10. 所有金额 exact，money 不用 JS `number`。
11. structured account/currency mismatch fail closed。
12. parse 在 SQLite write tx 外；batch persistence atomic。
13. file parser 不进行 HTTP。
14. XML 在 parser 前拒绝 `<!DOCTYPE` / `<!ENTITY`。
15. deterministic fixtures only。

支持：

```text
CSV
OFX 1.x SGML Banking/CreditCard subset
OFX 2.x XML Banking/CreditCard subset
QFX through OFX parser
camt.053.001.01 ... camt.053.001.14 common subset
```

不支持 QIF/MT940/PDF/OCR/camt.052/camt.054/investment OFX。

Limits：

```text
MAX_FILE_BYTES = 20 MiB
MAX_TRANSACTION_ROWS = 100000
MAX_TEXT_FIELD_CHARS = 10000
```

CSV 复用现有 `csv-parse`。

XML 允许新增一个 server-only parser dependency；必须先核对 upstream security。
截至 2026-08-13，`fast-xml-parser 5.10.1` 为当前版本，但即使使用它也必须预先拒绝 DTD/ENTITY。

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

不要 merge/tag；完成后返回 exact SHA + Actions run。
