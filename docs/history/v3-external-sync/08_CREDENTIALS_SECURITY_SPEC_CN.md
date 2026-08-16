# Credential & Security Spec

## Secret boundary

仅 server env：

```text
KRAKEN_API_KEY
KRAKEN_API_SECRET
```

`.env.example` 只留空占位。

禁止进入：

- SQLite
- backup
- client bundle
- React props
- HTML
- logs
- source payload JSON
- error response

Provider factory 必须 server-only。

## Dedicated read-only key

UI 只显示：

```text
Credential configured: yes/no
Required read permissions
Dangerous write permissions detected: yes/no
```

不要显示 key 前后几位。

## Same-origin mutation routes

```text
POST /api/sync/kraken/run
POST /api/sync/candidates/:id/import
POST /api/sync/candidates/:id/ignore
POST /api/sync/observations/:id/reconcile
```

必须 same-origin。

## Safe errors

分类：

```text
CONFIG_ERROR
AUTH_ERROR
PERMISSION_ERROR
NONCE_ERROR
RATE_LIMITED
UPSTREAM_ERROR
UPSTREAM_PAYLOAD_INVALID
NETWORK_ERROR
```

不得 dump request headers/signed payload/env。

## GetApiKeyInfo payload

可以保存 permission check 结果，
不要把完整 API key info（尤其 apiKey 字段）当 source object 保存。

## Testing destination

不要提供用户可配置 `KRAKEN_API_BASE_URL` 来测试，
避免 credential exfiltration/SSRF 风险。

测试用 injected transport。

## Backup

可保存：

```text
credentialRef = env:kraken.primary
```

不保存 secrets。

restore 后 env 缺 key：

```text
credentials missing
sync unavailable
```

但 Ledger/backup 正常。
