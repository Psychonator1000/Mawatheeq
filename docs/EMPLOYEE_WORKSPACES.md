# Employee workspaces

After username login (and any required password change), choose an assigned workspace. Use **تغيير مساحة العمل** to return to the chooser. Refresh retains the choice in that browser tab; a new login starts at the chooser.

| Workspace | Tools | Access required |
|---|---|---|
| القضايا | Existing cases, clients, reviews, reports and administrator settings | One or more existing legal section grants |
| السكرتارية | Daily agenda, tasks, hearings, assignees and work history | secretary |
| التحصيل | Structured case files, source review, claim and evidence-bundle Word preparation | collections |
| المحاسبة | Fees, receipts, expenses, currency-specific balances and cancellation history | accounting |
| الموارد البشرية | Employee profiles, leave requests, decisions and history | hr |

## Administrator setup

In **القضايا → الإعدادات والبيانات → فريق المكتب والصلاحيات**, create or edit a named local account. Choose its workspaces and legal sections, all cases or selected cases, and whether editing/exporting is allowed. An employee can have multiple workspaces. New accounts have no access until the administrator assigns it. Saving a permission change ends that employee's existing sessions.

The owner always retains every workspace. HR employee profiles are separate from login accounts; HR access never grants account administration.

## Shared data and boundaries

All workspaces use the same private database and stable case IDs. A department grant alone allows only minimal case identity (code, automatic number, displayed parties, archive status and revision), and its own department records. It does not grant case narratives, court rulings, PDFs, client profiles, financial entries or employee information from other areas.

Assigned-case scope applies to secretary work, collections, and case-linked accounting. General accounting entries require all-case access. HR records require HR access and are independent of case assignments. Read-only accounts cannot save, approve, cancel or archive records. Export grants control the app's export/generation operations; they cannot prevent someone copying information they are authorized to read.

Secretary tasks and hearings are the same records shown in the legal workspace. A secretary's case button opens the permitted identity summary.

## Collections

Create one structured file per case and enter the party identifiers, address, claim and evidence details from the source. No PDF upload is required. Record the source reference, save, then explicitly attest that the saved data matches it. The server records the reviewer, time, file revision and case revision.

Any file edit or archive/reopen clears the review. A changed main case makes the previous review stale. Word generation checks the current revisions, complete template-specific fields and export permission. Each generation saves an immutable data snapshot and template version; the Word file downloads to the user's computer. The app lists creation history; administrators' full backups include those snapshots.

The current claim template is the existing claim following refusal of an order of payment, with service account/telephone details. The screen lists the fields it requires. Files for other case types can be saved, but should not be forced into an inapplicable template. Reviewing a collection source is separate from owner approval of judgment or execution-announcement data.

The order of payment (أمر الأداء) is the source paper: its details are typed once into the collection file, and both outputs, the statement of claim (صحيفة الدعوى) and the document bundle (حافظة المستندات), are produced from that data. A button fills the bundle with the usual documents derived from the file's own details. The earlier PDF-upload page (إعداد المستندات) was removed on 11 October 2026; drafts it saved remain in the database and the owner's full backup.

### Batch printing

The «طباعة جماعية» view in التحصيل, also shown in the secretary workspace, lists files that are reviewed and complete for the chosen paper. Filter by search or hearing dates, tick files (or «تحديد كل الجاهز»), choose bundle, claim or both, and download one Word file per paper type. Each paper is generated through the same server `generate` action as a single paper, so revision checks, export permission and immutable output snapshots apply to every file; failures are listed without stopping the batch. Each document is its own section with page numbers restarting at 1. A secretary needs the التحصيل section and export permission; the section alone grants no case narrative, client profile or other department data.

## Accounting

Posted entries retain their original amount, currency, date, reference and party. Correct an entry by cancelling it with a reason and posting a replacement. Cancellation preserves the original and records the actor and time. Repeated submission of the same entry ID cannot post a second entry.

Amounts use exact integer minor units: three decimal places for KWD; two for SAR, AED, EGP and USD. Totals apply to the selected currency and filters. Outstanding fees = fees minus receipts; net receipts = receipts minus expenses. Cancelled entries do not contribute. This is an office transaction register, not double-entry bookkeeping, payroll, payment execution or a tax calculation system.

## HR

Employee profiles include an internal employee number, name, job title, department, phone, joining date and status. Archive a profile instead of deleting it. Record leave dates and a decision; rejected/cancelled leave requires a reason. Approval rejects any overlapping approved leave for that employee, including requests submitted concurrently. This release does not calculate employment entitlements or payroll.

## Maintenance

Migration `20261010082155_employee_workspaces.sql` introduces private department records, histories and output snapshots, plus the opaque-session RPC `mawatheeq_department_request`. Direct table/helper access remains denied. Existing case, client, document and account records are preserved.

Run `pnpm run check`, `test:departments`, `test:permissions`, `test:office`, `test:local-auth`, `test:clients` and `build:pages`. GitHub CI runs the existing office browser workflow and `scripts/verify-workspaces-ui.mjs` against synthetic PGlite records with real Chrome; it never tests mutations against production.

No new paid service or runtime dependency is required. These records remain portable with the existing PostgreSQL database, source and private attachments for a future office-server migration.
