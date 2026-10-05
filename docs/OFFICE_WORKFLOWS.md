# Office workflows release

The owner delegated feature selection and implementation on 4 October 2026. This release adds the daily controls needed to rely on case records, while preserving the free GitHub Pages setup, private shared data, Arabic interface, local usernames, and portability to the office server.

## Capability map and build order

| Module | Responsibility | Dependency |
| --- | --- | --- |
| office-access | Named staff accounts; owner-controlled creation, suspension and password reset | Existing local sessions |
| case-verification | Optional case attachments, source references, separate judgment/announcement reviews, revision history | Existing cases, documents, office-access |
| office-work | Assigned tasks and hearings, due dates, completion notes, in-app attention list | Existing cases, office-access |
| traceable-analysis | Clickable distributions, verification totals, preliminary party-name checks | case-verification, office-work |

Build order: authenticated database contracts and tests, verification UI, work/staff UI, analysis and navigation, browser tests, deployment.

## Acceptance criteria

- Existing records remain untouched by the schema migration. No approval is inferred from old free-text review notes or a filled announcement date.
- Every new review has a server-authenticated username and server time. Only an office owner can approve. Members can request review with a note.
- Approval needs a saved case revision and the checked source type and precise reference; a PDF is optional. Announcement approval also records the matching notice date, method, recipient and result. It does not certify legal effectiveness independently of the office reviewer.
- Later case saves or changes to the evidence invalidate the displayed approval. Old reviews and case changes remain available; the browser cannot rewrite their actor or time.
- Each analytics distribution links to exactly the same active records used for its count. Verification is a separate filter and never silently removes pending cases from all-case analysis.
- Work items persist centrally, link to a case when relevant, support local account assignment, date pickers, priority, status and completion notes. Hearing dates require a linked case. Optimistic revisions prevent lost updates.
- Tasks and hearings have numbered pagination, assignee/status filters and overdue/today/upcoming views. Reminders are in-app; no email or background notification service is introduced.
- Owners can create editor accounts, suspend/reactivate editors, and reset their passwords. Temporary passwords require changing at first login; password resets/suspension revoke sessions. No public registration, email, or owner self-lockout flow.
- A party-name check searches current and archived case parties and client aliases. It shows matching roles and cases and is explicitly preliminary, never automatic legal conflict clearance.
- New records, evidence links, reviews and work-item history are included in a portable JSON export. PDF bytes remain private files and are downloaded from their case panel.

## Contracts and boundaries

The new `mawatheeq_office_request(token, action, data)` RPC uses the existing opaque local session gate. Its implementation and new tables remain in the private schema with RLS and no direct client table access. All actions validate server-side. Public wrappers are security invokers. The existing file upload/download authorization is reused.

Source: `lib/office.ts`, `lib/office-api.ts`, focused `components/office-*` / `case-verification.tsx`, and an additive SQL migration. Tests: synthetic fixtures in `scripts/verify-office*.mjs`, plus existing auth/domain/browse/client suites. UI follows the existing wine/cream theme and date picker.

Style: explicit TypeScript types and small functions, e.g. `isWorkOverdue(item, today)`; no new dependencies, generic workflow engine or external scheduler.

Always preserve revision checks, original source wording, entity IDs, unknown values, access controls and private evidence. Never commit real office records, test against real records by mutation, or create public attachment URLs. Do not implement التحصيل ahead of its separately planned data model, or add paid services, trust accounting or external messages in this release.

## Verification and release

Run `npm run check`, focused `npm run test:office`, `npm run test:local-auth`, existing relevant regression commands, and `npm run build:pages`. Run the same migration in PGlite with synthetic data, including anonymous denial, editor restrictions, approval staleness, missing source references, optional attachments, forged actor/time, task validation, conflicts and session revocation. Verify the Arabic UI with `scripts/verify-office-ui.mjs` against a Pages dev server and an isolated PGlite database. CI runs it in the standard free GitHub runner Chrome before deployment; Playwright is installed at a pinned version in a temporary test folder only. No production credentials or data enter this test. Apply the tested additive SQL to the shared backend, confirm existing record counts/revisions unchanged, then fast-forward GitHub main and confirm the Pages deployment.

Rollback: restore the prior frontend commit. New private tables/history may remain; do not drop review evidence or work records during rollback. Old frontend and RPCs continue to work.

## Updated direction, 4 October 2026

PDFs served the historical database import. New cases use direct forms. Attaching a PDF is optional for case entry and review. Verification requires the source type and exact reference checked, the signed-in reviewer, timestamp, explicit attestation, and the saved case revision. Optional PDF evidence must still be linked to the same case and match the review scope. Source references document a human check, not an automated court confirmation.

Migration: `supabase/migrations/20261005161605_office_workflows.sql`, applied using the backend-generated version. The migration is additive and leaves existing case payloads and revisions untouched. Private tables intentionally have no direct-client policies: access uses the validated local-session RPC. Supabase Auth password-provider settings do not apply to these local bcrypt accounts.
