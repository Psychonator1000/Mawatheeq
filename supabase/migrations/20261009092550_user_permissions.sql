begin;

-- No case/document payload or revision is changed by this migration.
create table mawatheeq_private.member_access (
  user_id uuid primary key references mawatheeq_private.accounts(id),
  permissions jsonb not null, revision integer not null default 1,
  updated_by uuid references mawatheeq_private.accounts(id), updated_at timestamptz not null default now()
);
create table mawatheeq_private.access_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references mawatheeq_private.accounts(id),
  before_permissions jsonb, after_permissions jsonb not null, revision integer not null,
  actor_id uuid not null references mawatheeq_private.accounts(id), created_at timestamptz not null default now()
);
alter table mawatheeq_private.member_access enable row level security;
alter table mawatheeq_private.access_changes enable row level security;
revoke all on mawatheeq_private.member_access,mawatheeq_private.access_changes from public,anon,authenticated;

-- Preserve the tested domain validation in private, non-callable implementations.
alter function mawatheeq_private.local_request(text,text,jsonb) rename to local_request_impl;
alter function mawatheeq_private.client_request(text,text,jsonb) rename to client_request_impl;
alter function mawatheeq_private.office_request(text,text,jsonb) rename to office_request_impl;

create function mawatheeq_private.authorize(p_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'انتهت الجلسة. سجل الدخول مجدداً.' using errcode='28000'; end if;
  -- Serialize permission changes against in-flight data requests for this account.
  select a.id into actor from mawatheeq_private.accounts a join mawatheeq_private.sessions s on s.user_id=a.id
    where s.token_hash=extensions.digest(p_token,'sha256') and s.expires_at>clock_timestamp() and a.enabled for share of a;
  if actor is null then raise exception 'انتهت الجلسة. سجل الدخول مجدداً.' using errcode='28000'; end if;
  -- Recheck after acquiring the lock: a permission update may have revoked it.
  perform mawatheeq_private.local_request_impl(p_token,'rules','{}');
  return actor;
end $$;

create function mawatheeq_private.access_for(p_user uuid) returns jsonb
language sql stable set search_path='' as $$
 select case when exists(select 1 from public.mawatheeq_members where user_id=p_user and role='owner') then
  '{"sections":["overview","cases","clients","deadlines","analytics","verification","work","conflicts","documents"],"caseScope":"all","caseIds":[],"canEdit":true,"canExport":true,"revision":0}'::jsonb
 else coalesce((select permissions||jsonb_build_object('revision',revision) from mawatheeq_private.member_access where user_id=p_user),
  '{"sections":[],"caseScope":"selected","caseIds":[],"canEdit":false,"canExport":false,"revision":0}'::jsonb) end;
$$;
create function mawatheeq_private.has_section(p_user uuid,p_section text) returns boolean
language sql stable set search_path='' as $$ select (mawatheeq_private.access_for(p_user)->'sections') ? p_section; $$;
create function mawatheeq_private.can_read_cases(p_user uuid) returns boolean
language sql stable set search_path='' as $$ select (mawatheeq_private.access_for(p_user)->'sections') ?| array['overview','cases','clients','deadlines','analytics','verification','work','conflicts']; $$;
create function mawatheeq_private.can_case(p_user uuid,p_case text) returns boolean
language sql stable set search_path='' as $$
 select mawatheeq_private.can_read_cases(p_user) and
   (mawatheeq_private.access_for(p_user)->>'caseScope'='all' or (mawatheeq_private.access_for(p_user)->'caseIds') ? p_case);
$$;
create function mawatheeq_private.can_document(p_user uuid,p_document uuid) returns boolean
language sql stable set search_path='' as $$
 select (mawatheeq_private.has_section(p_user,'documents') and mawatheeq_private.access_for(p_user)->>'caseScope'='all') or
  (mawatheeq_private.has_section(p_user,'verification')
   and exists(select 1 from mawatheeq_private.case_evidence where document_id=p_document and active)
   and not exists(select 1 from mawatheeq_private.case_evidence where document_id=p_document and active and not mawatheeq_private.can_case(p_user,case_id)));
$$;
create function mawatheeq_private.can_work_payload(p_user uuid,p_item jsonb) returns boolean
language sql stable set search_path='' as $$
 select coalesce(mawatheeq_private.has_section(p_user,'work') and case when coalesce(p_item->>'caseId','')<>''
  then mawatheeq_private.can_case(p_user,p_item->>'caseId')
  else mawatheeq_private.access_for(p_user)->>'caseScope'='all' or p_item->>'assigneeId'=p_user::text end,false);
$$;
alter function mawatheeq_private.office_review_json(mawatheeq_private.case_reviews) rename to office_review_json_impl;
create function mawatheeq_private.office_review_json(r mawatheeq_private.case_reviews) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_set(mawatheeq_private.office_review_json_impl(r),'{evidence}',
  (select coalesce(jsonb_agg(e-'fileKey'),'[]') from jsonb_array_elements(r.evidence) e
   where mawatheeq_private.can_document(auth.uid(),(e->>'documentId')::uuid)));
$$;

create function mawatheeq_private.require_access(allowed boolean) returns void
language plpgsql set search_path='' as $$ begin
 if allowed is not true then raise exception 'لا تملك صلاحية هذه العملية أو السجل.' using errcode='42501'; end if;
end $$;

create function mawatheeq_private.save_access(p_user uuid,p_permissions jsonb,p_revision integer) returns jsonb
language plpgsql set search_path='' as $$
declare old mawatheeq_private.member_access%rowtype; a jsonb; next_revision integer;
begin
 perform mawatheeq_private.require_access(mawatheeq_private.is_owner());
 if not exists(select 1 from public.mawatheeq_members where user_id=p_user and role='editor') then raise exception 'حساب مسؤول المكتب محفوظ ولا يمكن تقييد صلاحياته.' using errcode='42501'; end if;
 -- Lock the account before grants and sessions, in the same order as authorize().
 perform 1 from mawatheeq_private.accounts where id=p_user for update;
 select * into old from mawatheeq_private.member_access where user_id=p_user for update;
 if coalesce(old.revision,0) is distinct from p_revision then raise exception 'تغيرت الصلاحيات. أعد تحميل المستخدم قبل الحفظ.' using errcode='40001'; end if;
 a:=coalesce(p_permissions,'{"sections":[],"caseScope":"selected","caseIds":[],"canEdit":false,"canExport":false}'::jsonb);
 if jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(a->'sections') is distinct from 'array'
  or jsonb_typeof(a->'caseIds') is distinct from 'array' or coalesce(a->>'caseScope','') not in ('all','selected')
  or jsonb_typeof(a->'canEdit') is distinct from 'boolean' or jsonb_typeof(a->'canExport') is distinct from 'boolean'
  or jsonb_array_length(a->'sections')>9 or jsonb_array_length(a->'caseIds')>20000 then raise exception 'إعدادات الصلاحيات غير صالحة.'; end if;
 if exists(select 1 from jsonb_array_elements(a->'sections') s where jsonb_typeof(s)<>'string' or s#>>'{}' not in ('overview','cases','clients','deadlines','analytics','verification','work','conflicts','documents'))
  or exists(select 1 from jsonb_array_elements(a->'caseIds') c where jsonb_typeof(c)<>'string' or not exists(select 1 from public.mawatheeq_cases where id=c#>>'{}')) then raise exception 'اختر أقساماً وقضايا محفوظة صالحة.'; end if;
 if a->>'caseScope'='selected' and a->'sections' ? 'documents' then raise exception 'مكتبة المستندات غير المصنفة تتطلب الوصول إلى جميع القضايا. المرفقات المرتبطة متاحة من التحقق.'; end if;
 a:=jsonb_build_object('sections',(select coalesce(jsonb_agg(distinct s),'[]') from jsonb_array_elements(a->'sections') s),
  'caseScope',a->>'caseScope','caseIds',case when a->>'caseScope'='all' then '[]'::jsonb else (select coalesce(jsonb_agg(distinct c),'[]') from jsonb_array_elements(a->'caseIds') c) end,
  'canEdit',a->'canEdit','canExport',a->'canExport');
 next_revision:=coalesce(old.revision,0)+1;
 insert into mawatheeq_private.member_access(user_id,permissions,revision,updated_by) values(p_user,a,next_revision,auth.uid())
  on conflict(user_id) do update set permissions=excluded.permissions,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into mawatheeq_private.access_changes(user_id,before_permissions,after_permissions,revision,actor_id) values(p_user,old.permissions,a,next_revision,auth.uid());
 delete from mawatheeq_private.sessions where user_id=p_user;
 return a||jsonb_build_object('revision',next_revision);
end $$;

create function mawatheeq_private.local_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; old jsonb; result jsonb; v_offset integer; v_id text;
begin
 if p_action='password' then
  -- A stale password request must not overwrite an administrator's reset.
  perform 1 from mawatheeq_private.accounts u join mawatheeq_private.sessions s on s.user_id=u.id
   where s.token_hash=extensions.digest(p_token,'sha256') for update of u;
  return mawatheeq_private.local_request_impl(p_token,p_action,p_data);
 end if;
 if p_action in ('session','logout') then return mawatheeq_private.local_request_impl(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>2000000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),1000000));
 case p_action
 when 'access' then return a;
 when 'rules' then return mawatheeq_private.local_request_impl(p_token,p_action,p_data);
 when 'cases_page' then
  perform mawatheeq_private.require_access(mawatheeq_private.can_read_cases(actor));
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from
   (select id,payload,revision,archived from public.mawatheeq_cases where mawatheeq_private.can_case(actor,id) order by id limit 500 offset v_offset) t;
  return result;
 when 'save_case' then
  perform mawatheeq_private.require_access((a->>'canEdit')::boolean and mawatheeq_private.has_section(actor,'cases'));
  v_id:=p_data#>>'{case,id}';
  perform pg_advisory_xact_lock(hashtext('mawatheeq-case-writes'));
  select payload into old from public.mawatheeq_cases where id=v_id for update;
  perform mawatheeq_private.require_access(case when old is null then a->>'caseScope'='all' else mawatheeq_private.can_case(actor,v_id) end);
  -- Restricted staff must not probe/mutate a shared entity by changing its link or aliases.
  if a->>'caseScope'<>'all' then
   p_data:=jsonb_set(p_data,'{case}',(select coalesce(jsonb_object_agg(k,old->k),'{}') from unnest(array['client','clientGroup','clientEntityId','clientContactId']) k where old ? k)||(p_data->'case'));
   perform mawatheeq_private.require_access(not exists(select 1 from unnest(array['client','clientGroup','clientEntityId','clientContactId']) k
    where (p_data->'case') ? k and (p_data->'case'->k) is distinct from old->k));
  end if;
 when 'import_cases','save_rules' then perform mawatheeq_private.require_access(mawatheeq_private.is_owner());
 when 'documents_page' then perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'documents') and a->>'caseScope'='all');
 when 'save_document','file_upload','file_cleanup' then
  perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'documents') and a->>'caseScope'='all' and (a->>'canEdit')::boolean);
 when 'file_download' then perform mawatheeq_private.require_access(mawatheeq_private.can_document(actor,(p_data->>'id')::uuid));
 when 'check_export' then
  perform mawatheeq_private.require_access((a->>'canExport')::boolean and mawatheeq_private.can_read_cases(actor)); return '{}'::jsonb;
 else raise exception 'العملية المطلوبة غير متاحة.';
 end case;
 return mawatheeq_private.local_request_impl(p_token,p_action,p_data);
end $$;

create function mawatheeq_private.client_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; result jsonb; full_profiles boolean; v_offset integer;
begin
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>2000000 then raise exception 'الطلب غير صالح.'; end if;
 if p_action in ('list','lookup') then
  perform mawatheeq_private.require_access(case when p_action='list' then mawatheeq_private.has_section(actor,'clients') else mawatheeq_private.can_read_cases(actor) end);
  full_profiles:=a->>'caseScope'='all' and mawatheeq_private.has_section(actor,'clients');
  v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),1000000));
  select coalesce(jsonb_agg(case when full_profiles then t.payload else
    jsonb_build_object('id',t.id,'name',t.payload->'name','kind',t.payload->'kind','sector',t.payload->'sector','needsReview',t.payload->'needsReview','notes','','aliases','[]'::jsonb,
     'contacts',(select coalesce(jsonb_agg(jsonb_build_object('id',p->'id','name',p->'name','role',p->'role','phone','','notes','')),'[]') from jsonb_array_elements(t.payload->'contacts') p
       where exists(select 1 from public.mawatheeq_cases c where c.payload->>'clientEntityId'=t.id::text and c.payload->>'clientContactId'=p->>'id' and mawatheeq_private.can_case(actor,c.id)))) end
    ||jsonb_build_object('id',t.id,'revision',t.revision)),'[]') into result
   from (select e.* from mawatheeq_private.client_entities e where e.merged_into is null and (full_profiles or exists(
    select 1 from public.mawatheeq_cases c where c.payload->>'clientEntityId'=e.id::text and mawatheeq_private.can_case(actor,c.id))) order by e.id limit 500 offset v_offset) t;
  return jsonb_build_object('clients',result,'canMerge',mawatheeq_private.is_owner());
 elsif p_action='save' then
  perform mawatheeq_private.require_access((a->>'canEdit')::boolean and a->>'caseScope'='all' and mawatheeq_private.has_section(actor,'clients'));
 elsif p_action='merge' then
  if not mawatheeq_private.is_owner() then raise exception 'دمج الموكلين متاح لمسؤول المكتب فقط.' using errcode='42501'; end if;
 else raise exception 'العملية المطلوبة غير متاحة.';
 end if;
 return mawatheeq_private.client_request_impl(p_token,p_action,p_data);
end $$;

create function mawatheeq_private.office_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; result jsonb; v_offset integer; owner boolean; v_case text; v_id uuid; old mawatheeq_private.work_items%rowtype; item jsonb;
begin
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor); owner:=mawatheeq_private.is_owner();
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>1000000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),1000000));
 case p_action
 when 'context' then
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'username',u.username,'role',m.role,'enabled',u.enabled)
   ||case when owner then jsonb_build_object('mustChangePassword',u.must_change_password,'permissions',mawatheeq_private.access_for(u.id)) else '{}'::jsonb end order by u.username),'[]') into result
   from mawatheeq_private.accounts u join public.mawatheeq_members m on m.user_id=u.id
   where owner or u.id=actor or (mawatheeq_private.has_section(actor,'work') and u.enabled and mawatheeq_private.has_section(u.id,'work'));
  return jsonb_build_object('members',result,'canManage',owner,'user',mawatheeq_private.local_request_impl(p_token,'session','{}'),'permissions',a);
 when 'create_member','reset_member_password','set_member_enabled','set_member_access','access_history','export_page' then
  if not owner then raise exception 'إدارة المستخدمين والنسخ الكاملة متاحة لمسؤول المكتب فقط.' using errcode='42501'; end if;
  if p_action='create_member' then
   result:=mawatheeq_private.office_request_impl(p_token,p_action,p_data);
   a:=mawatheeq_private.save_access((result->>'id')::uuid,p_data->'permissions',0);
   return result||jsonb_build_object('permissions',a);
  elsif p_action='set_member_access' then
   return mawatheeq_private.save_access((p_data->>'id')::uuid,p_data->'permissions',(p_data->>'revision')::integer);
  elsif p_action='access_history' then
   select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
    select h.id,h.before_permissions as before,h.after_permissions as after,h.revision,u.username as actor,h.created_at as "createdAt"
    from mawatheeq_private.access_changes h join mawatheeq_private.accounts u on u.id=h.actor_id
    where h.user_id=(p_data->>'id')::uuid order by h.id desc limit 50 offset v_offset) t;
   return result;
  end if;
 when 'reviews_page' then
  perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'verification'));
  select coalesce(jsonb_agg(mawatheeq_private.office_review_json(t)),'[]') into result from
   (select distinct on(case_id,scope) * from mawatheeq_private.case_reviews where mawatheeq_private.can_case(actor,case_id) order by case_id,scope,id desc limit 500 offset v_offset) t;
  return result;
 when 'case_file','case_history','review','link_evidence' then
  v_case:=p_data->>'caseId';
  perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'verification') and mawatheeq_private.can_case(actor,v_case));
  if p_action in ('review','link_evidence') then perform mawatheeq_private.require_access((a->>'canEdit')::boolean); end if;
  if p_action='link_evidence' then
   perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'documents') and a->>'caseScope'='all');
  end if;
  result:=mawatheeq_private.office_request_impl(p_token,p_action,p_data);
  if p_action='case_file' then
   -- A PDF shared with a hidden case is not safe to disclose, including its title.
   result:=jsonb_set(result,'{evidence}',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(result->'evidence') e where mawatheeq_private.can_document(actor,(e->>'documentId')::uuid)));
  end if;
  return result;
 when 'work_page' then
  perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'work'));
  select coalesce(jsonb_agg(mawatheeq_private.office_work_json(t)),'[]') into result from
   (select * from mawatheeq_private.work_items where mawatheeq_private.can_work_payload(actor,payload) or
     (mawatheeq_private.has_section(actor,'work') and coalesce(payload->>'caseId','')='' and created_by=actor) order by id limit 500 offset v_offset) t;
  return result;
 when 'save_work','work_history' then
  perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'work'));
  v_id:=case when p_action='save_work' then (p_data#>>'{item,id}')::uuid else (p_data->>'id')::uuid end;
  perform pg_advisory_xact_lock(hashtext('office-work-'||v_id::text));
  select * into old from mawatheeq_private.work_items where id=v_id for update;
  if old.id is not null then
   perform mawatheeq_private.require_access(mawatheeq_private.can_work_payload(actor,old.payload) or (coalesce(old.payload->>'caseId','')='' and old.created_by=actor));
  end if;
  if p_action='work_history' then
   perform mawatheeq_private.require_access(old.id is not null);
   select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'revision',t.revision,'before',t.before_payload,'after',t.after_payload,'actor',u.username,'createdAt',t.created_at) order by t.id desc),'[]') into result
    from (select * from mawatheeq_private.work_changes h where h.work_id=v_id
     and (h.before_payload is null or mawatheeq_private.can_work_payload(actor,h.before_payload) or (coalesce(h.before_payload->>'caseId','')='' and old.created_by=actor))
     and (mawatheeq_private.can_work_payload(actor,h.after_payload) or (coalesce(h.after_payload->>'caseId','')='' and old.created_by=actor))
     order by id desc limit 50 offset v_offset) t join mawatheeq_private.accounts u on u.id=t.actor_id;
   return result;
  end if;
  item:=p_data->'item';
  perform mawatheeq_private.require_access((a->>'canEdit')::boolean and
    (mawatheeq_private.can_work_payload(actor,item) or coalesce(item->>'caseId','')=''));
  if not exists(select 1 from mawatheeq_private.accounts u join public.mawatheeq_members m on m.user_id=u.id
    where u.id=(item->>'assigneeId')::uuid and u.enabled and mawatheeq_private.can_work_payload(u.id,item)) then
   raise exception 'اختر موظفاً فعالاً لديه صلاحية المهام والقضية المرتبطة.' using errcode='42501';
  end if;
 else raise exception 'العملية المطلوبة غير متاحة.';
 end case;
 return mawatheeq_private.office_request_impl(p_token,p_action,p_data);
end $$;

-- Rebind public wrappers after renaming; only session-gated APIs remain callable.
create or replace function public.mawatheeq_local_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.local_request(p_token,p_action,p_data); $$;
create or replace function public.mawatheeq_client_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.client_request(p_token,p_action,p_data); $$;
create or replace function public.mawatheeq_office_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.office_request(p_token,p_action,p_data); $$;
revoke all on all functions in schema mawatheeq_private from public,anon,authenticated;
grant execute on function mawatheeq_private.local_login(text,text),mawatheeq_private.local_request(text,text,jsonb),mawatheeq_private.client_request(text,text,jsonb),mawatheeq_private.office_request(text,text,jsonb) to anon,authenticated,service_role;
revoke all on public.mawatheeq_members,public.mawatheeq_cases,public.mawatheeq_settings,public.mawatheeq_documents,public.mawatheeq_audit from anon,authenticated;
drop policy if exists mawatheeq_files_read on storage.objects;
drop policy if exists mawatheeq_files_create on storage.objects;
drop policy if exists mawatheeq_files_cleanup on storage.objects;
notify pgrst,'reload schema';
commit;
