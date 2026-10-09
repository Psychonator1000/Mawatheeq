# Spec: accounting

## Objective and contract
Provide an accounting ledger for manually entered fees, receipts and expenses with case association, reference, payer/payee, currency, date, amount, notes and a void/reversal reason. Keep posted entries immutable; corrections void an entry with an audited reason and create a replacement. Duplicate submission IDs cannot post twice. Use exact integer minor units (3 decimals for KWD, 2 for SAR/AED/EGP/USD); never combine currencies. Display fees, receipts, expenses, outstanding fees and net receipts for the selected currency and filters. Unlinked office entries require all-case scope. This release records office transactions; it does not calculate statutory taxes, execute payments or implement payroll.

## Acceptance
- Add a fee/receipt/expense and see correct currency-specific totals; void with reason retains the original and its history.
- Restricted accountants see only assigned-case entries and case summaries; legal and HR access alone reveal no ledger data.
- Read-only/export grants, amount/date validation, stale revisions and retry protection are enforced.

## Implementation conventions
Keep React/TypeScript with existing Vite Pages, local username RPCs and private PostgreSQL tables. No dependencies or paid services. Reuse Arabic RTL typography, numbered pagination and DateField. Example: `await departmentRequest('records_page', {workspace: 'collections', offset: 0})`. Put typed contracts in `lib/departments.ts`, UI in `components/departments/`, database changes in a pending SQL file until the actual applied version is assigned.

Commands: `pnpm run check`, `pnpm run test:departments`, `pnpm run test:permissions`, `pnpm run test:office`, `pnpm run test:local-auth`, `pnpm run build:pages`; run synthetic Playwright on the Pages dev server in GitHub CI. Test real migrations in PGlite. Use only synthetic cases, employee records and amounts in tests.

Always enforce grants on the server, validate inputs, preserve revisions and audit edits. Never expose private records in GitHub or change existing case/client values. The user's request authorizes the necessary additive schema, frontend and deployment changes. Ask only for a new paid integration or an unresolved destructive migration. Existing user authorization supersedes routine skill review gates.
