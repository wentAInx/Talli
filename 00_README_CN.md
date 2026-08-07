# 多资产个人记账 App V1 — Codex 工程任务包

## 1. 任务包用途

这是一个可直接交给 Codex 的、自包含的 V1 工程任务包。目标不是“照着 Lunch Money / iCost 抄界面”，而是实现一个适合个人自用、可自托管、原生支持法币/外币/虚拟货币余额的多资产账本。

V1 的核心原则只有一句：

> **Ledger quantities are source of truth; market valuation is derived data and must never mutate the ledger.**
>
> 原生资产数量是唯一账本事实；市场估值只是衍生数据，任何汇率和币价变化都不得修改原始账本。

V1 **完全不实现汇率、币价、统一法币折算、实时行情、历史行情、净资产折线图**。CNY、USD、USDT、BTC、ETH 等资产各自独立记账、独立统计。

---

## 2. Codex 阅读顺序

Codex 在写代码前必须依次阅读：

1. `01_CODEX_MASTER_INSTRUCTION_CN.md`
2. `02_PRODUCT_AND_ENGINEERING_BRIEF_CN.md`
3. `03_DOMAIN_LEDGER_SPEC_CN.md`
4. `04_DATABASE_SCHEMA.sql`
5. `05_TYPES_AND_SERVICE_CONTRACTS.ts`
6. `06_UI_UX_SPEC_CN.md`
7. `07_TEST_ACCEPTANCE_CN.md`
8. `08_IMPLEMENTATION_PLAN_CN.md`
9. `09_NON_GOALS_AND_V2_BOUNDARY_CN.md`
10. `10_SEED_DATA.json`

`MANIFEST.tsv` 仅用于完整性检查。

---

## 3. V1 必须交付

- Next.js + TypeScript 单体 Web App。
- SQLite 持久化。
- Drizzle ORM / migration。
- 多资产定义：法币、Crypto、自定义资产。
- 单资产账户。
- 收入、支出、同资产转账、跨资产兑换、余额调整。
- 分类、标签。
- 交易列表、筛选、编辑、删除。
- 资产总览：按资产分别显示，不统一换算。
- 月度收支统计：按资产分别统计。
- 精确金额存储：禁止浮点金额。
- JSON 无损备份/恢复；CSV 导出。
- 自动化测试。
- Docker 自托管说明。

---

## 4. V1 明确不做

- 任何 CoinGecko / Coinbase / Kraken / ECB / Forex API。
- 实时币价、每日币价、历史币价。
- CNY/USD 等自动汇率。
- base currency / home currency。
- “总资产 ¥xxxx”。
- 银行/交易所/链上账户自动同步。
- 多用户系统。
- 多设备离线同步与冲突解决。
- OCR、AI 分类、账单截图识别。
- 预算、周期账、账单导入（可作为 V1.1）。

详见 `09_NON_GOALS_AND_V2_BOUNDARY_CN.md`。

---

## 5. 关键产品语义

首页可以显示：

```text
CNY        ¥8,438.23
USD          $628.41
USDT      628.435000 USDT
BTC         0.00428137 BTC
```

但不得显示：

```text
总资产：¥18,432.22
```

因为 V1 没有估值层。

跨资产兑换不需要行情：

```text
-100.000000 USDT
+99.720000 USD
```

真实成交率可由两边金额即时推导：

```text
1 USDT = 0.9972 USD
```

这只是该笔真实成交的派生展示，不是“市场汇率”。

---

## 6. 推荐运行形态

V1 面向单用户、单服务实例：

```text
Browser / Phone / Tablet
        │
      HTTPS
        │
Next.js single process
        │
SQLite /data/finance.db
```

不要在 V1 构造微服务。

V1 不实现复杂认证与多用户授权。部署文档必须提示：不要把未保护实例直接暴露在公网；远程使用时应放在可信私网、VPN、Tailscale、Cloudflare Access 或反向代理认证之后。

---

## 7. 关于 Lunch Money / iCost

它们仅作为功能和信息架构参考。实现时不要复制其商标、Logo、图标资源、专有文案或逐像素 UI。产品应使用自己的中性界面与命名。
