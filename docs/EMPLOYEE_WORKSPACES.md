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

In **القضايا → الإعدادات والبيانات → إدارة المستخدمين**, create or edit a named local account. Choose its workspaces and legal sections, all cases or selected cases, and whether editing/exporting is allowed. An employee can have multiple workspaces. New accounts have no access until the administrator assigns it. Saving a permission change ends that employee's existing sessions.

The owner always retains every workspace. HR employee profiles are separate from login accounts; HR access never grants account administration.

## Shared data and boundaries

All workspaces use the same private database and stable case IDs. A department grant alone allows only minimal case identity (code, automatic number, displayed parties, archive status and revision), and its own department records. It does not grant case narratives, court rulings, PDFs, client profiles, financial entries or employee information from other areas.

Assigned-case scope applies to secretary work, collections, and case-linked accounting. General accounting entries require all-case access. HR records require HR access and are independent of case assignments. Read-only accounts cannot save, approve, cancel or archive records. Export grants control the app's export/generation operations; they cannot prevent someone copying information they are authorized to read.

Secretary tasks and hearings are the same records shown in the legal workspace. A secretary's case button opens the permitted identity summary.

## Collections

Create one structured file per case and enter the party identifiers, address, claim and evidence details from the source. No PDF upload is required. Record the source reference, save, then explicitly attest that the saved data matches it. The server records the reviewer, time, file revision and case revision.

Any file edit or archive/reopen clears the review. A changed main case makes the previous review stale. Word generation checks the current revisions, complete template-specific fields and export permission. Each generation saves an immutable data snapshot and template version; the Word file downloads to the user's computer. The app lists creation history; administrators' full backups include those snapshots.

The current claim template is the existing claim following refusal of an order of payment, with service account/telephone details. The screen lists the fields it requires. Files for other case types can be saved, but should not be forced into an inapplicable template. Reviewing a collection source is separate from owner approval of judgment or execution-announcement data.

## Accounting

Posted entries retain their original amount, currency, date, reference and party. Correct an entry by cancelling it with a reason and posting a replacement. Cancellation preserves the original and records the actor and time. Repeated submission of the same entry ID cannot post a second entry.

Amounts use exact integer minor units: three decimal places for KWD; two for SAR, AED, EGP and USD. Totals apply to the selected currency and filters. Outstanding fees = fees minus receipts; net receipts = receipts minus expenses. Cancelled entries do not contribute. This is an office transaction register, not double-entry bookkeeping, payroll, payment execution or a tax calculation system.

## HR

Employee profiles include an internal employee number, name, job title, department, phone, joining date and status. Archive a profile instead of deleting it. Record leave dates and a decision; rejected/cancelled leave requires a reason. Approval rejects any overlapping approved leave for that employee, including requests submitted concurrently. This release does not calculate employment entitlements or payroll.

## Maintenance

Migration `20261010082155_employee_workspaces.sql` introduces private department records, histories and output snapshots, plus the opaque-session RPC `mawatheeq_department_request`. Direct table/helper access remains denied. Existing case, client, document and account records are preserved.

Run `pnpm run check`, `test:departments`, `test:permissions`, `test:office`, `test:local-auth`, `test:clients` and `build:pages`. GitHub CI runs the existing office browser workflow and `scripts/verify-workspaces-ui.mjs` against synthetic PGlite records with real Chrome; it never tests mutations against production.

No new paid service or runtime dependency is required. These records remain portable with the existing PostgreSQL database, source and private attachments for a future office-server migration.
