begin;
-- Additive department storage. Existing cases, clients and documents stay untouched.
create function mawatheeq_private.case_assigned(p_user uuid,p_case text) returns boolean
language sql stable set search_path='' as $$
 select coalesce(mawatheeq_private.access_for(p_user)->>'caseScope'='all' or (mawatheeq_private.access_for(p_user)->'caseIds') ? p_case,false);
$$;
create function mawatheeq_private.can_access_work(p_user uuid) returns boolean
language sql stable set search_path='' as $$
 select mawatheeq_private.has_section(p_user,'work') or mawatheeq_private.has_section(p_user,'secretary');
$$;
create or replace function mawatheeq_private.can_work_payload(p_user uuid,p_item jsonb) returns boolean
language sql stable set search_path='' as $$
 select coalesce(mawatheeq_private.can_access_work(p_user) and case when coalesce(p_item->>'caseId','')<>''
  then mawatheeq_private.case_assigned(p_user,p_item->>'caseId')
  else mawatheeq_private.access_for(p_user)->>'caseScope'='all' or p_item->>'assigneeId'=p_user::text end,false);
$$;
create or replace function mawatheeq_private.access_for(p_user uuid) returns jsonb
language sql stable set search_path='' as $$
 select case when exists(select 1 from public.mawatheeq_members where user_id=p_user and role='owner') then
  '{"sections":["overview","cases","clients","deadlines","analytics","verification","work","conflicts","documents","secretary","collections","accounting","hr"],"caseScope":"all","caseIds":[],"canEdit":true,"canExport":true,"revision":0}'::jsonb
 else coalesce((select permissions||jsonb_build_object('revision',revision) from mawatheeq_private.member_access where user_id=p_user),
  '{"sections":[],"caseScope":"selected","caseIds":[],"canEdit":false,"canExport":false,"revision":0}'::jsonb) end;
$$;

create or replace function mawatheeq_private.save_access(p_user uuid,p_permissions jsonb,p_revision integer) returns jsonb
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
  or jsonb_array_length(a->'sections')>13 or jsonb_array_length(a->'caseIds')>20000 then raise exception 'إعدادات الصلاحيات غير صالحة.'; end if;
 if exists(select 1 from jsonb_array_elements(a->'sections') s where jsonb_typeof(s)<>'string' or s#>>'{}' not in ('overview','cases','clients','deadlines','analytics','verification','work','conflicts','documents','secretary','collections','accounting','hr'))
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

create or replace function mawatheeq_private.office_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
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
   where owner or u.id=actor or (mawatheeq_private.can_access_work(actor) and u.enabled and mawatheeq_private.can_access_work(u.id));
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
  perform mawatheeq_private.require_access(mawatheeq_private.can_access_work(actor));
  select coalesce(jsonb_agg(mawatheeq_private.office_work_json(t)),'[]') into result from
   (select * from mawatheeq_private.work_items where mawatheeq_private.can_work_payload(actor,payload) or
     (mawatheeq_private.can_access_work(actor) and coalesce(payload->>'caseId','')='' and created_by=actor) order by id limit 500 offset v_offset) t;
  return result;
 when 'save_work','work_history' then
  perform mawatheeq_private.require_access(mawatheeq_private.can_access_work(actor));
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

create table mawatheeq_private.department_records (
 id uuid primary key,
 workspace text not null check(workspace in ('collections','accounting','hr')),
 kind text not null,
 case_id text references public.mawatheeq_cases(id),
 subject_id uuid references mawatheeq_private.department_records(id),
 payload jsonb not null,
 review jsonb,
 revision integer not null default 1,
 archived boolean not null default false,
 created_by uuid not null references mawatheeq_private.accounts(id),
 updated_by uuid not null references mawatheeq_private.accounts(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((workspace='collections' and kind='file' and case_id is not null and subject_id is null)
    or (workspace='accounting' and kind='entry' and subject_id is null)
    or (workspace='hr' and case_id is null and (kind='employee' and subject_id is null or kind='leave' and subject_id is not null)))
);
create unique index department_collection_case on mawatheeq_private.department_records(case_id) where workspace='collections';
create unique index department_employee_number on mawatheeq_private.department_records(lower(payload->>'employeeNumber')) where workspace='hr' and kind='employee';
create index department_case on mawatheeq_private.department_records(workspace,case_id);
create index department_subject on mawatheeq_private.department_records(subject_id);
create table mawatheeq_private.department_changes (
 id bigint generated always as identity primary key,
 record_id uuid not null references mawatheeq_private.department_records(id),
 before_record jsonb, after_record jsonb not null, revision integer not null,
 actor_id uuid not null references mawatheeq_private.accounts(id),
 created_at timestamptz not null default now()
);
create index department_changes_record on mawatheeq_private.department_changes(record_id,id);
create table mawatheeq_private.department_outputs (
 id uuid primary key,
 record_id uuid not null references mawatheeq_private.department_records(id),
 record_revision integer not null, case_revision integer not null,
 kind text not null check(kind in ('claim','bundle')), template_version text not null,
 payload jsonb not null,
 actor_id uuid not null references mawatheeq_private.accounts(id),
 created_at timestamptz not null default now()
);
create index department_outputs_record on mawatheeq_private.department_outputs(record_id,created_at);
alter table mawatheeq_private.department_records enable row level security;
alter table mawatheeq_private.department_changes enable row level security;
alter table mawatheeq_private.department_outputs enable row level security;
revoke all on mawatheeq_private.department_records,mawatheeq_private.department_changes,mawatheeq_private.department_outputs from public,anon,authenticated;

create function mawatheeq_private.department_visible(p_user uuid,w text,c text) returns boolean
language sql stable set search_path='' as $$
 select mawatheeq_private.has_section(p_user,w) and
  (w='hr' or case when c is null then mawatheeq_private.access_for(p_user)->>'caseScope'='all' else mawatheeq_private.case_assigned(p_user,c) end);
$$;
create function mawatheeq_private.department_json(r mawatheeq_private.department_records) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'workspace',r.workspace,'kind',r.kind,'caseId',coalesce(r.case_id,''),'subjectId',coalesce(r.subject_id::text,''),
  'payload',r.payload,'review',r.review,'revision',r.revision,'archived',r.archived,'createdAt',r.created_at,'updatedAt',r.updated_at,
  'createdBy',a.username,'updatedBy',b.username)
 from mawatheeq_private.accounts a,mawatheeq_private.accounts b where a.id=r.created_by and b.id=r.updated_by;
$$;
create function mawatheeq_private.department_date(v text,required boolean default false) returns void
language plpgsql set search_path='' as $$ begin
 if coalesce(v,'')='' and not required then return; end if;
 if coalesce(v,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'اختر تاريخاً صالحاً.'; end if;
 perform v::date;
end $$;
-- Whitelisted, bounded strings only. Server metadata is never copied from the caller.
create function mawatheeq_private.department_fields(p jsonb,keys text[]) returns jsonb
language plpgsql set search_path='' as $$
declare k text; result jsonb:='{}';
begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'بيانات السجل غير صالحة.'; end if;
 foreach k in array keys loop
  if p ? k and jsonb_typeof(p->k)<>'string' then raise exception 'راجع قيمة الحقل %.',k; end if;
  if length(coalesce(p->>k,''))>5000 then raise exception 'النص طويل جداً: %.',k; end if;
  result:=result||jsonb_build_object(k,btrim(coalesce(p->>k,'')));
 end loop;
 return result;
end $$;
create function mawatheeq_private.department_payload(w text,k text,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb; field text; e jsonb; evidence jsonb:='[]'; decimals integer; minor bigint;
begin
 if w='collections' and k='file' then
  result:=mawatheeq_private.department_fields(p,array['company','defendant','civilId','nationality','address','address2','amount','amountWords','account','phone','orderNumber','court','rejectedDate','demandDate','statementDate','companyCivil','companyRegister','email','code','hearingCourt','hearingDay','hearingDate','hearingCircuit','lawsuitNumber','lawsuitYear','receiptDate','receiptFee','receiptNumber','orderAuto','sourceReference','notes']);
  foreach field in array array['rejectedDate','demandDate','statementDate','hearingDate','receiptDate'] loop perform mawatheeq_private.department_date(result->>field); end loop;
  foreach field in array array['amount','receiptFee'] loop
   if result->>field<>'' and (result->>field !~ '^[0-9]{1,9}([.][0-9]{1,3})?$' or (result->>field)::numeric<=0) then raise exception 'أدخل مبلغاً موجباً بالدينار الكويتي حتى ثلاث خانات عشرية.'; end if;
  end loop;
  if coalesce(p->'evidence','[]') is not null and jsonb_typeof(coalesce(p->'evidence','[]'))<>'array' then raise exception 'راجع قائمة المستندات.'; end if;
  if jsonb_array_length(coalesce(p->'evidence','[]'))>100 then raise exception 'الحد الأقصى 100 مستند في الحافظة.'; end if;
  for e in select value from jsonb_array_elements(coalesce(p->'evidence','[]')) loop
   perform mawatheeq_private.department_date(e->>'date');
   if jsonb_typeof(e->'included') is distinct from 'boolean' or coalesce(e->>'pages','') !~ '^[0-9]{1,4}$' or (e->>'pages')::int<1
     or jsonb_typeof(e->'description') is distinct from 'string' or length(btrim(e->>'description')) not between 1 and 5000 then raise exception 'أكمل وصف المستند وعدد صفحاته.'; end if;
   evidence:=evidence||jsonb_build_array(mawatheeq_private.department_fields(e,array['id','date','description'])||jsonb_build_object('included',e->'included','pages',(e->>'pages')::int));
  end loop;
  return result||jsonb_build_object('evidence',evidence);
 elsif w='accounting' and k='entry' then
  result:=mawatheeq_private.department_fields(p,array['type','date','currency','amount','reference','party','notes']);
  if result->>'type' not in ('fee','receipt','expense') or result->>'currency' not in ('KWD','SAR','AED','EGP','USD') then raise exception 'اختر نوع القيد والعملة.'; end if;
  perform mawatheeq_private.department_date(result->>'date',true);
  decimals:=case when result->>'currency'='KWD' then 3 else 2 end;
  if result->>'amount' !~ ('^[0-9]{1,9}([.][0-9]{1,'||decimals||'})?$') then raise exception 'راجع المبلغ وعدد الخانات العشرية للعملة.'; end if;
  minor:=((result->>'amount')::numeric*power(10,decimals))::bigint;
  if minor<=0 or result->>'reference'='' or result->>'party'='' then raise exception 'أدخل مبلغاً موجباً ومرجعاً واسم الدافع أو المستفيد.'; end if;
  return result||jsonb_build_object('amountMinor',minor::text,'status','posted','voidReason','');
 elsif w='hr' and k='employee' then
  result:=mawatheeq_private.department_fields(p,array['employeeNumber','name','title','department','phone','startDate','status','notes']);
  if result->>'employeeNumber'='' or result->>'name'='' or result->>'status' not in ('active','inactive') then raise exception 'أكمل رقم الموظف واسمه وحالته.'; end if;
  perform mawatheeq_private.department_date(result->>'startDate');
  return result;
 elsif w='hr' and k='leave' then
  result:=mawatheeq_private.department_fields(p,array['type','fromDate','toDate','status','notes','decisionNote']);
  if result->>'type'='' or result->>'status' not in ('pending','approved','rejected','cancelled') then raise exception 'أكمل نوع الإجازة وحالتها.'; end if;
  perform mawatheeq_private.department_date(result->>'fromDate',true); perform mawatheeq_private.department_date(result->>'toDate',true);
  if result->>'fromDate'>result->>'toDate' then raise exception 'نهاية الإجازة تسبق بدايتها.'; end if;
  if result->>'status' in ('rejected','cancelled') and result->>'decisionNote'='' then raise exception 'دوّن سبب رفض الإجازة أو إلغائها.'; end if;
  return result;
 end if;
 raise exception 'نوع السجل غير متاح.';
end $$;

create function mawatheeq_private.department_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; w text; result jsonb; r mawatheeq_private.department_records%rowtype; old jsonb;
 item jsonb; v_id uuid; v_case text; subject uuid; v_offset integer; next_payload jsonb; field text;
 c public.mawatheeq_cases%rowtype; outrow mawatheeq_private.department_outputs%rowtype; output_id uuid;
begin
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>250000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 w:=p_data->>'workspace';
 perform mawatheeq_private.require_access(w in ('secretary','collections','accounting','hr') and mawatheeq_private.has_section(actor,w));
 v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),1000000));
 if p_action='cases_page' then
  perform mawatheeq_private.require_access(w<>'hr');
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
   select cs.id,coalesce(cs.payload->>'code','') as code,coalesce(cs.payload->>'autoNumber','') as "autoNumber",
    coalesce(cs.payload->>'client','') as client,coalesce(cs.payload->>'clientGroup','') as "clientGroup",
    coalesce(e.payload->>'name','') as "clientEntityName",coalesce(cs.payload->>'opponent','') as opponent,cs.revision,cs.archived
   from public.mawatheeq_cases cs left join mawatheeq_private.client_entities e on e.id::text=cs.payload->>'clientEntityId'
   where mawatheeq_private.case_assigned(actor,cs.id) order by cs.id limit 500 offset v_offset
  ) t; return result;
 elsif p_action='check_export' then
  perform mawatheeq_private.require_access((a->>'canExport')::boolean); return '{}';
 elsif p_action='backup_page' then
  perform mawatheeq_private.require_access(mawatheeq_private.is_owner());
  case p_data->>'kind'
  when 'records' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select * from mawatheeq_private.department_records order by id limit 100 offset v_offset)t;
  when 'changes' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select * from mawatheeq_private.department_changes order by id limit 100 offset v_offset)t;
  when 'outputs' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select * from mawatheeq_private.department_outputs order by id limit 100 offset v_offset)t;
  else raise exception 'نوع النسخة غير متاح.'; end case; return result;
 end if;
 perform mawatheeq_private.require_access(w<>'secretary');
 if p_action='records_page' then
  select coalesce(jsonb_agg(mawatheeq_private.department_json(t)),'[]') into result from
   (select * from mawatheeq_private.department_records where workspace=w and mawatheeq_private.department_visible(actor,workspace,case_id) order by id limit 500 offset v_offset)t;
  return result;
 end if;
 if p_action not in ('save_record','history','archive_record','void_record','review_file','generate','outputs') then raise exception 'العملية المطلوبة غير متاحة.'; end if;
 item:=p_data->'record'; v_id:=case when p_action='save_record' then (item->>'id')::uuid else (p_data->>'id')::uuid end;
 if v_id is null then raise exception 'معرف السجل مطلوب.'; end if;
 perform pg_advisory_xact_lock(hashtext('department-record-'||v_id::text));
 select * into r from mawatheeq_private.department_records where id=v_id for update;
 if r.id is not null then perform mawatheeq_private.require_access(r.workspace=w and mawatheeq_private.department_visible(actor,w,r.case_id));
 elsif p_action<>'save_record' then perform mawatheeq_private.require_access(false); end if;
 if p_action='history' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
   select h.id,h.revision,h.before_record as before,h.after_record as after,u.username as actor,h.created_at as "createdAt"
   from mawatheeq_private.department_changes h join mawatheeq_private.accounts u on u.id=h.actor_id where h.record_id=r.id order by h.id desc limit 50 offset v_offset)t;
  return result;
 elsif p_action='outputs' then
  perform mawatheeq_private.require_access(w='collections');
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
   select o.id,o.record_revision as "recordRevision",o.case_revision as "caseRevision",o.kind,o.template_version as "templateVersion",u.username as actor,o.created_at as "createdAt"
   from mawatheeq_private.department_outputs o join mawatheeq_private.accounts u on u.id=o.actor_id where o.record_id=r.id order by o.created_at desc limit 50 offset v_offset)t;
  return result;
 end if;
 if p_action='generate' then
  perform mawatheeq_private.require_access(w='collections' and (a->>'canExport')::boolean and not r.archived);
  output_id:=(p_data->>'outputId')::uuid;
  if output_id is null or coalesce(p_data->>'kind','') not in ('claim','bundle') then raise exception 'اختر نوع المستند.'; end if;
  perform pg_advisory_xact_lock(hashtext('department-output-'||output_id::text));
  select * into outrow from mawatheeq_private.department_outputs where id=output_id;
  if outrow.id is not null then
   perform mawatheeq_private.require_access(outrow.record_id=r.id and outrow.actor_id=actor and outrow.kind=p_data->>'kind' and outrow.record_revision=(p_data->>'revision')::int);
   return jsonb_build_object('id',outrow.id,'data',outrow.payload,'templateVersion',outrow.template_version);
  end if;
  select * into c from public.mawatheeq_cases where id=r.case_id for share;
  if r.revision is distinct from (p_data->>'revision')::integer or r.review is null or (r.review->>'recordRevision')::integer<>r.revision
   or (r.review->>'caseRevision')::integer<>c.revision then raise exception 'راجع الملف الحالي والقضية الحالية قبل إنشاء المستند.' using errcode='40001'; end if;
  foreach field in array case when p_data->>'kind'='claim' then
   array['company','defendant','civilId','nationality','address','amount','amountWords','account','orderNumber','court','rejectedDate','demandDate','statementDate','companyCivil','companyRegister','hearingCourt','hearingDate','hearingDay','hearingCircuit']
   else array['company','defendant','hearingCourt','hearingDate','hearingCircuit','lawsuitNumber','lawsuitYear'] end loop
   if btrim(coalesce(r.payload->>field,''))='' then raise exception 'أكمل حقول القالب المطلوبة قبل الإنشاء: %.',field; end if;
  end loop;
  if p_data->>'kind'='bundle' and not exists(select 1 from jsonb_array_elements(r.payload->'evidence') e where e->'included'='true') then raise exception 'اختر مستنداً واحداً على الأقل للحافظة.'; end if;
  insert into mawatheeq_private.department_outputs(id,record_id,record_revision,case_revision,kind,template_version,payload,actor_id)
   values(output_id,r.id,r.revision,c.revision,p_data->>'kind','office-word-v1',r.payload,actor) returning * into outrow;
  return jsonb_build_object('id',outrow.id,'data',outrow.payload,'templateVersion',outrow.template_version);
 end if;
 perform mawatheeq_private.require_access((a->>'canEdit')::boolean);
 if coalesce(r.revision,0) is distinct from (case when p_action='save_record' then item->>'revision' else p_data->>'revision' end)::integer then
  raise exception 'تغير السجل. أعد تحميله قبل الحفظ.' using errcode='40001'; end if;
 old:=case when r.id is null then null else mawatheeq_private.department_json(r) end;
 if p_action='save_record' then
  v_case:=nullif(item->>'caseId',''); subject:=nullif(item->>'subjectId','')::uuid;
  perform mawatheeq_private.require_access(mawatheeq_private.department_visible(actor,w,v_case));
  if r.id is not null and (r.kind is distinct from item->>'kind' or r.case_id is distinct from v_case or r.subject_id is distinct from subject) then raise exception 'ارتباط السجل ونوعه ثابتان. أنشئ سجلاً آخر عند الحاجة.'; end if;
  if r.id is not null and (w='accounting' or r.archived) then raise exception 'القيد المالي ثابت؛ ألغِه بسبب ثم أضف التصحيح. افتح السجلات المؤرشفة قبل تعديلها.'; end if;
  if v_case is not null and not exists(select 1 from public.mawatheeq_cases where id=v_case and (not archived or r.id is not null)) then raise exception 'اختر قضية نشطة محفوظة.'; end if;
  next_payload:=mawatheeq_private.department_payload(w,item->>'kind',item->'payload');
  if w='hr' and item->>'kind'='leave' then
   -- Serialize approvals for the employee, including concurrent requests.
   perform 1 from mawatheeq_private.department_records where id=subject and workspace='hr' and kind='employee' and (not archived or r.id is not null) for update;
   if not found then raise exception 'اختر ملف موظف فعالاً.'; end if;
   if next_payload->>'status'='approved' and exists(select 1 from mawatheeq_private.department_records
    where subject_id=subject and id<>v_id and payload->>'status'='approved'
      and payload->>'fromDate'<=next_payload->>'toDate' and payload->>'toDate'>=next_payload->>'fromDate') then raise exception 'تتداخل الإجازة مع إجازة معتمدة للموظف.'; end if;
  end if;
  insert into mawatheeq_private.department_records(id,workspace,kind,case_id,subject_id,payload,created_by,updated_by)
   values(v_id,w,item->>'kind',v_case,subject,next_payload,actor,actor)
   on conflict(id) do update set payload=excluded.payload,review=null,revision=department_records.revision+1,updated_by=actor,updated_at=clock_timestamp()
   returning * into r;
 elsif p_action='archive_record' then
  perform mawatheeq_private.require_access(w='collections' or w='hr' and r.kind='employee');
  if jsonb_typeof(p_data->'archived') is distinct from 'boolean' then raise exception 'حالة الأرشيف غير صالحة.'; end if;
  update mawatheeq_private.department_records set archived=(p_data->>'archived')::boolean,review=null,revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where id=r.id returning * into r;
 elsif p_action='void_record' then
  perform mawatheeq_private.require_access(w='accounting');
  if r.payload->>'status'<>'posted' or length(btrim(coalesce(p_data->>'reason',''))) not between 1 and 2000 then raise exception 'القيد ملغى بالفعل أو سبب الإلغاء غير مكتمل.'; end if;
  update mawatheeq_private.department_records set payload=payload||jsonb_build_object('status','void','voidReason',btrim(p_data->>'reason')),revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where id=r.id returning * into r;
 elsif p_action='review_file' then
  perform mawatheeq_private.require_access(w='collections' and not r.archived);
  select * into c from public.mawatheeq_cases where id=r.case_id for share;
  if c.revision is distinct from (p_data->>'caseRevision')::integer then raise exception 'تغيرت القضية. أعد تحميل الملف وراجع المصدر مجدداً.' using errcode='40001'; end if;
  if p_data->'attested' is distinct from 'true'::jsonb or btrim(coalesce(r.payload->>'sourceReference',''))='' then raise exception 'سجّل مرجع المصدر وأكد مطابقة البيانات له.'; end if;
  update mawatheeq_private.department_records set revision=revision+1,
   review=jsonb_build_object('recordRevision',revision+1,'caseRevision',c.revision,'reviewer',(select username from mawatheeq_private.accounts where id=actor),'reviewerId',actor,'createdAt',clock_timestamp(),'sourceReference',payload->>'sourceReference'),
   updated_by=actor,updated_at=clock_timestamp() where id=r.id returning * into r;
 end if;
 insert into mawatheeq_private.department_changes(record_id,before_record,after_record,revision,actor_id) values(r.id,old,mawatheeq_private.department_json(r),r.revision,actor);
 return mawatheeq_private.department_json(r);
end $$;
create function public.mawatheeq_department_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.department_request(p_token,p_action,p_data); $$;
revoke all on all functions in schema mawatheeq_private from public,anon,authenticated;
revoke all on function public.mawatheeq_department_request(text,text,jsonb) from public;
grant execute on function mawatheeq_private.local_login(text,text),mawatheeq_private.local_request(text,text,jsonb),mawatheeq_private.client_request(text,text,jsonb),mawatheeq_private.office_request(text,text,jsonb),mawatheeq_private.department_request(text,text,jsonb),public.mawatheeq_department_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
