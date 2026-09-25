# Mawatheeq | مواثيق

Arabic, right-to-left legal case management with a beige and dark red interface.

## Features

- Judgment register, case editing, procedure histories, insurance, and execution tracking.
- Deadline reminders, client summaries, and analysis charts.
- Excel import/export and backup workflows.
- Arabic PDF scanning and autofill, including JBIG2 scanner images, English date stamps, and Arabic digits.
- Review extracted details and generate a statement of claim and document bundle in the office's Word layouts.

## Source snapshot and data

This repository contains the application source, including the PDF-reader repair. It starts with **empty case data**. Client records, original PDFs, uploaded documents, real-case examples, credentials, and the private production database are not included. The Word templates contain placeholders rather than case details.

The repository is a source snapshot. Publishing GitHub changes does not automatically update the existing hosted application. Production records and files remain in that application's database and file storage.

## Local development

Requirements: Node.js 22.13 or later and pnpm 11.25.0.

```bash
pnpm install --frozen-lockfile
pnpm run setup:ocr
pnpm dev
```

The OCR setup copies PDF image decoders, fonts, workers, and Arabic/English language data from the installed dependencies. These generated assets are excluded from Git. A clean checkout defaults to the portable execution profile; use the local URL printed by the development server.

The app uses Cloudflare D1 (`DB`) and R2 (`BUCKET`). Local development simulates these services. The schema is in `drizzle/`. The development authentication helper provides `/signin-with-chatgpt?return_to=/` for a local mock sign-in.

## Checks and build

```bash
pnpm run check
pnpm run test:pdf
pnpm run test:domain
pnpm build
```

For an optional end-to-end OCR check against a local PDF:

```bash
node scripts/verify-pdf-reader.mjs /absolute/path/to/document.pdf
```

OCR results require review before Word generation. Low-quality pages and missing fields are shown explicitly. Never commit the PDFs or test output containing case details.

## Project structure

- `app/` — pages and server API routes.
- `components/` — workspace, case editor, and document studio.
- `lib/domain.ts` — judgment and execution rules.
- `lib/pdf-reader.ts` — PDF rendering and OCR.
- `lib/document-fields.ts` — field matching, dates, and amount wording.
- `lib/document-tools.ts` — Word generation and document evidence.
- `lib/data/templates.json` — parameterized Word templates.
- `lib/data/seed.json` — empty starter data.
- `drizzle/` and `db/` — schema and database migrations.
- `scripts/copy-ocr-assets.mjs` — reproducible OCR asset setup.

## Hosting

The existing production app uses ChatGPT Sites and Cloudflare Workers. A separate deployment needs its own Site identity, D1 and R2 resources, and authenticated request handling. The included hosting manifest declares the logical bindings only; it does not contain the production Site ID or secrets.
