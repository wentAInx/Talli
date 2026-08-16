# V6 Decision Log

## D1 — Raw observations, not daily materialized valuations
Decision: persist provider observations; compute analytics on read.
Reason: avoids invalidation errors.

## D2 — App timezone EOD
Decision: daily point cutoff is local day end.
Reason: consistent with Talli accounting calendar.

## D3 — Hourly crypto preferred
Decision: fetch explicit hourly in <=100-day chunks, daily only where hourly unavailable.
Reason: allows deterministic latest-prior quote near local EOD.

## D4 — ECB carry-forward explicit
Decision: max 7 calendar days, status exposed.
Reason: weekends/holidays are normal; pretending same-day is wrong.

## D5 — No automatic crypto fallback
Decision: CoinGecko only automatic crypto provider in V6 P0.
Reason: provenance > convenience.

## D6 — Separate historical manual quote
Decision: current active manual quote does not apply retroactively.
Reason: temporal semantics differ.

## D7 — Provider history excluded from Backup
Decision: provider cache rebuildable; manual historical quote backed up.
Reason: same V2 cache/config separation.

## D8 — Archived historical exposure included
Decision: archive cannot erase past net worth.
Reason: availability constraint != historical fact.

## D9 — Incomplete chart gaps
Decision: incomplete total is null; known subtotal separate.
Reason: no false zero/false complete trend.

## D10 — Decomposition is algebraic attribution
Decision: cash flow / market&FX / trade-rebalance / reconciliation.
Reason: explains net-worth changes without inventing tax/cost-basis semantics.

## D11 — Explicit resumable refresh
Decision: foreground bounded run/unit model; no cron.
Reason: provider limits + self-hosted single process + existing architecture.

## D12 — No chart-derived financial math
Decision: chart `number` is geometry only.
Reason: exact values remain decimal text.
