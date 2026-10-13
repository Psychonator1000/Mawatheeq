# Employee workspaces

After username login (and any required password change), choose an assigned workspace. Use **تغيير مساحة العمل** to return to the chooser. Refresh retains the choice in that browser tab; a new login starts at the chooser.

| Workspace | Tools | Access required |
|---|---|---|
| القضايا | Existing cases, clients, reviews, reports and administrator settings | One or more existing legal section grants |
| السكرتارية | Daily agenda, tasks, hearings, assignees and work history | secretary |
| التحصيل | Structured case files, source review, claim and evidence-bundle Word preparation | collections |
| المحاسبة | Fees, receipts, expenses, currency-specific balances and cancellation history | accounting |
| الموارد البشرية | Employee profiles, leave requests, decisions and history | hr |
| الأرشيف | Physical files, storage locations, custody hand-outs and returns, file requests, stocktakes, labels and receipts | archive |

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

### Follow-up (13 October 2026)

Modelled on the office's previous collections system. A file window has tabs: بيانات الملف, الأطراف والمطالبة, الحافظة والمستندات, إفادات الملف, الوضع المالي, السجل.

- **File data**: file status and execution-file status (fixed lists), assigned employee, arrival date, batch number, accounting contract, debt reason, required action, order-of-payment fee (added to the claim), instalment, total instalments, delay days, overdue amount, promissory note amount and dates, four free tags (ترقيم 1–4), and closing date and reason. These follow-up fields are not source data for the papers: changing only them keeps a valid source review. Any other change clears it as before.
- **File statements (إفادات)**: categories اتصالات, تنفيذ, عناوين خصوم and إداري. Each statement records the action (from a list, or typed), review date, status (منجز / غير منجز / مؤجل) and text. Calls also record the number, the party called and the method (phone/WhatsApp), with call and WhatsApp links. The server stamps who wrote each statement and when. Statements can be corrected or removed; the history keeps both. Statements that are not done and whose review date has come appear in «المتابعات المستحقة».
- **Financial position**: payments on the file, payments made directly to the client (سداد خارجي) and expenses, in exact fils. Total claim = claim + order-of-payment fee. Remaining = total claim − paid (including external payments). Net collected = paid − expenses. Posted payments are never edited; they are cancelled with a reason, and the cancellation is audited. «طباعة كشف حساب الملف» prints the file's account statement.
- **List**: dashboard totals (claims, collected, remaining, due follow-ups, files needing source review), status chips, filters by batch and assigned employee, and searching by tags and phone. Tick files to distribute or transfer them to an employee, or change their status, in one step. «التحصيلات» lists all payments with type and date filters and totals, and can be printed.

Statements and payments are department records linked to their file (`subject_id`) and carry its case, so the collections section and case scope govern them exactly like the file. Migration `20261013120000_collection_followup.sql`.

### Batch printing

The «طباعة جماعية» view in التحصيل, also shown in the secretary workspace, lists files that are reviewed and complete for the chosen paper. Filter by search or hearing dates, tick files (or «تحديد كل الجاهز»), choose bundle, claim or both, and download one Word file per paper type. Each paper is generated through the same server `generate` action as a single paper, so revision checks, export permission and immutable output snapshots apply to every file; failures are listed without stopping the batch. Each document is its own section with page numbers restarting at 1. A secretary needs the التحصيل section and export permission; the section alone grants no case narrative, client profile or other department data.

## Accounting

Posted entries retain their original amount, currency, date, reference and party. Correct an entry by cancelling it with a reason and posting a replacement. Cancellation preserves the original and records the actor and time. Repeated submission of the same entry ID cannot post a second entry.

Amounts use exact integer minor units: three decimal places for KWD; two for SAR, AED, EGP and USD. Totals apply to the selected currency and filters. Outstanding fees = fees minus receipts; net receipts = receipts minus expenses. Cancelled entries do not contribute. This is an office transaction register, not double-entry bookkeeping, payroll, payment execution or a tax calculation system.

## HR

Employee profiles include an internal employee number, name, job title, department, phone, joining date and status. Archive a profile instead of deleting it. Record leave dates and a decision; rejected/cancelled leave requires a reason. Approval rejects any overlapping approved leave for that employee, including requests submitted concurrently. This release does not calculate employment entitlements or payroll.

## Archive (الأرشيف)

Added 13 October 2026 for the employee responsible for the office's paper files. Grant the «archive» section (job role «أرشيف» preselects it with all cases, edit and export).

- **Locations**: rooms, cabinets, shelves and boxes with a short unique code and an optional capacity. Locations are shared; adding, editing or closing one needs edit rights with all-case scope. A location holding files cannot be closed.
- **Files**: one record per physical file or volume, with a unique archive number (suggested as `ARC-00001`, Latin letters, digits and dashes so it prints as a Code 39 barcode), title, type, volume, page count, home location, originals and confidential flags, intake date and a keep-until date. A file is linked to a case; with all-case scope it may be a general office file. Closing a file (destroyed or retention ended) is allowed only while it is in the archive.
- **Custody**: hand-out to a staff member, sending to an outside body (court, experts, execution…), handing originals to the client, return, move between locations, and inventory confirmation. Each movement is immutable and records who entered it; the server serializes movements per file and checks them against the current state, so a file cannot be handed out twice. A wrong movement is cancelled with a reason, latest first. The current state, holder, due date and place always come from the latest posted movement.
- **Requests**: a colleague's request for a file with the date needed and purpose; «تسليم الملف» opens the hand-out with the request's details and marks it delivered.
- **Overdue and retention**: files past their return date and files past their keep-until date are counted on the dashboard and filterable.
- **Stocktake**: tick (or scan) the files found in a location; each found file gets an inventory movement, and the missing ones can be printed.
- **Printing** (export permission): file labels with barcode and location, hand-over and receipt slips with signature lines, the custody list, location inventory sheets and the movement log. Any USB barcode scanner works in the «مسح الباركود» box without setup.

Migration `20261013150000_archive.sql` extends the department record checks, adds the section to the owner's access and to permission saving, and routes `workspace: 'archive'` requests to their own function. Run `test:departments`, `test:browse` and `scripts/verify-workspaces-ui.mjs` when changing it.

## Maintenance

Migration `20261010082155_employee_workspaces.sql` introduces private department records, histories and output snapshots, plus the opaque-session RPC `mawatheeq_department_request`. Direct table/helper access remains denied. Existing case, client, document and account records are preserved.

Run `pnpm run check`, `test:departments`, `test:permissions`, `test:office`, `test:local-auth`, `test:clients` and `build:pages`. GitHub CI runs the existing office browser workflow and `scripts/verify-workspaces-ui.mjs` against synthetic PGlite records with real Chrome; it never tests mutations against production.

No new paid service or runtime dependency is required. These records remain portable with the existing PostgreSQL database, source and private attachments for a future office-server migration.
