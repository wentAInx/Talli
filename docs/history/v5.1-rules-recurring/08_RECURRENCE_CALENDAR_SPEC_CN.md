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
