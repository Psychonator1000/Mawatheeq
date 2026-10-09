# Implementation plan: employee workspaces

Scope and dependency index: `CAPABILITIES-workspaces.md` and `SPEC-*.md`. Existing permissions, free hosting, local usernames and private shared data remain.

1. Add grant keys and a chooser, plus minimal case summary API. Verify backward-compatible and default-deny access.
2. Connect the secretary agenda to existing work records and histories. Verify cross-workspace identity and scope.
3. Add private department record storage with revision/history; implement collection file forms/review/Word outputs.
4. Implement posted finance records with exact money, immutable originals, void reasons and currency-aware totals.
5. Implement HR profiles and leave approval with strict department isolation.
6. Run synthetic abuse tests and desktop/mobile browser flows; independently review authorization changes.
7. Apply tested additive migration, verify existing record fingerprints, and fast-forward reviewed source to GitHub for automatic Pages deployment.

Risks: department-only accounts must not inherit broad case access; metadata and histories can leak hidden cases; financial edits require an immutable trail; grants/reviews/updates must reject stale revisions. Avoid duplicating existing case/employee login identities.

Rollback: preserve new private tables, audit records and deny rules; revert only UI if necessary and use a reviewed forward migration for backend fixes. No private fixtures in GitHub.
