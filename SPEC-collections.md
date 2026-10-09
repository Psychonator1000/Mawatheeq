# Spec: collections

## Objective and contract
Provide a case-linked collection register and structured document form with party details, civil ID, address, contract/account, claim amount in KWD, relevant dates, source reference and evidence descriptions. Store unknowns blank; use the existing DocumentData and approved parameterized templates. One collection file per case; preserve independent revision/history. Selecting a case pre-fills its displayed code and parties for review but never changes the case or client entity.

An explicit source attestation records reviewer/time/current case revision. Editing invalidates the previous review. Claim/bundle generation requires the corresponding complete fields, current reviewed file, current case revision and export permission. Save an immutable output snapshot with record/case revision and template version. Prior generated snapshots remain separate from edited files. This is document preparation, not court certification. No PDF is required.

## Acceptance
- Create, search, edit, archive/reopen and review a permitted collection file; private field/history access follows its case grant.
- Missing required template fields or stale review prevents output. Generate actual Word outputs from structured fields, with no OCR step.
- No financial receipts or HR fields are exposed from collections.

## Implementation conventions
Keep React/TypeScript with existing Vite Pages, local username RPCs and private PostgreSQL tables. No dependencies or paid services. Reuse Arabic RTL typography, numbered pagination and DateField. Example: `await departmentRequest('records_page', {workspace: 'collections', offset: 0})`. Put typed contracts in `lib/departments.ts`, UI in `components/departments/`, database changes in a pending SQL file until the actual applied version is assigned.

Commands: `pnpm run check`, `pnpm run test:departments`, `pnpm run test:permissions`, `pnpm run test:office`, `pnpm run test:local-auth`, `pnpm run build:pages`; run synthetic Playwright on the Pages dev server in GitHub CI. Test real migrations in PGlite. Use only synthetic cases, employee records and amounts in tests.

Always enforce grants on the server, validate inputs, preserve revisions and audit edits. Never expose private records in GitHub or change existing case/client values. The user's request authorizes the necessary additive schema, frontend and deployment changes. Ask only for a new paid integration or an unresolved destructive migration. Existing user authorization supersedes routine skill review gates.
