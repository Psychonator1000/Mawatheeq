# User permissions

Requested 5 October 2026: only the administrator creates users and decides which sections and cases each user may access.

## Behavior

- The owner always retains full access. Staff cannot create users, change permissions, reset another password, change office-wide rules, bulk import, merge clients, or download the complete backup.
- New staff start with no sections, no assigned cases, and no editing/export permission. The administrator selects sections, all cases (including future cases) or an explicit case list, editing, and report export. Creation and the initial permissions commit together.
- Sections are independent entry points. Every enabled case-based section uses the same allowed cases; hiding a section does not redact individual fields from an otherwise allowed case. Analytics, search, counters, archived records, reviews and work must not reveal other cases.
- Staff with selected cases see only client names and the contacts used in those cases. Shared client profile editing and new case creation require all-case access, editing and the corresponding section. This prevents a restricted employee from changing shared information used by hidden cases.
- The legacy document studio contains unclassified, potentially multi-case files. Granting it requires all-case access. A restricted user with verification access can open evidence linked exclusively to their allowed cases, but cannot browse the unclassified library or upload/change its files. Attachments remain optional.
- Work is visible only with the work section and an allowed linked case. General work is visible to its assignee/creator, or all-case users. Assignees must be enabled and able to access the work and linked case. A history entry involving a hidden case is omitted.
- Report export permits the app's Excel/print actions for visible records. It cannot prevent a reader from copying or photographing information they can already see. Complete database backups remain administrator-only.
- Permission edits require the current permission revision, record the administrator/time/before/after values, and revoke the target's sessions. New requests use current database permissions. Previously downloaded files cannot be recalled; already issued PDF download links expire after 60 seconds.

## Trust boundaries and abuse cases

The browser and all request parameters are untrusted. The only identity source is the validated opaque local session. Each request checks enabled membership, password rotation and current grants inside Postgres. Private legacy helpers cannot be invoked directly by anonymous or authenticated API roles. Direct table/storage access is closed; the file function checks the same document authorization before issuing a URL.

Test guessed IDs, forged roles, hidden sections via RPC/hash links, read-only writes, client/contact leaks, review/history/export/file access, reassigned work, invalid grants, stale permission edits, expired/revoked sessions and atomic creation. All fixtures are synthetic. Preserve the existing case/review/document validation and optimistic revisions.

## Delivery

No new service. The permission migration is recorded as `20261009092550_user_permissions.sql`, using the actual applied database version. Its SQL passed the PGlite abuse tests and the two-account Chrome workflow before application. Case, document and client fingerprints and review counts were unchanged after application. The tested frontend is delivered through GitHub Pages.

To manage access, sign in as the administrator and open **الإعدادات والبيانات → فريق المكتب والصلاحيات → إضافة موظف**. Select the sections, cases and operations, then save the account. The employee sets a personal password at first login. Use **تعديل الصلاحيات** to change access later; saving ends that employee’s sessions.

If the frontend fails after release, redeploy the previous successful Pages build while preparing a fix. Keep the database permission checks, access grants and audit history in place. Restricted staff may temporarily receive access errors in the previous interface; the administrator retains full access. Do not restore broad table/function grants or discard permission data to recover the UI. Fix backend defects with a reviewed forward migration.
