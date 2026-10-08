# Mawatheeq project workflow

The owner requested on 25 September 2026 that Mawatheeq run through GitHub with shared records, independently of ChatGPT Sites. This supersedes the previous Sites deployment workflow.

## Delivery

- Make the GitHub Pages frontend and Supabase backend the primary application. Approved members share server records and private documents within administrator-assigned permissions; do not substitute browser-only storage.
- Validate requested changes and synchronize them to `Psychonator1000/Mawatheeq` on `main`. The GitHub Pages workflow publishes successful, configured builds automatically.
- Read the current branch and changed files before writing. Preserve unrelated edits and use fast-forward updates only.
- Do not publish future changes to ChatGPT Sites. Preserve the previous private database and files until an explicit, verified migration; never put them in GitHub.
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

- Link the README to the verified GitHub Pages deployment after activation. Do not use a misleading domain label or redirect readers to ChatGPT Sites.
- Only configure `mawatheeq.site` after ownership and DNS setup are confirmed. A custom domain is optional for the GitHub Pages address.

## Office server and document direction

- The owner intends to migrate the whole application, database, attachments, and local username accounts to an office server. Keep future work portable and free; the current hosted backend is an interim arrangement. Staff must never need provider login.
- The previous case data and original uploaded PDF have been restored and verified. Legacy extracted text was incomplete; retain the original and the explicit review requirement. Never overwrite restored office data with an empty seed.
- The 27 September 2026 direction supersedes the 100-PDF automation proposal: build التحصيل later, with each structured collection file linked to a case, and generate صحيفة الدعوى and الحافظة from reviewed civil ID, address, party, claim, and evidence details. See docs/TAHSEEL_PLAN.md. Do not add that section prematurely or discard existing drafts.
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
- Keep private import plans and source workbooks outside the public repository. Use revision checks, snapshots, and reconciliation for shared-data updates. Run `test:excel` when changing workbook parsing.

## Office workflows and source verification

- The 4 October 2026 clarification makes new case entry form-based. PDFs were for building the initial database; attachments remain optional for entry and verification. Never require a PDF to add a case or approve a source-based review.
- Judgment data and execution-announcement reviews are separate. Approval requires the reviewed source type/reference, current case revision, signed-in owner, server timestamp and explicit attestation. Existing dates or free-text review notes must not become approvals automatically.
- Edits invalidate approvals. Optional attachments require the exact link/document revisions the reviewer saw; reject stale submissions. Keep review and change history private.
- Named local staff accounts have owner/editor roles; no email. Tasks/hearings use revision checks, named assignees and date pickers. Existing work can be closed after its case is archived.
- Run `test:office` and the synthetic browser workflow before deploying changes to these controls. Do not use real case mutations as tests.

## User permissions

- Only the owner creates/manages local accounts and grants access. New accounts default to no sections, no cases, read-only, and no report export. The owner cannot be restricted or disabled through staff controls.
- Enforce allowed cases and sections on the server, including documents, client/contact projections, work, history, reviews and exports. Hidden navigation is not authorization. Never restore broad execute grants to private legacy functions or direct table/storage access.
- Changing permissions requires the current permission revision, records an audit entry and revokes sessions. Keep account locking/revalidation so a concurrent stale password request cannot undo an administrator reset.
- Shared client profiles/new case creation require all-case editing and their corresponding section. Restricted case edits preserve client links and historical labels, including omitted keys. Unclassified document studio access requires all-case scope; case evidence must be linked exclusively to allowed cases.
- Run test:permissions, test:local-auth, test:office and the synthetic browser test when changing any of these boundaries. Use synthetic fixtures only. See docs/USER_PERMISSIONS.md.
