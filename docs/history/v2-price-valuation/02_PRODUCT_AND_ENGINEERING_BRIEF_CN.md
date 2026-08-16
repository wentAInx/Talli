# Talli V2.0 产品与工程 Brief

# 1. 产品目标

V1 已经能精确记录 CNY、USD、USDT、BTC、ETH 等原生数量，但用户无法快速回答：

> “按我选择的主法币，现在这些账户大概值多少钱？”

V2.0 增加 **Current Valuation**，但不把 Talli 变成交易终端或投资组合 P&L 工具。

# 2. 核心用户故事

## P0

- 用户选择 CNY/USD/EUR/HKD 等非归档 fiat asset 作为 Home Asset。
- Dashboard 继续显示原生余额，同时显示 `≈ Home Asset` 估值。
- Dashboard 可显示一个明确带 `≈` 的估算总资产。
- 用户能看到该总额是否完整、多少非零资产没有可用 quote。
- Crypto 价格来自 CoinGecko，fiat FX 来自 ECB reference rates。
- 用户可为 unsupported/custom asset 输入 manual exact-pair quote。
- 用户可手动刷新行情。
- stale/missing/provider error 时账本仍正常工作。
- API key 不暴露给客户端。
- V1 backup 可以在 V2 恢复。

## P1（V2.0 可做但不得压过 P0）

- Settings 中编辑/启停 provider mapping。
- 显示 quote provenance：provider、provider observation、last fetched。
- Provider health/status：configured / fresh / stale / error / cooldown。
- Manual quote 历史记录与停用。

# 3. 非目标

本轮不是：

- 实时交易行情 terminal。
- investment P&L tracker。
- tax/cost-basis engine。
- exchange/wallet sync。
- historical net worth。

# 4. UX 信息层级

每个资产先显示 V1 fact，再显示估值：

```text
BTC
0.00428137 BTC          <-- primary fact
≈ ¥1,242.78             <-- derived estimate
BTC/USD CoinGecko × USD/CNY ECB
```

总资产必须显示近似标记：

```text
估算总资产
≈ ¥18,426.37 CNY
8 / 9 个非零资产已估值
```

若不完整：

```text
≈ ¥17,183.59 CNY
估值不完整 · 1 个非零资产缺少价格
XYZ：未配置可用价格源
```

**缺失资产不能静默按 0 计入后仍宣称“完整总资产”。**

# 5. 网络容错

- SSR 首屏只读 Ledger + 本地 price cache，不等待外网。
- stale/missing 时页面渲染后再触发同源 refresh。
- refresh 失败：继续显示 V1 原生余额；若有 stale cache，可标记 stale 继续估值。
- 无 cache：该资产 valuation missing。

# 6. 估值一致性

V2.0 使用 USD bridge：

- Crypto quote 始终 CoinGecko -> USD。
- Fiat FX 始终 ECB reference rate。
- Crypto -> 非 USD Home = Crypto/USD × USD/Home。

好处：

- Crypto 与用户持有的 USD 都使用同一套 ECB FX 基准。
- Home Asset 切换不需要重新抓 Crypto quote。
- Provider 职责清晰，未来 V2.1 历史数据也容易复用。

# 7. 安全与隐私

Talli 仍是单用户自托管 App；V2 不引入账户认证。

CoinGecko API key：

- 仅环境变量。
- 仅 server runtime 读取。
- 不写 SQLite。
- 不写 backup。
- 不传给 client component。
- 错误日志中不得打印 request headers / 完整 URL query key。

# 8. 性能目标

个人账本规模下：

- Dashboard cache-only render 不应因行情服务变慢。
- 一次 CoinGecko refresh 批量获取所有 enabled Crypto mappings。
- 一次 ECB refresh 批量获取所需 fiat series。
- portfolio valuation 在内存中使用 Decimal 计算。
