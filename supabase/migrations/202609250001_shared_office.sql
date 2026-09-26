begin;

create schema if not exists mawatheeq_private;
revoke all on schema mawatheeq_private from public;
grant usage on schema mawatheeq_private to authenticated, service_role;

create table if not exists public.mawatheeq_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  created_at timestamptz not null default now()
);
create table if not exists public.mawatheeq_cases (
  id text primary key,
  payload jsonb not null,
  revision integer not null default 1,
  archived boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.mawatheeq_settings (
  key text primary key,
  value jsonb not null
);
create table if not exists public.mawatheeq_documents (
  id uuid primary key,
  payload jsonb not null,
  filename text not null,
  file_key text,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
create table if not exists public.mawatheeq_audit (
  id uuid primary key default gen_random_uuid(),
  actor uuid references auth.users(id) on delete set null,
  record_id text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create or replace function mawatheeq_private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.mawatheeq_members where user_id = (select auth.uid()));
$$;
create or replace function mawatheeq_private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.mawatheeq_members where user_id = (select auth.uid()) and role = 'owner');
$$;
revoke all on function mawatheeq_private.is_member(), mawatheeq_private.is_owner() from public, anon;
grant execute on function mawatheeq_private.is_member(), mawatheeq_private.is_owner() to authenticated, service_role;

alter table public.mawatheeq_members enable row level security;
alter table public.mawatheeq_cases enable row level security;
alter table public.mawatheeq_settings enable row level security;
alter table public.mawatheeq_documents enable row level security;
alter table public.mawatheeq_audit enable row level security;
revoke all on public.mawatheeq_members, public.mawatheeq_cases, public.mawatheeq_settings, public.mawatheeq_documents, public.mawatheeq_audit from anon, authenticated;
grant select on public.mawatheeq_members, public.mawatheeq_cases, public.mawatheeq_settings, public.mawatheeq_documents, public.mawatheeq_audit to authenticated;
grant all on public.mawatheeq_members, public.mawatheeq_cases, public.mawatheeq_settings, public.mawatheeq_documents, public.mawatheeq_audit to service_role;

drop policy if exists members_read on public.mawatheeq_members;
create policy members_read on public.mawatheeq_members for select to authenticated using (user_id = (select auth.uid()) or (select mawatheeq_private.is_owner()));
drop policy if exists cases_read on public.mawatheeq_cases;
create policy cases_read on public.mawatheeq_cases for select to authenticated using ((select mawatheeq_private.is_member()));
drop policy if exists settings_read on public.mawatheeq_settings;
create policy settings_read on public.mawatheeq_settings for select to authenticated using ((select mawatheeq_private.is_member()));
drop policy if exists documents_read on public.mawatheeq_documents;
create policy documents_read on public.mawatheeq_documents for select to authenticated using ((select mawatheeq_private.is_member()));
drop policy if exists audit_read on public.mawatheeq_audit;
create policy audit_read on public.mawatheeq_audit for select to authenticated using ((select mawatheeq_private.is_owner()));

create or replace function mawatheeq_private.validate_case(c jsonb) returns void
language plpgsql set search_path = '' as $$
declare k text; d text; p jsonb;
begin
  if jsonb_typeof(c) <> 'object' or coalesce(length(c->>'id'),0) not between 1 and 100 or coalesce(btrim(c->>'client'),'') = '' then
    raise exception 'اسم الموكل ومعرّف السجل مطلوبان.';
  end if;
  if length(c::text) > 150000 then raise exception 'حجم السجل كبير جداً.'; end if;
  if coalesce(c->>'executionNote','') <> '' and c->>'executionNote' not in ('تم عمل اجراءات التنفيذ','لم يتم عمل اجراءات التنفيذ','غير متداول','تم فتح ملف التنفيذ','لم يتم فتح ملف التنفيذ','مراجعة المستشار') then
    raise exception 'اختر إحدى ملاحظات التنفيذ المعتمدة.';
  end if;
  if coalesce(c->>'autoNumber','') <> '' and (c->>'autoNumber') !~ '^[0-9]+$' then raise exception 'الرقم الآلي يجب أن يحتوي على أرقام فقط.'; end if;
  foreach k in array array['date','copyDate','notificationDate','announcementDate','originalDate'] loop
    d := c->>k;
    if coalesce(d,'') <> '' then
      if d !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'راجع تنسيق التاريخ.'; end if;
      perform d::date;
    end if;
  end loop;
  if jsonb_typeof(coalesce(c->'procedures','[]'::jsonb)) <> 'array' then raise exception 'قائمة الإجراءات غير صالحة.'; end if;
  for p in select value from jsonb_array_elements(coalesce(c->'procedures','[]'::jsonb)) loop
    foreach k in array array['date','followup'] loop
      d := p->>k;
      if coalesce(d,'') <> '' then
        if d !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'راجع تواريخ الإجراءات والمتابعة.'; end if;
        perform d::date;
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function mawatheeq_private.normalized(v text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(translate(coalesce(v,''),'أإآىة','ااايه'),'[ً-ٟـ]','','g'),'\s+',' ','g'));
$$;
create or replace function mawatheeq_private.import_key(c jsonb) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(c->>'autoNumber',''),c->>'code','') || '|' || coalesce(c->>'date','') || '|' || mawatheeq_private.normalized(c->>'client') || '|' || mawatheeq_private.normalized(c->>'opponent');
$$;
revoke all on function mawatheeq_private.validate_case(jsonb), mawatheeq_private.normalized(text), mawatheeq_private.import_key(jsonb) from public, anon, authenticated;

create or replace function mawatheeq_private.mawatheeq_save_case(p_case jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare old_revision integer; next_revision integer; c jsonb;
begin
  if not mawatheeq_private.is_member() then raise exception 'لا تملك صلاحية الوصول إلى المكتب.' using errcode = '42501'; end if;
  perform mawatheeq_private.validate_case(p_case);
  perform pg_advisory_xact_lock(hashtext('mawatheeq-case-writes'));
  select revision into old_revision from public.mawatheeq_cases where id = p_case->>'id' for update;
  if old_revision is not null and old_revision <> coalesce((p_case->>'revision')::integer,0) then
    raise exception 'تم تعديل هذا السجل بواسطة مستخدم آخر. أعد تحميله قبل الحفظ.' using errcode = '40001';
  end if;
  next_revision := coalesce(old_revision,0)+1;
  c := p_case || jsonb_build_object('revision',next_revision,'archived',coalesce((p_case->>'archived')::boolean,false));
  insert into public.mawatheeq_cases(id,payload,revision,archived) values(c->>'id',c,next_revision,(c->>'archived')::boolean)
  on conflict(id) do update set payload=excluded.payload,revision=excluded.revision,archived=excluded.archived,updated_at=now();
  insert into public.mawatheeq_audit(actor,record_id,action) values(auth.uid(),c->>'id',case when old_revision is null then 'create_case' else 'update_case' end);
  return c;
end;
$$;

create or replace function mawatheeq_private.mawatheeq_import_cases(p_cases jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare input jsonb; c jsonb; added integer := 0;
begin
  if not mawatheeq_private.is_member() then raise exception 'لا تملك صلاحية الوصول إلى المكتب.' using errcode = '42501'; end if;
  if p_cases is null or jsonb_typeof(p_cases) <> 'array' or jsonb_array_length(p_cases) > 400 then raise exception 'ملف الاستيراد غير صالح أو يتجاوز 400 سجل في الدفعة.'; end if;
  perform pg_advisory_xact_lock(hashtext('mawatheeq-case-writes'));
  for input in select value from jsonb_array_elements(p_cases) loop
    c := input || jsonb_build_object('id',gen_random_uuid()::text,'revision',1,'archived',false);
    perform mawatheeq_private.validate_case(c);
    if not exists(select 1 from public.mawatheeq_cases where mawatheeq_private.import_key(payload) = mawatheeq_private.import_key(c)) then
      insert into public.mawatheeq_cases(id,payload,revision,archived) values(c->>'id',c,1,false);
      insert into public.mawatheeq_audit(actor,record_id,action) values(auth.uid(),c->>'id','import_case');
      added := added+1;
    end if;
  end loop;
  return jsonb_build_object('added',added,'skipped',jsonb_array_length(p_cases)-added);
end;
$$;

create or replace function mawatheeq_private.mawatheeq_save_rules(p_rules jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if not mawatheeq_private.is_member() then raise exception 'لا تملك صلاحية الوصول إلى المكتب.' using errcode = '42501'; end if;
  foreach k in array array['first','appeal','objection','execution','warning'] loop
    if coalesce(p_rules->>k,'') !~ '^[0-9]+$' or (p_rules->>k)::integer not between 0 and 365 then raise exception 'المدة يجب أن تكون بين 0 و365 يوماً.'; end if;
  end loop;
  insert into public.mawatheeq_settings(key,value) values('rules',p_rules) on conflict(key) do update set value=excluded.value;
  return p_rules;
end;
$$;

create or replace function mawatheeq_private.mawatheeq_save_document(p_id uuid,p_payload jsonb,p_filename text,p_file_key text,p_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare previous public.mawatheeq_documents%rowtype; next_revision integer; stored_key text;
begin
  if not mawatheeq_private.is_member() then raise exception 'لا تملك صلاحية الوصول إلى المكتب.' using errcode = '42501'; end if;
  if p_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' or length(p_payload::text) > 1000000 or coalesce(length(p_filename),0) not between 1 and 500 then raise exception 'بيانات المستند غير صالحة أو كبيرة جداً.'; end if;
  if p_file_key is not null and (p_file_key not like 'documents/' || p_id::text || '/%.pdf' or not exists(select 1 from storage.objects where bucket_id='mawatheeq-documents' and name=p_file_key)) then raise exception 'ملف PDF غير موجود.'; end if;
  perform pg_advisory_xact_lock(hashtext('mawatheeq-document-' || p_id::text));
  select * into previous from public.mawatheeq_documents where id=p_id for update;
  if previous.id is not null and previous.revision <> coalesce(p_revision,0) then raise exception 'تم تعديل المستند بواسطة مستخدم آخر. أعد فتحه قبل الحفظ.' using errcode = '40001'; end if;
  next_revision := coalesce(previous.revision,0)+1;
  stored_key := coalesce(p_file_key,previous.file_key);
  insert into public.mawatheeq_documents(id,payload,filename,file_key,revision) values(p_id,p_payload,p_filename,stored_key,next_revision)
  on conflict(id) do update set payload=excluded.payload,filename=excluded.filename,file_key=excluded.file_key,revision=excluded.revision,updated_at=now();
  insert into public.mawatheeq_audit(actor,record_id,action) values(auth.uid(),p_id::text,'save_document');
  return jsonb_build_object('id',p_id,'filename',p_filename,'fileKey',stored_key,'revision',next_revision);
end;
$$;

create or replace function mawatheeq_private.mawatheeq_list_members() returns table(user_id uuid,email text,role text)
language plpgsql security definer set search_path = '' as $$
begin
  if not mawatheeq_private.is_owner() then raise exception 'هذه العملية متاحة لمسؤول المكتب فقط.' using errcode = '42501'; end if;
  return query select m.user_id,u.email::text,m.role from public.mawatheeq_members m join auth.users u on u.id=m.user_id order by m.created_at;
end;
$$;
create or replace function mawatheeq_private.mawatheeq_add_member(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare member_id uuid;
begin
  if not mawatheeq_private.is_owner() then raise exception 'هذه العملية متاحة لمسؤول المكتب فقط.' using errcode = '42501'; end if;
  select id into member_id from auth.users where lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null;
  if member_id is null then raise exception 'يجب على الزميل إنشاء حساب وتأكيد بريده أولاً.'; end if;
  insert into public.mawatheeq_members(user_id,role) values(member_id,'editor') on conflict(user_id) do nothing;
end;
$$;
create or replace function mawatheeq_private.mawatheeq_remove_member(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not mawatheeq_private.is_owner() then raise exception 'هذه العملية متاحة لمسؤول المكتب فقط.' using errcode = '42501'; end if;
  if exists(select 1 from public.mawatheeq_members where user_id=p_user_id and role='owner') then raise exception 'لا يمكن إلغاء وصول مسؤول المكتب من هذه الشاشة.'; end if;
  delete from public.mawatheeq_members where user_id=p_user_id;
end;
$$;

revoke all on function mawatheeq_private.mawatheeq_save_case(jsonb),mawatheeq_private.mawatheeq_import_cases(jsonb),mawatheeq_private.mawatheeq_save_rules(jsonb),mawatheeq_private.mawatheeq_save_document(uuid,jsonb,text,text,integer),mawatheeq_private.mawatheeq_list_members(),mawatheeq_private.mawatheeq_add_member(text),mawatheeq_private.mawatheeq_remove_member(uuid) from public,anon;
grant execute on function mawatheeq_private.mawatheeq_save_case(jsonb),mawatheeq_private.mawatheeq_import_cases(jsonb),mawatheeq_private.mawatheeq_save_rules(jsonb),mawatheeq_private.mawatheeq_save_document(uuid,jsonb,text,text,integer),mawatheeq_private.mawatheeq_list_members(),mawatheeq_private.mawatheeq_add_member(text),mawatheeq_private.mawatheeq_remove_member(uuid) to authenticated,service_role;

-- The Data API exposes invoker wrappers; privileged writes remain in the private schema.
create or replace function public.mawatheeq_save_case(p_case jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select mawatheeq_private.mawatheeq_save_case(p_case);
$$;
create or replace function public.mawatheeq_import_cases(p_cases jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select mawatheeq_private.mawatheeq_import_cases(p_cases);
$$;
create or replace function public.mawatheeq_save_rules(p_rules jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select mawatheeq_private.mawatheeq_save_rules(p_rules);
$$;
create or replace function public.mawatheeq_save_document(p_id uuid,p_payload jsonb,p_filename text,p_file_key text,p_revision integer) returns jsonb
language sql security invoker set search_path = '' as $$
  select mawatheeq_private.mawatheeq_save_document(p_id,p_payload,p_filename,p_file_key,p_revision);
$$;
create or replace function public.mawatheeq_list_members() returns table(user_id uuid,email text,role text)
language sql security invoker set search_path = '' as $$
  select * from mawatheeq_private.mawatheeq_list_members();
$$;
create or replace function public.mawatheeq_add_member(p_email text) returns void
language sql security invoker set search_path = '' as $$
  select mawatheeq_private.mawatheeq_add_member(p_email);
$$;
create or replace function public.mawatheeq_remove_member(p_user_id uuid) returns void
language sql security invoker set search_path = '' as $$
  select mawatheeq_private.mawatheeq_remove_member(p_user_id);
$$;

revoke all on function public.mawatheeq_save_case(jsonb),public.mawatheeq_import_cases(jsonb),public.mawatheeq_save_rules(jsonb),public.mawatheeq_save_document(uuid,jsonb,text,text,integer),public.mawatheeq_list_members(),public.mawatheeq_add_member(text),public.mawatheeq_remove_member(uuid) from public,anon;
grant execute on function public.mawatheeq_save_case(jsonb),public.mawatheeq_import_cases(jsonb),public.mawatheeq_save_rules(jsonb),public.mawatheeq_save_document(uuid,jsonb,text,text,integer),public.mawatheeq_list_members(),public.mawatheeq_add_member(text),public.mawatheeq_remove_member(uuid) to authenticated,service_role;

insert into public.mawatheeq_settings(key,value) values('rules','{"first":30,"appeal":60,"objection":15,"execution":30,"warning":5}') on conflict(key) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mawatheeq-documents','mawatheeq-documents',false,26214400,array['application/pdf']) on conflict(id) do nothing;
drop policy if exists mawatheeq_files_read on storage.objects;
create policy mawatheeq_files_read on storage.objects for select to authenticated using(bucket_id='mawatheeq-documents' and (select mawatheeq_private.is_member()));
drop policy if exists mawatheeq_files_create on storage.objects;
create policy mawatheeq_files_create on storage.objects for insert to authenticated with check(bucket_id='mawatheeq-documents' and name like 'documents/%.pdf' and (select mawatheeq_private.is_member()));
drop policy if exists mawatheeq_files_cleanup on storage.objects;
create policy mawatheeq_files_cleanup on storage.objects for delete to authenticated using(bucket_id='mawatheeq-documents' and (select mawatheeq_private.is_member()) and not exists(select 1 from public.mawatheeq_documents where file_key=name));

create index if not exists mawatheeq_cases_import_key_idx on public.mawatheeq_cases(mawatheeq_private.import_key(payload));
create index if not exists mawatheeq_documents_file_key_idx on public.mawatheeq_documents(file_key) where file_key is not null;
create index if not exists mawatheeq_audit_actor_idx on public.mawatheeq_audit(actor);

commit;
