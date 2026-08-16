# Security & Provider Policy

## Secret invariants

`COINGECKO_API_KEY`：
- env only
- server only
- never DB
- never Backup
- never source metadata
- never logs
- never client JS / RSC serialized props

ECB无 secret。

## SSR

- analytics Server Component只读 DB cache；
- 不 await external provider；
- provider outage不能让页面 SSR 挂死。

## Provider URL

CoinGecko：
- demo/keyless fixed origin
- pro fixed origin
- no arbitrary user-configured provider URL in production

Tests inject deterministic transport/base URL。

ECB fixed `data-api.ecb.europa.eu` production origin。

## Raw data minimization

Persist only needed:
- price observation
- rate
- timestamp/date
- minimal source metadata

不要存：
- CoinGecko entire response
- market cap
- volume
- arbitrary debug body
- ECB full raw CSV blob

## Licensing / source attribution

Analytics data-source panel必须有：
- CoinGecko attribution
- ECB source label

Provider cache不可经 backup/export endpoint redistributable raw dump。

## Purge

用户能删除 provider-derived history，不影响：
- Ledger
- snapshots
- manual quotes
- mappings

## Error hygiene

Provider error保存：
- normalized safe code
- safe short message

不要保存 response body if it may echo request/security details。

## Security check script

扩展 `security:check` 检查：
- historical provider code没有 client imports；
- env secret names不出现在 backup/client bundles；
- no historical route writes Ledger；
- no new configurable production origins；
- no forbidden stablecoin peg constant。
