---
name: acceptance-gate
description: Run a completion/review gate for a feature, phase, or V1 against the canonical acceptance tests, build commands, V1 non-goals, and actual command evidence. Use before claiming a milestone is complete.
---

# Acceptance Gate

This skill is a **verification workflow**, not a license to change acceptance criteria.

Read `07_TEST_ACCEPTANCE_CN.md`, `09_NON_GOALS_AND_V2_BOUNDARY_CN.md`, and the relevant implementation plan phase.

## Step 1 — Determine affected acceptance surface

Map the change to canonical cases:

- Money M-001..M-006
- Events E-001..E-008
- Fees F-001..F-002
- Snapshots B-001..B-007
- End-to-end T1..T4 dataset and expected balances/reports
- Reconciliation end-to-end dataset
- Dashboard constraints
- Report constraints
- Backup D-001..D-004
- Minimum Playwright flow
- Build gate / Definition of Done

Do not require unrelated tests for a tiny change, but final V1 review covers the entire matrix.

## Step 2 — Static risk scan

Review changed code for:

- monetary `number`, `Number`, `parseFloat`, float DB types, or silent rounding;
- cross-asset totals or valuation/price calls;
- stablecoin peg assumptions;
- transfer/exchange conflation;
- incorrect snapshot inclusivity;
- transfer/exchange principal entering reports;
- missing transaction boundaries;
- client-only financial validation;
- unbounded transaction-history reads;
- accidental V1.1/V2 features.

## Step 3 — Run targeted tests

Run the smallest relevant tests first. Record exact commands and outcomes.

For financial behavior, prefer assertions on atomic `bigint`/string values and deterministic timestamps.

## Step 4 — Run repository gate

Discover the real scripts from the repository rather than assuming names. Execute the project equivalents of:

```text
lint
typecheck
tests
build
```

For final V1, also run configured critical Playwright E2E.

Do not fabricate or summarize unrun commands as passing.

## Step 5 — Optional parallel audit

At major milestones, ask the parent to spawn the read-only project agents in parallel:

- domain_auditor
- architecture_auditor
- ui_auditor
- test_auditor

The primary agent should reconcile findings and own all subsequent edits.

## Step 6 — Completion report

Report:

1. implemented behavior;
2. key architecture/semantic decisions;
3. migrations if any;
4. important files changed;
5. commands actually run and exact pass/fail status;
6. unresolved failures/known limitations;
7. acceptance cases covered;
8. confirmation that no V2/non-goal functionality was implemented.

A failing required check means the milestone is not fully complete unless the failure is clearly external/unrelated and is reported as such.
