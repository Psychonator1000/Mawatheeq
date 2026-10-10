# Workspace tasks

- [x] 1. Grant keys, chooser routing and administrator controls (permissions.ts, permission-editor.tsx, shared-app.tsx, workspace-hub.tsx). Verify TypeScript and denied/no-access routing.
- [x] 2. Database grants and minimal case-summary endpoint (employee_workspaces migration, local-auth.ts, departments.ts, verify-departments.mjs). Verify old-grant compatibility and forbidden full-data access.
- [x] 3. Secretary agenda over shared work (secretair.tsx, office-work.tsx, office.ts, employee_workspaces migration). Verify scoped task/hearing editing and history.
- [x] Checkpoint: permissions/auth/office regressions and foundation build pass.
- [x] 4. Collection storage and forms (employee_workspaces migration, departments.ts, collections.tsx, record-history.tsx). Verify one file per case, stale review, hidden IDs.
- [x] 5. Collection document generation/snapshots (employee_workspaces migration, collections.tsx, collection-documents.ts, verify-departments.mjs). Verify actual Word files and missing fields.
- [x] 6. Accounting ledger (employee_workspaces migration, accounting.tsx, departments.ts, verify-departments.mjs). Verify exact currency arithmetic, retry and void trail.
- [x] 7. HR profiles and leave (employee_workspaces migration, hr.tsx, departments.ts, verify-departments.mjs). Verify isolation, valid dates, overlap and history.
- [x] 8. Shared visual polish and UI workflows (workspaces.css, department-shell.tsx, verify-office-ui.mjs, verify-workspaces-ui.mjs, pages.yml). Verify responsive different layouts and all restricted views.
- [x] Checkpoint: complete browser flows, build and independent security review pass.
- [x] 9. Document the release, apply the exact tested migration, and prepare the verified source for automatic Pages publication. Verify data preservation and anonymous denial.

Release evidence: CI run 38037427813 passed all database, TypeScript, browser (including both Word downloads and cross-tab account replacement) and build checks. Applied migration 20261010082155_employee_workspaces; existing record fingerprints match exactly before/after. Production HTTP probes deny invalid sessions and direct table reads. The main-branch Pages workflow must succeed before this release is reported live.
