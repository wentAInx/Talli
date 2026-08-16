# Security policy

## Deployment warning

**Talli currently has no built-in authentication.** Do not expose it directly
to the Internet. Use a trusted private network or VPN, or an external
authentication and access-control proxy. Restrict the host firewall as well;
the default Compose port mapping can publish the service on host interfaces.

Same-origin checks on mutation routes are defense in depth. They are not user
authentication or authorization.

## Reporting a vulnerability

This repository does not currently provide a verified private reporting
channel. Do not disclose an unpatched vulnerability in a public issue,
discussion, or pull request, and do not send sensitive details through an
unverified address or form.

**OWNER ACTION REQUIRED:** enable GitHub private vulnerability reporting or
publish a private maintainer contact before making the repository public. Once
enabled, the GitHub **Security → Report a vulnerability** flow is the preferred
channel. No maintainer email is currently designated in this repository.

Include, when safe:

- affected version or commit;
- impact and affected security boundary;
- minimal reproduction using synthetic data;
- whether credentials or private data may have been exposed; and
- suggested mitigation, if known.

Never include a working production secret. If a real credential may be
compromised, revoke or rotate it at the provider before preparing the report.

## Never upload sensitive data

Do not submit any of the following to GitHub Issues, Discussions, pull requests,
CI artifacts, or public vulnerability comments:

- API keys, tokens, cookies, passwords, or signed provider requests;
- Kraken keys or secrets;
- Alchemy or CoinGecko keys;
- wallet private keys, mnemonics, or seed phrases;
- real Talli backup JSON or SQLite databases;
- real bank statements or CSV/OFX/QFX/camt source files;
- full bank, card, exchange, or brokerage account numbers; or
- personally identifying financial data, screenshots, or logs.

Use redacted metadata and deterministic synthetic fixtures. A secret printed in
a commit or CI log must be considered exposed even if that commit is later
deleted from the current branch.

## Data and integration boundaries

- The SQLite database and backup JSON contain sensitive financial data and are
  not encrypted by Talli at the application layer. Protect storage, backups,
  filesystem permissions, and host access.
- Provider credentials remain server-side runtime values and are excluded from
  SQLite and backup JSON.
- Enabled integrations make outbound requests. Kraken receives authenticated
  read-only requests; Alchemy receives public-address-related requests;
  CoinGecko and ECB receive asset/rate queries.
- Raw imported file bytes and full statement account numbers are not persisted,
  but normalized financial fields and limited source provenance are stored.
- Talli never needs an EVM private key or write-capable exchange credential.

## Supported versions

Security fixes are expected to target the latest released line. At the time
this policy was written, that line is `v6.0.0`. Older versions may be used to
verify migrations and backup compatibility but should not be assumed to receive
separate security patches.
