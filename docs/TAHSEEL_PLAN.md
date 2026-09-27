# التحصيل — planned case-linked document workflow

Status: recorded for a later phase, as requested on 27 September 2026. This update does not add a التحصيل screen or replace existing document drafts.

## Intended flow

1. Open or create a collection file in **التحصيل** and link it to an existing case using the stable case ID. The visible case code remains a label, not the relationship key.
2. Enter and review the structured details needed by the office: parties and their roles, civil IDs, addresses, claim amounts, relevant dates, and the evidence list. The exact fields and required documents will be agreed before implementation.
3. Generate **صحيفة الدعوى** and **الحافظة** from the reviewed record and the office's parameterized Word templates. Data entry and document generation must work without PDF reading or OCR. Original attachments can remain supporting evidence.
4. Preserve the source record revision and template version with each generated draft, so later changes do not silently alter previously reviewed output.

## Design direction

- Keep case and party information consistent across the case register and التحصيل. Display existing details for review and define an explicit update rule; do not create competing copies silently.
- Store civil IDs, addresses, and case codes as text to preserve leading zeros. Leave unknown details blank and identify missing required fields before generation; never invent legal or personal details.
- Use the structured record for both outputs. Evidence descriptions and page counts belong to the linked collection file and require review.
- Consider a future batch action that selects reviewed collection files, produces one clearly named output pair per file, and reports incomplete files separately. The earlier 100-PDF reading request is superseded by this structured-data direction; a new OCR batch workflow is not part of the current scope.
- Use Mawatheeq's own username permissions. Staff must not need email accounts or external-provider sign-in.
- Keep the application, records, attachments, accounts, and templates portable to the office server. The current free hosted backend is an interim deployment; GitHub holds source code, never private office data.
- Keep all work free. Do not add paid document APIs, OCR services, hosting upgrades, or domain purchases.

## Current browsing update

Case lists now have numbered pages, a direct page jump, and combined month/year, code, client, and opposing-party filters. Dashboard month counts link to the matching month in the case register. These filters use the judgment date and exclude archived cases unless the archive is selected.
