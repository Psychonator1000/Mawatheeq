begin;
-- Paper-file handover (1 November 2026): the archive hands files out against the recipient's own confirmation.
-- * A colleague asks for a case's paper file from the case itself; the request lands in the archive's requests.
-- * The archive sends a list of files at once (the daily handover sheet), each to its recipient. Each file is
--   outside the archive, with that person, from the moment it is sent, and waits for the recipient to confirm
--   «استلمت» before the paper changes hands. Sending a file closes the recipient's open request for it.
-- * The holder reports «أرجعت الملف»; the file stays with them until the archive confirms it is back on the shelf.
-- A hand-out to an account carries, beside its fixed movement fields, server-set fields: receipt ('pending' →
-- 'received'), receivedAt, returnClaimedAt and batchId (the handover sheet it was sent on). Hand-outs to a name
-- typed by hand, to an outside body or to the client have no receipt to confirm.
-- The «desk_*» actions need no archive section: anyone may see the files they hold and their own requests, and ask
-- for the paper file of a case they can open.

create function mawatheeq_private.archive_now() returns text
language sql stable set search_path='' as $$ select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'); $$;

-- One change-log entry for a record changed outside the core save.
create function mawatheeq_private.archive_log(p_before jsonb,r mawatheeq_private.department_records,p_actor uuid) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb:=mawatheeq_private.department_json(r);
begin
 insert into mawatheeq_private.department_changes(record_id,before_record,after_record,revision,actor_id) values(r.id,p_before,result,r.revision,p_actor);
 return result;
end $$;

-- After a hand-out to an account: wait for the recipient's receipt and close their open requests for the file.
create function mawatheeq_private.archive_after_checkout(p_movement uuid,p_actor uuid,p_batch text) returns jsonb
language plpgsql set search_path='' as $$
declare m mawatheeq_private.department_records%rowtype; q mawatheeq_private.department_records%rowtype; before jsonb;
begin
 select * into m from mawatheeq_private.department_records where id=p_movement;
 update mawatheeq_private.department_records set payload=payload||jsonb_build_object('receipt','pending','receivedAt','','returnClaimedAt','','batchId',coalesce(p_batch,''))
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

-- The file's latest posted movement, if it is a hand-out to this account.
create function mawatheeq_private.archive_held(p_file uuid,p_user uuid) returns uuid
language sql stable set search_path='' as $$
 select m.id from mawatheeq_private.department_records m
  where m.id=(mawatheeq_private.archive_state(p_file)->>'lastId')::uuid and m.payload->>'type'='checkout' and m.payload->>'holderId'=p_user::text;
$$;

-- Cases sharing the office code of this case: one paper file serves every judgment of a case.
create function mawatheeq_private.archive_case_ids(p_case text) returns setof text
language sql stable set search_path='' as $$
 select p_case union
 select c.id from public.mawatheeq_cases c join public.mawatheeq_cases k on k.id=p_case
  where coalesce(k.payload->>'code','')<>'' and c.payload->>'code'=k.payload->>'code';
$$;

-- Whether this person may ask for the paper file: they open its case (or one sharing its code) from the cases page.
create function mawatheeq_private.archive_may_request(p_user uuid,p_case text) returns boolean
language sql stable set search_path='' as $$
 select p_case is not null and (mawatheeq_private.has_section(p_user,'cases') or mawatheeq_private.has_section(p_user,'archive'))
  and exists(select 1 from mawatheeq_private.archive_case_ids(p_case) c(id) where mawatheeq_private.case_assigned(p_user,c.id));
$$;

create function mawatheeq_private.archive_file_brief(f mawatheeq_private.department_records) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('fileId',f.id,'number',f.payload->>'number','title',f.payload->>'title','type',f.payload->>'type','volume',coalesce(f.payload->>'volume',''),
  'caseId',coalesce(f.case_id,''),'caseCode',coalesce(c.payload->>'code',''),'client',coalesce(c.payload->>'client',''),'opponent',coalesce(c.payload->>'opponent',''))
 from (select 1) x left join public.mawatheeq_cases c on c.id=f.case_id;
$$;

alter function mawatheeq_private.archive_request(text,text,jsonb) rename to archive_request_core;
create function mawatheeq_private.archive_request(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; result jsonb; f mawatheeq_private.department_records%rowtype; m mawatheeq_private.department_records%rowtype;
 q mawatheeq_private.department_records%rowtype; before jsonb; item jsonb; holder text; v_batch text; v_date text; st jsonb; v_id uuid; out jsonb:='[]'; n integer:=0;
begin
 if p_action like 'desk\_%' then
  actor:=mawatheeq_private.authorize(p_token);
  if length(p_data::text)>20000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
  if p_action='desk_mine' then
   -- The files this person holds or is asked to confirm, and their own requests (open, or settled in the last 30 days).
   select coalesce(jsonb_agg(mawatheeq_private.archive_file_brief(x)||jsonb_build_object('movementId',mv.id,'date',mv.payload->>'date','dueDate',mv.payload->>'dueDate',
     'purpose',mv.payload->>'purpose','receipt',coalesce(mv.payload->>'receipt',''),'receivedAt',coalesce(mv.payload->>'receivedAt',''),'returnClaimedAt',coalesce(mv.payload->>'returnClaimedAt',''),
     'sentBy',coalesce(nullif(u.display_name,''),u.username),'sentAt',mv.created_at) order by mv.created_at),'[]') into result
    from mawatheeq_private.department_records x
    join mawatheeq_private.department_records mv on mv.id=mawatheeq_private.archive_held(x.id,actor)
    join mawatheeq_private.accounts u on u.id=mv.created_by
    where x.workspace='archive' and x.kind='file' and not x.archived and x.id in (select h.subject_id from mawatheeq_private.department_records h
     where h.workspace='archive' and h.kind='movement' and h.payload->>'holderId'=actor::text);
   return jsonb_build_object('holding',result,'requests',(select coalesce(jsonb_agg(mawatheeq_private.archive_file_brief(x)||jsonb_build_object('id',r.id,'neededBy',r.payload->>'neededBy',
     'purpose',r.payload->>'purpose','status',r.payload->>'status','decisionNote',r.payload->>'decisionNote','createdAt',r.created_at,'updatedAt',r.updated_at) order by r.created_at desc),'[]')
    from mawatheeq_private.department_records r join mawatheeq_private.department_records x on x.id=r.subject_id
    where r.workspace='archive' and r.kind='request' and not r.archived and r.payload->>'requesterId'=actor::text
     and (r.payload->>'status' in ('pending','ready') or r.updated_at>clock_timestamp()-interval '30 days')));
  elsif p_action='desk_case' then
   perform mawatheeq_private.require_access(mawatheeq_private.archive_may_request(actor,p_data->>'caseId'));
   return (select coalesce(jsonb_agg(mawatheeq_private.archive_file_brief(x)||jsonb_build_object('state',st2->>'state','holder',coalesce(mv.payload->>'holder',''),
     'mine',coalesce(mv.payload->>'holderId','')=actor::text,'receipt',coalesce(mv.payload->>'receipt',''),'returnClaimedAt',coalesce(mv.payload->>'returnClaimedAt',''),
     'movementId',case when coalesce(mv.payload->>'holderId','')=actor::text then mv.id end,'dueDate',coalesce(mv.payload->>'dueDate',''),
     'request',(select jsonb_build_object('id',r.id,'status',r.payload->>'status','neededBy',r.payload->>'neededBy') from mawatheeq_private.department_records r
       where r.workspace='archive' and r.kind='request' and r.subject_id=x.id and not r.archived and r.payload->>'requesterId'=actor::text and r.payload->>'status' in ('pending','ready')
       order by r.created_at desc limit 1)) order by x.payload->>'number'),'[]')
    from mawatheeq_private.department_records x
    cross join lateral (select mawatheeq_private.archive_state(x.id) st2) s
    left join mawatheeq_private.department_records mv on mv.id=(s.st2->>'lastId')::uuid and s.st2->>'state'<>'in'
    where x.workspace='archive' and x.kind='file' and not x.archived and x.case_id in (select id from mawatheeq_private.archive_case_ids(p_data->>'caseId') c(id)));
  elsif p_action='desk_request' then
   v_id:=nullif(p_data->>'fileId','')::uuid;
   perform pg_advisory_xact_lock(hashtext('archive-file-'||coalesce(v_id::text,'')));
   select * into f from mawatheeq_private.department_records where id=v_id and workspace='archive' and kind='file';
   if f.id is null or f.archived then raise exception 'اختر ملف أرشيف فعالاً.'; end if;
   perform mawatheeq_private.require_access(mawatheeq_private.archive_may_request(actor,f.case_id));
   if mawatheeq_private.archive_held(f.id,actor) is not null then raise exception 'الملف معك بالفعل.'; end if;
   if exists(select 1 from mawatheeq_private.department_records r where r.workspace='archive' and r.kind='request' and r.subject_id=f.id and not r.archived
     and r.payload->>'requesterId'=actor::text and r.payload->>'status' in ('pending','ready')) then raise exception 'طلبت هذا الملف من قبل وما زال طلبك مفتوحاً.'; end if;
   select coalesce(nullif(display_name,''),username) into holder from mawatheeq_private.accounts where id=actor;
   item:=mawatheeq_private.archive_payload('request',jsonb_build_object('requester',holder,'requesterId',actor,'neededBy',coalesce(p_data->>'neededBy',''),
    'purpose',coalesce(p_data->>'purpose',''),'status','pending','notes',coalesce(p_data->>'notes',''),'decisionNote',''));
   if length(item->>'purpose')>500 or length(item->>'notes')>2000 then raise exception 'النص طويل جداً.'; end if;
   insert into mawatheeq_private.department_records(id,workspace,kind,case_id,subject_id,payload,created_by,updated_by,created_at,updated_at)
    values(gen_random_uuid(),'archive','request',f.case_id,f.id,item,actor,actor,clock_timestamp(),clock_timestamp()) returning * into q;
   return mawatheeq_private.archive_log(null,q,actor);
  elsif p_action='desk_cancel' then
   select * into q from mawatheeq_private.department_records where id=nullif(p_data->>'id','')::uuid and workspace='archive' and kind='request' for update;
   perform mawatheeq_private.require_access(q.id is not null and q.payload->>'requesterId'=actor::text);
   if q.archived or q.payload->>'status' not in ('pending','ready') then raise exception 'الطلب مغلق بالفعل.'; end if;
   before:=mawatheeq_private.department_json(q);
   update mawatheeq_private.department_records set payload=payload||jsonb_build_object('status','declined','decisionNote','ألغاه مقدّم الطلب'),revision=revision+1,updated_by=actor,updated_at=clock_timestamp()
    where id=q.id returning * into q;
   return mawatheeq_private.archive_log(before,q,actor);
  elsif p_action in ('desk_receive','desk_return') then
   select * into m from mawatheeq_private.department_records where id=nullif(p_data->>'movementId','')::uuid and workspace='archive' and kind='movement';
   perform mawatheeq_private.require_access(m.id is not null and m.payload->>'holderId'=actor::text);
   perform pg_advisory_xact_lock(hashtext('archive-file-'||m.subject_id::text));
   select * into m from mawatheeq_private.department_records where id=m.id for update;
   if mawatheeq_private.archive_held(m.subject_id,actor) is distinct from m.id then raise exception 'لم يعد الملف مسجلاً معك. أعد التحميل.' using errcode='40001'; end if;
   before:=mawatheeq_private.department_json(m);
   if p_action='desk_receive' then
    if coalesce(m.payload->>'receipt','')<>'pending' then raise exception 'استلامك لهذا الملف مؤكد بالفعل.'; end if;
    update mawatheeq_private.department_records set payload=payload||jsonb_build_object('receipt','received','receivedAt',mawatheeq_private.archive_now()),revision=revision+1,updated_by=actor,updated_at=clock_timestamp()
     where id=m.id returning * into m;
   else
    if coalesce(m.payload->>'receipt','')<>'received' then raise exception 'أكّد استلام الملف أولاً.'; end if;
    if coalesce(m.payload->>'returnClaimedAt','')<>'' then raise exception 'أبلغت بإرجاع الملف من قبل؛ ينتظر تأكيد الأرشيف.'; end if;
    update mawatheeq_private.department_records set payload=payload||jsonb_build_object('returnClaimedAt',mawatheeq_private.archive_now()),revision=revision+1,updated_by=actor,updated_at=clock_timestamp()
     where id=m.id returning * into m;
   end if;
   return mawatheeq_private.archive_log(before,m,actor);
  end if;
  raise exception 'العملية المطلوبة غير متاحة.';
 elsif p_action='dispatch' then
  -- The handover sheet: every file to its recipient in one step, all or nothing.
  if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 200 then raise exception 'أضف ملفاً واحداً على الأقل إلى الكشف.'; end if;
  v_date:=coalesce(p_data->>'date',''); perform mawatheeq_private.department_date(v_date,true);
  v_batch:=gen_random_uuid()::text;
  for item in select * from jsonb_array_elements(p_data->'items') loop
   n:=n+1;
   select * into f from mawatheeq_private.department_records where id=nullif(item->>'fileId','')::uuid and workspace='archive' and kind='file';
   if f.id is null then raise exception 'السطر %: اختر ملف أرشيف.',n; end if;
   if exists(select 1 from jsonb_array_elements(p_data->'items') with ordinality o(x,i) where i<n and x->>'fileId'=item->>'fileId') then raise exception 'الملف % مكرر في الكشف.',f.payload->>'number'; end if;
   select coalesce(nullif(display_name,''),username) into holder from mawatheeq_private.accounts where id=nullif(item->>'holderId','')::uuid and enabled;
   if holder is null then raise exception 'الملف %: اختر المستلم من الموظفين.',f.payload->>'number'; end if;
   begin
    result:=mawatheeq_private.archive_request_core(p_token,'save_record',jsonb_build_object('workspace','archive','record',jsonb_build_object('id',gen_random_uuid(),'kind','movement',
     'caseId',coalesce(f.case_id,''),'subjectId',f.id,'revision',0,'payload',jsonb_build_object('type','checkout','date',v_date,'holder',holder,'holderId',item->>'holderId',
     'purpose',coalesce(item->>'purpose',''),'dueDate',coalesce(item->>'dueDate',''),'locationId','','notes',coalesce(p_data->>'notes','')))));
   exception when others then raise exception 'الملف %: %',f.payload->>'number',sqlerrm using errcode=sqlstate;
   end;
   out:=out||mawatheeq_private.archive_after_checkout((result->>'id')::uuid,(select created_by from mawatheeq_private.department_records where id=(result->>'id')::uuid),v_batch);
  end loop;
  return jsonb_build_object('batchId',v_batch,'movements',out);
 elsif p_action='approve_return' then
  -- The archive confirms the file is back: a return movement, as when receiving it at the desk.
  select * into f from mawatheeq_private.department_records where id=nullif(p_data->>'fileId','')::uuid and workspace='archive' and kind='file';
  if f.id is null then raise exception 'اختر ملف أرشيف.'; end if;
  v_date:=coalesce(nullif(p_data->>'date',''),((clock_timestamp() at time zone 'Asia/Kuwait')::date)::text);
  return mawatheeq_private.archive_request_core(p_token,'save_record',jsonb_build_object('workspace','archive','record',jsonb_build_object('id',gen_random_uuid(),'kind','movement',
   'caseId',coalesce(f.case_id,''),'subjectId',f.id,'revision',0,'payload',jsonb_build_object('type','return','date',v_date,'holder','','holderId','','purpose','','dueDate','','locationId','',
   'notes',coalesce(p_data->>'notes','')))));
 end if;
 result:=mawatheeq_private.archive_request_core(p_token,p_action,p_data);
 if p_action='save_record' and result->>'kind'='movement' and result->'payload'->>'type'='checkout' and coalesce(result->'payload'->>'holderId','')<>'' then
  result:=mawatheeq_private.archive_after_checkout((result->>'id')::uuid,(select created_by from mawatheeq_private.department_records where id=(result->>'id')::uuid),'');
 end if;
 return result;
end $$;

revoke all on function mawatheeq_private.archive_now(),mawatheeq_private.archive_log(jsonb,mawatheeq_private.department_records,uuid),
 mawatheeq_private.archive_after_checkout(uuid,uuid,text),mawatheeq_private.archive_held(uuid,uuid),mawatheeq_private.archive_case_ids(text),
 mawatheeq_private.archive_may_request(uuid,text),mawatheeq_private.archive_file_brief(mawatheeq_private.department_records),
 mawatheeq_private.archive_request(text,text,jsonb),mawatheeq_private.archive_request_core(text,text,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
