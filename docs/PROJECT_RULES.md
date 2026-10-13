# Mawatheeq project workflow

The owner requested on 25 September 2026 that Mawatheeq run through GitHub with shared records, independently of the previous hosting. This supersedes the previous deployment workflow.

## Delivery

- Make the GitHub Pages frontend and Supabase backend the primary application. Approved members share server records and private documents within administrator-assigned permissions; do not substitute browser-only storage.
- Validate requested changes and synchronize them to `Psychonator1000/Mawatheeq` on `main`. The GitHub Pages workflow publishes successful, configured builds automatically.
- Read the current branch and changed files before writing. Preserve unrelated edits and use fast-forward updates only.
- Do not publish future changes to the previous hosting. Preserve the previous private database and files until an explicit, verified migration; never put them in GitHub.
- Distinguish prepared source, configured backend, and successful deployment. Never describe the app as live unless deployment succeeds.

## Cost constraint

- The owner requires this application to remain free. Keep the repository public, use standard GitHub-hosted runners and GitHub Pages, and keep the Supabase organization on the Free plan.
- Do not upgrade plans, buy domains, add paid compute/storage/backups, enable paid email services, or start paid trials. Do not add payment details. If a free quota is exhausted, reduce usage or explain the limitation; do not introduce charges.
- Use the default GitHub Pages address. The owner requires local usernames and passwords only. Do not add email addresses, email verification/recovery, Google sign-in, or SMTP services to the application.

## Data and access

- Keep the public source free of case records, original PDFs, backups, credentials, and private deployment addresses. Keep `lib/data/seed.json` empty.
- The GitHub page is public, but shared case data and PDFs require a valid local username session and approved office membership. Start with one admin account; there is no public registration. Never embed a password or session token in public files. Store only bcrypt password hashes and SHA-256 session hashes in the private database schema.
- Use only the Supabase project URL and publishable key in public frontend configuration. Never include a service-role key, secret key, password, or management token.
- Keep database grants, row policies, custom session checks, and private storage policies in migrations. Test login failure, token expiry/revocation, data denial, and authorized access. The local-files Edge Function must validate the opaque session before using its server-only storage credentials.
- Preserve conflict checks when more than one person edits a record.
- Keep Word templates parameterized and free of real case details. Generate OCR assets from locked dependencies rather than committing them.

## Links

- Link the README to the verified GitHub Pages deployment after activation. Do not use a misleading domain label or redirect readers to the previous hosting.
- Only configure `mawatheeq.site` after ownership and DNS setup are confirmed. A custom domain is optional for the GitHub Pages address.

## Office server and document direction

- The owner intends to migrate the whole application, database, attachments, and local username accounts to an office server. Keep future work portable and free; the current hosted backend is an interim arrangement. Staff must never need provider login.
- The previous case data and original uploaded PDF have been restored and verified. Legacy extracted text was incomplete; retain the original and the explicit review requirement. Never overwrite restored office data with an empty seed.
- The 9 October 2026 employee-workspace request activates التحصيل: keep one structured file per case and prepare صحيفة الدعوى and الحافظة from reviewed source details. This supersedes the previous deferral and 100-PDF automation proposal. Preserve existing drafts and templates; see docs/EMPLOYEE_WORKSPACES.md.
- Keep judgment year and month as separate filters: either can be selected alone or combined. Dashboard month links select both, and older links with a combined year-month value must keep working. Keep numbered pages, direct jumps, combined filters, and chart counts consistent.

## Client entities and case categories

- Keep execution, insurance, and telecom inside the main cases view. Preserve old execution/insurance links by mapping them to case categories.
- A client entity has its own stable ID. Names, spellings, and representatives are not identity keys for interactive edits. A person may represent multiple entities; never merge companies just because they share a person.
- Keep original `client` and `clientGroup` wording on existing cases. Link the entity and the relevant contact separately; distinguish the contact from a person involved in that particular case.
- Private entity consolidation must preserve source aliases, case snapshots, contacts, and optimistic revision checks. Merge only verified matches; retain review flags for truncated names, uncertain entities, and unverified roles. Never commit a private consolidation plan or real client fixtures.
- `executionFile` records manual classification. It must not silently change the outcome, appeal confirmation, or legal eligibility rules. Insurance and telecom categories include their entities' sectors and explicit per-case flags.
- Use the shared calendar picker for full dates. Preserve date-only ISO values without timezone shifts; keep separate year/month browsing filters.
- Run `test:clients` and the entity tests in `test:local-auth` when changing these relationships.

## Case timing and workbook updates

- Calculate elapsed and remaining calendar days from date-only values. The deadlines page and its export use the selected report date; other case views use today's office date. Unknown dates must not display zero days.
- New workbooks supplement the corrected website data. Preserve existing nonempty values, client links, procedures, and records omitted from a newer workbook. Keep conflicting source values visible for review instead of overwriting corrections.
- Match repeated judgments using their automatic number, date, and parties; a changed office code alone does not make a new judgment. Never import workbook helper tables or cached countdown formulas as case records.
- «استيراد Excel» (`import_workbook`, settings power) previews with a dry run, then adds unmatched judgments (rows without an internal ID included), fills only empty fields of matched judgments and lists differing values and invalid dates in `importReview`; it stops at helper tables pasted under the main sheet and never overwrites website values. Run `test:excel`, `test:office` and the office browser test when changing it.
- Keep private import plans and source workbooks outside the public repository. Use revision checks, snapshots, and reconciliation for shared-data updates. Run `test:excel` when changing workbook parsing.

## Court levels

- Cases move ابتدائي → استئناف → تمييز. The record holds the current level; each level left is kept in `stages` exactly as it stood, with its own number, court, judgment and procedures.
- The server stamps who closed a level and when. Staff may add levels but never change or remove a closed one; only the owner or an admin with the reviews power corrects or undoes. A save without `stages` keeps the existing list. Workbook imports match closed levels too. Run `test:domain` and `test:office` when changing this.

## Staff chat

- Conversations are one-to-one or groups; any employee may start either. Members read and write; the owner or an admin with the chat power may review any conversation read-only, and the panel says so.
- References (people, cases, clients, work) are filtered on the server for both sender and reader; a reader without access sees only the typed label. Edits and deletions are allowed for 15 minutes. Attachments are ≤5 MB in the private `mawatheeq-chat` bucket via the local-files function. Polling only (no Realtime). Run `test:chat` when changing this.

## Office workflows and source verification

- The 4 October 2026 clarification makes new case entry form-based. PDFs were for building the initial database; attachments remain optional for entry and verification. Never require a PDF to add a case or approve a source-based review.
- Judgment data and execution-announcement reviews are separate. Approval requires the reviewed source type/reference, current case revision, signed-in owner, server timestamp and explicit attestation. Existing dates or free-text review notes must not become approvals automatically.
- Edits invalidate approvals. Optional attachments require the exact link/document revisions the reviewer saw; reject stale submissions. Keep review and change history private.
- Named local staff accounts have owner/editor roles; no email. Tasks/hearings use revision checks, named assignees and date pickers. Existing work can be closed after its case is archived.
- Run `test:office` and the synthetic browser workflow before deploying changes to these controls. Do not use real case mutations as tests.

## User permissions

- The owner (the original account) holds every admin power and cannot be restricted, disabled, renamed, reset or switched into by anyone else. The 13 October 2026 request delegates administration: staff accounts may hold specific `adminPowers` (staff, reviews, settings, backup, chat). Any admin with the staff power manages other staff and grants only powers they hold; never their own account or one with powers they lack. New accounts default to no sections, no cases, read-only, no report export and no admin powers.
- Each public request names the power its action needs (`set_power`); `is_owner()` is true only for the owner or a holder of that power in a session of their own. Switched sessions carry no admin powers. Data access still follows sections and case scope.
- New staff start by choosing a job role (manager, lawyer, counsel, secretary, sessions clerk, execution clerk, collections, call centre, accountant, HR, archive, courier/خارجيات, office administrator or custom); «الدور الوظيفي» changes an existing account's role alone or with the role's suggested settings. The role (`jobRole`) only labels the account and preselects editable settings; authority comes solely from the saved sections, case scope and edit/export flags. «Manager» means all pages and cases with edit/export and preselects the admin powers the granter holds.
- Enforce allowed cases and sections on the server, including documents, client/contact projections, work, history, reviews and exports. Hidden navigation is not authorization. Never restore broad execute grants to private legacy functions or direct table/storage access.
- Changing permissions requires the current permission revision, records an audit entry and revokes sessions. Keep account locking/revalidation so a concurrent stale password request cannot undo an administrator reset.
- Shared client profiles/new case creation require all-case editing and their corresponding section. Restricted case edits preserve client links and historical labels, including omitted keys. Unclassified document studio access requires all-case scope; case evidence must be linked exclusively to allowed cases.
- Run test:permissions, test:local-auth, test:office and the synthetic browser test when changing any of these boundaries. Use synthetic fixtures only. See docs/USER_PERMISSIONS.md.

## Employee workspaces

- Selecting legal, secretary, collections, accounting or HR never grants authority. Department grants alone must not authorize the full legal case, client profile, document or other departments' records.
- Keep case assignments shared across case-linked departments. HR profiles are independent of login accounts; only the owner and admins with the staff power administer users.
- Secretary work reuses work_items. Collection source-data edits invalidate source reviews; changes to follow-up fields only (status, assignee, instalments, tags, closing) keep them. Generation checks current file and case revisions and preserves immutable output snapshots.
- Collection statements (إفادات) and payments are records linked to their file and its case. Collection payments, like accounting entries, are immutable in exact fils and are cancelled with an audited reason. Run test:departments and the workspaces browser test when changing collections.
- Keep posted financial entries immutable, with exact minor-unit amounts, separate currencies and audited cancellation reasons. Never introduce paid payment services or payroll calculations implicitly.
- HR leave approval must serialize per employee and reject overlapping approved dates. Keep profile and leave histories.
- The archive workspace (section `archive`, 13 October 2026) tracks physical files: shared locations, files with unique archive numbers, immutable custody movements serialized per file (cancel latest first, with a reason) and requests. Files and their movements follow case scope; locations need all-case scope to change. See docs/EMPLOYEE_WORKSPACES.md.
- Run test:departments and both synthetic browser workflows alongside existing access tests before deployment.
