# Mawatheeq: free hosting and local usernames

The app runs on GitHub Pages, with shared records and private PDFs in Supabase. Accounts use local usernames and passwords. No email address, email verification, Google account, SMTP service, or Supabase Auth identity is required to use the app.

## Hosting and costs

Keep the GitHub repository public, use standard GitHub-hosted runners and GitHub Pages, and keep the Supabase organization on its Free plan. Do not purchase domains, add payment details, upgrade plans, enable paid add-ons, or start paid trials. The app address is https://psychonator1000.github.io/Mawatheeq/.

Free-plan quotas and inactivity restrictions can limit service. Reduce usage instead of upgrading. Current included quotas include 500 MB of database data, 1 GB of file storage, and 500,000 Edge Function invocations. Check [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase) and [Free-plan restrictions](https://supabase.com/docs/guides/platform/billing-faq) before changing the setup.

## Backend deployment

1. Apply the SQL migrations in `supabase/migrations/` in order. The username migration deliberately refuses to replace existing office memberships: migrate any such identities explicitly first. It preserves case data and existing Supabase Auth accounts, which are no longer used by the app.
2. Deploy `supabase/functions/local-files/` as the `local-files` Edge Function. Set `verify_jwt` to **false** for this function: it validates the application's opaque session token in the database before every file operation. Supabase JWTs are not used by username accounts. Keep this custom session validation intact.
3. Use only the project URL and modern publishable key in `public/app-config.json`. Server storage keys come from the Edge Function environment and must never be copied into GitHub or frontend configuration.
4. In GitHub Settings → Pages, choose GitHub Actions. The workflow validates, builds, and deploys updates on `main` automatically.

The SQL migration creates no default credentials. Provision the initial username privately after applying the migrations.

## Initial admin account

Create the first account in the trusted database administration interface using a strong temporary password, never a committed seed or public script. The following is a template; substitute the temporary password privately:

```sql
with account as (
  insert into mawatheeq_private.accounts(username,password_hash,must_change_password)
  values ('admin',extensions.crypt('REPLACE_PRIVATELY_WITH_A_STRONG_TEMPORARY_PASSWORD',extensions.gen_salt('bf',10)),true)
  returning id
)
insert into public.mawatheeq_members(user_id,role)
select id,'owner' from account;
```

The admin signs in with that username and temporary password. Before seeing office records, the app requires a new password of at least 12 characters and no more than 72 UTF-8 bytes. Do not publish the temporary password or its hash in this repository. There is no public registration and no email recovery.

Passwords are checked on the server with bcrypt. Only password hashes and SHA-256 session hashes are stored. Random sessions expire after 24 hours; logout revokes the current session, and a password change revokes other sessions. Failed attempts are rate limited. Sessions are stored in the browser so a refresh can restore access.

All currently approved office usernames share the same records and PDFs. This version starts with one admin account. Additional usernames can be provisioned through trusted administration, using the same account template with the `editor` membership role. Do not add a public account-creation endpoint.

## Password recovery without email

An authorized database administrator can reset a local password through the trusted administration interface. Replace the placeholder privately and verify the username first:

```sql
begin;
update mawatheeq_private.accounts
set password_hash=extensions.crypt('REPLACE_PRIVATELY_WITH_A_NEW_TEMPORARY_PASSWORD',extensions.gen_salt('bf',10)),
    must_change_password=true,failures=0,locked_until=null
where username='admin';
delete from mawatheeq_private.sessions
where user_id=(select id from mawatheeq_private.accounts where username='admin');
commit;
```

## Data and PDF protection

The public GitHub source contains no case records, original PDFs, credentials, or private backups. Data requests validate a local session and office membership before using the existing case/document validation and revision checks. Old email-authenticated RPC entry points are disabled for browser roles.

PDFs remain in a private bucket. The `local-files` function checks the local session, password-change requirement, and permitted file path before issuing a scoped upload token or a download link that expires in 60 seconds. A currently referenced PDF cannot be removed through the cleanup endpoint. Existing signed file links may remain usable for their short validity period after logout.

`pnpm run test:local-auth` executes both real SQL migrations with PostgreSQL/WASM and real pgcrypto, including bcrypt login, denied access, password rotation, session expiry/revocation, lockout, shared editing, conflict protection, private file authorization, and denial of legacy APIs.

## Existing office data

The previous case records, procedures, insurance records, and original PDF have been restored to the private shared backend. Record counts and a byte-for-byte original PDF download were verified. The legacy extracted text was incomplete, so the recovered draft explicitly requires review or rereading from the original. Preserve the previous source and private backup until the complete document workflow is verified. Never put office backups in GitHub.

The owner intends to move the application and all data to an office server. Keep the frontend, database, username accounts, attachments, and templates portable; the hosted backend is an interim setup. Staff use only their Mawatheeq username and password.

## Advisor notes

The private credential/session tables intentionally have RLS enabled with no browser policies or direct browser grants. Only the guarded private functions read them. Supabase may label this default-deny arrangement [RLS enabled with no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Supabase may also report [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) for its separate Auth service. The app no longer uses that service; this flag does not assess the custom username login. Do not upgrade the Free plan to change an unused Auth feature. The app enforces password length, salted bcrypt hashing, rate limits, session expiry, and password-change revocation itself.
