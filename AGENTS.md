# Mawatheeq project workflow

The owner requested on 25 September 2026 that Mawatheeq run through GitHub with shared records, independently of ChatGPT Sites. This supersedes the previous Sites deployment workflow.

## Delivery

- Make the GitHub Pages frontend and Supabase backend the primary application. All approved members use the same records and private documents; do not substitute browser-only storage.
- Validate requested changes and synchronize them to `Psychonator1000/Mawatheeq` on `main`. The GitHub Pages workflow publishes successful, configured builds automatically.
- Read the current branch and changed files before writing. Preserve unrelated edits and use fast-forward updates only.
- Do not publish future changes to ChatGPT Sites. Preserve the previous private database and files until an explicit, verified migration; never put them in GitHub.
- Distinguish prepared source, configured backend, and successful deployment. Never describe the app as live unless deployment succeeds.

## Data and access

- Keep the public source free of case records, original PDFs, backups, credentials, and private deployment addresses. Keep `lib/data/seed.json` empty.
- The GitHub page is public, but shared case data and PDFs require an authenticated, approved office membership. New accounts receive no membership automatically.
- Use only the Supabase project URL and publishable key in public frontend configuration. Never include a service-role key, secret key, password, or management token.
- Keep database grants, row policies, and private storage policies in migrations, and test access denial as well as allowed member access.
- Preserve conflict checks when more than one person edits a record.
- Keep Word templates parameterized and free of real case details. Generate OCR assets from locked dependencies rather than committing them.

## Links

- Link the README to the verified GitHub Pages deployment after activation. Do not use a misleading domain label or redirect readers to ChatGPT Sites.
- Only configure `mawatheeq.site` after ownership and DNS setup are confirmed. A custom domain is optional for the GitHub Pages address.
