# Backup schemaVersion 6

Product release = Talli V5.0；
Backup wire = schemaVersion 6。

Export 6，Accept 1/2/3/4/5/6。

新增 include：

```text
fileImportProfiles
fileImportBatches
fileImportSourceDetails
fileImportBatchSourceObjects
fileImportCandidateDetails
externalCandidateMatchLinks
fileImportBalanceObservationDetails
```

Existing union扩展：
- externalConnections.provider=file_import
- externalSourceObjects.objectType=file_transaction
- candidate.status=matched

Exclude：
raw file bytes、preview/temp/cache/local paths、full bank account number、
existing operational state/secrets。

Old schemaVersion5→6：
new arrays=[]，old IDs/facts exact preserve。

Validation：

Profile：
- connection provider=file_import
- credentialRef=local:file-import
- sourceKey=file:<connectionId>
- target account same book
- parser config format-compatible

Batch：
valid SHA/counts/profile relation；no raw blob fields。

Source：
file_transaction + source detail + batch link + payload hash。

Candidate：
file detail/profile/target account consistent；
stable key uses source external id；
direction/leg sign consistent。

Resolution：

```text
imported → import link yes / match link no
matched → match link yes / import link no
source_changed → exactly one provenance kind
other → neither
```

Match provenance edit/delete policy必须 server-side consistent。
推荐：会导致 matched target-account exact amount 失效的 Ledger edit/delete
必须先 explicit unlink match。

Restore：
full prevalidation → one BEGIN IMMEDIATE → FK check → any failure rollback all。
