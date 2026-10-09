# Spec: workspace-access

## Objective and contract
After username login/password rotation, show a chooser with only allowed environments. Preserve the existing legal screen and all its section/case/operation controls. Add four section grant keys: secretary, collections, accounting, hr. Existing grants retain their meaning; owner has every key; new accounts default to no access. Existing canEdit/canExport apply to granted environments. Department access alone never grants the full case payload, client profiles or PDFs. Case assignment scope applies equally to all case-linked environments. HR requires its own key, irrespective of case scope.

Create `mawatheeq_department_request(token, action, data)` for department case summaries and records, with deny-by-default actions. Keep auth/permission changes revisioned, audited, session-revoking and admin-only. Selecting a page never provides a role. Secretary work actions continue to use the same work records and domain validation.

## Acceptance
- Refresh retains the selected environment within the session; new login starts at the chooser. Staff with no environments see a clear message. A switch button returns to the chooser.
- Grants hide inaccessible cards and deny forged department/RPC/record IDs on the server. Staff cannot create accounts through HR.
- Department-only accounts cannot call the full case, document or client APIs. Existing legal permissions and links remain compatible.

## Implementation conventions
Keep React/TypeScript with existing Vite Pages, local username RPCs and private PostgreSQL tables. No dependencies or paid services. Reuse Arabic RTL typography, numbered pagination and DateField. Example: `await departmentRequest('records_page', {workspace: 'collections', offset: 0})`. Put typed contracts in `lib/departments.ts`, UI in `components/departments/`, database changes in a pending SQL file until the actual applied version is assigned.

Commands: `pnpm run check`, `pnpm run test:departments`, `pnpm run test:permissions`, `pnpm run test:office`, `pnpm run test:local-auth`, `pnpm run build:pages`; run synthetic Playwright on the Pages dev server in GitHub CI. Test real migrations in PGlite. Use only synthetic cases, employee records and amounts in tests.

Always enforce grants on the server, validate inputs, preserve revisions and audit edits. Never expose private records in GitHub or change existing case/client values. The user's request authorizes the necessary additive schema, frontend and deployment changes. Ask only for a new paid integration or an unresolved destructive migration. Existing user authorization supersedes routine skill review gates.
