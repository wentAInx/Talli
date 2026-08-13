# Codex Master Instruction — Talli V4.1

## A. Frozen baseline

Repository:

```text
wentAInx/Talli
```

V4.0 frozen baseline:

```text
v4.0.0
f981e3e0e454f4d7a8ce0111323c9aceebc2483b
```

开工前：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -10
git tag --points-at HEAD
```

必须从上述 baseline 或用户明确批准的 release-only descendant 开始。

推荐：

```bash
git checkout main
git pull --ff-only
git switch -c feat/v4.1-evm-l2-sync
```

禁止：

- reset V4.0；
- rebase / force push；
- 修改 0000–0005 已发布 migration；
- 重写 V4.0 source identity；
- squash release history。

---

# B. Frozen V1/V2/V3/V4.0 semantics

不得改变：

- persisted money = atomic integer TEXT + domain bigint；
- Account 单一 asset；
- V1 Expense/Income/Transfer/Exchange invariants；
- third-asset fee；
- snapshot/reconciliation semantics；
- balanceAt(snapshot + half-open entries)；
- V2 valuation 为 derived data；
- stablecoin 不假定 1:1；
- V3 Kraken read-only / candidate / provenance / atomic import；
- V4.0 Ethereum public-address-only；
- V4.0 exact raw hex → bigint；
- V4.0 movement/gas two-candidate design；
- explicit Import / Reconcile only；
- backup V1–V4 compatibility。

---

# C. V4.1 hard red lines

1. Production chains only:
   - Ethereum 1
   - Base 8453
   - Arbitrum One 42161

2. All three share:
   ```text
   credentialRef = env:alchemy.primary
   ```

3. Fixed Alchemy origins only:
   ```text
   eth-mainnet.g.alchemy.com
   base-mainnet.g.alchemy.com
   arb-mainnet.g.alchemy.com
   ```

4. No arbitrary RPC URL.

5. No:
   ```text
   eth_sendTransaction
   eth_sendRawTransaction
   eth_sign*
   personal_*
   wallet_*
   ```

6. For Base / Arbitrum, do not request `internal` from Transfers API as if it were supported.

7. L2 native movement must be trace-derived for every discovered tx before movement import is allowed.

8. Transfers API discovery on Base/Arbitrum is always surfaced as:
   ```text
   discovery_limited
   ```

9. Debug unavailable:
   - no L2 movement import;
   - no false “complete history”;
   - no activity cursor advancement.

10. Base total gas must include exact:
    - L2 execution;
    - L1 data/security fee;
    - operator fee when applicable.

11. Arbitrum total gas must use receipt `gasUsedForL1` correctly and must not double count parent fee.

12. No automatic bridge correlation across chains.

13. No chain-specific amount arithmetic through JS number.

---

# D. Allowed read RPC additions

V4.1 may extend the read allowlist with:

```text
debug_traceTransaction
eth_getRawTransactionByHash
eth_call
```

But `eth_call` is server-internal only for fixed, audited Base GasPriceOracle calls.
No UI-supplied target/data.

---

# E. Automated tests

Never call live Alchemy in CI.

Use:

```text
injectable transport
deterministic Base fixture
deterministic Arbitrum fixture
temporary file-backed SQLite
```

Final gate:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm security:check
pnpm test:e2e
```

Do not push / merge / tag unless the user explicitly asks.
