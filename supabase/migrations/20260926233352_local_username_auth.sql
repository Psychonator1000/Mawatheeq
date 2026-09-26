begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Credentials and session hashes are never exposed through the Data API.
create table mawatheeq_private.accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check(username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$'),
  password_hash text not null,
  must_change_password boolean not null default true,
  enabled boolean not null default true,
  failures integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create table mawatheeq_private.sessions (
  token_hash bytea primary key,
  user_id uuid not null references mawatheeq_private.accounts(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index local_sessions_user_idx on mawatheeq_private.sessions(user_id);
create table mawatheeq_private.login_rate (
  id boolean primary key default true check(id),
  window_start timestamptz not null,
  attempts integer not null
);
alter table mawatheeq_private.accounts enable row level security;
alter table mawatheeq_private.sessions enable row level security;
alter table mawatheeq_private.login_rate enable row level security;
revoke all on mawatheeq_private.accounts,mawatheeq_private.sessions,mawatheeq_private.login_rate from public,anon,authenticated;

-- Existing office identities must be migrated deliberately. Never discard them.
do $$ begin
  if exists(select 1 from public.mawatheeq_members) then
    raise exception 'Existing office members need a deliberate username migration.';
  end if;
end $$;
alter table public.mawatheeq_members drop constraint mawatheeq_members_user_id_fkey;
alter table public.mawatheeq_members add constraint mawatheeq_members_user_id_fkey foreign key(user_id) references mawatheeq_private.accounts(id) on delete cascade;
alter table public.mawatheeq_audit drop constraint mawatheeq_audit_actor_fkey;
alter table public.mawatheeq_audit add constraint mawatheeq_audit_actor_fkey foreign key(actor) references mawatheeq_private.accounts(id) on delete set null;

create function mawatheeq_private.local_login(p_username text,p_password text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a mawatheeq_private.accounts%rowtype; v_role text; v_token text; attempts integer; v_hash text;
begin
  if octet_length(coalesce(p_password,'')) not between 1 and 72 or length(coalesce(p_username,''))>100 then
    return jsonb_build_object('error','اسم المستخدم أو كلمة المرور غير صحيحة.');
  end if;
  -- Return errors instead of raising so failed-attempt counters are committed.
  insert into mawatheeq_private.login_rate(id,window_start,attempts) values(true,clock_timestamp(),1)
  on conflict(id) do update set
    attempts=case when mawatheeq_private.login_rate.window_start < clock_timestamp()-interval '5 minutes' then 1 else mawatheeq_private.login_rate.attempts+1 end,
    window_start=case when mawatheeq_private.login_rate.window_start < clock_timestamp()-interval '5 minutes' then clock_timestamp() else mawatheeq_private.login_rate.window_start end
  returning mawatheeq_private.login_rate.attempts into attempts;
  if attempts>60 then return jsonb_build_object('error','محاولات كثيرة. انتظر خمس دقائق ثم أعد المحاولة.'); end if;
  select * into a from mawatheeq_private.accounts where username=lower(btrim(p_username)) for update;
  if a.locked_until>clock_timestamp() then return jsonb_build_object('error','تعذر تسجيل الدخول. انتظر عشر دقائق ثم أعد المحاولة.'); end if;
  v_hash:=coalesce(a.password_hash,extensions.crypt('unused-comparison',extensions.gen_salt('bf',10)));
  if extensions.crypt(p_password,v_hash)<>v_hash or a.id is null or not a.enabled then
    if a.id is not null then
      update mawatheeq_private.accounts set failures=case when failures>=7 then 0 else failures+1 end,
        locked_until=case when failures>=7 then clock_timestamp()+interval '10 minutes' else null end where id=a.id;
    end if;
    return jsonb_build_object('error','اسم المستخدم أو كلمة المرور غير صحيحة.');
  end if;
  select role into v_role from public.mawatheeq_members where user_id=a.id;
  if v_role is null then return jsonb_build_object('error','هذا الحساب غير مفعّل في مساحة المكتب.'); end if;
  update mawatheeq_private.accounts set failures=0,locked_until=null where id=a.id;
  delete from mawatheeq_private.sessions where expires_at<clock_timestamp();
  delete from mawatheeq_private.sessions where token_hash in
    (select token_hash from mawatheeq_private.sessions where user_id=a.id order by created_at desc offset 19);
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into mawatheeq_private.sessions(token_hash,user_id,expires_at)
    values(extensions.digest(v_token,'sha256'),a.id,clock_timestamp()+interval '24 hours');
  return jsonb_build_object('token',v_token,'user',jsonb_build_object('id',a.id,'username',a.username,'role',v_role,'mustChangePassword',a.must_change_password));
end $$;

create function mawatheeq_private.local_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a mawatheeq_private.accounts%rowtype; v_role text; v_hash bytea; result jsonb; v_offset integer; v_key text; v_id uuid;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'انتهت الجلسة. سجل الدخول مجدداً.' using errcode='28000'; end if;
  v_hash:=extensions.digest(p_token,'sha256');
  select u.* into a from mawatheeq_private.sessions s join mawatheeq_private.accounts u on u.id=s.user_id
    where s.token_hash=v_hash and s.expires_at>clock_timestamp() and u.enabled;
  if a.id is null then raise exception 'انتهت الجلسة. سجل الدخول مجدداً.' using errcode='28000'; end if;
  select role into v_role from public.mawatheeq_members where user_id=a.id;
  if v_role is null then raise exception 'تم إلغاء صلاحية الوصول.' using errcode='28000'; end if;
  if p_action='logout' then delete from mawatheeq_private.sessions where token_hash=v_hash; return '{}'::jsonb; end if;
  if p_action='session' then return jsonb_build_object('id',a.id,'username',a.username,'role',v_role,'mustChangePassword',a.must_change_password); end if;
  if p_action='password' then
    if extensions.crypt(coalesce(p_data->>'currentPassword',''),a.password_hash)<>a.password_hash then raise exception 'كلمة المرور الحالية غير صحيحة.'; end if;
    if length(coalesce(p_data->>'newPassword',''))<12 or octet_length(p_data->>'newPassword')>72 then raise exception 'استخدم كلمة مرور من 12 حرفاً على الأقل وبحد أقصى 72 بايت.'; end if;
    update mawatheeq_private.accounts set password_hash=extensions.crypt(p_data->>'newPassword',extensions.gen_salt('bf',10)),must_change_password=false,failures=0,locked_until=null where id=a.id;
    delete from mawatheeq_private.sessions where user_id=a.id and token_hash<>v_hash;
    return jsonb_build_object('id',a.id,'username',a.username,'role',v_role,'mustChangePassword',false);
  end if;
  if a.must_change_password then raise exception 'غيّر كلمة المرور المؤقتة أولاً.' using errcode='42501'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>2000000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
  -- The actor comes only from a verified opaque session, never from client input.
  perform set_config('request.jwt.claim.sub',a.id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a.id,'role','authenticated')::text,true);
  v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),1000000));
  case p_action
    when 'cases_page' then
      select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from
        (select id,payload,revision,archived from public.mawatheeq_cases order by id limit 500 offset v_offset) t;
    when 'rules' then select value into result from public.mawatheeq_settings where key='rules';
    when 'save_case' then result:=mawatheeq_private.mawatheeq_save_case(p_data->'case');
    when 'import_cases' then result:=mawatheeq_private.mawatheeq_import_cases(p_data->'cases');
    when 'save_rules' then result:=mawatheeq_private.mawatheeq_save_rules(p_data->'rules');
    when 'documents_page' then
      select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from
        (select id,payload,filename,file_key,revision,updated_at from public.mawatheeq_documents order by id limit 500 offset v_offset) t;
    when 'save_document' then
      result:=mawatheeq_private.mawatheeq_save_document((p_data->>'id')::uuid,p_data->'payload',p_data->>'filename',p_data->>'fileKey',coalesce((p_data->>'revision')::integer,0));
    when 'file_upload' then
      v_id:=(p_data->>'id')::uuid;
      if v_id is null then raise exception 'معرّف المستند مطلوب.'; end if;
      result:=jsonb_build_object('path','documents/'||v_id::text||'/'||gen_random_uuid()::text||'.pdf');
    when 'file_download' then
      select file_key into v_key from public.mawatheeq_documents where id=(p_data->>'id')::uuid;
      if v_key is null then raise exception 'لا يوجد ملف PDF محفوظ لهذا المستند.'; end if;
      result:=jsonb_build_object('path',v_key);
    when 'file_cleanup' then
      v_key:=p_data->>'path';
      if v_key is null or v_key !~ '^documents/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$' or exists(select 1 from public.mawatheeq_documents where file_key=v_key) then raise exception 'لا يمكن حذف هذا الملف.'; end if;
      result:=jsonb_build_object('path',v_key);
    else raise exception 'العملية المطلوبة غير متاحة.';
  end case;
  return coalesce(result,'null'::jsonb);
end $$;

create function public.mawatheeq_local_login(p_username text,p_password text) returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.local_login(p_username,p_password); $$;
create function public.mawatheeq_local_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.local_request(p_token,p_action,p_data); $$;
revoke all on function mawatheeq_private.local_login(text,text),mawatheeq_private.local_request(text,text,jsonb),public.mawatheeq_local_login(text,text),public.mawatheeq_local_request(text,text,jsonb) from public,anon,authenticated;
grant usage on schema mawatheeq_private to anon;
grant execute on function mawatheeq_private.local_login(text,text),mawatheeq_private.local_request(text,text,jsonb),public.mawatheeq_local_login(text,text),public.mawatheeq_local_request(text,text,jsonb) to anon,authenticated,service_role;

-- Old email-authenticated entry points are no longer application APIs.
revoke all on function public.mawatheeq_save_case(jsonb),public.mawatheeq_import_cases(jsonb),public.mawatheeq_save_rules(jsonb),public.mawatheeq_save_document(uuid,jsonb,text,text,integer),public.mawatheeq_list_members(),public.mawatheeq_add_member(text),public.mawatheeq_remove_member(uuid) from anon,authenticated;
notify pgrst,'reload schema';
commit;
