# Workspace tasks

- [x] 1. Grant keys, chooser routing and administrator controls (permissions.ts, permission-editor.tsx, shared-app.tsx, workspace-hub.tsx). Verify TypeScript and denied/no-access routing.
- [x] 2. Database grants and minimal case-summary endpoint (pending migration, local-auth.ts, departments.ts, verify-departments.mjs). Verify old-grant compatibility and forbidden full-data access.
- [x] 3. Secretary agenda over shared work (secretair.tsx, office-work.tsx, office.ts, pending migration). Verify scoped task/hearing editing and history.
- [x] Checkpoint: permissions/auth/office regressions and foundation build pass.
- [x] 4. Collection storage and forms (pending migration, departments.ts, collections.tsx, record-history.tsx). Verify one file per case, stale review, hidden IDs.
- [ ] 5. Collection document generation/snapshots (pending migration, collections.tsx, collection-documents.ts, verify-departments.mjs). Verify actual Word files and missing fields.
- [x] 6. Accounting ledger (pending migration, accounting.tsx, departments.ts, verify-departments.mjs). Verify exact currency arithmetic, retry and void trail.
- [x] 7. HR profiles and leave (pending migration, hr.tsx, departments.ts, verify-departments.mjs). Verify isolation, valid dates, overlap and history.
- [ ] 8. Shared visual polish and UI workflows (workspaces.css, department-shell.tsx, verify-office-ui.mjs, verify-workspaces-ui.mjs, pages.yml). Verify responsive different layouts and all restricted views.
- [ ] Checkpoint: complete browser flows, build and independent security review pass.
- [ ] 9. Update docs, apply exact tested migration, verify data preservation and publish. Verify production build/deploy and anonymous denial.
