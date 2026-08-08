# App Router / UI-specific Codex rules

These rules apply to `src/app/**`.

- React components must not implement ledger invariants, balance algorithms, report inclusion rules, or monetary arithmetic.
- Prefer Server Components for reads. Keep client components narrow and only for interactive state that needs the browser.
- All mutations are revalidated server-side. Client validation improves UX but is never the only correctness boundary.
- Ordinary in-app mutations should prefer Server Actions; Route Handlers are reserved for boundaries such as file export/restore or when an HTTP API is actually useful.
- Use the installed frontend skills for design/React/interface review and `$finance-ui-review` for project-specific rules.
- V2 may display a fiat Home Asset estimate only from service-provided quote resolutions. Always show `≈`, incomplete state/provenance, and never infer `USDT/USDC = USD`.
- Server Components must never await external providers; hydration may call the same-origin refresh route, which keeps secrets server-only.
- Amounts use tabular numerals; signs and asset codes remain explicit; color is never the sole carrier of meaning.
- Mobile must remain first-class: bottom navigation, transaction sheet/fullscreen behavior, touch targets, keyboard handling, and no horizontal overflow.
- Keep destructive confirmations for transaction deletion, snapshot edit/delete consequences, and restore.
