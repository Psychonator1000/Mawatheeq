-- Prepares a plain PostgreSQL database for the Mawatheeq migrations (run before them on every start; idempotent).
-- Supplies the few hosted-platform objects the migrations expect: API roles, the extensions schema,
-- minimal auth/storage tables, and a private bookkeeping schema for this office server.
-- psql variables: auth_pw (PostgREST login password), files_secret (shared with the file service).
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
end $$;
alter role authenticator with login noinherit password :'auth_pw';
grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, created_at timestamptz not null default now(),
  unique (bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;

-- Office bookkeeping: applied migrations and the file-service secret (stored hashed).
create schema if not exists office;
revoke all on schema office from public;
create table if not exists office.migrations (name text primary key, applied_at timestamptz not null default now());
create table if not exists office.config (key text primary key, value text not null);
insert into office.config values ('files_secret', encode(extensions.digest(:'files_secret', 'sha256'), 'hex'))
  on conflict (key) do update set value = excluded.value;

-- The file service records stored PDFs so documents can reference them, exactly as hosted storage did.
create or replace function public.office_file_register(p_secret text, p_path text, p_remove boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_secret is null or encode(extensions.digest(p_secret, 'sha256'), 'hex') is distinct from (select value from office.config where key = 'files_secret') then
    raise exception 'غير مسموح.' using errcode = '42501';
  end if;
  if p_path is null or p_path !~ '^documents/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$' then raise exception 'مسار الملف غير صالح.'; end if;
  if p_remove then delete from storage.objects where bucket_id = 'mawatheeq-documents' and name = p_path;
  else insert into storage.objects (bucket_id, name) values ('mawatheeq-documents', p_path) on conflict do nothing;
  end if;
  return '{}'::jsonb;
end $$;
revoke all on function public.office_file_register(text, text, boolean) from public;
grant execute on function public.office_file_register(text, text, boolean) to anon;
