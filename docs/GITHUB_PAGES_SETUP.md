# Activate the shared GitHub Pages app

GitHub Pages serves the app's HTML, JavaScript, fonts, templates, and OCR assets. Supabase provides the shared PostgreSQL database, private PDF storage, and email authentication. No ChatGPT sign-in or ChatGPT hosting is used by this build.

## Free-only setup

The owner requires the application to remain free. Use a public GitHub repository, standard GitHub-hosted runners, GitHub Pages, and a Supabase Free-plan organization. Do not add payment details, upgrade plans, purchase a domain, enable paid add-ons, or start paid trials.

Supabase Free quotas include 500 MB of database data and 1 GB of file storage. Exceeding the Free quota can cause service restrictions; reduce usage instead of upgrading. Free projects may also pause after inactivity. Check the [current quotas](https://supabase.com/docs/guides/platform/billing-on-supabase) and [Free-plan restrictions](https://supabase.com/docs/guides/platform/billing-faq) before changing the setup.

Email delivery is a separate setup item. Only connect an existing no-cost SMTP service or a provider whose free plan and hard limits have been verified. Do not pay for SMTP or disable email verification to work around delivery restrictions. Until email delivery is configured, accounts outside the Supabase project team cannot complete self-service registration or recovery.

## 1. Connect the shared backend

Create or select a Supabase project owned by the office. Apply `supabase/migrations/202609250001_shared_office.sql` through a database migration or the project's SQL editor. It creates empty app tables, member-only read policies, guarded write functions, and a private PDF bucket limited to 25 MiB PDFs.

The migration never creates an owner or grants access to the first person who registers. Run it against the intended project, not an unrelated production database.

The shared schema and private bucket are now applied to the connected Free-plan project, and the public frontend configuration is present. Anonymous API access and unapproved-user database access have been tested. The initial owner account and real sign-in/PDF round trip still need verification.

Configure Supabase Authentication:

- Enable email/password authentication and email confirmation.
- Set the Site URL and allowed redirect URL to `https://psychonator1000.github.io/Mawatheeq/`.
- Add the local development URL only to a development project when needed.
- Configure [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) using a verified free option before onboarding office members. Supabase's default mail service sends only to project-team addresses and is intended for testing.

Put the project's HTTPS URL and **publishable** key into `public/app-config.json`:

```json
{
  "supabaseUrl": "https://YOUR-PROJECT.supabase.co",
  "supabasePublishableKey": "sb_publishable_REPLACE_WITH_PROJECT_KEY"
}
```

The placeholder above is documentation, not a working configuration. Use the key from the actual project. The frontend and deployment check accept `sb_publishable_` keys only. Do not use a database password, personal access token, `sb_secret_` key, or legacy service-role key. Authentication and database/storage policies protect records even though the publishable key is public.

Before publishing, verify in the real project that anonymous and unapproved users cannot read or write records or PDFs. The local `pnpm run test:shared` check exercises the migration's policies, but does not contact the hosted Supabase service.

## 2. Enable GitHub Pages

In the repository's **Settings → Pages**, choose **GitHub Actions** under **Build and deployment → Source**.

Commit the backend configuration and run the **GitHub Pages** workflow (or push to `main`). The workflow installs locked dependencies, runs validation and access tests, builds the static app, checks backend configuration, and publishes `dist-pages/`.

Use the deployment URL shown by the successful workflow. Confirm it opens without ChatGPT and that sign-in, shared records, and saved PDF access work. Only then replace the pending-status notice in the README with the actual app link.

GitHub Pages settings require repository administration access. The source-code connector does not expose this settings operation; an owner can perform it in GitHub's settings.

## 3. Set the initial owner and share access

Create and verify the office owner's account in the app (or in Supabase Authentication). In the trusted Supabase SQL editor, substitute that account's verified email in this bootstrap query:

```sql
insert into public.mawatheeq_members (user_id, role)
select id, 'owner'
from auth.users
where lower(email) = lower('REPLACE_WITH_VERIFIED_OWNER_EMAIL')
  and email_confirmed_at is not null
on conflict (user_id) do update set role = excluded.role;
```

Check that exactly the intended account received the owner role. Do not paste a real owner's email or user ID into a committed migration.

The owner can now open **أعضاء المكتب** in the app. A colleague opens the shared app link, creates an account, and confirms their email. The owner enters that email to grant access. Members share the same records and PDFs; access can be revoked from the same panel. No message or invitation is sent by granting membership itself.

The app refreshes shared case records every 30 seconds and when the tab regains focus. Case and document revisions reject outdated saves rather than overwrite another member's work.

## 4. Migrate existing office data privately

No old production data is included in this repository or transferred by the migration.

Take a private export of the original records, settings, document metadata, and PDF files before moving anything. Existing Excel import supports case records. Transfer document drafts and PDFs through an authenticated migration process, preserving document IDs and storage references. Compare counts, sample records, settings, and original PDF downloads before retiring the old service. Never commit an export or PDF to GitHub.

## Optional custom domain

The default `github.io` address works without buying a domain and is the address for this free setup. Do not purchase `mawatheeq.site`. Only consider a domain later if the owner provides an existing domain and explicitly requests its use. Then verify ownership, configure it in GitHub Pages, change `PAGES_BASE_PATH` in the workflow to `/`, update the Supabase redirect URLs, and follow [GitHub's domain setup](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).

## References

- [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Actions deployment](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Supabase database policies](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase private storage policies](https://supabase.com/docs/guides/storage/security/access-control)
