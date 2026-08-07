# Session C — Filters / Reports / Backup / Hardening

继续 V1 的 Phase 7~10。

重点实现：

- 流水稳定分页/游标与日期、类型、账户、asset、分类、标签、关键词筛选；避免 N+1。
- 月度收入/支出与分类报表，严格按 app timezone 和 asset bucket。
- transfer/exchange principal 不进入收入支出；fee 进入对应 fee asset 支出。
- Lossless JSON backup，保留 atomic string / IDs / timestamps / schemaVersion。
- Restore to empty DB：全量预验证 + 单 transaction，非空 DB/错误版本拒绝且无部分写入。
- CSV human-readable export。
- mobile、empty/error/loading、a11y、Docker volume/self-hosting 文档。

使用：

```text
$ledger-domain-guard
$sqlite-drizzle-persistence
$finance-ui-review
$react-best-practices
$web-design-guidelines
```

最后用 `$acceptance-gate` 运行本阶段和全局相关验证。任何失败必须如实报告。
