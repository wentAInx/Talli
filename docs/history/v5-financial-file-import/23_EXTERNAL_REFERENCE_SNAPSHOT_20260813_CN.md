# External Reference Snapshot — 2026-08-13

Implementation should re-check first-party sources if current behavior changes.

## OFX
Financial Data Exchange OFX Work Group：
当前 OFX Banking 2.3；OFX 2.x XML；OFX 1.6 是最后 SGML-era spec。
https://financialdataexchange.org/about-fdx/ofx-work-group/

## ISO 20022
Current catalogue包含 `camt.053.001.14 BankToCustomerStatementV14`，
历史 versions 在 official archive。
https://www.iso20022.org/iso-20022-message-definitions?search=camt.053
https://www.iso20022.org/catalogue-messages/iso-20022-messages-archive

## Actual Budget
支持 CSV/QIF/OFX/QFX/CAMT；
duplicate strategy先 strong imported ID，再 date/amount/payee similarity，可匹配 manual tx。
https://actualbudget.org/docs/transactions/importing/

Talli V5.0 intentional difference：
never auto-match / never auto-edit existing Ledger。

## Firefly III
Data Importer 支持 reusable CSV config、CAMT.053、mapping/duplicate workflows。
https://docs.firefly-iii.org/how-to/data-importer/import/csv/
https://docs.firefly-iii.org/how-to/data-importer/advanced/cli/

## XML parser
截至 reference date `fast-xml-parser 5.10.1` current；
上游 2026 有多次 entity/DOCTYPE advisories，故 Talli 仍 pre-reject DTD/ENTITY。
https://www.npmjs.com/package/fast-xml-parser
https://github.com/NaturalIntelligence/fast-xml-parser/security
