# Backup and migrations

Talli uses forward SQLite migrations for local persistence and a versioned JSON
wire format for portable user-data backups. These are related compatibility
mechanisms, not interchangeable formats.

## Schema authority

**Design rule.** `src/db/schema.ts` describes the current schema and
`src/db/migrations/**` is the executable migration history.

**Invariant.** Runtime code does not mutate schema ad hoc. Historical SQL under
`docs/history/` is design material only and must never be applied to a current
database.

**Reason.** Old target schemas document decisions at a point in time but may
lack later constraints, indexes, compatibility changes, or remediation.

**Implementation consequence.** Every schema change is an explicit forward
migration with migration and backup compatibility tests. SQLite foreign keys
and WAL remain enabled on application connections.

## Backup compatibility philosophy

**Design rule.** Backups preserve the supported, versioned portable-data
contract while excluding credentials and reproducible operational cache.

The wire identifier remains `multi-asset-ledger-backup` for compatibility with
the original product name. The current payload uses `schemaVersion=8` and
accepts versions 1 through 7 through in-memory upgrade steps before validation.

Exact IDs, UTC timestamps, atomic-quantity strings, and relationships survive a
round trip. The portable contract includes:

- Ledger, reference, account, settings, snapshot, and manual current or
  historical quote facts;
- external-sync and file-import sources, observations, candidates, normalized
  legs, mappings, and provenance, including evidence that has not been imported
  into the Ledger; and
- automation and recurring definitions, persisted links, posted/imported
  outcomes, and explicit skip facts.

Excluded data includes:

- provider credentials and signed request material;
- current and historical provider quote caches;
- refresh runs, refresh units, provider cooldown state, and finalized cursors;
- operational sync state that can be recreated safely.

**Reason.** A backup must restore the supported accounting and source-evidence
contract without turning secrets, stale provider cache, or interrupted
operations into portable authority.

## Restore boundary

**Invariant.** Restore parses and validates the complete payload, version,
relationships, category tree, event roles/signs, and atomic strings before any
write. Commit targets only an eligible empty or unchanged seed-only business
database.

Commit rechecks eligibility inside one `BEGIN IMMEDIATE` transaction, writes all
accepted rows, runs foreign-key verification, and commits only if every check
succeeds. Any failure rolls back the transaction. Restore does not merge into an
existing user ledger.

## Operational upgrade and rollback

Before upgrading:

1. Download and verify a JSON backup.
2. Stop writes before taking a raw SQLite copy.
3. Copy the database with any active `-wal` and `-shm` sidecars.
4. Retain the previous application image and pre-upgrade database snapshot as a
   rollback pair.
5. Run one migration/startup process against a SQLite file; never run multiple
   replicas against it.

CSV export is human-readable and is not a restore format.

## Current source pointers

- `src/domain/backup.ts`
- `src/services/backup-service.ts`
- `src/db/queries/backup.ts`
- `src/db/schema.ts`
- `src/db/migrations/**`
