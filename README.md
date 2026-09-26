# Mawatheeq | مواثيق

Arabic, right-to-left legal case management with shared office records, PDF reading, and Word generation.

## GitHub hosting

This version uses **GitHub Pages for the application** and **Supabase for shared records, private PDFs, and sign-in**. Visitors do not need ChatGPT.

**[Open Mawatheeq](https://psychonator1000.github.io/Mawatheeq/)**

The GitHub Pages deployment and public sign-in screen are verified. The shared Supabase backend is connected on the Free plan. Initial owner account setup is still pending; follow [the setup guide](docs/GITHUB_PAGES_SETUP.md) to finish authentication and office access.

Share this repository or the app link. Approved members see and edit the same office records from any device. Creating an account alone does not grant access to office data; the owner approves members in the application.

The GitHub Actions workflow checks and builds every update on `main`, then deploys configured builds automatically. Pull requests run the checks without publishing.

The owner requires a free-only setup: keep the public repository, standard GitHub Actions runners, GitHub Pages address, and Supabase Free plan. Do not purchase domains, upgrade plans, or add paid services. Free quotas and inactivity restrictions can limit availability; see the setup guide.

## Features

- Judgment register, case editing, procedure histories, insurance, and execution tracking.
- Shared records with refresh across users and conflict protection for simultaneous edits.
- Owner-managed office membership, email sign-in, and password recovery.
- Deadline reminders, client summaries, and analysis charts.
- Excel import/export and case-data backup downloads.
- Arabic PDF scanning and autofill, including JBIG2 scanner images, English date stamps, and Arabic digits.
- Private PDF storage shared with approved office members.
- Review extracted details and generate a statement of claim and document bundle in the office's Word layouts.

## Data

The public repository contains **empty case data** and parameterized Word templates. Client records, original PDFs, credentials, and private database exports are never stored in GitHub.

The shared database starts empty. Previous records have not been migrated. Export and verify a private backup before any migration. The case-data JSON download contains cases, procedures, and rules; original PDFs and saved document drafts require a separate storage/database backup.

Only the Supabase project URL and `sb_publishable_` key belong in `public/app-config.json`. They identify the public API; access is enforced by authentication, membership, database grants, and row/storage policies. Never place an administrative or service-role key there.

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
pnpm run test:pdf
pnpm run test:shared
pnpm run build:pages
pnpm run check:pages-config
```

`test:shared` executes the actual SQL migration in PostgreSQL/WASM with fixtures for Supabase's managed auth and storage schemas. It checks allowed and denied access, shared editing, conflict detection, private PDFs, member approval/revocation, and import rollback. Hosted checks confirmed anonymous API denial, unapproved-user database denial, private storage configuration, and no Supabase security advisories. Sign-in and a saved-PDF round trip with an approved account still need verification after owner setup.

The build generates `dist-pages/` and packages OCR assets from locked dependencies. Generated files are excluded from Git. The configuration check intentionally blocks publication until a backend URL and publishable key are present.

For an optional OCR check against a local PDF:

```bash
node scripts/verify-pdf-reader.mjs /absolute/path/to/document.pdf
```

OCR results require review before Word generation. Low-quality pages and missing fields are shown explicitly. Never commit PDFs or test output containing case details.

## Project structure

- `pages/` — standalone app entry, sign-in, and office membership.
- `components/` — workspace, case editor, and document studio.
- `lib/shared-backend.ts` — shared records and private PDF access.
- `lib/domain.ts` — judgment and execution rules.
- `lib/pdf-reader.ts` and `lib/document-fields.ts` — PDF/OCR extraction.
- `lib/document-tools.ts` — Word generation.
- `supabase/migrations/` — database functions, grants, and access policies.
- `.github/workflows/pages.yml` — validation and automatic deployment.
- `AGENTS.md` — standing update and data-handling workflow.
