---
name: finance-ui-review
description: Design, implement, or audit UI/UX for this multi-asset ledger: dashboard, transaction entry, accounts, reports, settings, backup, responsive/mobile flows, and exact financial number presentation. Use alongside installed frontend-design/react/web-design skills.
---

# Finance UI Review — Talli (Multi-Asset Ledger V1)

Read `06_UI_UX_SPEC_CN.md` before designing a screen. UI must express the domain correctly; visual polish never overrides financial semantics.

## Recommended skill sequence

For a new or substantially redesigned screen, if these globally installed skills are available:

1. `$frontend-design` — establish visual direction and implement the interface.
2. `$finance-ui-review` — enforce product-specific finance semantics in this file.
3. `$react-best-practices` — review React/Next implementation quality.
4. `$web-design-guidelines` — review accessibility/interface conventions.

For an existing screen audit, start with this skill and then run the two review skills.

## Product visual direction

Target:

- clean;
- compact rather than oversized marketing UI;
- finance dashboard information density;
- neutral/subdued decoration;
- strong numerical alignment;
- mobile-first responsive behavior.

Avoid default AI/SaaS tropes when they reduce information density: giant hero cards, excessive gradients/glows, decorative metric tiles with no hierarchy, oversized whitespace, and every section inside identical rounded cards.

## Financial display rules

- Use tabular numerals for amounts.
- Preserve asset code visibility where symbol alone is ambiguous.
- Crypto does not automatically receive `$`.
- Negative values show an explicit `-` sign.
- Do not encode positive/negative state by color alone.
- Do not visually combine unlike assets into one total.
- Never show `总资产 ¥...`, `net worth`, `portfolio value`, or equivalent V1 valuation.
- Exchange UI may show **executed rate / 实际成交**, derived from the entered sides; never label it current/market price.

## Navigation

Desktop: left navigation.

Mobile: bottom navigation + top title.

Primary destinations:

- 总览
- 流水
- 报表
- 账户
- 设置

Keep a prominent global `+ 记一笔` action without obscuring mobile navigation.

## Transaction entry

Use modal/sheet on desktop and an appropriate full-height/sheet pattern on phone.

Event tabs/choices are distinct:

- 支出
- 收入
- 转账
- 兑换
- 调整余额

Do not collapse Transfer and Exchange into a generic movement form.

After choosing an account for ordinary income/expense, the account determines the asset; do not add a redundant currency selector.

Transfer destination options: different account, same asset, active accounts.

Exchange destination: different asset.

Fee expands independently and may select another asset account.

Reconciliation copy must explain the snapshot anchor consequence before save.

## Dashboard

Group by asset. Within each asset, show native total plus account breakdown. Recent events show logical events rather than exposing raw ledger entries.

Archived accounts are excluded from the default dashboard aggregation.

## Reports

Each asset is its own section/bucket. Income/expense and category breakdown are not converted across assets. Transfer/exchange principal is not displayed as normal spending/income.

## Destructive and data operations

Explicit confirmation is required for:

- deleting a ledger event;
- deleting/editing a reconciliation snapshot when it changes derived future balances;
- destructive restore.

Restore UX should validate/select first, show a summary, then confirm, and V1 rejects restore into a non-empty business DB.

## Browser review

When browser tooling or Playwright is available, inspect at minimum:

- desktop wide viewport;
- tablet-ish width;
- phone width around 390px;
- no horizontal overflow;
- keyboard/focus behavior for transaction forms;
- error and validation messages;
- empty state;
- loading/pending state for mutations where applicable;
- console errors;
- full create/edit/delete critical flow.
