# Codex Master Instruction — Talli V2.0

你是本项目的高级全栈工程师。目标是在 `wentAInx/Talli` 的 V1 冻结基线 `9345d8516aaa78495e408d53bb74e03f2f5eaa57` 上，严格实现本任务包定义的 V2.0 Price & Valuation Engine。

# A. 执行原则

1. **先读后写。** 先理解 V1 账本、余额锚点、备份格式、SQLite/Drizzle 迁移、E2E 结构，再开始修改。
2. **V1 语义冻结。** V2 不允许重写 Expense/Income/Transfer/Exchange/Reconciliation 语义。
3. **Additive migration only。** 新增 V2 表/索引；不得无必要修改 V1 表结构。
4. **网络不能成为账本可用性的前置条件。** CoinGecko/ECB 超时或宕机时，用户仍必须可以打开 Talli、记账、查看原生余额和 V1 报表。
5. **行情 API 仅服务器端访问。** API key 不得进入浏览器 bundle、HTML、SQLite、JSON backup、日志正文或错误回显。
6. **默认测试不得访问真实外网。** Provider adapters 使用注入式 HTTP transport / mock fixtures；可另做显式 opt-in live smoke，但不能成为普通 `pnpm test` 的前提。
7. **不要扩大范围。** 本轮只做 V2.0，不实现 V2.1 历史估值、P&L、账户同步等。
8. **不得伪造验证结果。** 只报告实际运行过的命令和真实结果。
9. **不要 push / deploy。** 除非用户另行明确要求。

# B. V1 冻结红线

以下代码行为必须保持：

- `amount_atomic` / `balance_atomic` 仍为 SQLite `TEXT` signed integer。
- V1 领域金额仍使用 `bigint`。
- Transfer 必须同资产等额本金。
- Exchange 必须跨资产、两边数量独立。
- fee 仍是独立负 entry，可使用第三资产。
- Balance 仍是 latest snapshot + `(snapshot.asOf, queryTime]` entries。
- Reconciliation 仍是 snapshot，不是收入/支出。
- V1 原生报表仍排除 Transfer/Exchange 本金，仅 fee 进入支出。
- 删除 `latest_price_quotes` 等 V2 衍生数据后，V1 current balances 和所有 ledger facts 必须完全不变。

# C. V2 精度规则

- Ledger 数量：继续 `bigint`，绝不改变。
- Price/FX rate：持久化为 **positive plain decimal TEXT**，业务计算使用 `decimal.js`。
- 禁止用 JS `number` 做价格乘除、cross rate 或 portfolio sum。
- Provider JSON 在外部 adapter 边界若以 JS number 到达，只允许立即 `String(value)` -> `Decimal`；不得在 number 上做任何财务计算。
- 禁止科学计数法写入 `rate_text`。
- 逐资产估值不要先 round 后再 sum；先保留高精度 Decimal 汇总，最终 UI display 才按 Home Asset scale 四舍五入。

# D. Provider 责任分离

- CoinGecko：只负责已映射 Crypto -> USD 的 current market quote。
- ECB：只负责 EUR reference rates，并由 resolver 计算 fiat cross rate。
- Manual：只负责用户明确输入的 exact pair override。
- Provider adapters 不得依赖 Account、Ledger、Dashboard。
- Quote Resolver 不得发 HTTP。
- Portfolio Valuation Service 不得发 HTTP。

# E. Quote precedence

对 `baseAsset -> homeAsset`：

1. `base == home`：identity rate=1。
2. 存在 active manual exact-pair quote：manual override，最高优先级。
3. base 为 fiat：ECB cross rate。
4. base 为 crypto：CoinGecko `base -> USD`；若 Home != USD，再乘 ECB `USD -> Home`。
5. base 为 custom：V2.0 只支持 manual exact-pair；否则 missing。

**USDT/USDC 不得特殊处理为 1 USD。** 它们必须和 BTC/ETH 一样从 CoinGecko 读取市场价格。

# F. 网络与事务

- 不得在 SQLite write transaction 内执行外部 HTTP。
- Refresh 流程应先短事务登记 attempt/cooldown，再在事务外 fetch，最后短事务写 quote/state。
- 同一 provider 同一进程应有 in-flight dedupe，避免并发重复请求。
- 429 应尊重 `Retry-After`（若有）并设置 cooldown；没有时至少 60 秒。
- Provider failure 不得把 rate 写成 0，也不得删除最后一次成功 cache。

# G. 验证门槛

最终必须运行项目实际可用的等价命令，并报告结果：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

如果环境不允许某项，报告原因及未验证风险。

# H. 最终输出

完成后给出：

1. 当前 HEAD 与分支。
2. V2.0 实现摘要。
3. 新增 migration/table/index 列表。
4. Provider / resolver / valuation 架构说明。
5. Backup v1->v2 兼容策略。
6. 新增/修改文件概览。
7. 实际运行的命令与结果。
8. V1 regression 结果。
9. 未完成项/已知限制。
10. 明确确认未实现 V2.1 和其他非目标。
