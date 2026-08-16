# V4.0 → V4.1 Forward Migration Plan

# 1. 已发布 migrations frozen

禁止修改：

```text
0000
0001
0002
0003
0004_v4_evm_wallet_sync
0005_quiet_betty_brant
```

V4.1 从新 migration 开始，例如：

```text
0006_v41_evm_l2_expansion
```

名字以实际 drizzle-kit 结果为准。

# 2. 需要 generalize 的 CHECK

V4.0 三处 chain=1：

```text
evm_wallet_connections
evm_balance_observation_details
evm_candidate_details
```

V4.1 允许：

```text
1
8453
42161
```

`evm_wallet_connections` 还必须校验 chain/network pair。

# 3. Operational state

`evm_wallet_connection_state` 增加：

```text
trace_capability_status
trace_checked_at
```

这些字段：

```text
operational
excluded from backup
```

# 4. L2 fee detail table

新增：

```text
evm_l2_gas_fee_details
```

只服务 Base / Arbitrum。

不要强迫迁移旧 V4.0 Ethereum gas candidate。
旧 Ethereum provenance 继续按 V4.0 解释。

# 5. Rebuild discipline

如需 SQLite table rebuild：

1. `PRAGMA foreign_keys=OFF` 在 transaction 外；
2. `BEGIN IMMEDIATE`；
3. create target temp；
4. copy exact old rows；
5. row-count guard；
6. drop/rename；
7. recreate indexes/checks；
8. create L2 table / state columns；
9. COMMIT；
10. `PRAGMA foreign_keys=ON`；
11. `PRAGMA foreign_key_check` 必须 `[]`。

Migration failure 必须 rollback。

# 6. Identity preservation

V4.0 Ethereum rows必须 byte-for-byte 保留业务字段：

```text
chainId=1
networkId=eth-mainnet
sourceKey=eip155:1:<address>
asset keys
candidate stable keys
source IDs
candidate IDs
import links
Ledger IDs
```

# 7. Acceptance

V4.0-shaped DB 升级后：

```text
Ethereum V4 E2E PASS
Kraken V3 PASS
foreign_key_check=[]
```

并验证同一 address 可以新增：

```text
Base 8453
Arbitrum 42161
```

但同链 duplicate 拒绝。
