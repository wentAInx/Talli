# Cross-chain Bridge Boundary

# 1. 不自动关联

V4.1 不做：

```text
Ethereum outbound
↔ Base inbound

Ethereum outbound
↔ Arbitrum retryable/inbound

Base withdrawal
↔ Ethereum claim

Arbitrum withdrawal
↔ Ethereum outbox
```

即使：

- 金额一样；
- 地址一样；
- 时间接近；
- provider metadata 看起来像 bridge；
- tx/message 有协议关联 ID；

也不自动创建跨链 Transfer。

# 2. 为什么

Bridge 可能涉及：

- canonical bridge；
- third-party bridge；
- wrapping；
- gateway；
- mint/burn representation；
- retryable；
- delayed settlement；
- different token contracts；
- fees on multiple chains。

一轮 V4.1 不应把这些协议语义塞进 generic movement normalizer。

# 3. 用户行为

每链候选独立展示。

用户可以：

```text
明确选择 Transfer
```

并选择同资产的另一个 Talli account。

现有 V1 Transfer invariant 负责正确性。

# 4. No auto reconciliation

Bridge 造成 wallet/Talli 差异：

```text
显示 difference
```

不自动 snapshot。

# 5. Future

自动 bridge linking 留到独立版本，
必须 chain-specific protocol adapter + explicit review。
