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
