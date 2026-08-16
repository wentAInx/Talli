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
