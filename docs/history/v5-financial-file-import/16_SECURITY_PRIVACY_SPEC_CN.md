# V5.0 Security & Privacy

Treat CSV/XML/OFX as hostile input.

Hard limits：

```text
20 MiB
100000 transaction rows
10000 chars per selected text field
bounded nesting
```

不保存 file blob/full raw XML/full raw CSV line with unselected columns。

Bank account PII：
不保存 raw full IBAN/account/card account number；
只保存 SHA-256 fingerprint + last4。

XML：
在 parser 前拒绝 `DOCTYPE` / `ENTITY`；
no external entity resolution；
no network。
若使用 fast-xml-parser，pin audited version + strict limits。

CSV text render 依赖 React escaping，禁止 raw HTML injection。

Upload only same-origin POST。
V5.0 不支持 import from URL。

Filename：
basename only；strip control chars/NUL；不得作为 filesystem path。

Default bounded memory parse。
若用 temp file：
server temp only、random path、finally delete、tests prove cleanup。

Client bundle 不得包含 server parser/bank internals beyond explicit preview DTO。

Security static checks应覆盖：
- importer 内无 fetch/HTTP；
- raw blob schema column；
- arbitrary path/url ingestion；
- account raw ID persistence；
- XML security precheck存在。
