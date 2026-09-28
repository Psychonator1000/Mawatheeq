begin;
-- Entity identity is independent of names and of the people instructing a case.
-- Historical names stay on cases; no office records are included in this migration.
create table mawatheeq_private.client_entities (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  revision integer not null default 1,
  merged_into uuid references mawatheeq_private.client_entities(id),
  updated_at timestamptz not null default now()
);
create index client_entities_merged_idx on mawatheeq_private.client_entities(merged_into);
create table mawatheeq_private.client_case_history (
  id bigint generated always as identity primary key,
  case_id text not null,
  payload jsonb not null,
  revision integer not null,
  saved_at timestamptz not null default now()
);
create index client_case_history_case_idx on mawatheeq_private.client_case_history(case_id);
alter table mawatheeq_private.client_entities enable row level security;
alter table mawatheeq_private.client_case_history enable row level security;
revoke all on mawatheeq_private.client_entities,mawatheeq_private.client_case_history from public,anon,authenticated;
create index mawatheeq_case_entity_idx on public.mawatheeq_cases((payload->>'clientEntityId'));

create function mawatheeq_private.client_key(v text) returns text
language sql immutable set search_path='' as $$
  select lower(mawatheeq_private.normalized(regexp_replace(coalesce(v,''),'^[*[:space:]]+','','g')));
$$;
create function mawatheeq_private.validate_client(c jsonb) returns void
language plpgsql set search_path='' as $$
declare p jsonb;
begin
  if c is null or jsonb_typeof(c)<>'object' or length(c::text)>100000
     or length(btrim(coalesce(c->>'name',''))) not between 1 and 500
     or coalesce(c->>'kind','') not in ('organization','individual','group','unknown')
     or coalesce(c->>'sector','') not in ('other','insurance','telecom')
     or jsonb_typeof(c->'contacts') is distinct from 'array'
     or jsonb_typeof(c->'aliases') is distinct from 'array'
     or jsonb_typeof(c->'needsReview') is distinct from 'boolean' then
    raise exception 'راجع اسم الموكل ونوعه وبيانات الأشخاص المرتبطين به.';
  end if;
  perform (c->>'id')::uuid;
  if c->>'id' is null or jsonb_array_length(c->'contacts')>300 or jsonb_array_length(c->'aliases')>1000 then raise exception 'بيانات الموكل غير صالحة.'; end if;
  for p in select value from jsonb_array_elements(c->'contacts') loop
    if jsonb_typeof(p)<>'object' or coalesce(p->>'id','') !~ '^[0-9a-f-]{36}$' or length(btrim(coalesce(p->>'name',''))) not between 1 and 300 then
      raise exception 'أدخل اسم كل شخص أو أزل السطر الفارغ.';
    end if;
    perform (p->>'id')::uuid;
  end loop;
  if (select count(*) from jsonb_array_elements(c->'contacts'))<>(select count(distinct contact->>'id') from jsonb_array_elements(c->'contacts') contact) then raise exception 'معرّفات الأشخاص مكررة.'; end if;
  if exists(select 1 from jsonb_array_elements(c->'aliases') alias where jsonb_typeof(alias)<>'string') then raise exception 'الأسماء السابقة غير صالحة.'; end if;
end $$;

create function mawatheeq_private.link_case_client() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_id uuid; e mawatheeq_private.client_entities%rowtype; label text; original text; v_contacts jsonb; matches integer;
begin
  if (new.payload ? 'executionFile' and jsonb_typeof(new.payload->'executionFile')<>'boolean') or (new.payload ? 'telecom' and jsonb_typeof(new.payload->'telecom')<>'boolean') then raise exception 'تصنيف القضية غير صالح.'; end if;
  -- A previous frontend cannot accidentally remove a link it does not understand.
  if tg_op='UPDATE' and not (new.payload ? 'clientEntityId') then
    new.payload:=new.payload||jsonb_build_object('clientEntityId',old.payload->>'clientEntityId','clientContactId',old.payload->>'clientContactId');
  end if;
  v_id:=nullif(new.payload->>'clientEntityId','')::uuid;
  label:=coalesce(nullif(btrim(new.payload->>'clientGroup'),''),nullif(btrim(new.payload->>'client'),''));
  original:=btrim(coalesce(new.payload->>'client',''));
  if v_id is null then
    select count(*),(array_agg(id))[1] into matches,v_id from mawatheeq_private.client_entities ent
      where ent.merged_into is null and (mawatheeq_private.client_key(ent.payload->>'name')=mawatheeq_private.client_key(label)
        or exists(select 1 from jsonb_array_elements_text(ent.payload->'aliases') a where mawatheeq_private.client_key(a)=mawatheeq_private.client_key(label)));
    if matches<>1 then
      v_id:=gen_random_uuid();
      insert into mawatheeq_private.client_entities(id,payload) values(v_id,jsonb_build_object(
        'id',v_id,'name',coalesce(label,'موكل يحتاج مراجعة'),'kind','unknown','sector','other','contacts','[]'::jsonb,
        'aliases',to_jsonb(array(select distinct x from unnest(array[label,original]) x where coalesce(x,'')<>'')),
        'notes','تم إنشاء الملف من السجل السابق. راجع الجهة والأشخاص المرتبطين بها.','needsReview',true));
    end if;
  end if;
  select * into e from mawatheeq_private.client_entities where id=v_id and merged_into is null;
  if e.id is null then raise exception 'ملف الموكل تغير أو دُمج. أعد تحميل السجلات واختر الموكل الصحيح.' using errcode='40001'; end if;
  if coalesce(new.payload->>'clientContactId','')<>'' and not exists(
    select 1 from jsonb_array_elements(e.payload->'contacts') p where p->>'id'=new.payload->>'clientContactId') then
    raise exception 'الشخص المحدد غير مرتبط بهذا الموكل. اختر الشخص من ملف الموكل.';
  end if;
  -- Retain every source spelling as an alias without changing the source on the case.
  if label is not null and (not(e.payload->'aliases' @> to_jsonb(array[label])) or not(e.payload->'aliases' @> to_jsonb(array[original]))) then
    update mawatheeq_private.client_entities set payload=jsonb_set(payload,'{aliases}',
      (select jsonb_agg(distinct x) from jsonb_array_elements_text((payload->'aliases')||to_jsonb(array[label,original])) x where x<>'')),
      revision=revision+1,updated_at=now() where id=v_id;
  end if;
  new.payload:=new.payload||jsonb_build_object('clientEntityId',v_id,'revision',new.revision);
  if tg_op='UPDATE' and (old.payload->>'clientEntityId' is distinct from new.payload->>'clientEntityId'
    or old.payload->>'clientContactId' is distinct from new.payload->>'clientContactId') then
    insert into mawatheeq_private.client_case_history(case_id,payload,revision) values(old.id,old.payload,old.revision);
  end if;
  return new;
end $$;
create trigger case_client_link before insert or update on public.mawatheeq_cases
for each row execute function mawatheeq_private.link_case_client();
-- Bootstrap exact existing labels. Curated consolidation is a private data operation.
update public.mawatheeq_cases set payload=payload,revision=revision+1,updated_at=now();

-- Return the stored payload so trigger-assigned entity identities reach all clients.
create or replace function mawatheeq_private.mawatheeq_save_case(p_case jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old_revision integer; next_revision integer; c jsonb;
begin
  if not mawatheeq_private.is_member() then raise exception 'لا تملك صلاحية الوصول إلى المكتب.' using errcode='42501'; end if;
  perform mawatheeq_private.validate_case(p_case);
  perform pg_advisory_xact_lock(hashtext('mawatheeq-case-writes'));
  select revision into old_revision from public.mawatheeq_cases where id=p_case->>'id' for update;
  if old_revision is not null and old_revision<>coalesce((p_case->>'revision')::integer,0) then
    raise exception 'تم تعديل هذا السجل بواسطة مستخدم آخر. أعد تحميله قبل الحفظ.' using errcode='40001';
  end if;
  next_revision:=coalesce(old_revision,0)+1;
  c:=p_case||jsonb_build_object('revision',next_revision,'archived',coalesce((p_case->>'archived')::boolean,false));
  -- Use UPDATE for existing rows; an INSERT trigger cannot see OLD during upsert.
  if old_revision is null then
    insert into public.mawatheeq_cases(id,payload,revision,archived) values(c->>'id',c,next_revision,(c->>'archived')::boolean) returning payload into c;
  else
    update public.mawatheeq_cases set payload=c,revision=next_revision,archived=(c->>'archived')::boolean,updated_at=now() where id=c->>'id' returning payload into c;
  end if;
  insert into public.mawatheeq_audit(actor,record_id,action) values(auth.uid(),c->>'id',case when old_revision is null then 'create_case' else 'update_case' end);
  return c;
end $$;

create function mawatheeq_private.merge_clients(p_source uuid,p_target uuid,p_source_revision integer,p_target_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s mawatheeq_private.client_entities%rowtype; t mawatheeq_private.client_entities%rowtype; merged jsonb; moved integer;
begin
  perform pg_advisory_xact_lock(hashtext('mawatheeq-case-writes'));
  if p_source is null or p_target is null or p_source_revision is null or p_target_revision is null then raise exception 'بيانات الدمج غير مكتملة.'; end if;
  if p_source=p_target then raise exception 'اختر ملفين مختلفين.'; end if;
  select * into s from mawatheeq_private.client_entities where id=p_source and merged_into is null for update;
  select * into t from mawatheeq_private.client_entities where id=p_target and merged_into is null for update;
  if s.id is null or t.id is null or s.revision<>p_source_revision or t.revision<>p_target_revision then
    raise exception 'تم تعديل أحد الملفين. أعد التحميل قبل الدمج.' using errcode='40001';
  end if;
  merged:=t.payload||jsonb_build_object(
    'aliases',(select jsonb_agg(distinct x) from jsonb_array_elements_text((t.payload->'aliases')||(s.payload->'aliases')||jsonb_build_array(s.payload->>'name',t.payload->>'name')) x),
    'contacts',(select coalesce(jsonb_agg(p),'[]') from (select distinct on (p->>'id') p from jsonb_array_elements((t.payload->'contacts')||(s.payload->'contacts')) p) q),
    'notes',concat_ws(E'\n',nullif(t.payload->>'notes',''),nullif(s.payload->>'notes','')),
    'needsReview',coalesce((t.payload->>'needsReview')::boolean,false) or coalesce((s.payload->>'needsReview')::boolean,false));
  perform mawatheeq_private.validate_client(merged);
  update mawatheeq_private.client_entities set payload=merged,revision=revision+1,updated_at=now() where id=p_target;
  update public.mawatheeq_cases set payload=jsonb_set(payload,'{clientEntityId}',to_jsonb(p_target::text)),revision=revision+1,updated_at=now()
    where payload->>'clientEntityId'=p_source::text;
  get diagnostics moved=row_count;
  update mawatheeq_private.client_entities set merged_into=p_target,revision=revision+1,updated_at=now() where id=p_source;
  insert into public.mawatheeq_audit(actor,record_id,action) values(auth.uid(),p_target::text,'merge_client:'||p_source::text);
  return jsonb_build_object('moved',moved,'targetId',p_target);
end $$;

create function mawatheeq_private.client_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; c jsonb; old mawatheeq_private.client_entities%rowtype; v_id uuid; v_revision integer;
begin
  -- Reuse opaque-session, active membership, and required password-change checks.
  perform mawatheeq_private.local_request(p_token,'rules','{}');
  if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>2000000 then raise exception 'الطلب غير صالح.'; end if;
  if p_action='list' then
    select coalesce(jsonb_agg(t.payload||jsonb_build_object('id',t.id,'revision',t.revision)),'[]') into result from
      (select id,payload,revision from mawatheeq_private.client_entities where merged_into is null order by id limit 500 offset greatest(0,least(coalesce((p_data->>'offset')::integer,0),1000000))) t;
    return jsonb_build_object('clients',result,'canMerge',mawatheeq_private.is_owner());
  elsif p_action='save' then
    c:=p_data->'client';
    perform mawatheeq_private.validate_client(c);
    v_id:=(c->>'id')::uuid;
    perform pg_advisory_xact_lock(hashtext('mawatheeq-case-writes'));
    select * into old from mawatheeq_private.client_entities where id=v_id for update;
    if old.merged_into is not null or (old.id is not null and old.revision<>coalesce((c->>'revision')::integer,0)) then
      raise exception 'تم تعديل ملف الموكل. أعد التحميل قبل الحفظ.' using errcode='40001';
    end if;
    if exists(select 1 from public.mawatheeq_cases k where k.payload->>'clientEntityId'=v_id::text and coalesce(k.payload->>'clientContactId','')<>''
      and not exists(select 1 from jsonb_array_elements(c->'contacts') p where p->>'id'=k.payload->>'clientContactId')) then
      raise exception 'لا يمكن حذف شخص مرتبط بقضية. عدّل ارتباط القضية أولاً.';
    end if;
    -- Preserve historical labels, including the previous display name after a rename.
    c:=c||jsonb_build_object('aliases',(select coalesce(jsonb_agg(distinct x),'[]') from jsonb_array_elements_text(
      (c->'aliases')||coalesce(old.payload->'aliases','[]')||jsonb_build_array(c->>'name')||case when old.id is null then '[]'::jsonb else jsonb_build_array(old.payload->>'name') end) x));
    v_revision:=coalesce(old.revision,0)+1;
    insert into mawatheeq_private.client_entities(id,payload,revision) values(v_id,c-'revision',v_revision)
      on conflict(id) do update set payload=excluded.payload,revision=excluded.revision,updated_at=now();
    insert into public.mawatheeq_audit(actor,record_id,action) values(auth.uid(),v_id::text,'save_client');
    return c||jsonb_build_object('revision',v_revision);
  elsif p_action='merge' then
    if not mawatheeq_private.is_owner() then raise exception 'دمج الموكلين متاح لمسؤول المكتب فقط.' using errcode='42501'; end if;
    return mawatheeq_private.merge_clients((p_data->>'sourceId')::uuid,(p_data->>'targetId')::uuid,(p_data->>'sourceRevision')::integer,(p_data->>'targetRevision')::integer);
  end if;
  raise exception 'العملية المطلوبة غير متاحة.';
end $$;
create function public.mawatheeq_client_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.client_request(p_token,p_action,p_data); $$;
revoke all on function mawatheeq_private.client_key(text),mawatheeq_private.validate_client(jsonb),mawatheeq_private.link_case_client(),mawatheeq_private.merge_clients(uuid,uuid,integer,integer) from public,anon,authenticated;
revoke all on function mawatheeq_private.client_request(text,text,jsonb),public.mawatheeq_client_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.client_request(text,text,jsonb),public.mawatheeq_client_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
