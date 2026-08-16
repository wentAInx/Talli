# V5.0 Acceptance Matrix

## Frozen regression
V1/V2/V3/V4/V4.1 all PASS。

## Migration
0000–0006 untouched；
V4.1→V5 all IDs/facts preserve；
provider/source/status CHECK generalization；
repeat startup stable；
FK check empty。

## CSV
UTF-8 BOM / Windows-1252 / GB18030；
comma/semicolon/tab；
signed + debit-credit；
invalid both columns；
decimal dot/comma/thousands；
excess precision reject；
all strict date formats；
date-only noon+precision；
optional time；
explicit ID strong；
no ID weak ordinal；
identical repeated rows preserved；
mixed currency reject；
malformed row blocks commit。

## OFX/QFX
OFX1 SGML；
OFX2 XML；
QFX extension；
credit card；
FITID strong/reimport；
changed strong payload source_changed；
account fingerprint/mismatch；
CURDEF mismatch；
LEDGERBAL observation；
unsupported investment statement；
malformed fail。

## CAMT.053
representative .02/.08/.13/.14；
CRDT/DBIT sign；
date/dateTime；
account fingerprint；
safe refs；
NOTPROVIDED weak；
CLBD；
multi-TxDtls unsupported；
currency mismatch；
unknown future namespace unsupported；
DOCTYPE/ENTITY reject。

## Atomicity
preview zero DB write；
commit parse error zero write；
late persistence failure whole batch rollback；
no parsing/HTTP inside tx。

## Duplicate
exact file hash；
strong identity across different files；
weak reimport；
10 reimports no Ledger duplicates。

## Match
same amount/date/payee suggestion；
no auto match；
explicit match no new Ledger event；
target account exact signed amount required；
transfer/exchange can match account leg；
wrong amount/book reject；
matched cannot import again；
matched source change→source_changed；
edit/delete invalidation policy tested。

## Import
out expense|transfer；
in income|transfer；
confirmed；
same V1 writer；
payee/memo default；
atomic provenance；
reimport no duplicate。

## Reconcile
OFX ledger / CAMT CLBD；
import no snapshot；
explicit reconcile snapshot only；
no income/expense side effect。

## Backup 6
export 6；
restore 1..6；
all file/match facts roundtrip；
no raw blob/full account number；
relation validation；
late failure rollback。

## Security
>20MiB；
>100000 rows；
>10k field；
DOCTYPE/ENTITY；
path traversal filename；
no HTTP importer；
no parser client bundle；
no raw account id persistence。

## E2E desktop/mobile
CSV profile/upload/mapping/preview/candidates；
one manual match；
one expense import；
same file reupload no duplicate；
OFX closing balance；
explicit reconcile；
backup schema6；
mobile critical path。

Final commands：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm security:check
pnpm test:e2e
```
