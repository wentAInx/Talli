# V4.1 Test & Acceptance Matrix

# A. Frozen regression

全部 PASS：

```text
V1 Ledger
V2 valuation
V3 Kraken
V4.0 Ethereum wallet
```

# B. Chain identity

## C-001

chain registry exact：
1 / 8453 / 42161。

## C-002

same address on three chains allowed。

## C-003

same chain + same lowercase address duplicate reject。

## C-004

asset keys/stable keys include chain。

## C-005

wrong chainId response → CHAIN_MISMATCH。

# C. Migration

## M-001

V4 DB → V4.1：
all Ethereum IDs/facts unchanged。

## M-002

FK check empty。

## M-003

old 0004/0005 untouched。

## M-004

repeat startup no rebuild loop。

# D. L2 Transfers / capability

## L2-001

Base request categories exactly external+erc20；
no internal。

## L2-002

Arbitrum same。

## L2-003

Debug unavailable：
balances persist；
movement candidate none；
activity cursor unchanged；
status partial/balance_only；
warning visible。

## L2-004

Debug exact：
discovered tx trace accepted；
coverage still discovery_limited。

## L2-005

temporary debug rate limit != capability unavailable；
no unsafe partial activity/cursor.

# E. Trace normalization

## TR-001

CALL nonzero counts.

## TR-002

CREATE/CREATE2 value counts.

## TR-003

SELFDESTRUCT/SUICIDE normalized and counts.

## TR-004

DELEGATECALL/STATICCALL/CALLCODE do not count.

## TR-005

ancestor revert suppresses descendants.

## TR-006

failed receipt → no movement; gas independent.

## TR-007

top-level external ETH not double-counted with trace root.

## TR-008

trace human/display data never used for money.

# F. Base fees

## BF-001

execution = gasUsed * effectiveGasPrice bigint.

## BF-002

fetch raw tx by hash.

## BF-003

historical eth_call GPO getL1Fee at tx block.

## BF-004

pre-Isthmus operator = 0.

## BF-005

post-Isthmus/Jovian uses historical getOperatorFee(gasUsed),
not local hardcoded fork formula.

## BF-006

total=execution+l1+operator.

## BF-007

GPO/raw failure → unresolved; import disabled.

## BF-008

type 0x7e deposit → no normal user gas candidate.

## BF-009

ABI selector uses Keccak-256, not SHA3-256.

# G. Arbitrum fees

## AF-001

gasUsedForL1 exact parse.

## AF-002

parent = gasUsedForL1 * price.

## AF-003

execution=(gasUsed-gasUsedForL1)*price.

## AF-004

total=gasUsed*price.

## AF-005

components sum total; no double count.

## AF-006

missing/invalid gasUsedForL1 → unresolved.

## AF-007

custom Arbitrum L1-origin types no ordinary user gas candidate.

# H. Finality/cursor

## F-001

history to numeric finalized head.

## F-002

balance latest remains independent.

## F-003

pagination incomplete → activity no commit, cursor no advance.

## F-004

trace unavailable → cursor no advance.

## F-005

32-block overlap + IDs still dedupe.

# I. Ledger isolation/import

## I-001

all Base/Arb sync → Ledger unchanged.

## I-002

simple exchange explicit import → one V1 exchange.

## I-003

gas explicit import → one V1 expense.

## I-004

imported resync no duplicate.

## I-005

late provenance failure rolls Ledger back.

## I-006

complex stays unsupported.

# J. Bridge

## BR-001

matching amount/time across Ethereum/Base does not auto-link.

## BR-002

Arbitrum retryable/deposit does not auto-link.

# K. Backup v5

## BV5-001 schemaVersion5.

## BV5-002 V1–V4 restore.

## BV5-003 V5 roundtrip.

## BV5-004 L2 fee details roundtrip.

## BV5-005 chain mismatch pre-write reject.

## BV5-006 component sum mismatch reject.

## BV5-007 capability/cursors/secrets excluded.

## BV5-008 late failure full rollback.

# L. E2E

Desktop fixture：

1. add Base wallet；
2. sync balances；
3. show discovery_limited；
4. Debug available fixture；
5. map ETH/USDC；
6. Base movement；
7. Base fee breakdown；
8. explicit import；
9. re-sync no duplicate；
10. add Arbitrum same public address；
11. map；
12. Arbitrum movement；
13. parent/child fee breakdown；
14. explicit import；
15. backup schemaVersion5。

另一个 fixture：

```text
Debug unavailable
```

验证 balances 可用、movement disabled、cursor不推进。

Mobile WebKit：

- Base/Arbitrum cards；
- coverage warning；
- mapping；
- fee breakdown；
- no overflow。

# M. Final gate

```bash
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

Exact final SHA GitHub Actions：

```text
Quality & Build = success
Playwright E2E = success
```
