# Session B — Account / Transaction / Dashboard UI

继续 V1 的 Phase 4~6：Account UI、五类交易入口、Dashboard。

先阅读：

- `AGENTS.md`
- `06_UI_UX_SPEC_CN.md`
- `03_DOMAIN_LEDGER_SPEC_CN.md`
- 已实现 service/domain contracts

不得把 UI 变成第二套业务逻辑。所有 mutation 必须走已经存在的 server/service/domain 校验与 transaction 边界。

对新页面/主要重构依次使用可用 skills：

```text
$frontend-design
$finance-ui-review
$react-best-practices
$web-design-guidelines
```

必须完整支持：支出、收入、同资产转账、跨资产兑换、调整余额。

Dashboard 只按原生 asset 分组显示余额与账户拆分，严禁统一净资产/估值。

完成 UI 后用 Playwright（MCP 或项目测试能力，按当前环境可用方式）检查桌面和手机关键路径，并补齐最低 E2E。最后使用 `$acceptance-gate`。
