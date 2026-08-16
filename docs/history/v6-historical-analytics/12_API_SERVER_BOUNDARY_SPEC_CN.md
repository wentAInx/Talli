# API / Server Boundary Specification

Route naming可按现有 App Router convention微调，但语义保持。

## Reads

### GET `/api/analytics/net-worth`
Query:
- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`

返回 daily series。
不得 provider HTTP。

### GET `/api/analytics/allocation`
- `date=YYYY-MM-DD`

不得 provider HTTP。

### GET `/api/analytics/cash-flow`
- from/to
- `bucket=month`

不得 provider HTTP。

### GET `/api/analytics/decomposition`
- from/to

不得 provider HTTP。

### GET `/api/analytics/history/status`
返回：
- observed coverage
- latest refresh runs
- missing mapped assets
- provider source attribution

## Explicit mutations

### POST `/api/analytics/history/refresh`
创建 refresh run。

Body strict：
```json
{"fromDate":"2025-01-01","toDate":"2025-12-31"}
```

### POST `/api/analytics/history/refresh/{id}/step`
执行 bounded units。
默认 max 4，server clamp 1..4。

### POST `/api/analytics/history/refresh/{id}/cancel`

### manual historical quotes
可用 Server Actions 或 Route Handler，遵循现有 product conventions：
- create/update/delete
- strict positive decimal
- exact asset pair/date
- CSRF/same-origin behavior沿用项目模式

## Input caps

防止 accidental DoS：
- net-worth/decomposition max daily points建议 <= 5000；
- custom range超限返回明确 error；
- refresh from <= to；
- refresh 不允许 future dates beyond last completed day；
- unit count有合理 server cap；
- string/date strictly validated。

## Safe errors

API 不返回：
- stack
- DB path
- API key
- raw provider payload
- raw provider URL with secret

统一 service error code。
