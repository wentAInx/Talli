# V4 Test Acceptance

## Regression
V1/V2/V3 Kraken 全部 PASS；任一 Critical regression = NO-GO。

## Migration
- V3 Kraken connection/import/provenance fixture → V4 IDs/facts 原样；`sourceKey=kraken:primary`；FK check empty。
- 多个 EVM wallet 同 `env:alchemy.primary` 可以创建。

## Identity/exactness
- mixed-case address -> lowercase identity；invalid reject；duplicate reject。
- native key `eip155:1/native`。
- 同 symbol 不同 contract identity 不同。
- fake USDC 不 auto-map。
- `eth_getBalance` hex / tokenBalance hex / rawContract.value 全 bigint exact。
- human `value` 故意错误时 normalized 必须按 raw。
- missing decimals / excess precision 不可 import/reconcile。

## Provider
- `eth_chainId != 0x1` reject。
- token pageKey 完整。
- transfers from/to pageKey 完整。
- self-transfer uniqueId dedupe。
- HTTP assert SQLite transaction false。
- static scan 无 write/sign RPC。
- incomplete pagination：activity cursor 不推进、partial candidates 不写。

## Balance
- sync 不改 Ledger/snapshot。
- nonzero ERC20 observation；zero 不覆盖成 0/不删除历史。
- exact difference。
- explicit reconcile only -> snapshot。

## Candidate
- inbound -> simple_in unknown。
- outbound -> simple_out unknown。
- -100 USDC +0.04 ETH -> simple_exchange。
- 3+ assets -> unsupported complex。
- self net zero -> no movement candidate。
- failed tx -> no importable movement。

## Gas
- execution fee exact bigint。
- blob fee included。
- incomplete blob fields -> unresolved。
- inbound no gas candidate。
- failed tx still gas candidate。
- movement + gas are two candidates。

## Idempotency/import
- 10 syncs stable source/candidate count。
- imported re-sync ledger count stable。
- source change after import -> source_changed, Ledger unchanged。
- exchange/gas/simple out import through same V1 writer。
- late provenance failure rolls Ledger event back。

## Backup
schemaVersion4、V1/V2/V3 restore、V4 roundtrip、secrets/cursors excluded、broken EVM relation pre-write reject、late failure full rollback。

## E2E fixture
Desktop：add wallet -> sync -> map ETH+USDC -> resync -> balance/difference -> reconcile -> simple swap movement -> gas candidate -> import both -> provenance -> resync no duplicate -> backup v4。

Mobile：wallet/mapping/tx group/imported state/no overflow。

Final gate：

```text
format:check
lint
typecheck
db:check
unit
integration
build
security:check
e2e
```

Exact final SHA GitHub Actions：Quality & Build success + Playwright E2E success。
