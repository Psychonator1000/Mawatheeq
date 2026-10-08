# Permission release security review

## Authorization

The new permission tests execute the real migrations in isolated PostgreSQL (PGlite), using synthetic cases/accounts only. They cover denied administration, atomic default-deny creation, selected-case and future-case scopes, read-only writes, hidden section RPCs, client/contact projection, shared-PDF and review snapshot redaction, moved-work histories, direct table/storage/private-function bypasses, grant revisions, audit records and session revocation.

An independent review identified two issues that were corrected before release: password changes now lock the account and revalidate the session before updating credentials; restricted case saves restore omitted protected client fields before comparing and saving. Existing office/auth regressions pass alongside these tests.

## Dependencies

`pnpm audit --json` was run against the authoritative lockfile. The reachable spreadsheet-parser findings in `xlsx@0.18.5` were addressed by pinning the official SheetJS Community Edition 0.20.3 tarball and its integrity in `pnpm-lock.yaml`. The package has no install lifecycle script; installation used `--ignore-scripts`. Spreadsheet regression tests pass. Sources: [official installation](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/) and [maintainer security clarification](https://git.sheetjs.com/sheetjs/sheetjs/issues/3332).

The audit still reports findings in the preserved legacy server and development dependency graph. This is not a zero-finding audit:

- Next.js `next/og`, server-side image optimization, React Server Functions, vinext image parsers, sharp and Cloudflare/miniflare undici/ws paths do not run in the GitHub Pages static build/deployment or the browser permission tests. No ImageResponse, RSC server, proxy pool, image server or legacy framework server is started by this release.
- Vite's reported Windows-path dev-server issue is not exposed by the Linux build/test runner, which binds its test server to 127.0.0.1. Do not expose development servers as an office production server.
- Glob/YAML/Browserslist/source-map findings in build/lint tools require attacker-controlled patterns, configuration, statistics or source maps. These inputs are repository-controlled here; office case text/uploads are not processed through those tools.

Review these deferred development/legacy findings by **23 October 2026**, and before enabling the legacy server or any office-server deployment. No audit ignore rules, forced fixes, new paid services or bulk dependency upgrades were introduced.

## Concurrent repository edits

The newer secretary-screen draft and configuration were preserved. Missing imports were fixed and the draft's task/history operations use the existing permission-checked work API; it is not a separate database registry or navigation section. Its optional data field does not force unrelated loaders to fabricate data.

The newly added npm lock snapshot is retained as `docs/npm-lock-reference.json`. `package.json`, CI and the existing project policy consistently specify pnpm 11.25.0; `pnpm-lock.yaml` remains the only installation lockfile.
