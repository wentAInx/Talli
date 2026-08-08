# Shared component Codex rules

- Components are presentation/interaction primitives, not a second domain layer.
- Money display accepts exact preformatted/string/bigint-safe inputs; do not coerce financial values through JS number for formatting.
- Reusable finance components must keep asset code/precision/sign semantics explicit.
- A V2 Home-denominated total is allowed only from a cache-only Decimal valuation result, must show `≈`, provenance/completeness, and must never imply a stablecoin peg.
- Preserve accessible labels, keyboard behavior, focus management, and mobile touch targets.
- Use design-system primitives consistently, but avoid wrapping every element in unnecessary abstraction.
