# Statement Balance → Reconciliation

支持：
OFX/QFX `LEDGERBAL`；
CAMT `CLBD closing booked balance`；
CSV 无 generic balance。

创建 `external_balance_observations`
+ `file_import_balance_observation_details`。

Exact timestamp 用 source instant。
Date-only 用 profile local date noon，并 UI 明确 “source provided date only”。

比较：

```text
queryBalanceAt(targetAccount, observation.asOf)
vs
statement observed amount
```

No valuation/cross-asset conversion。

只有 explicit Reconcile 才走 existing V1 snapshot writer。
Statement import 本身绝不创建 snapshot。
