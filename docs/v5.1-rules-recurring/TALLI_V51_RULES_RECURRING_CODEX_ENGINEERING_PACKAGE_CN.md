# TALLI V5.1 RULES & RECURRING — COMBINED CODEX ENGINEERING PACKAGE

Repository: `wentAInx/Talli`

Frozen baseline: `d8afd71eea85abf05121b79b6d6c499b0272f19f` / `v5.0.0`

Generated: 2026-08-14


---

# FILE: 00_README_CN.md

# Talli V5.1 — Rules & Recurring Automation

Repository: `wentAInx/Talli`

Frozen V5.0 baseline:

```text
v5.0.0
d8afd71eea85abf05121b79b6d6c499b0272f19f
```

Release verification:

```text
main release CI:     31809780778
feature support CI: 31808929577
Quality & Build: PASS
Playwright E2E: PASS
```

推荐开发分支：

```text
feat/v5.1-rules-recurring
```

## 正式目标

> **Talli V5.1 — Rules & Recurring Automation**

V5.1 包含两个语义严格分离的子系统：

```text
A. Candidate Rules
   file-import Candidate
   → clean payee/category/tag/note/event-type suggestions

B. Recurring Expectations
   房租 / 工资 / 订阅 / 保险 / 年费
   → expected occurrences
   → match suggestions
   → explicit link/post
```

最高红线：

```text
Rule projection != Ledger fact
Recurring expectation != Ledger fact
```

因此禁止 rule/recurring 自动写 Ledger、自动 link、修改 source amount/date/account identity，
也禁止未来 occurrence 伪装成 transaction。

V5.1 Rules 首版只作用于 `provider=file_import`；
Recurring 首版只支持 Expense / Income。

新版本数据：

```text
migration 0008_...
Backup schemaVersion 7
restore accepts 1..7
```

Rules/Recurring definitions 与 explicit links/skips 进入 Backup；
derived projection/suggestions/upcoming lists 不进入 Backup。


---

# FILE: 01_CODEX_MASTER_INSTRUCTION_CN.md

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


---

# FILE: 02_PRODUCT_ENGINEERING_BRIEF_CN.md

# Product & Engineering Brief

## Rules

V5.0 已能把 statement 安全地转成 Candidate，但用户仍会重复做：

```text
AMZN Mktp...
→ Amazon
→ Shopping

NETFLIX.COM
→ Netflix
→ Subscription
```

V5.1 不修改 source/candidate provenance，而是：

```text
Immutable Candidate
→ Rule evaluator
→ Derived Projection
→ UI prefill
→ Explicit Import
→ V1 Ledger
```

## Recurring

例如：

```text
Netflix
monthly
15.99 USD
```

未来 9/15 在扣款发生前只是 Expected Occurrence。

真实 bank candidate 到来后：

```text
Candidate
→ Recurring match suggestion
→ Explicit Import + Link
```

Ledger event 代表真实发生；
Recurring link 只说明“哪个 occurrence 被履行”。

## 默认自动化程度

自动：
- rule projection；
- upcoming/due/overdue 计算；
- recurring match suggestion；
- form prefill。

不自动：
- Ledger write；
- recurring link；
- historical Ledger edit；
- auto-post scheduled transaction。

目标是减少 review 成本，不牺牲 trust boundary。


---

# FILE: 03_ARCHITECTURE_INVARIANTS_CN.md

# V5.1 Architecture Invariants

## Layering

```text
V5 Source/Candidate = external financial evidence
Rules              = derived classification projection
Recurring          = expected planning metadata
Ledger             = confirmed financial facts
```

不能把四层混在一起。

## Rule projection

Base projection 来自 immutable candidate：

```text
sourcePayee
projectedPayee
memo
categoryId=null
tagIds=[]
suggestedEventType=unknown
```

Rules 只改变 projected fields。

不得修改：

```text
candidate id/stableKey/sourceFingerprint
occurredAt
target account
asset
leg amountText
leg amountAtomic
source payload
```

## Recurring

Recurring item 持有“未来应发生什么”的定义。

Occurrence 是函数结果：

```text
item + date range → generated occurrences
```

不为每个未来日期插入 DB row。

DB 只保存用户明确产生的事实：

```text
definition
explicit skip
explicit ledger link
```

## Explicitness

三种写入边界：

```text
Candidate Explicit Import → V1 writer
Recurring Explicit Post   → V1 writer + occurrence link
Explicit Link Existing    → recurring link only, no Ledger mutation
```

## No historical rewrite

Rule changes只影响之后的 projection。
不得 retroactively 修改 imported Ledger。

Recurring item 修改也不得改写已 linked Ledger event。


---

# FILE: 04_RULE_ENGINE_DOMAIN_SPEC_CN.md

# Rule Engine Domain Spec

## Target scope

V5.1 only:

```text
file_import_candidate
```

Schema keeps an explicit `target_scope` so future versions can add other sources
through a new audited migration rather than silently applying bank rules to Kraken/EVM.

## Rule ordering

Use three stages:

```text
pre
default
post
```

Within each stage:

```text
sort_order ASC
id ASC
```

Rules run sequentially.

Later scalar action wins:

```text
payee
category
note
suggested event type
```

Tags use stable union, preserving first-add order.

## Match mode

Each rule:

```text
match_mode = all | any
```

Each condition can be negated.

No arbitrary nested boolean tree in V5.1.

## Evaluation context

Immutable fields:

```text
provider=file_import
connectionId
fileProfileId
sourceFormat
targetAccountId
assetId
assetCode
assetScale
direction in|out
sourcePayee
sourceMemo
sourceAmountAtomic
sourceDate
identityStrength
candidateStatus
```

Mutable projection fields:

```text
projectedPayee
projectedNote
projectedCategoryId
projectedTagIds
projectedEventType
```

A later condition may inspect `projected_payee`,
while `source_payee` always means the original imported value.

## Rule output

```ts
{
  projectedPayee,
  projectedCategoryId,
  projectedTagIds,
  projectedNote,
  projectedEventType,
  appliedRuleIds,
  warnings
}
```

Evaluation is pure/derived; no DB financial writes.

## Candidate statuses

Projection may be calculated for display on any file candidate,
but actionable import defaults are only for:

```text
pending
needs_mapping
```

Do not make imported/matched/source_changed re-importable.


---

# FILE: 05_RULE_CONDITION_ACTION_SPEC_CN.md

# Rule Conditions & Actions

## Condition fields

V5.1:

```text
source_payee
projected_payee
memo
file_profile
target_account
source_format
direction
amount_abs
identity_strength
```

## Text operators

```text
equals
not_equals
contains
not_contains
starts_with
ends_with
is_empty
is_not_empty
```

Text normalization:

```text
Unicode NFKC
trim
collapse whitespace
case-insensitive
```

Do NOT implement user regex in V5.1.

## Enum/ID operators

```text
equals
not_equals
```

## Amount operators

```text
equals
gt
gte
lt
lte
between
```

Rule amount values are stored as plain decimal JSON strings,
but evaluation parses them through the current candidate account asset scale
to exact bigint.

No JS number for amount comparison.
No rounding.
Excess precision in a rule definition is invalid for a candidate asset.

## Actions

### set_payee
Derived payee only. Max bounded text.

### set_category
Category must belong to same book.
Compatibility:

```text
out → expense|both category
in  → income|both category
```

If a rule can match both directions, only `both` category is allowed.

### add_tag
Tag same book. Stable set union.

### set_note
Replace projected note.

### append_note
Append with newline if both old/new non-empty.

### suggest_event_type
Only:

```text
out → expense
in  → income
```

No rule-generated Transfer/Exchange in V5.1.

## Forbidden fields

Rules cannot set:

```text
amount
date
account
asset
source id
candidate status
mapping
snapshot
Ledger event id
```

## Archived references

Creating/updating an enabled rule cannot reference archived category/tag/account/profile.

Archiving a referenced category/tag should either:
- block while an enabled rule references it, OR
- atomically disable affected rules with explicit user confirmation.

Preferred minimal implementation: block archive with clear error until rules are disabled/edited.


---

# FILE: 06_RULE_EVALUATION_PIPELINE_CN.md

# Rule Evaluation Pipeline

## Runtime flow

```text
Candidate/source
→ existing V5 provenance validation
→ build immutable RuleEvaluationContext
→ load enabled rules for book/scope
→ sort pre/default/post + sort_order + id
→ evaluate sequentially
→ derived projection
→ UI
```

No source/candidate persistence occurs.

## Stage semantics

`pre`:
typically payee cleanup.

`default`:
typically category/tags/event-type.

`post`:
explicit override.

All stages may technically use all allowed actions,
but UI should explain common intent.

## Conflict rule

For scalar projected field:

```text
last matching action wins
```

For tags:

```text
union; no duplicate
```

## Conditions and projection mutation

Example:

```text
Rule A [pre]
IF source_payee contains "AMZN"
THEN set_payee "Amazon"

Rule B [default]
IF projected_payee equals "Amazon"
THEN set_category Shopping
```

B sees A's projected payee.
Neither changes the V5 source payee.

## Preview

Rule editor must support preview before save/apply:

```text
matched candidate count
first 20 sample projections
before → after
applied rule sequence
```

Preview is read-only.

## Existing candidates

Saving a rule requires no batch rewrite.
Current unresolved candidate pages immediately reflect new projection on next read.

No "apply actions to Ledger" button in V5.1.

## Determinism

Same:
- DB rules
- candidate source facts
- app version

must produce byte-equivalent projection ordering.

No current time in evaluator except if explicitly needed for display outside the rule result.


---

# FILE: 07_RECURRING_DOMAIN_SPEC_CN.md

# Recurring Domain Spec

## Meaning

Recurring item = expectation template, not transaction.

Supported:

```text
expense
income
```

One item is bound to:

```text
book
account
asset
```

This makes amount scale unambiguous.

## Required fields

```text
name
account
eventType expense|income
frequency
interval
anchorDate
amountMode
date window
```

Optional:

```text
payee
payeeMatchMode
category
tags
note
startsOn
endsOn
```

## Amount modes

Store positive atomic magnitude.

### exact

```text
amount_atomic_text
```

### approx

```text
amount_atomic_text
tolerance_bps
```

Tolerance is explicit user input.
No hidden default financial tolerance.

Bounds computed with bigint only.

### range

```text
min_amount_atomic_text
max_amount_atomic_text
```

Require:

```text
0 < min <= max
```

## Payee matching

```text
any
exact
contains
```

Uses same deterministic text normalization as Rules.

## Date window

User-configurable:

```text
before_days
after_days
```

Recommended UI initial value:

```text
2 / 2
```

This is matching convenience only, not a Ledger date rewrite rule.

## Lifecycle

Use `is_active`.

Do not hard-delete items with linked/skipped history from normal UI;
archive instead.

## Asset lock

Because recurring amounts are stored atomic under an asset scale,
an account with any recurring item must not silently change asset.

Extend account fact-lock logic accordingly.


---

# FILE: 08_RECURRENCE_CALENDAR_SPEC_CN.md

# Recurrence Calendar Semantics

All recurrence dates are **local date-only facts** under the App timezone.

No fake occurrence timestamp is needed until an actual Ledger event is explicitly posted.

## Frequencies

```text
daily
weekly
monthly
yearly
```

`interval_count >= 1`.

## Anchor

`anchor_date = YYYY-MM-DD`

### Daily

Every N days from anchor.

### Weekly

Every N weeks on anchor weekday.

### Monthly

Two modes:

```text
fixed
last
```

`fixed` uses the anchor day-of-month.

If fixed day does not exist in a month:

```text
skip that cycle
```

Example 31st:
February has no occurrence.

`last` explicitly means last calendar day of each applicable month.

### Yearly

Every N years on anchor month/day.

Feb 29 on non-leap year:

```text
skip that cycle
```

No implicit Feb 28 conversion.

## Active range

Optional:

```text
starts_on
ends_on
```

Occurrence must satisfy both recurring pattern and active range.

## Generation

Provide bounded function:

```ts
generateOccurrences(item, fromDate, toDate)
```

Hard cap generated occurrence count per call, e.g. 10,000.

No DB row for future occurrences.

## Status derived at read time

For generated occurrence:

```text
linked
skipped
upcoming
due
overdue
```

`linked/skipped` from DB facts.
Other states derived from local current date and configured after-window.

Current-time status must be display logic, not stored accounting truth.


---

# FILE: 09_RECURRING_MATCH_LINK_SPEC_CN.md

# Recurring Matching & Linking

## Match candidates

V5.1 may generate suggestions from:

```text
A. Existing V1 Ledger expense/income events
B. Unresolved V5 file_import candidates
```

For file candidate matching, use:
- immutable exact amount/date/account;
- rule-projected payee when available.

## Ledger suggestion hard filters

Recurring item:

```text
account exact
eventType exact
same book
```

Ledger event must have the corresponding exact main account entry sign:

```text
expense → negative
income  → positive
```

Amount magnitude must satisfy recurring amount expectation.

Event date must be within configured occurrence date window.

If payee match mode != any, payee must match.

Already-linked Ledger event cannot satisfy a second occurrence.

## Candidate suggestion hard filters

File candidate:
- provider=file_import；
- target account exact；
- direction matches event type；
- exact source/candidate provenance passes；
- amount matches expectation；
- date inside window；
- payee criteria matches source/rule projection；
- status actionable.

## Scoring

Suggestions are deterministic, no ML.

Suggested components:

```text
date exact             highest
date ±1
date ±2...
payee exact
amount exact center
amount inside approx/range
```

Use integer score only; money comparison remains bigint.

## No automatic link

No matter how high score is:

```text
no DB link until user confirms
```

## Explicit Link Existing

One transaction:

```text
validate recurring item/occurrence
validate event same book/account/type
insert recurring_occurrence_link
```

No Ledger update.

A user-confirmed link may be allowed even if amount/date is outside suggestion tolerance,
because user is asserting occurrence identity.
UI must warn.
Server still requires same account and expense/income direction.

## Unlink

Explicit unlink removes the recurring link only.
Ledger remains unchanged.

## Delete Ledger event

Ledger event referenced by recurring link should be protected by FK RESTRICT / service error.

User must unlink first, preserving visible provenance.

## Skip Occurrence

Explicit:

```text
recurring_occurrence_skips
```

Cannot skip a linked occurrence.
Cannot link a skipped occurrence until skip is explicitly removed.

## Explicit Post Occurrence

For an unlinked/unskipped occurrence:

```text
user enters/confirms actual amount
→ V1 expense/income writer
→ recurring link
```

Both happen in one SQLite transaction.

Exact mode may prefill amount.
Approx/range still requires explicit actual amount confirmation.

No automatic posting by date.


---

# FILE: 10_DATABASE_TARGET_SCHEMA_V51_DRAFT.sql

-- Talli V5.1 target additive schema draft.
-- Documentation only. Codex must implement a real forward migration from v5.0.0.

CREATE TABLE automation_rules (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_scope TEXT NOT NULL
    CHECK(target_scope IN ('file_import_candidate')),
  stage TEXT NOT NULL
    CHECK(stage IN ('pre','default','post')),
  match_mode TEXT NOT NULL
    CHECK(match_mode IN ('all','any')),
  is_enabled INTEGER NOT NULL DEFAULT 1
    CHECK(is_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX automation_rules_book_scope_order_idx
  ON automation_rules(book_id, target_scope, stage, sort_order, id);

CREATE TABLE automation_rule_conditions (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL
    REFERENCES automation_rules(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position >= 0),
  field TEXT NOT NULL CHECK(field IN (
    'source_payee',
    'projected_payee',
    'memo',
    'file_profile',
    'target_account',
    'source_format',
    'direction',
    'amount_abs',
    'identity_strength'
  )),
  operator TEXT NOT NULL CHECK(operator IN (
    'equals','not_equals',
    'contains','not_contains',
    'starts_with','ends_with',
    'is_empty','is_not_empty',
    'gt','gte','lt','lte','between'
  )),
  value_json TEXT NOT NULL,
  is_negated INTEGER NOT NULL DEFAULT 0
    CHECK(is_negated IN (0,1)),
  UNIQUE(rule_id, position)
);

CREATE TABLE automation_rule_actions (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL
    REFERENCES automation_rules(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position >= 0),
  action_type TEXT NOT NULL CHECK(action_type IN (
    'set_payee',
    'set_category',
    'add_tag',
    'set_note',
    'append_note',
    'suggest_event_type'
  )),
  value_json TEXT NOT NULL,
  UNIQUE(rule_id, position)
);

CREATE TABLE recurring_items (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('expense','income')),
  payee_text TEXT,
  payee_match_mode TEXT NOT NULL DEFAULT 'any'
    CHECK(payee_match_mode IN ('any','exact','contains')),
  category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  note TEXT,
  amount_mode TEXT NOT NULL
    CHECK(amount_mode IN ('exact','approx','range')),
  amount_atomic_text TEXT,
  tolerance_bps INTEGER,
  min_amount_atomic_text TEXT,
  max_amount_atomic_text TEXT,
  frequency TEXT NOT NULL
    CHECK(frequency IN ('daily','weekly','monthly','yearly')),
  interval_count INTEGER NOT NULL CHECK(interval_count >= 1),
  anchor_date TEXT NOT NULL,
  monthly_day_mode TEXT
    CHECK(monthly_day_mode IS NULL OR monthly_day_mode IN ('fixed','last')),
  date_window_before_days INTEGER NOT NULL DEFAULT 2
    CHECK(date_window_before_days BETWEEN 0 AND 31),
  date_window_after_days INTEGER NOT NULL DEFAULT 2
    CHECK(date_window_after_days BETWEEN 0 AND 31),
  starts_on TEXT,
  ends_on TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX recurring_items_book_active_idx
  ON recurring_items(book_id, is_active);
CREATE INDEX recurring_items_account_idx
  ON recurring_items(account_id);

CREATE TABLE recurring_item_tags (
  recurring_item_id TEXT NOT NULL
    REFERENCES recurring_items(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
  PRIMARY KEY(recurring_item_id, tag_id)
);

CREATE TABLE recurring_occurrence_links (
  recurring_item_id TEXT NOT NULL
    REFERENCES recurring_items(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL,
  ledger_event_id TEXT NOT NULL
    REFERENCES ledger_events(id) ON DELETE RESTRICT,
  linked_at TEXT NOT NULL,
  PRIMARY KEY(recurring_item_id, occurrence_date),
  UNIQUE(ledger_event_id)
);

CREATE TABLE recurring_occurrence_skips (
  recurring_item_id TEXT NOT NULL
    REFERENCES recurring_items(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL,
  skipped_at TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY(recurring_item_id, occurrence_date)
);


---

# FILE: 11_V50_TO_V51_MIGRATION_PLAN_CN.md

# V5.0 → V5.1 Migration Plan

## Frozen baseline

```text
v5.0.0
d8afd71eea85abf05121b79b6d6c499b0272f19f
```

Published migrations:

```text
0000 ... 0007
```

all frozen.

V5.1 adds forward migration only:

```text
0008_v51_rules_recurring
```

Actual name may follow drizzle generation conventions.

## Additive tables

- automation_rules
- automation_rule_conditions
- automation_rule_actions
- recurring_items
- recurring_item_tags
- recurring_occurrence_links
- recurring_occurrence_skips

No V5 source/candidate table rebuild should be necessary.

Avoid changing:
- external candidate statuses；
- file import provenance tables；
- Ledger shape。

## Account asset lock

Application service logic must treat recurring item reference as asset-locking fact.

No schema mutation of account asset is needed.

## Existing V5 data

Migration produces:

```text
rules = []
recurring items = []
links/skips = []
```

No inference/backfill from old Ledger.

## Acceptance

V5.0-shaped DB after migration:
- all existing IDs/facts unchanged；
- file import roundtrip still passes；
- Kraken/EVM regression passes；
- `foreign_key_check=[]`；
- repeat startup no migration loop。


---

# FILE: 12_TYPES_SERVICE_CONTRACTS.ts

export type AutomationRuleStage = "pre" | "default" | "post";
export type AutomationRuleMatchMode = "all" | "any";
export type AutomationRuleScope = "file_import_candidate";

export type AutomationConditionField =
  | "source_payee"
  | "projected_payee"
  | "memo"
  | "file_profile"
  | "target_account"
  | "source_format"
  | "direction"
  | "amount_abs"
  | "identity_strength";

export type AutomationConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between";

export type AutomationActionType =
  | "set_payee"
  | "set_category"
  | "add_tag"
  | "set_note"
  | "append_note"
  | "suggest_event_type";

export interface AutomationRuleCondition {
  id: string;
  position: number;
  field: AutomationConditionField;
  operator: AutomationConditionOperator;
  value: unknown;
  isNegated: boolean;
}

export interface AutomationRuleAction {
  id: string;
  position: number;
  actionType: AutomationActionType;
  value: unknown;
}

export interface AutomationRule {
  id: string;
  bookId: string;
  name: string;
  targetScope: AutomationRuleScope;
  stage: AutomationRuleStage;
  matchMode: AutomationRuleMatchMode;
  isEnabled: boolean;
  sortOrder: number;
  conditions: AutomationRuleCondition[];
  actions: AutomationRuleAction[];
}

export interface FileCandidateAutomationContext {
  bookId: string;
  connectionId: string;
  fileProfileId: string;
  sourceFormat: "csv" | "ofx" | "qfx" | "camt053";
  targetAccountId: string;
  assetId: string;
  assetCode: string;
  assetScale: number;
  direction: "in" | "out";
  sourcePayee: string | null;
  sourceMemo: string | null;
  sourceAmountAtomic: bigint;
  sourceDate: string;
  identityStrength: "strong" | "weak";
  candidateStatus: string;
}

export interface AutomationProjection {
  projectedPayee: string | null;
  projectedCategoryId: string | null;
  projectedTagIds: string[];
  projectedNote: string | null;
  projectedEventType: "expense" | "income" | "unknown";
  appliedRuleIds: string[];
  warnings: string[];
}

export type RecurringEventType = "expense" | "income";
export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type RecurringAmountMode = "exact" | "approx" | "range";
export type RecurringPayeeMatchMode = "any" | "exact" | "contains";
export type MonthlyDayMode = "fixed" | "last";

export interface RecurringItem {
  id: string;
  bookId: string;
  accountId: string;
  assetId: string;
  name: string;
  eventType: RecurringEventType;
  payeeText: string | null;
  payeeMatchMode: RecurringPayeeMatchMode;
  categoryId: string | null;
  tagIds: string[];
  note: string | null;
  amountMode: RecurringAmountMode;
  amountAtomic: bigint | null;
  toleranceBps: number | null;
  minAmountAtomic: bigint | null;
  maxAmountAtomic: bigint | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  anchorDate: string;
  monthlyDayMode: MonthlyDayMode | null;
  dateWindowBeforeDays: number;
  dateWindowAfterDays: number;
  startsOn: string | null;
  endsOn: string | null;
  isActive: boolean;
}

export interface GeneratedOccurrence {
  recurringItemId: string;
  occurrenceDate: string;
  status: "linked" | "skipped" | "upcoming" | "due" | "overdue";
  linkedLedgerEventId: string | null;
}

export interface RecurringMatchSuggestion {
  recurringItemId: string;
  occurrenceDate: string;
  ledgerEventId?: string;
  candidateId?: string;
  score: number;
  reasons: string[];
}

/*
Services:

AutomationRuleService
- CRUD + ordering
- validates category/tag/account references
- preview(ruleDraft)

AutomationProjectionService
- pure deterministic projection for file candidate
- no writes

RecurringItemService
- CRUD/archive
- generate occurrences
- skip/unskip
- explicit link/unlink
- explicit post occurrence via V1 writer

RecurringMatchService
- suggestions only
- no automatic links

FileImportReadService / candidate page
- attaches AutomationProjection
- attaches RecurringMatchSuggestion

ExternalImportService
- accepts explicit payee/tag/category/note user choices
- optionally explicit recurring occurrence link
- all in same transaction
*/


---

# FILE: 13_FILE_IMPORT_INTEGRATION_CN.md

# V5 File Import Integration

## Existing V5 provenance remains authoritative

Before any automation projection:

```text
assertStoredFileImportCandidateProvenance(...)
```

must still pass.

Rules cannot weaken or replace it.

## Candidate read model

Extend file candidate read DTO with:

```text
automationProjection
recurringSuggestions
```

Both are derived.

Do not persist projection into:

```text
file_import_candidate_details
external_transaction_legs
external_source_objects
```

## Import form defaults

Rules may prefill:

```text
payee
category
tags
note
expense/income choice
```

User sees them before pressing Import.

## Import request

Extend File Import branch of `CandidateImportInput` to accept explicit:

```text
payee?: string|null
tagIds?: string[]
categoryId?: string|null   # already exists, preserve
note?: string|null         # already exists
```

These are user-confirmed Ledger metadata,
not source facts.

The server must:
- validate payee length/text；
- validate category same book + type；
- validate tags same book + active；
- continue validating source amount/account/date provenance；
- never allow rule metadata to override amount/account/date.

## Optional recurring link during import

UI may let user choose:

```text
Link to recurring occurrence:
Netflix · 2026-09-15
```

Request includes explicit:

```text
recurringItemId
occurrenceDate
confirmedRecurringLink=true
```

Server validates occurrence belongs to item and is open,
and recurring item account/event direction matches imported Ledger event.

Then within the same transaction:

```text
createLedgerEventIn
insert external_import_link
insert recurring_occurrence_link
mark candidate imported
```

Any late failure rolls all back.

## Match Existing

V5 `Match Existing` remains separate from recurring linking.

A file candidate can:
- Match Existing to Ledger source provenance；
then user may separately link that Ledger event to recurring occurrence.

Do not conflate:
`external_candidate_match_link`
with
`recurring_occurrence_link`.


---

# FILE: 14_LEDGER_BOUNDARY_AND_ATOMICITY_CN.md

# Ledger Boundary & Atomicity

## Rules

Rule CRUD/evaluation never invokes V1 writer.

No rule action can produce:
- Ledger event；
- snapshot；
- external import link；
- recurring link。

## Recurring explicit link

Link Existing:

```text
recurring link write only
Ledger unchanged
```

## Recurring explicit post

One transaction:

```text
validate recurring item
validate generated occurrence
validate actual amount
createLedgerEventIn(...)
insert recurring_occurrence_link
```

If link insert fails:
Ledger event rolls back.

## Candidate import + recurring link

One transaction:

```text
V5 provenance revalidation
explicit metadata validation
recurring occurrence validation
createLedgerEventIn
external_import_link
recurring_occurrence_link
candidate imported
```

Any failure rolls all layers back.

## Ledger deletion

If a Ledger event has recurring occurrence link:
delete should fail with clear service error until user unlinks.

This is provenance safety, not an attempt to prevent normal Ledger edits.

Ledger edits may remain allowed; recurring link is a user assertion of occurrence identity,
not an exact-source binding like V5 Match Existing.

## Recurring actual amount

Explicit post/import actual amount is whatever user/source confirms.

Recurring expectation does not overwrite actual amount.

Example:

```text
Recurring approx:
Netflix ≈ 15.99

Actual:
16.49

Ledger:
16.49
```

Recurring remains expectation.


---

# FILE: 15_BACKUP_SCHEMA_V7_CN.md

# Backup schemaVersion 7

V5.1 export:

```text
schemaVersion = 7
```

Accept:

```text
1 / 2 / 3 / 4 / 5 / 6 / 7
```

## Include

Existing V1–V6 user facts plus:

```text
automationRules
automationRuleConditions
automationRuleActions
recurringItems
recurringItemTags
recurringOccurrenceLinks
recurringOccurrenceSkips
```

## Exclude

Derived:

```text
automation projections
rule preview results
recurring match suggestions
generated future occurrences
due/overdue cached status
```

Also continue excluding all existing operational state/secrets.

## V6 → V7 upgrade

All new arrays empty.

Do not infer rules or recurring items from historical Ledger during restore.

## Rule validation

- rule book exists；
- targetScope=file_import_candidate；
- stage/match mode valid；
- conditions/actions positions unique；
- operator compatible with field；
- value_json strict；
- category/tag/account/profile references same book；
- `suggest_event_type` direction-safe；
- no forbidden action type；
- no user regex action/condition。

## Recurring item validation

- account/asset/book relation exact；
- account.assetId == recurring.assetId；
- category/tag same book；
- eventType expense|income；
- positive atomic magnitude；
- exact/approx/range conditional fields coherent；
- tolerance bps bounded；
- recurrence fields valid；
- ISO date-only strings canonical；
- starts <= ends if both；
- monthly mode only for monthly frequency。

## Occurrence facts

Link:
- item exists；
- occurrenceDate is generated by item recurrence and inside active range；
- Ledger event same book；
- event has matching recurring account and expense/income direction；
- ledger_event_id unique；
- no skip for same occurrence。

Skip:
- generated valid occurrence；
- no link for same occurrence。

## Restore

Full validation before write,
then one transaction + FK check.

Late V7 insert failure:
rollback V1–V7 entirely.


---

# FILE: 16_UI_UX_SPEC_CN.md

# V5.1 UI / UX

## Navigation

Add:

```text
Automation
```

Route:

```text
/automation
```

Tabs:

```text
Rules
Recurring
```

## Rules list

Show:

```text
Enabled
Stage
Name
Scope
Conditions summary
Actions summary
Matched unresolved candidates
```

Actions:
- Create
- Edit
- Disable/Enable
- Move order
- Preview
- Duplicate rule

## Rule editor

Left:

```text
Stage pre/default/post
ALL / ANY
conditions
actions
```

Right:

```text
Preview
Matched: N

Candidate
Before
After
Applied rule order
```

No button called “Apply to Ledger”.

## Candidate page

Add card:

```text
Automation suggestions

Payee: AMAZON... → Amazon
Category: Shopping
Tags: Online
Suggested type: Expense

Applied rules:
1. Clean Amazon
2. Categorize Amazon
```

Fields in Import form are prefilled but editable.

## Recurring list

Each item:

```text
Netflix
Expense · USD Card
Approx 15.99 USD
Monthly · 15th
Next: 2026-09-15
Status: upcoming
```

Filters:

```text
active
overdue
upcoming
income
expense
```

## Recurring detail

Show bounded occurrence timeline:

```text
Aug 15  linked → Ledger tx
Sep 15  upcoming
Oct 15  upcoming
```

Actions:

```text
Link existing
Unlink
Skip
Undo skip
Post occurrence
Archive item
```

## Create recurring item

Can start from:
- Automation page；
- existing Ledger transaction；
- file candidate。

Starting from transaction only pre-fills data.
User must choose/confirm cadence and amount mode.

## Candidate recurring suggestion

Example:

```text
Likely recurring occurrence

Netflix · Sep 15
expected ~15.99 USD
candidate 15.99 USD · Sep 15

[Link when importing]
```

No automatic link.

## Mobile

Rules editor uses stacked cards, not wide table dependency.
Recurring timeline fits WebKit without horizontal page overflow.
Critical desktop + mobile paths required.


---

# FILE: 17_SECURITY_CORRECTNESS_CN.md

# Security & Correctness

## No network

Rule and recurring modules perform no HTTP.

No external AI/ML service.

## Text matching

No user regex in V5.1 to avoid regex complexity/ReDoS risk.

Use bounded strings and deterministic normalization.

## Amounts

All monetary expectation values persisted as bigint decimal TEXT.

No floating-point amount comparison.

Tolerance basis points may be integer number,
but bounds are computed with bigint.

Define rounding conservatively and test it:
- lower bound floor;
- upper bound ceil;
or another documented exact integer policy.

## Input bounds

Rule:
- max conditions per rule e.g. 50；
- max actions per rule e.g. 20；
- max rule name/value text；
- max enabled rules per book e.g. 1000。

Recurring:
- interval bounded；
- date window <=31；
- occurrence generation hard cap 10,000/call；
- tolerance bps bounded 0..10000。

## No source mutation

Static/security tests should detect rule module writing:
- external_source_objects；
- external_transaction_legs；
- file_import_candidate_details；
- ledger tables。

Only RuleService CRUD may write automation tables.

## Projection trust

Client-provided projected values are not security authority.

Import server independently validates:
- V5 provenance；
- category/tag/book；
- explicit account/event type；
- actual amount from source candidate.

## Recurring link

Client cannot invent arbitrary occurrence date.
Server recomputes recurrence and verifies date is valid.

## Backup

No derived projection cache means no stale rule computation can become restored financial truth.


---

# FILE: 18_TEST_ACCEPTANCE_CN.md

# V5.1 Acceptance Matrix

## A. Frozen regression

All must pass:

```text
V1 Ledger
V2 valuation
V3 Kraken
V4 Ethereum
V4.1 Base/Arbitrum
V5 file import/match/reconcile
```

## B. Migration

- 0000–0007 untouched；
- V5 DB → V5.1 exact old facts；
- 0008 additive tables；
- repeated startup stable；
- FK check empty。

## C. Rule ordering

R-001 stage order pre→default→post.
R-002 within stage sort_order then id.
R-003 later scalar action wins.
R-004 tags stable union.
R-005 ALL and ANY.
R-006 negated condition.
R-007 disabled rule ignored.
R-008 evaluator deterministic.

## D. Rule fields/operators

- source payee vs projected payee distinction；
- text equals/contains/start/end/empty；
- case-insensitive NFKC normalization；
- amount exact bigint eq/gt/gte/lt/lte/between；
- excess precision rule amount reject；
- profile/account/format/direction/identity filters；
- no regex accepted。

## E. Rule actions

- payee projection；
- category projection type-safe；
- tags same-book；
- note set/append；
- expense/out and income/in suggestion；
- Transfer/Exchange suggestion reject；
- amount/date/account action impossible。

## F. Source isolation

Evaluate and preview 100 candidates:

```text
external_source_objects unchanged
external_transaction_candidates unchanged
file_import_candidate_details unchanged
external_transaction_legs unchanged
ledger_events unchanged
ledger_entries unchanged
```

## G. Rule preview & candidate integration

- preview read-only；
- new rule changes projection without candidate rewrite；
- candidate page shows applied rules；
- imported/matched/source_changed remain non-importable；
- source correction recomputes projection from new facts。

## H. Import metadata

- rule-prefilled payee/category/tags/note can be explicitly imported；
- server validates all IDs/book/category type；
- source amount/date/account remain authoritative；
- V5 corruption defense still catches candidate/source mismatch；
- rule cannot override source amount。

## I. Recurrence generation

- daily interval；
- weekly interval/weekday；
- monthly fixed；
- monthly 31 skips absent month；
- monthly last-day；
- yearly；
- Feb29 skips non-leap；
- starts/ends；
- inactive item；
- generation cap；
- deterministic date-only behavior。

## J. Amount expectations

Exact:
- exact magnitude only.

Approx:
- explicit tolerance bps；
- bigint bounds；
- boundary inclusive；
- no float.

Range:
- min/max inclusive；
- min>max reject；
- zero/negative definition reject.

## K. Recurring suggestions

- same account required；
- event type/direction required；
- date window；
- payee modes；
- amount modes；
- already linked event excluded；
- skipped occurrence excluded；
- file candidate uses exact V5 provenance；
- rule-projected payee may improve suggestion；
- no auto-link.

## L. Explicit link/unlink/skip

- link existing creates no Ledger write；
- link invalid account/type reject；
- one Ledger event cannot satisfy two occurrences；
- linked occurrence cannot skip；
- skipped occurrence cannot link；
- explicit unskip works；
- linked event delete blocked until unlink；
- normal Ledger edit does not rewrite recurring definition.

## M. Explicit Post Occurrence

- expense uses V1 writer；
- income uses V1 writer；
- actual amount explicit；
- event + occurrence link same transaction；
- late link failure rolls event back；
- approximate expectation never forces expected amount into Ledger。

## N. File Import + Recurring atomic path

Candidate import with explicit recurring link:
- V5 provenance valid；
- create Ledger + external import link + recurring link + candidate status atomically；
- forced recurring-link insert failure rolls Ledger/external link/status back。

## O. Backup schemaVersion7

- export 7；
- restore 1..7；
- rules roundtrip；
- recurring definitions/tags/links/skips roundtrip；
- derived projection/suggestions absent；
- invalid rule operator/value reject；
- cross-book refs reject；
- invalid atomic expectation reject；
- invalid occurrence date reject；
- link+skip conflict reject；
- late V7 insert full rollback。

## P. E2E

Desktop Chromium:
1. create rule cleaning payee；
2. category/tag rule；
3. preview candidate before/after；
4. import candidate with suggested metadata；
5. create monthly recurring from Ledger；
6. view upcoming；
7. import another candidate and explicitly link occurrence；
8. skip next occurrence；
9. explicit post another occurrence；
10. Backup schemaVersion7。

Mobile WebKit:
- Automation nav；
- Rule create/preview；
- recurring list/detail；
- candidate suggestion/import；
- no horizontal overflow。

Existing V5 import and V3/V4 sync E2E all pass.

## Final gate

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


---

# FILE: 19_IMPLEMENTATION_PLAN_CN.md

# V5.1 Implementation Plan

Phase 0 — verify v5.0.0 exact baseline.

Phase 1 — rule domain types, normalization, pure evaluator.

Phase 2 — 0008 additive migration + rule/recurring tables.

Phase 3 — RuleService CRUD/order/validation.

Phase 4 — candidate automation projection read integration.

Phase 5 — rule UI + preview.

Phase 6 — recurring recurrence engine/date-only generation.

Phase 7 — RecurringItemService CRUD/archive/tags/asset lock.

Phase 8 — Ledger + candidate recurring suggestion engine.

Phase 9 — explicit link/unlink/skip.

Phase 10 — explicit Post Occurrence through V1 writer.

Phase 11 — file candidate explicit import + optional recurring link atomic integration.

Phase 12 — Backup schemaVersion7 / restore 1..7.

Phase 13 — Automation UI desktop/mobile.

Phase 14 — security + full regression + E2E.

Phase 15 — final audit delivery.

Final report:

```text
branch
exact SHA
Actions run
migration
changed files
unit count
integration count
E2E count
known limitations
```

No merge/tag before independent audit.


---

# FILE: 20_NON_GOALS_AND_FUTURE_CN.md

# V5.1 Non-goals & Future

Not V5.1:

- rules for Kraken/EVM；
- rule changing amount/date/account；
- user regex；
- arbitrary formulas；
- auto-post Ledger；
- auto-link recurring；
- recurring Transfer/Exchange；
- multiple dates per month in one item；
- weekday ordinal such as 2nd Wednesday；
- bank OAuth/direct sync；
- notifications/email/push；
- cron/background scheduler；
- ML recurring discovery；
- budget/envelope planning；
- historical price/net-worth；
- tax/P&L。

Potential later:

## V5.2 Smart Automation Hardening

- propose rules from repeated user behavior；
- recurring suggestions from historical patterns；
- optional audited auto-link policy；
- more recurrence shapes；
- direct bank sync adapters。

## V6.0

Historical Net Worth & Analytics remains next major agreed theme.


---

# FILE: 21_COMPETITOR_REFERENCE_20260814_CN.md

# Competitor Reference Snapshot — 2026-08-14

This file records product ideas only; Talli does not copy their trust model.

## Actual Budget — Rules

Official docs:
https://actualbudget.org/docs/budgeting/rules/

Useful patterns:
- imported transactions run through ordered rules；
- later rules can override earlier scalar changes；
- pre/default/post stages；
- distinction between imported payee and changed payee；
- rule preview against matching transactions；
- automatic payee/category learning exists in Actual。

Talli adopts:
- source payee vs projected payee；
- deterministic sequential ordering；
- pre/default/post；
- preview。

Talli intentionally does NOT adopt in V5.1:
- rules changing amount/date/account；
- retroactive Ledger mutation；
- automatic rule creation。

## Firefly III — Trigger / Action

Official:
https://docs.firefly-iii.org/how-to/firefly-iii/features/rules/

Useful:
- triggers + actions；
- strict ALL vs non-strict ANY；
- inverted triggers；
- explicit rule order/groups；
- importer may apply rules.

Talli adopts:
- ALL/ANY；
- negation；
- ordered deterministic actions。

Talli limits actions to safe classification projection.

## Actual Budget — Schedules

Official:
https://actualbudget.org/docs/schedules/

Useful:
- recurring/one-time expectations；
- flexible intervals；
- explicit last day of month；
- history matching；
- ±2-day schedule matching window；
- skip occurrence；
- optional automatic posting.

Talli adopts:
- date-only recurrence；
- explicit last-day mode；
- match window；
- skip；
- create from transaction.

Talli deliberately does NOT auto-post in V5.1.

## Lunch Money — Recurring Items

Official:
https://support.lunchmoney.app/finances/recurring-items/
https://support.lunchmoney.app/finances/recurring-items/recurring-transactions
https://support.lunchmoney.app/finances/recurring-items/faq

Useful separation:
- recurring item = repeating expectation；
- recurring transaction = actual transaction for a period；
- recurring rules identify/link matches.

Talli adopts the conceptual separation:
definition / occurrence / actual Ledger link.

Talli keeps linking explicit in V5.1.


---

# FILE: 22_RISK_REGISTER_CN.md

# V5.1 Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Rule mutates source provenance | Critical | projection-only architecture |
| Rule silently writes Ledger | Critical | no writer dependency in evaluator |
| Rule changes amount/date/account | Critical | action allowlist |
| Rule order nondeterministic | High | stage+sort_order+id |
| Rule category wrong direction | High | direction/type validation |
| Amount rule uses float | Critical | bigint parsing/comparison |
| Regex DoS | High | no user regex |
| Recurring future row mistaken as transaction | Critical | generated occurrence only |
| Auto-post creates false facts | Critical | no auto-post |
| Auto-link wrong occurrence | High | suggestions + explicit link |
| Monthly 31 ambiguity | High | fixed skip vs explicit last |
| Feb29 ambiguity | Medium | explicit skip non-leap |
| Recurring account asset changes scale | High | asset lock |
| Link duplicate | High | unique occurrence + event |
| Link/skip conflict | High | service + backup validation |
| Posting succeeds but link fails | High | one transaction rollback |
| Rules break V5 exact provenance | Critical | immutable candidate + V5 validator |
| Backup stores stale projection | Medium | projections excluded |
| V1–V5 regression | Critical | full regression gate |


---

# FILE: 23_FINAL_AUDIT_CHECKLIST_CN.md

# V5.1 Independent Final Audit Checklist

Audit exact feature SHA.

## Baseline
- descendant of v5.0.0 `d8afd71...`；
- 0000–0007 untouched；
- only 0008 forward migration。

## Rules
- projection only；
- source/candidate/leg untouched；
- deterministic order；
- ALL/ANY/negation；
- source vs projected payee；
- safe action allowlist；
- bigint amount conditions；
- no regex/no HTTP；
- preview read-only。

## Import
- explicit；
- V5 provenance revalidated；
- rule metadata cannot change amount/account/date；
- category/tag/payee validated；
- V1 writer unchanged.

## Recurring
- expectation != Ledger；
- no auto-post/link；
- date-only recurrence exact；
- monthly31/last/leap rules；
- bigint expectation；
- explicit link/skip/unlink；
- Post via V1 writer；
- candidate import + recurring link atomic。

## Backup
- schemaVersion7；
- restore 1..7；
- only user facts；
- no projection/suggestion cache；
- relation/occurrence validation；
- rollback.

## Regression
- V1/V2/V3/V4/V4.1/V5；
- desktop/mobile；
- exact SHA Actions green。

Verdict:

```text
Critical
High
Medium blocking
Low

Rule Architecture
Recurring Architecture
Ledger Isolation
Exact Money
Backup
Security
Regression
CI

GO / NO-GO
```


---

# FILE: 24_RULE_FIXTURES.json

{
  "version": 1,
  "rules": [
    {
      "name": "Clean Amazon",
      "stage": "pre",
      "matchMode": "all",
      "conditions": [
        {
          "field": "source_payee",
          "operator": "contains",
          "value": "amzn"
        }
      ],
      "actions": [
        {
          "type": "set_payee",
          "value": "Amazon"
        }
      ]
    },
    {
      "name": "Categorize Amazon",
      "stage": "default",
      "matchMode": "all",
      "conditions": [
        {
          "field": "projected_payee",
          "operator": "equals",
          "value": "Amazon"
        }
      ],
      "actions": [
        {
          "type": "set_category",
          "value": "fixture-category-shopping"
        },
        {
          "type": "add_tag",
          "value": "fixture-tag-online"
        },
        {
          "type": "suggest_event_type",
          "value": "expense"
        }
      ]
    },
    {
      "name": "Post override",
      "stage": "post",
      "matchMode": "all",
      "conditions": [
        {
          "field": "source_payee",
          "operator": "contains",
          "value": "AMZN"
        }
      ],
      "actions": [
        {
          "type": "set_note",
          "value": "Reviewed by post rule"
        }
      ]
    }
  ],
  "candidate": {
    "direction": "out",
    "sourcePayee": "AMZN Mktp US*ABC",
    "sourceMemo": "Order 123",
    "amountAtomic": "-3599",
    "assetScale": 2
  },
  "expected": {
    "projectedPayee": "Amazon",
    "projectedCategoryId": "fixture-category-shopping",
    "projectedTagIds": [
      "fixture-tag-online"
    ],
    "projectedEventType": "expense",
    "projectedNote": "Reviewed by post rule",
    "appliedRuleNames": [
      "Clean Amazon",
      "Categorize Amazon",
      "Post override"
    ]
  }
}


---

# FILE: 25_RECURRING_FIXTURES.json

{
  "version": 1,
  "monthlyFixed31": {
    "anchorDate": "2026-01-31",
    "frequency": "monthly",
    "interval": 1,
    "monthlyDayMode": "fixed",
    "range": [
      "2026-01-01",
      "2026-05-31"
    ],
    "expectedDates": [
      "2026-01-31",
      "2026-03-31",
      "2026-05-31"
    ]
  },
  "monthlyLast": {
    "anchorDate": "2026-01-31",
    "frequency": "monthly",
    "interval": 1,
    "monthlyDayMode": "last",
    "range": [
      "2026-01-01",
      "2026-05-31"
    ],
    "expectedDates": [
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31"
    ]
  },
  "leapYearly": {
    "anchorDate": "2024-02-29",
    "frequency": "yearly",
    "interval": 1,
    "range": [
      "2024-01-01",
      "2029-12-31"
    ],
    "expectedDates": [
      "2024-02-29",
      "2028-02-29"
    ]
  },
  "exactExpense": {
    "eventType": "expense",
    "amountMode": "exact",
    "amountAtomic": "1599",
    "accountId": "fixture-usd-card",
    "occurrenceDate": "2026-09-15",
    "candidateDate": "2026-09-16",
    "candidateSignedAtomic": "-1599",
    "withinWindow": true
  }
}


---

# FILE: CODEX_HANDOFF_PROMPT.txt

你现在负责 Talli V5.1。

Repository:
wentAInx/Talli

Frozen baseline:
v5.0.0
d8afd71eea85abf05121b79b6d6c499b0272f19f

目标：
Talli V5.1 — Rules & Recurring Automation

推荐分支：
feat/v5.1-rules-recurring

开始前完整阅读任务包 00 → 25。

最高红线：

Rule projection != Ledger fact
Recurring expectation != Ledger fact

V5.1 Rules 首版只处理 file_import candidates。
规则只生成 derived projection，不能修改 V5 source/candidate/leg，
不能修改 amount/date/account/source identity，
不能自动调用 Ledger writer。

Recurring 首版只支持 Expense / Income。
未来 occurrence 不持久化成 transaction。
No auto-post。
No auto-link。
Explicit Post / Explicit Import / Explicit Link 才能写相关事实。

关键实现：

1. 0000–0007 frozen，只新增 0008 forward migration。
2. Rule evaluator pure/deterministic，无 HTTP。
3. Rule stage pre/default/post，match mode all/any，condition negation。
4. no user regex。
5. allowed actions:
   set_payee
   set_category
   add_tag
   set_note
   append_note
   suggest_event_type expense|income only
6. Rules 不允许 amount/date/account action。
7. Candidate page显示 automation projection，但不回写 candidate。
8. File Import explicit import允许用户确认 payee/category/tags/note，
   但 source amount/account/date 继续由 V5 provenance authority 决定。
9. Recurring date-only recurrence：
   daily/weekly/monthly/yearly；
   monthly fixed missing day = skip；
   monthly last explicit；
   Feb29 non-leap = skip。
10. amount exact/approx/range 全 bigint atomic。
11. recurring matching suggestions only，不自动 link。
12. Explicit Post occurrence必须调用现有 V1 writer，
    event + recurring link 同一 transaction。
13. Candidate Import + explicit recurring link也必须原子。
14. Backup schemaVersion7，accept 1..7；
    include definitions/links/skips；
    exclude rule projections/match suggestions/generated future occurrence cache。
15. V1/V2/V3/V4/V4.1/V5 regressions全部通过。

开始前：

git status --short
git branch --show-current
git rev-parse HEAD
git tag --points-at HEAD

Final gate：

pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm security:check
pnpm test:e2e

不得伪造结果。

完成后 push：
feat/v5.1-rules-recurring

不要 merge main。
不要 tag v5.1.0。
不要开始 V6。

最终返回：
- branch
- exact SHA
- Actions run URL
- migration
- changed files
- unit/integration/E2E counts
- known limitations
