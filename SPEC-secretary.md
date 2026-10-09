# Spec: secretary

## Objective and contract
Provide a teal agenda workspace organized around a chosen date, upcoming hearings and overdue tasks, with search, assignees, filters and numbered pages. Reuse existing work_items, work_changes, task completion validation and calendar/time entry. Return only permitted case summaries to department-only secretaries; a case button opens a summary, never an unauthorized full editor. Granting secretary allows work actions within assigned cases; existing legal work access continues to work.

## Acceptance
- A secretary creates, updates and completes a task/hearing; the same record is visible to an authorized legal user.
- Read-only staff cannot save; reassignment to a user without work/case access fails.
- Hidden-case work and histories are excluded before pagination.

## Implementation conventions
Keep React/TypeScript with existing Vite Pages, local username RPCs and private PostgreSQL tables. No dependencies or paid services. Reuse Arabic RTL typography, numbered pagination and DateField. Example: `await departmentRequest('records_page', {workspace: 'collections', offset: 0})`. Put typed contracts in `lib/departments.ts`, UI in `components/departments/`, database changes in a pending SQL file until the actual applied version is assigned.

Commands: `pnpm run check`, `pnpm run test:departments`, `pnpm run test:permissions`, `pnpm run test:office`, `pnpm run test:local-auth`, `pnpm run build:pages`; run synthetic Playwright on the Pages dev server in GitHub CI. Test real migrations in PGlite. Use only synthetic cases, employee records and amounts in tests.

Always enforce grants on the server, validate inputs, preserve revisions and audit edits. Never expose private records in GitHub or change existing case/client values. The user's request authorizes the necessary additive schema, frontend and deployment changes. Ask only for a new paid integration or an unresolved destructive migration. Existing user authorization supersedes routine skill review gates.
