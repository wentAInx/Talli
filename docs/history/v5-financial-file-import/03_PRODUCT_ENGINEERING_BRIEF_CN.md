# V5.0 Product & Engineering Brief

用户从银行/信用卡/Wise/Revolut 等下载 statement，再进入 Talli：

```text
选择 Target Account
→ 上传 CSV/OFX/QFX/camt.053
→ Preview
→ CSV mapping / structured account & currency confirmation
→ Duplicate / Possible match
→ Create review candidates
→ Import / Match Existing / Ignore
```

每个 Import Profile 明确绑定一个 Talli target account。这个选择本身就是显式资产/账户映射，
不能从 `$`、`USD`、`人民币` 自动决定 Talli account。

单账户 statement row：

```text
negative → Expense OR Transfer
positive → Income OR Transfer
```

方向不自动等于 Expense/Income。

Match Existing 场景：

```text
8/10 用户手工记 Starbucks -35
8/12 bank statement 出现 STARBUCKS -35
```

Talli 只提示 Possible Match。用户明确 Match Existing 后：
- 不创建新 Ledger event；
- 建 provenance link；
- 原 Ledger event 不被自动改日期/Payee。

OFX/camt.053 若提供 closing ledger/booked balance：
作为 external balance observation，用户可明确 Reconcile。

隐私：
- 不保存 raw statement file；
- 保存 file hash、sanitized filename、选中 raw fields、source row hash、masked account clue；
- 不保存 full account number / 未选 CSV 列。
