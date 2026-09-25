# Mawatheeq project workflow

The owner requested on 25 September 2026 that future app updates made with ChatGPT also update the GitHub repository automatically.

## Delivery of app changes

- For each requested application change, validate the change, publish the existing private Mawatheeq Site, and synchronize the corresponding source changes to `Psychonator1000/Mawatheeq` on `main`, unless the user explicitly requests a narrower scope.
- Use the Sites workflow for the live app. Resolve its current identity from the private checkout's hosting manifest or native Sites tools. Preserve its access settings and production records.
- Read the current GitHub branch and relevant files before writing. Preserve unrelated edits; use ordinary commits and fast-forward updates, never a force push.
- Verify the successful live deployment and the GitHub branch/file results before reporting both as complete. If one step fails, report which step remains.
- Documentation-only GitHub changes do not require rebuilding or republishing the unchanged app.

## Public source boundaries

The GitHub repository is public. It contains an intentionally sanitized source copy.

- Keep `lib/data/seed.json` empty, with the typed empty-seed initialization path.
- Exclude real case examples, client records, uploaded PDFs/Word/Excel files, production database or storage exports, credentials, and the production Site identifier.
- Keep the Word templates parameterized and free of case details and personal document metadata.
- Preserve the public setup scripts and tests; OCR assets are generated from the locked dependencies rather than committed.
- Never replace production data with the empty public starter data.

## Opening the application

Live app: https://mawatheeq.amratif15.chatgpt.site
Source repository: https://github.com/Psychonator1000/Mawatheeq

The README's “Open Mawatheeq” link opens the existing authenticated app. GitHub serves the source code; direct GitHub edits do not independently trigger a live deployment. The synchronized delivery above is part of the workflow for requested app changes, not a background GitHub-to-Sites deployment service.
