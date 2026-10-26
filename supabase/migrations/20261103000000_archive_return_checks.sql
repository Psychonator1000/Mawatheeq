begin;
-- Return checks (3 November 2026): what a file holds goes out and comes back on the record.
-- * A file keeps a contents list (one important item per line, chiefly originals) beside its page count. Each hand-out
--   carries a copy of both, so «استلمت» confirms exactly that; the recipient can note what was already missing.
-- * The archive checks every return against that list: «عاد كاملاً» or «عاد ناقصاً» with what is missing. A missing
--   item stays open against the last holder until the archive records how it was settled.
-- * A reported return the archive did not receive is rejected with a reason; the file stays with the holder and the
--   rejection stays in the hand-out's history.
-- * A file that cannot be found is marked «مفقود», naming its last confirmed holder, until it is found again.
-- * A file can be taken off its drawer without a new place: a move marked «unplaced», after which it has no place
--   until it is put somewhere again.
-- These server-set fields survive ordinary saves of the file. Safe to run again.

create or replace function mawatheeq_private.archive_payload(k text,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb; f text;
begin
 if k='location' then
  result:=mawatheeq_private.department_fields(p,array['code','name','cabinet','shelf','box','capacity','notes']);
  if length(result->>'code') not between 1 and 40 or length(result->>'name') not between 1 and 200 then raise exception 'أكمل رمز الموقع واسمه.'; end if;
  if result->>'capacity'<>'' and result->>'capacity' !~ '^[0-9]{1,5}$' then raise exception 'السعة عدد ملفات صحيح.'; end if;
  foreach f in array array['cabinet','shelf','box'] loop if length(result->>f)>40 then raise exception 'راجع الخزانة والرف والصندوق.'; end if; end loop;
 elsif k='file' then
  result:=mawatheeq_private.department_fields(p,array['number','title','type','volume','pages','locationId','originals','confidential','intakeDate','retentionUntil','notes','contents']);
  if length(result->>'number') not between 1 and 40 or result->>'number' !~ '^[A-Za-z0-9./ $+%-]+$' then raise exception 'رقم الأرشيف أحرف لاتينية وأرقام وشرطة فقط.'; end if;
  if length(result->>'title') not between 1 and 300 or length(result->>'type') not between 1 and 100 or length(result->>'volume')>40 then raise exception 'أكمل عنوان الملف ونوعه.'; end if;
  if result->>'pages'<>'' and result->>'pages' !~ '^[0-9]{1,6}$' then raise exception 'عدد الأوراق رقم صحيح.'; end if;
  if length(result->>'contents')>4000 then raise exception 'قائمة محتويات الملف طويلة جداً.'; end if;
  if result->>'originals' not in ('yes','no') or result->>'confidential' not in ('yes','no') then raise exception 'حدد الأصول والسرية.'; end if;
  perform mawatheeq_private.department_date(result->>'intakeDate'); perform mawatheeq_private.department_date(result->>'retentionUntil');
 elsif k='movement' then
  result:=mawatheeq_private.department_fields(p,array['type','date','holder','holderId','purpose','dueDate','locationId','notes']);
  if result->>'type' not in ('checkout','court','client','return','move','audit') then raise exception 'اختر نوع الحركة.'; end if;
  perform mawatheeq_private.department_date(result->>'date',true); perform mawatheeq_private.department_date(result->>'dueDate');
  if result->>'type' in ('checkout','court','client') and length(result->>'holder') not between 1 and 200 then raise exception 'حدد مستلم الملف.'; end if;
  if result->>'dueDate'<>'' and result->>'dueDate'<result->>'date' then raise exception 'موعد الإعادة يسبق تاريخ التسليم.'; end if;
  if result->>'type'='move' and result->>'locationId'='' then raise exception 'اختر الموقع الجديد.'; end if;
  if length(result->>'holder')>200 or length(result->>'purpose')>500 then raise exception 'النص طويل جداً.'; end if;
 elsif k='request' then
  result:=mawatheeq_private.department_fields(p,array['requester','requesterId','neededBy','purpose','status','notes','decisionNote']);
  if length(result->>'requester') not between 1 and 200 or result->>'status' not in ('pending','ready','done','declined') then raise exception 'أكمل اسم طالب الملف وحالة الطلب.'; end if;
  perform mawatheeq_private.department_date(result->>'neededBy');
  if result->>'status'='declined' and result->>'decisionNote'='' then raise exception 'دوّن سبب الاعتذار عن الطلب.'; end if;
 else raise exception 'نوع السجل غير متاح.';
 end if;
 foreach f in array array['holderId','requesterId','locationId'] loop
  if result ? f and result->>f<>'' and result->>f !~ '^[0-9a-f-]{36}$' then raise exception 'مرجع غير صالح: %.',f; end if;
 end loop;
 return result;
end $$;


create or replace function mawatheeq_private.archive_after_checkout(p_movement uuid,p_actor uuid,p_batch text) returns jsonb
language plpgsql set search_path='' as $$
declare m mawatheeq_private.department_records%rowtype; q mawatheeq_private.department_records%rowtype; f mawatheeq_private.department_records%rowtype; before jsonb;
begin
 select * into m from mawatheeq_private.department_records where id=p_movement;
 select * into f from mawatheeq_private.department_records where id=m.subject_id;
 update mawatheeq_private.department_records set payload=payload||jsonb_build_object('receipt','pending','receivedAt','','returnClaimedAt','','batchId',coalesce(p_batch,''),
   'contents',coalesce(f.payload->>'contents',''),'pages',coalesce(f.payload->>'pages',''))
  where id=m.id returning * into m;
 update mawatheeq_private.department_changes set after_record=mawatheeq_private.department_json(m)
  where id=(select max(id) from mawatheeq_private.department_changes where record_id=m.id);
 for q in select * from mawatheeq_private.department_records where workspace='archive' and kind='request' and subject_id=m.subject_id and not archived
   and payload->>'requesterId'=m.payload->>'holderId' and payload->>'status' in ('pending','ready') for update loop
  before:=mawatheeq_private.department_json(q);
  update mawatheeq_private.department_records set payload=payload||jsonb_build_object('status','done'),revision=revision+1,updated_by=p_actor,updated_at=clock_timestamp()
   where id=q.id returning * into q;
  perform mawatheeq_private.archive_log(before,q,p_actor);
 end loop;
 return mawatheeq_private.department_json(m);
end $$;


-- Where a file is kept: the latest movement that names a place, or that took it off its place.
create or replace function mawatheeq_private.archive_state(p_file uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'state',coalesce((select m.payload->>'toState' from mawatheeq_private.department_records m where m.subject_id=p_file and m.workspace='archive' and m.kind='movement'
    and m.payload->>'status'='posted' order by m.created_at desc,m.id desc limit 1),'in'),
  'lastId',(select m.id from mawatheeq_private.department_records m where m.subject_id=p_file and m.workspace='archive' and m.kind='movement'
    and m.payload->>'status'='posted' order by m.created_at desc,m.id desc limit 1),
  'locationId',coalesce((select m.payload->>'locationId' from mawatheeq_private.department_records m where m.subject_id=p_file and m.workspace='archive' and m.kind='movement'
    and m.payload->>'status'='posted' and (m.payload->>'locationId'<>'' or m.payload->>'unplaced'='yes') order by m.created_at desc,m.id desc limit 1),
   (select f.payload->>'locationId' from mawatheeq_private.department_records f where f.id=p_file)));
$$;

-- An archive editor who can see the file's case; returns who they are.
create or replace function mawatheeq_private.archive_editor(p_token text,p_file uuid) returns uuid
language plpgsql set search_path='' as $$
declare actor uuid; v_case text; found_file boolean;
begin
 actor:=mawatheeq_private.authorize(p_token);
 perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'archive') and coalesce((mawatheeq_private.access_for(actor)->>'canEdit')::boolean,false));
 select true,case_id into found_file,v_case from mawatheeq_private.department_records where id=p_file and workspace='archive' and kind='file';
 if found_file is null then raise exception 'اختر ملف أرشيف.'; end if;
 perform mawatheeq_private.require_access(mawatheeq_private.department_visible(actor,'archive',v_case));
 return actor;
end $$;

-- Update a record outside the core save, with its change-log entry.
create or replace function mawatheeq_private.archive_patch(p_id uuid,p_patch jsonb,p_actor uuid) returns jsonb
language plpgsql set search_path='' as $$
declare r mawatheeq_private.department_records%rowtype; before jsonb;
begin
 select * into r from mawatheeq_private.department_records where id=p_id for update;
 before:=mawatheeq_private.department_json(r);
 update mawatheeq_private.department_records set payload=payload||p_patch,revision=revision+1,updated_by=p_actor,updated_at=clock_timestamp() where id=p_id returning * into r;
 return mawatheeq_private.archive_log(before,r,p_actor);
end $$;

do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='archive_request_journeys') then
  alter function mawatheeq_private.archive_request(text,text,jsonb) rename to archive_request_journeys;
 end if;
end $$;

create or replace function mawatheeq_private.archive_request(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; result jsonb; m mawatheeq_private.department_records%rowtype; f mawatheeq_private.department_records%rowtype;
 v_check text; v_missing text; v_note text; v_name text; st jsonb; before jsonb; v_keep jsonb;
 server_keys text[]:=array['lost','lostAt','lostNote','lostBy','lostHolder','foundAt','foundBy','foundNote'];
begin
 if p_action='desk_receive' then
  v_missing:=btrim(coalesce(p_data->>'missing',''));
  if length(v_missing)>1000 then raise exception 'النص طويل جداً.'; end if;
  result:=mawatheeq_private.archive_request_journeys(p_token,p_action,p_data);
  if v_missing<>'' then
   update mawatheeq_private.department_records set payload=payload||jsonb_build_object('receivedMissing',v_missing) where id=(result->>'id')::uuid returning * into m;
   update mawatheeq_private.department_changes set after_record=mawatheeq_private.department_json(m) where id=(select max(id) from mawatheeq_private.department_changes where record_id=m.id);
   result:=mawatheeq_private.department_json(m);
  end if;
  return result;
 elsif p_action='approve_return' then
  select * into f from mawatheeq_private.department_records where id=nullif(p_data->>'fileId','')::uuid and workspace='archive' and kind='file';
  if f.id is null then raise exception 'اختر ملف أرشيف.'; end if;
  v_check:=coalesce(nullif(p_data->>'check',''),'complete'); v_missing:=btrim(coalesce(p_data->>'missing',''));
  if v_check not in ('complete','missing') then raise exception 'حدد هل عاد الملف كاملاً.'; end if;
  if v_check='missing' and v_missing='' then raise exception 'اكتب ما ينقص الملف.'; end if;
  if length(v_missing)>1000 or coalesce(p_data->>'pages','') !~ '^[0-9]{0,6}$' then raise exception 'راجع النواقص وعدد الأوراق.'; end if;
  select * into m from mawatheeq_private.department_records where id=(mawatheeq_private.archive_state(f.id)->>'lastId')::uuid;
  result:=mawatheeq_private.archive_request_journeys(p_token,p_action,p_data);
  update mawatheeq_private.department_records set payload=payload||jsonb_build_object('returnCheck',v_check,'missing',case when v_check='missing' then v_missing else '' end,
    'pagesBack',coalesce(p_data->>'pages',''),'fromHolder',coalesce(m.payload->>'holder',''),'fromHolderId',coalesce(m.payload->>'holderId',''),'missingResolvedAt','','missingResolution','')
   where id=(result->>'id')::uuid returning * into m;
  update mawatheeq_private.department_changes set after_record=mawatheeq_private.department_json(m) where id=(select max(id) from mawatheeq_private.department_changes where record_id=m.id);
  return mawatheeq_private.department_json(m);
 elsif p_action='reject_return' then
  select * into f from mawatheeq_private.department_records where id=nullif(p_data->>'fileId','')::uuid and workspace='archive' and kind='file';
  actor:=mawatheeq_private.archive_editor(p_token,f.id);
  perform pg_advisory_xact_lock(hashtext('archive-file-'||f.id::text));
  v_note:=btrim(coalesce(p_data->>'reason',''));
  if length(v_note) not between 1 and 500 then raise exception 'اكتب سبب رفض الإرجاع.'; end if;
  select * into m from mawatheeq_private.department_records where id=(mawatheeq_private.archive_state(f.id)->>'lastId')::uuid;
  if m.id is null or m.payload->>'type'<>'checkout' or coalesce(m.payload->>'returnClaimedAt','')='' then raise exception 'لا يوجد إبلاغ بإرجاع هذا الملف.' using errcode='40001'; end if;
  select coalesce(nullif(display_name,''),username) into v_name from mawatheeq_private.accounts where id=actor;
  return mawatheeq_private.archive_patch(m.id,jsonb_build_object('returnClaimedAt','','rejections',coalesce(m.payload->'rejections','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
   'at',mawatheeq_private.archive_now(),'by',v_name,'reason',v_note,'claimedAt',m.payload->>'returnClaimedAt'))),actor);
 elsif p_action='resolve_missing' then
  select * into m from mawatheeq_private.department_records where id=nullif(p_data->>'movementId','')::uuid and workspace='archive' and kind='movement';
  if m.id is null or m.payload->>'returnCheck'<>'missing' then raise exception 'لا توجد نواقص مسجلة في هذه الحركة.'; end if;
  actor:=mawatheeq_private.archive_editor(p_token,m.subject_id);
  if coalesce(m.payload->>'missingResolvedAt','')<>'' then raise exception 'سُوّيت هذه النواقص من قبل.'; end if;
  v_note:=btrim(coalesce(p_data->>'note',''));
  if length(v_note) not between 1 and 500 then raise exception 'اكتب كيف سُوّيت النواقص.'; end if;
  select coalesce(nullif(display_name,''),username) into v_name from mawatheeq_private.accounts where id=actor;
  return mawatheeq_private.archive_patch(m.id,jsonb_build_object('missingResolvedAt',mawatheeq_private.archive_now(),'missingResolution',v_note,'missingResolvedBy',v_name),actor);
 elsif p_action in ('mark_lost','mark_found') then
  select * into f from mawatheeq_private.department_records where id=nullif(p_data->>'fileId','')::uuid and workspace='archive' and kind='file';
  actor:=mawatheeq_private.archive_editor(p_token,f.id);
  perform pg_advisory_xact_lock(hashtext('archive-file-'||f.id::text));
  select coalesce(nullif(display_name,''),username) into v_name from mawatheeq_private.accounts where id=actor;
  v_note:=btrim(coalesce(p_data->>'note',''));
  if length(v_note)>500 then raise exception 'النص طويل جداً.'; end if;
  if p_action='mark_lost' then
   if f.payload->>'lost'='yes' then raise exception 'الملف مسجّل مفقوداً بالفعل.'; end if;
   if v_note='' then raise exception 'اكتب ما تعرفه عن فقد الملف.'; end if;
   st:=mawatheeq_private.archive_state(f.id);
   return mawatheeq_private.archive_patch(f.id,jsonb_build_object('lost','yes','lostAt',mawatheeq_private.archive_now(),'lostNote',v_note,'lostBy',v_name,
    'lostHolder',coalesce((select x.payload->>'holder' from mawatheeq_private.department_records x where x.workspace='archive' and x.kind='movement' and x.subject_id=f.id
      and x.payload->>'status'='posted' and x.payload->>'type'='checkout' order by x.created_at desc,x.id desc limit 1),'')),actor);
  else
   if coalesce(f.payload->>'lost','')<>'yes' then raise exception 'الملف غير مسجّل مفقوداً.'; end if;
   return mawatheeq_private.archive_patch(f.id,jsonb_build_object('lost','','foundAt',mawatheeq_private.archive_now(),'foundBy',v_name,'foundNote',v_note),actor);
  end if;
 elsif p_action='unplace_file' then
  select * into f from mawatheeq_private.department_records where id=nullif(p_data->>'fileId','')::uuid and workspace='archive' and kind='file';
  actor:=mawatheeq_private.archive_editor(p_token,f.id);
  perform pg_advisory_xact_lock(hashtext('archive-file-'||f.id::text));
  st:=mawatheeq_private.archive_state(f.id);
  if st->>'state'<>'in' then raise exception 'الملف خارج الأرشيف الآن؛ يُرفع من مكانه بعد عودته.' using errcode='40001'; end if;
  if coalesce(st->>'locationId','')='' then raise exception 'الملف بلا مكان حفظ بالفعل.'; end if;
  insert into mawatheeq_private.department_records(id,workspace,kind,case_id,subject_id,payload,created_by,updated_by,created_at,updated_at)
   values(gen_random_uuid(),'archive','movement',f.case_id,f.id,jsonb_build_object('type','move','date',((clock_timestamp() at time zone 'Asia/Kuwait')::date)::text,'holder','','holderId','',
    'purpose','','dueDate','','locationId','','unplaced','yes','notes',left(coalesce(p_data->>'note','رُفع من مكانه'),500),'status','posted','voidReason','','fromState','in','toState','in'),
    actor,actor,clock_timestamp(),clock_timestamp()) returning * into m;
  return mawatheeq_private.archive_log(null,m,actor);
 elsif p_action='save_record' and p_data->'record'->>'kind'='file' then
  -- Lost and found are set by their own actions; an ordinary save of the file keeps them.
  select payload into before from mawatheeq_private.department_records where id=nullif(p_data->'record'->>'id','')::uuid;
  result:=mawatheeq_private.archive_request_journeys(p_token,p_action,p_data);
  select coalesce(jsonb_object_agg(k,v),'{}') into v_keep from jsonb_each(coalesce(before,'{}')) e(k,v) where k=any(server_keys);
  if v_keep<>'{}'::jsonb then
   update mawatheeq_private.department_records set payload=payload||v_keep where id=(result->>'id')::uuid returning * into f;
   update mawatheeq_private.department_changes set after_record=mawatheeq_private.department_json(f) where id=(select max(id) from mawatheeq_private.department_changes where record_id=f.id);
   result:=mawatheeq_private.department_json(f);
  end if;
  return result;
 elsif p_action='desk_journeys' then
  result:=mawatheeq_private.archive_request_journeys(p_token,p_action,p_data);
  return jsonb_set(result,'{handouts}',(select coalesce(jsonb_agg(h||jsonb_build_object('receivedMissing',coalesce(x.payload->>'receivedMissing',''),'rejections',coalesce(x.payload->'rejections','[]'::jsonb),
    'contents',coalesce(x.payload->>'contents',''),'pages',coalesce(x.payload->>'pages',''),
    'steps',(select coalesce(jsonb_agg(s||jsonb_build_object('returnCheck',coalesce(y.payload->>'returnCheck',''),'missing',coalesce(y.payload->>'missing',''),
      'missingResolvedAt',coalesce(y.payload->>'missingResolvedAt',''),'missingResolution',coalesce(y.payload->>'missingResolution','')) order by so),'[]'::jsonb)
     from jsonb_array_elements(h->'steps') with ordinality se(s,so) left join mawatheeq_private.department_records y on y.id=(s->>'id')::uuid)) order by ho),'[]'::jsonb)
   from jsonb_array_elements(result->'handouts') with ordinality he(h,ho) left join mawatheeq_private.department_records x on x.id=(h->>'movementId')::uuid));
 end if;
 return mawatheeq_private.archive_request_journeys(p_token,p_action,p_data);
end $$;

revoke all on function mawatheeq_private.archive_state(uuid),mawatheeq_private.archive_payload(text,jsonb),mawatheeq_private.archive_after_checkout(uuid,uuid,text),mawatheeq_private.archive_editor(text,uuid),
 mawatheeq_private.archive_patch(uuid,jsonb,uuid),mawatheeq_private.archive_request(text,text,jsonb),mawatheeq_private.archive_request_journeys(text,text,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
