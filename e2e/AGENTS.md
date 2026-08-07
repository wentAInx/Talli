# E2E-specific Codex rules

- Use deterministic seed/setup data and deterministic timestamps where the product permits it.
- Assert visible balances and event behavior using exact formatted quantities; do not convert financial expectations through floating point.
- Minimum flow: create CNY account with initial balance → expense → dashboard updates → transaction appears → edit → balance updates → delete → balance restores.
- Add exchange coverage when practical, especially different-asset principal plus independent fee asset.
- Test at least one phone viewport for critical transaction entry/navigation flows.
- Avoid brittle selectors based on visual DOM structure. Prefer roles, labels, stable accessible names, and intentional test IDs only where necessary.
- E2E is not a substitute for domain/integration coverage of snapshot boundaries and money precision.
