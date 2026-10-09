# Spec: hr

## Objective and contract
Provide a people workspace with employee number, name, job title, department, phone, joining date, employment status and notes. Profiles may exist without login accounts. Provide leave records linked to an employee with type, start/end dates, status (pending/approved/rejected/cancelled), notes and a decision note. Date range is validated; approved overlapping leave is rejected. Preserve histories and archive profiles rather than deleting them. HR does not grant authentication administration, case access, payroll or legal employment-entitlement calculations.

## Acceptance
- Create/edit/archive an employee profile, record leave and review its status with an audit trail.
- Only HR-granted users/owner can list/read/edit these records. Case scope does not disclose HR data.
- Read-only staff cannot mutate; rejected requests require reasons and invalid/overlapping ranges fail.

## Implementation conventions
Keep React/TypeScript with existing Vite Pages, local username RPCs and private PostgreSQL tables. No dependencies or paid services. Reuse Arabic RTL typography, numbered pagination and DateField. Example: `await departmentRequest('records_page', {workspace: 'collections', offset: 0})`. Put typed contracts in `lib/departments.ts`, UI in `components/departments/`, database changes in a pending SQL file until the actual applied version is assigned.

Commands: `pnpm run check`, `pnpm run test:departments`, `pnpm run test:permissions`, `pnpm run test:office`, `pnpm run test:local-auth`, `pnpm run build:pages`; run synthetic Playwright on the Pages dev server in GitHub CI. Test real migrations in PGlite. Use only synthetic cases, employee records and amounts in tests.

Always enforce grants on the server, validate inputs, preserve revisions and audit edits. Never expose private records in GitHub or change existing case/client values. The user's request authorizes the necessary additive schema, frontend and deployment changes. Ask only for a new paid integration or an unresolved destructive migration. Existing user authorization supersedes routine skill review gates.
