begin;
-- «الأرشيف» (13 October 2026): the office's physical files and where each one is. The new «archive» section opens it.
-- * location: a storage place (room, cabinet, shelf, box) with an optional capacity. Locations are office-wide:
--   anyone with the section sees them; changing them needs all-case scope.
-- * file: one physical file or volume with its own archive number, type, home location and retention date,
--   linked to a case or, with all-case scope, to no case (general office papers).
-- * movement: an immutable custody record for one file: handed to a staff member, sent to an outside body,
--   handed to the client, returned, moved, or confirmed in an inventory. The file's current state and place are
--   always its latest posted movement. A wrong movement is cancelled with a reason, latest first, never edited.
-- * request: a colleague's request for a file, with the date it is needed and its outcome.
-- Files, movements and requests follow case scope exactly like the other departments. Movements for one file are
-- serialized, so two people cannot hand out the same file at once.

alter table mawatheeq_private.department_records drop constraint department_records_workspace_check;
alter table mawatheeq_private.department_records add constraint department_records_workspace_check check(workspace in ('collections','accounting','hr','archive'));
alter table mawatheeq_private.department_records drop constraint department_records_check;
alter table mawatheeq_private.department_records add constraint department_records_check check(
 (workspace='collections' and kind='file' and case_id is not null and subject_id is null)
 or (workspace='collections' and kind in ('statement','payment') and case_id is not null and subject_id is not null)
 or (workspace='accounting' and kind='entry' and subject_id is null)
 or (workspace='hr' and case_id is null and (kind='employee' and subject_id is null or kind='leave' and subject_id is not null))
 or (workspace='archive' and kind='location' and case_id is null and subject_id is null)
 or (workspace='archive' and kind='file' and subject_id is null)
 or (workspace='archive' and kind in ('movement','request') and subject_id is not null));
create unique index department_archive_number on mawatheeq_private.department_records(lower(payload->>'number')) where workspace='archive' and kind='file';
create unique index department_archive_location on mawatheeq_private.department_records(lower(payload->>'code')) where workspace='archive' and kind='location';

-- The owner's full access includes the new section.
create or replace function mawatheeq_private.access_for(p_user uuid) returns jsonb
language sql stable set search_path='' as $$
 select case when exists(select 1 from public.mawatheeq_members where user_id=p_user and role='owner') then
  '{"sections":["overview","cases","clients","deadlines","analytics","verification","work","conflicts","documents","secretary","collections","accounting","hr","archive"],"caseScope":"all","caseIds":[],"canEdit":true,"canExport":true,"revision":0}'::jsonb
 else coalesce((select permissions||jsonb_build_object('revision',revision) from mawatheeq_private.member_access where user_id=p_user),
  '{"sections":[],"caseScope":"selected","caseIds":[],"canEdit":false,"canExport":false,"revision":0}'::jsonb) end;
$$;

-- Saving permissions accepts the «archive» section and the «archivist» job role; everything else (validation,
-- revision check, admin powers, audit entry, session revocation) stays in the existing functions.
alter function mawatheeq_private.save_access(uuid,jsonb,integer) rename to save_access_powers;
create function mawatheeq_private.save_access(p_user uuid,p_permissions jsonb,p_revision integer) returns jsonb
language plpgsql set search_path='' as $$
declare archive boolean:=false; archivist boolean:=false; p jsonb:=p_permissions; result jsonb;
begin
 if jsonb_typeof(p) is not distinct from 'object' and jsonb_typeof(p->'sections') is not distinct from 'array' then
  archive:=p->'sections' ? 'archive';
  p:=jsonb_set(p,'{sections}',coalesce((select jsonb_agg(s) from jsonb_array_elements(p->'sections') s where s<>'"archive"'::jsonb),'[]'));
 end if;
 if p ? 'jobRole' and p->'jobRole'='"archivist"'::jsonb then archivist:=true; p:=jsonb_set(p,'{jobRole}','"custom"'); end if;
 result:=mawatheeq_private.save_access_powers(p_user,p,p_revision);
 if archive or archivist then
  update mawatheeq_private.member_access set permissions=permissions
    ||case when archive then jsonb_build_object('sections',(permissions->'sections')||'["archive"]'::jsonb) else '{}' end
    ||case when archivist then '{"jobRole":"archivist"}'::jsonb else '{}' end
   where user_id=p_user returning permissions||jsonb_build_object('revision',revision) into result;
  update mawatheeq_private.access_changes set after_permissions=after_permissions
    ||case when archive then jsonb_build_object('sections',(after_permissions->'sections')||'["archive"]'::jsonb) else '{}' end
    ||case when archivist then '{"jobRole":"archivist"}'::jsonb else '{}' end
   where id=(select max(id) from mawatheeq_private.access_changes where user_id=p_user);
 end if;
 return result;
end $$;

-- Current custody of one file: the latest posted movement decides its state and holder; the latest movement
-- that names a location decides where it is kept, otherwise its home location.
create function mawatheeq_private.archive_state(p_file uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'state',coalesce((select m.payload->>'toState' from mawatheeq_private.department_records m where m.subject_id=p_file and m.workspace='archive' and m.kind='movement'
    and m.payload->>'status'='posted' order by m.created_at desc,m.id desc limit 1),'in'),
  'lastId',(select m.id from mawatheeq_private.department_records m where m.subject_id=p_file and m.workspace='archive' and m.kind='movement'
    and m.payload->>'status'='posted' order by m.created_at desc,m.id desc limit 1),
  'locationId',coalesce((select m.payload->>'locationId' from mawatheeq_private.department_records m where m.subject_id=p_file and m.workspace='archive' and m.kind='movement'
    and m.payload->>'status'='posted' and m.payload->>'locationId'<>'' order by m.created_at desc,m.id desc limit 1),
   (select f.payload->>'locationId' from mawatheeq_private.department_records f where f.id=p_file)));
$$;

create function mawatheeq_private.archive_payload(k text,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb; f text;
begin
 if k='location' then
  result:=mawatheeq_private.department_fields(p,array['code','name','cabinet','shelf','box','capacity','notes']);
  if length(result->>'code') not between 1 and 40 or length(result->>'name') not between 1 and 200 then raise exception 'أكمل رمز الموقع واسمه.'; end if;
  if result->>'capacity'<>'' and result->>'capacity' !~ '^[0-9]{1,5}$' then raise exception 'السعة عدد ملفات صحيح.'; end if;
  foreach f in array array['cabinet','shelf','box'] loop if length(result->>f)>40 then raise exception 'راجع الخزانة والرف والصندوق.'; end if; end loop;
 elsif k='file' then
  result:=mawatheeq_private.department_fields(p,array['number','title','type','volume','pages','locationId','originals','confidential','intakeDate','retentionUntil','notes']);
  if length(result->>'number') not between 1 and 40 or result->>'number' !~ '^[A-Za-z0-9./ $+%-]+$' then raise exception 'رقم الأرشيف أحرف لاتينية وأرقام وشرطة فقط.'; end if;
  if length(result->>'title') not between 1 and 300 or length(result->>'type') not between 1 and 100 or length(result->>'volume')>40 then raise exception 'أكمل عنوان الملف ونوعه.'; end if;
  if result->>'pages'<>'' and result->>'pages' !~ '^[0-9]{1,6}$' then raise exception 'عدد الأوراق رقم صحيح.'; end if;
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

create function mawatheeq_private.archive_request(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; result jsonb; v_offset integer; item jsonb; v_id uuid; v_kind text; v_case text; subject uuid;
 r mawatheeq_private.department_records%rowtype; f mawatheeq_private.department_records%rowtype; old jsonb; next_payload jsonb; st jsonb; v_to text;
 all_scope boolean;
begin
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
 if length(p_data::text)>250000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'archive'));
 all_scope:=a->>'caseScope'='all';
 v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),1000000));
 if p_action='cases_page' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
   select cs.id,coalesce(cs.payload->>'code','') as code,coalesce(cs.payload->>'autoNumber','') as "autoNumber",
    coalesce(cs.payload->>'client','') as client,coalesce(cs.payload->>'clientGroup','') as "clientGroup",
    coalesce(e.payload->>'name','') as "clientEntityName",coalesce(cs.payload->>'opponent','') as opponent,cs.revision,cs.archived
   from public.mawatheeq_cases cs left join mawatheeq_private.client_entities e on e.id::text=cs.payload->>'clientEntityId'
   where mawatheeq_private.case_assigned(actor,cs.id) order by cs.id limit 500 offset v_offset) t;
  return result;
 elsif p_action='people' then
  -- Names of active accounts only, to pick who receives or asks for a file.
  return (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'username',x.username,'displayName',coalesce(x.display_name,'')) order by x.username),'[]')
   from mawatheeq_private.accounts x where x.enabled);
 elsif p_action='check_export' then
  perform mawatheeq_private.require_access((a->>'canExport')::boolean); return '{}';
 elsif p_action='records_page' then
  select coalesce(jsonb_agg(mawatheeq_private.department_json(t)),'[]') into result from
   (select * from mawatheeq_private.department_records where workspace='archive'
     and (kind='location' or mawatheeq_private.department_visible(actor,'archive',case_id)) order by id limit 500 offset v_offset) t;
  return result;
 elsif p_action not in ('save_record','history','archive_record','void_record') then raise exception 'العملية المطلوبة غير متاحة.';
 end if;

 item:=p_data->'record';
 v_id:=case when p_action='save_record' then (item->>'id')::uuid else (p_data->>'id')::uuid end;
 if v_id is null then raise exception 'معرف السجل مطلوب.'; end if;
 perform pg_advisory_xact_lock(hashtext('department-record-'||v_id::text));
 select * into r from mawatheeq_private.department_records where id=v_id for update;
 if r.id is not null then perform mawatheeq_private.require_access(r.workspace='archive' and (r.kind='location' or mawatheeq_private.department_visible(actor,'archive',r.case_id)));
 elsif p_action<>'save_record' then perform mawatheeq_private.require_access(false); end if;
 if p_action='history' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
   select h.id,h.revision,h.before_record as before,h.after_record as after,u.username as actor,h.created_at as "createdAt"
   from mawatheeq_private.department_changes h join mawatheeq_private.accounts u on u.id=h.actor_id where h.record_id=r.id order by h.id desc limit 50 offset v_offset) t;
  return result;
 end if;

 perform mawatheeq_private.require_access((a->>'canEdit')::boolean);
 if coalesce(r.revision,0) is distinct from (case when p_action='save_record' then item->>'revision' else p_data->>'revision' end)::integer then
  raise exception 'تغير السجل. أعد تحميله قبل الحفظ.' using errcode='40001'; end if;
 old:=case when r.id is null then null else mawatheeq_private.department_json(r) end;

 if p_action='save_record' then
  v_kind:=item->>'kind'; v_case:=nullif(item->>'caseId',''); subject:=nullif(item->>'subjectId','')::uuid;
  if r.id is not null and (r.kind is distinct from v_kind or r.case_id is distinct from v_case or r.subject_id is distinct from subject) then
   raise exception 'ارتباط السجل ونوعه ثابتان. أنشئ سجلاً آخر عند الحاجة.'; end if;
  if r.archived then raise exception 'أعد فتح السجل المؤرشف قبل تعديله.'; end if;
  if v_kind='movement' and r.id is not null then raise exception 'حركة الملف ثابتة؛ ألغها بسبب ثم سجّل الحركة الصحيحة.'; end if;
  next_payload:=mawatheeq_private.archive_payload(v_kind,item->'payload');
  if next_payload->>'locationId'<>'' and not exists(select 1 from mawatheeq_private.department_records l where l.id=(next_payload->>'locationId')::uuid
    and l.workspace='archive' and l.kind='location' and not l.archived) then raise exception 'اختر موقعاً فعالاً.'; end if;
  foreach v_to in array array['holderId','requesterId'] loop
   if coalesce(next_payload->>v_to,'')<>'' and not exists(select 1 from mawatheeq_private.accounts where id=(next_payload->>v_to)::uuid) then raise exception 'الموظف المختار غير موجود.'; end if;
  end loop;
  if v_kind='location' then
   perform mawatheeq_private.require_access(all_scope and v_case is null and subject is null);
   if exists(select 1 from mawatheeq_private.department_records where workspace='archive' and kind='location' and id<>v_id and lower(payload->>'code')=lower(next_payload->>'code')) then
    raise exception 'رمز الموقع مستخدم لموقع آخر.'; end if;
  elsif v_kind='file' then
   perform mawatheeq_private.require_access(subject is null and mawatheeq_private.department_visible(actor,'archive',v_case));
   if v_case is not null and not exists(select 1 from public.mawatheeq_cases where id=v_case and (not archived or r.id is not null)) then raise exception 'اختر قضية محفوظة.'; end if;
   if exists(select 1 from mawatheeq_private.department_records where workspace='archive' and kind='file' and id<>v_id and lower(payload->>'number')=lower(next_payload->>'number')) then
    raise exception 'رقم الأرشيف مستخدم لملف آخر.'; end if;
  elsif v_kind in ('movement','request') then
   -- Every movement of one file waits for the previous one, so custody never forks.
   perform pg_advisory_xact_lock(hashtext('archive-file-'||coalesce(subject::text,'')));
   select * into f from mawatheeq_private.department_records where id=subject and workspace='archive' and kind='file';
   if f.id is null or f.archived then raise exception 'اختر ملف أرشيف فعالاً.'; end if;
   perform mawatheeq_private.require_access(mawatheeq_private.department_visible(actor,'archive',f.case_id) and v_case is not distinct from f.case_id);
   if v_kind='movement' then
    st:=mawatheeq_private.archive_state(f.id);
    if not (case next_payload->>'type' when 'checkout' then st->>'state'='in' when 'court' then st->>'state' in ('in','staff') when 'client' then st->>'state'='in'
      when 'return' then st->>'state' in ('staff','court','client') else st->>'state'='in' end) then
     raise exception 'لا تناسب هذه الحركة حالة الملف الحالية. أعد تحميل الملف.' using errcode='40001'; end if;
    if next_payload->>'type'='move' and next_payload->>'locationId'=coalesce(st->>'locationId','') then raise exception 'الملف محفوظ في هذا الموقع بالفعل.'; end if;
    v_to:=case next_payload->>'type' when 'checkout' then 'staff' when 'court' then 'court' when 'client' then 'client' else 'in' end;
    if v_to='in' then next_payload:=next_payload||'{"holder":"","holderId":"","dueDate":"","purpose":""}'::jsonb||
      case when next_payload->>'type' in ('return','audit') then jsonb_build_object('purpose','') else '{}' end; end if;
    next_payload:=next_payload||jsonb_build_object('status','posted','voidReason','','fromState',st->>'state','toState',v_to);
   end if;
  else raise exception 'نوع السجل غير متاح.';
  end if;
  insert into mawatheeq_private.department_records(id,workspace,kind,case_id,subject_id,payload,created_by,updated_by,created_at,updated_at)
   values(v_id,'archive',v_kind,v_case,subject,next_payload,actor,actor,clock_timestamp(),clock_timestamp())
   on conflict(id) do update set payload=excluded.payload,revision=department_records.revision+1,updated_by=actor,updated_at=clock_timestamp()
   returning * into r;
 elsif p_action='archive_record' then
  if jsonb_typeof(p_data->'archived') is distinct from 'boolean' then raise exception 'حالة الأرشيف غير صالحة.'; end if;
  if r.kind='file' then
   if (p_data->>'archived')::boolean and mawatheeq_private.archive_state(r.id)->>'state'<>'in' then raise exception 'أعد الملف إلى الأرشيف قبل إغلاقه.'; end if;
  elsif r.kind='location' then
   perform mawatheeq_private.require_access(all_scope);
   if (p_data->>'archived')::boolean and exists(select 1 from mawatheeq_private.department_records x where x.workspace='archive' and x.kind='file' and not x.archived
     and mawatheeq_private.archive_state(x.id)->>'locationId'=r.id::text) then raise exception 'انقل الملفات المحفوظة في هذا الموقع قبل إغلاقه.'; end if;
  elsif r.kind='request' then null;
  else raise exception 'ألغِ الحركة بسبب بدلاً من حذفها.';
  end if;
  update mawatheeq_private.department_records set archived=(p_data->>'archived')::boolean,revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where id=r.id returning * into r;
 elsif p_action='void_record' then
  perform mawatheeq_private.require_access(r.kind='movement');
  perform pg_advisory_xact_lock(hashtext('archive-file-'||r.subject_id::text));
  if r.payload->>'status'<>'posted' or length(btrim(coalesce(p_data->>'reason',''))) not between 1 and 2000 then raise exception 'الحركة ملغاة بالفعل أو سبب الإلغاء غير مكتمل.'; end if;
  if (mawatheeq_private.archive_state(r.subject_id)->>'lastId')::uuid is distinct from r.id then raise exception 'تُلغى آخر حركة للملف أولاً.' using errcode='40001'; end if;
  update mawatheeq_private.department_records set payload=payload||jsonb_build_object('status','void','voidReason',btrim(p_data->>'reason')),revision=revision+1,updated_by=actor,updated_at=clock_timestamp()
   where id=r.id returning * into r;
 end if;
 insert into mawatheeq_private.department_changes(record_id,before_record,after_record,revision,actor_id) values(r.id,old,mawatheeq_private.department_json(r),r.revision,actor);
 return mawatheeq_private.department_json(r);
end $$;

alter function mawatheeq_private.department_request(text,text,jsonb) rename to department_request_collections;
create function mawatheeq_private.department_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_data is not null and jsonb_typeof(p_data)='object' and p_data->>'workspace'='archive' and p_action<>'backup_page' then
  return mawatheeq_private.archive_request(p_token,p_action,p_data); end if;
 return mawatheeq_private.department_request_collections(p_token,p_action,p_data);
end $$;

revoke all on function mawatheeq_private.access_for(uuid),mawatheeq_private.save_access(uuid,jsonb,integer),mawatheeq_private.save_access_powers(uuid,jsonb,integer),
 mawatheeq_private.archive_state(uuid),mawatheeq_private.archive_payload(text,jsonb),mawatheeq_private.archive_request(text,text,jsonb),
 mawatheeq_private.department_request(text,text,jsonb),mawatheeq_private.department_request_collections(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.department_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
