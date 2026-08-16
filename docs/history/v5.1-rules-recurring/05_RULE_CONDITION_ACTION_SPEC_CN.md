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
