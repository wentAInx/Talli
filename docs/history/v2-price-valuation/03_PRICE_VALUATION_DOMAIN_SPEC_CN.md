# Price & Valuation Domain Specification

# 1. 标准 Quote 语义

系统内所有标准 quote 统一定义：

> `1 BASE = rate QUOTE`

例如：

```text
BASE  = BTC
QUOTE = USD
rate  = 68123.456789
```

表示 `1 BTC = 68123.456789 USD`。

不得让不同 Provider 在 domain 内保留相反方向语义。

# 2. 价格不是账本金额

- Ledger quantity：精确事实，atomic bigint。
- Market/reference rate：衍生 decimal。
- Valuation：quantity × resolved rate 的临时结果。

Price refresh 不得：

- update account balance。
- insert ledger entry。
- insert balance snapshot。
- 改 Exchange 历史成交数量。

# 3. Home Asset

- 存在于 `book_valuation_settings`。
- 必须引用非归档 `assetType='fiat'` asset。
- Home Asset 只决定估值展示单位，不改变任何 Ledger fact。
- 若设置无效/缺失，V1 页面仍工作，只是不显示 portfolio valuation，并引导设置。

# 4. External provider mapping

`price_provider_mappings` 仅表示“某个 Talli asset 对应外部 Provider 的什么 key”。

禁止使用 symbol 自动猜测 CoinGecko identity。

示例：

```text
Talli BTC  -> CoinGecko id: bitcoin
Talli ETH  -> CoinGecko id: ethereum
Talli USD  -> ECB currency code: USD
```

# 5. V2.0 Provider 责任

## 5.1 CoinGecko

只生成：

```text
Crypto Talli Asset -> USD Talli Asset
```

例如 BTC/USD、ETH/USD、USDT/USD。

## 5.2 ECB

Provider-native observation 是：

```text
1 EUR = X fiat
```

缓存为标准 quote：

```text
EUR -> USD
EUR -> CNY
EUR -> HKD
```

EUR 本身使用 identity `EUR/EUR = 1`，不请求不存在的 EUR/EUR series。

## 5.3 Manual

Manual quote 是用户明确输入的 exact pair：

```text
BASE -> QUOTE
```

Active manual exact pair 是该 pair 的最高优先级 override。

# 6. Quote Resolution

目标：`resolve(baseAsset, homeAsset, at)`。

V2.0 current valuation 只解析当前 quote，不做历史回填。

## 6.1 Identity

若 `base.id == home.id`：

```text
rate = 1
status = identity
```

不读 cache，不发 HTTP。

## 6.2 Manual override

若存在 active exact pair `base -> home`：

- 使用 manual rate。
- provenance = manual。
- 不继续自动 provider resolution。

不做 reverse-pair 自动倒数；用户若换 Home Asset，需要对应 exact pair，或让自动 provider 处理。

## 6.3 Fiat -> Home Fiat

通过 ECB EUR legs：

若 base=EUR：

```text
EUR -> HOME = ECB(EUR -> HOME)
```

若 home=EUR：

```text
BASE -> EUR = 1 / ECB(EUR -> BASE)
```

否则：

```text
BASE -> HOME
= ECB(EUR -> HOME) / ECB(EUR -> BASE)
```

所有运算使用 Decimal。

## 6.4 Crypto -> Home Fiat

CoinGecko 给：

```text
CRYPTO -> USD = cryptoUsd
```

若 Home=USD：

```text
CRYPTO -> HOME = cryptoUsd
```

否则：

```text
CRYPTO -> HOME
= cryptoUsd × resolveFiat(USD -> HOME)
```

## 6.5 Custom

V2.0：

- active manual exact pair -> usable。
- 否则 missing。

不得自动把 custom code 当 fiat/crypto provider key。

# 7. Stablecoin 红线

以下逻辑禁止存在：

```text
if asset.code == USDT: rate = 1 USD
if asset.code == USDC: rate = 1 USD
```

USDT/USDC 必须通过 CoinGecko market quote，与 BTC/ETH/SOL 同路径。

# 8. Quote Resolution 状态

建议 domain 类型：

```text
identity
manual
fresh
stale
missing_mapping
missing_quote
provider_error
unsupported
```

组成 quote 时状态按最弱 leg 传播：

- 任一 required leg missing/error 且无 usable stale -> overall missing/error。
- 任一 leg stale、其余 usable -> overall stale。
- 所有 external legs fresh -> fresh。
- manual exact override -> manual。

# 9. Portfolio valuation

在同一个 `queryTime`：

1. 用现有 V1 balance engine 获取所有 active account balance。
2. 按 asset 聚合 native quantity atomic。
3. 对每个非零 asset resolve `asset -> home`。
4. quantity Decimal × resolved rate Decimal。
5. 每个 line 保留高精度 Decimal 文本。
6. 对所有 usable line 的 exact Decimal value 求和。
7. 最后 UI display 才按 Home Asset scale round。

# 10. Completeness

- 零余额 asset 即使无 mapping，也不影响 `isComplete`。
- 非零 asset 无 usable quote -> `isComplete=false`。
- 负余额正常估值并减少总值；不要根据 `accountType=credit/loan` 再翻转符号。
- archived account 不进入当前 dashboard valuation，与 V1 dashboard 规则一致。
- archived asset 的 active account 本应被 V1 过滤；V2 不应重新引入。

# 11. Rounding

推荐 Decimal context：precision >= 80。

禁止：

```text
round(each asset to 2dp) -> sum
```

要求：

```text
sum(exact per-asset Decimal) -> final display round to home.scale
```

# 12. Provenance

最终 resolved quote 应保存/返回 leg chain，而不是只有一个 rate：

```text
BTC -> USD : CoinGecko spot
USD -> CNY : ECB reference cross
```

UI 可显示：

```text
CoinGecko BTC/USD × ECB USD/CNY
```

这有助于诊断 stale/missing，也避免把 ECB reference rate 描述成实时成交汇率。
