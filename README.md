# Mawatheeq | مواثيق

Arabic, right-to-left legal case management with shared office records, PDF reading, and Word generation.

## GitHub hosting

This version uses **GitHub Pages for the application** and **Supabase for shared records, private PDFs, and sign-in**.

**[Open Mawatheeq](https://psychonator1000.github.io/Mawatheeq/)**

The GitHub Pages deployment and public sign-in screen are verified. The shared Supabase backend is connected on the Free plan. Sign-in uses a local username and password, with one initial admin account. No email address, Google sign-in, or email verification is required. See [the setup guide](docs/GITHUB_PAGES_SETUP.md).

Share this repository or the app link. Approved members see and edit the same office records from any device. Accounts are provisioned privately; there is no public registration. The password is checked on the server and is never included in the public source.

The GitHub Actions workflow checks and builds every update on `main`, then deploys configured builds automatically. Pull requests run the checks without publishing.

The owner requires a free-only setup: keep the public repository, standard GitHub Actions runners, GitHub Pages address, and Supabase Free plan. Do not purchase domains, upgrade plans, or add paid services. Free quotas and inactivity restrictions can limit availability; see the setup guide.

## Features

- Judgment register, case editing, procedure histories, insurance, and execution tracking.
- Shared records with refresh across users and conflict protection for simultaneous edits.
- Local username sign-in, in-app password changes, and expiring server-verified sessions.
- Deadline reminders, client summaries, and analysis charts.
- Numbered pages and direct page jumps, including Arabic numerals.
- Separate judgment year and month filters, combined with code, client, and opposing-party filters. Select a year, a month across years, or both. Dashboard months open their matching case lists with both date filters selected.
- Excel import/export and case-data backup downloads.
- Arabic PDF scanning and autofill, including JBIG2 scanner images, English date stamps, and Arabic digits.
- Private PDF storage shared with approved office members.
- Review extracted details and generate a statement of claim and document bundle in the office's Word layouts.

## Data

The public repository contains **empty case data** and parameterized Word templates. Client records, original PDFs, credentials, and private database exports are never stored in GitHub.

The previous case records, procedure histories, insurance records, and original uploaded PDF have been restored to the private shared backend. Record counts and the original PDF download were verified. Incomplete legacy OCR text was not treated as a complete document draft; the restored original remains available for review. The case-data JSON download contains cases, procedures, and rules; original PDFs and saved document drafts require a separate storage/database backup.

Only the Supabase project URL and `sb_publishable_` key belong in `public/app-config.json`. They identify the public API; access is enforced by authentication, membership, database grants, and row/storage policies. Never place an administrative or service-role key there.

## Employee workspaces

After login, choose **القضايا، السكرتارية، التحصيل، المحاسبة أو الموارد البشرية** from the workspaces assigned by the administrator. They share private records and case assignments. Collections prepares Word claims and evidence bundles from reviewed structured files; accounting records fees, receipts and expenses; HR manages employee profiles and leave. See [workspace setup and rules](docs/EMPLOYEE_WORKSPACES.md). The deployment remains portable to an office server, with local usernames and no email or provider sign-in for staff.

## Development

Requirements: Node.js 22.13 or later and pnpm 11.25.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The default commands now run the GitHub Pages application. Configure a development Supabase project using the setup guide to test shared data. The old server implementation remains available through `dev:legacy` and `build:legacy`; it is not used by the GitHub workflow.

## Checks and build

```bash
pnpm run check
pnpm run test:domain
pnpm run test:browse
pnpm run test:pdf
pnpm run test:shared
pnpm run test:local-auth
pnpm run build:pages
pnpm run check:pages-config
```

`test:shared` executes the actual SQL migration in PostgreSQL/WASM with fixtures for Supabase's managed auth and storage schemas. It checks allowed and denied access, shared editing, conflict detection, private PDFs, member approval/revocation, and import rollback. Hosted checks confirmed anonymous API denial, unapproved-user database denial, private storage configuration, and denial of unapproved access. The additional `test:local-auth` check executes the username migration with real bcrypt, token expiry/revocation, password changes, lockout, shared-data access, and private file authorization.

The build generates `dist-pages/` and packages OCR assets from locked dependencies. Generated files are excluded from Git. The configuration check intentionally blocks publication until a backend URL and publishable key are present.

For an optional OCR check against a local PDF:

```bash
node scripts/verify-pdf-reader.mjs /absolute/path/to/document.pdf
```

OCR results require review before Word generation. Low-quality pages and missing fields are shown explicitly. Never commit PDFs or test output containing case details.

## Project structure

- `pages/` — standalone app entry, username sign-in, and password changes.
- `lib/local-auth.ts` — local account sessions and authenticated file requests.
- `supabase/functions/local-files/` — session-checked private PDF access.
- `components/` — workspace, case editor, and document studio.
- `lib/shared-backend.ts` — shared records and private PDF access.
- `lib/domain.ts` — judgment and execution rules.
- `lib/pdf-reader.ts` and `lib/document-fields.ts` — PDF/OCR extraction.
- `lib/document-tools.ts` — Word generation.
- `supabase/migrations/` — database functions, grants, and access policies.
- `.github/workflows/pages.yml` — validation and automatic deployment.
- `AGENTS.md` — standing update and data-handling workflow.

### Case categories and client profiles

The main cases screen contains All cases, Execution, Insurance, and Telecom buttons. Adding from a category preselects that classification. Manually creating an execution file does not certify a favorable judgment, absence of an appeal, or legal readiness. Calendar controls replace typed full dates, with month/year selection and a clear action.

The client directory uses stable entity IDs for organizations, individuals, and joint parties. Each profile stores its representatives or contacts, former source spellings, and linked cases. A case separately identifies its client, the person instructing/following up, and any person involved in that case. Names alone do not establish that two entities or people are identical.

Owners can review and merge duplicate profiles. Merges retain original case wording, source profiles, contacts, aliases, and private case snapshots. Unclear source entries remain flagged for review. Excel exports include client and contact sheets, and the JSON export includes the entity directory. The new private schema and username-gated RPC are defined in `supabase/migrations/20260928064201_client_entities.sql`; no real office records or cleanup mappings belong in the public repository. Existing local username login remains the only staff sign-in.

Validate entity relationships and calendar dates with `pnpm test:clients`. `pnpm test:local-auth` also verifies migration of legacy records, entity access denial, merges, revision conflicts, contact boundaries, preservation of original import identity, and compatibility with an older frontend.

## Office verification and daily work

New cases use direct forms. PDF attachments are optional; historical PDF imports are not a prerequisite for case entry or review.

The verification center separates judgment-data reviews from execution-announcement reviews. An owner records the checked source and reference, confirms the comparison, and approves the current case revision. The server records their local username and time. Optional attachments are tied to the precise versions reviewed; later case or evidence changes invalidate the current approval. This records a human source check, not an automated court certification. Case history preserves before/after values from feature activation onward; legacy dates and notes are not auto-approved.

Tasks and hearings have named assignees, date pickers, priority, completion notes, revision conflicts, and in-app overdue/today/upcoming views. Local staff accounts are managed in Settings, without email. The party-name search includes archived cases and aliases and is a preliminary aid, not conflict clearance. Analytics distributions open the included case records and identify the calculation scope.

The JSON data export includes reviews, evidence references, work items, history, and account names, without passwords/session secrets or PDF bytes. Download private attachments separately. See [the office workflows specification](docs/OFFICE_WORKFLOWS.md) for migration and rollback details.

Run `pnpm test:office` for synthetic database and logic tests. `scripts/verify-office-ui.mjs` runs synthetic browser workflows against a local Pages dev server with Playwright; the Pages CI gates deployment on this test. Browser tests use an isolated database and never contact the real backend.
