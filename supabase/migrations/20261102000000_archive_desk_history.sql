begin;
-- «ملفاتي الورقية» page (2 November 2026): each paper file's journey with this person, from their request to the
-- file being back in the archive, with every dated step on the way.
-- * handouts: every hand-out to this person, newest first, each with the file's posted movements from that hand-out
--   until the file is next back in the archive (sent on to a court or an expert, moved, returned), with who recorded
--   each one and where the file was shelved on its return. A journey is complete once a movement brings it back in.
-- * requests: every request this person made, with what became of it and the hand-out that answered it, if any.
-- * A request marked «سُلّم» by hand now really hands the file to its requester (waiting for «استلمت») when the file
--   is in the archive. A request marked that way before, with no hand-out behind it, can be confirmed by its
--   requester with «استلمت» (desk_accept_marked): the hand-out is recorded as made by whoever marked it, received now.
-- Like the other «desk_*» actions these need no archive section. Safe to run again.

do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='archive_request_handover') then
  alter function mawatheeq_private.archive_request(text,text,jsonb) rename to archive_request_handover;
 end if;
end $$;

create or replace function mawatheeq_private.archive_request(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; result jsonb; v_req mawatheeq_private.department_records%rowtype; v_file mawatheeq_private.department_records%rowtype;
 v_mv mawatheeq_private.department_records%rowtype; st jsonb; v_name text; before jsonb;
begin
 if p_action='desk_accept_marked' then
  actor:=mawatheeq_private.authorize(p_token);
  select * into v_req from mawatheeq_private.department_records where id=nullif(p_data->>'requestId','')::uuid and workspace='archive' and kind='request';
  perform mawatheeq_private.require_access(v_req.id is not null and v_req.payload->>'requesterId'=actor::text);
  perform pg_advisory_xact_lock(hashtext('archive-file-'||v_req.subject_id::text));
  if v_req.payload->>'status'<>'done' then raise exception 'هذا الطلب لم يُعلَّم «سُلّم».'; end if;
  if exists(select 1 from mawatheeq_private.department_records x where x.workspace='archive' and x.kind='movement' and x.subject_id=v_req.subject_id and x.payload->>'type'='checkout'
    and x.payload->>'holderId'=actor::text and x.payload->>'status'='posted' and x.created_at>=v_req.created_at) then raise exception 'سُجّل تسليم هذا الملف لك بالفعل.'; end if;
  select * into v_file from mawatheeq_private.department_records where id=v_req.subject_id;
  st:=mawatheeq_private.archive_state(v_file.id);
  if v_file.archived or st->>'state'<>'in' then
   raise exception 'الملف مسجّل الآن %. اطلب من الأرشيف تصحيح عهدته.',coalesce((select 'مع '||nullif(x.payload->>'holder','') from mawatheeq_private.department_records x where x.id=(st->>'lastId')::uuid),'خارج الأرشيف');
  end if;
  select coalesce(nullif(display_name,''),username) into v_name from mawatheeq_private.accounts where id=actor;
  insert into mawatheeq_private.department_records(id,workspace,kind,case_id,subject_id,payload,created_by,updated_by,created_at,updated_at)
   values(gen_random_uuid(),'archive','movement',v_file.case_id,v_file.id,jsonb_build_object('type','checkout','date',((v_req.updated_at at time zone 'Asia/Kuwait')::date)::text,'holder',v_name,
    'holderId',actor::text,'purpose',coalesce(v_req.payload->>'purpose',''),'dueDate','','locationId','','notes','استلام مؤكد لطلب علّمه الأرشيف «سُلّم»',
    'status','posted','voidReason','','fromState','in','toState','staff','receipt','received','receivedAt',mawatheeq_private.archive_now(),'returnClaimedAt','','batchId',''),
    coalesce(v_req.updated_by,actor),actor,clock_timestamp(),clock_timestamp()) returning * into v_mv;
  return mawatheeq_private.archive_log(null,v_mv,actor);
 end if;
 if p_action='save_record' and p_data->'record'->>'kind'='request' then
  -- «سُلّم» set by hand hands the file to its requester, so they receive the notice and confirm.
  before:=(select mawatheeq_private.department_json(x) from mawatheeq_private.department_records x where x.id=nullif(p_data->'record'->>'id','')::uuid);
  result:=mawatheeq_private.archive_request_handover(p_token,p_action,p_data);
  if result->'payload'->>'status'='done' and coalesce(before->'payload'->>'status','')<>'done' and coalesce(result->'payload'->>'requesterId','')<>''
    and mawatheeq_private.archive_state((result->>'subjectId')::uuid)->>'state'='in'
    and not exists(select 1 from mawatheeq_private.department_records x where x.workspace='archive' and x.kind='movement' and x.subject_id=(result->>'subjectId')::uuid
     and x.payload->>'type'='checkout' and x.payload->>'holderId'=result->'payload'->>'requesterId' and x.payload->>'status'='posted' and x.created_at>=(result->>'createdAt')::timestamptz) then
   perform mawatheeq_private.archive_request_handover(p_token,'dispatch',jsonb_build_object('workspace','archive','date',((clock_timestamp() at time zone 'Asia/Kuwait')::date)::text,
    'items',jsonb_build_array(jsonb_build_object('fileId',result->>'subjectId','holderId',result->'payload'->>'requesterId','purpose',coalesce(result->'payload'->>'purpose','')))));
  end if;
  return result;
 end if;
 if p_action<>'desk_journeys' then return mawatheeq_private.archive_request_handover(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 return jsonb_build_object(
  'handouts',(select coalesce(jsonb_agg(t.j order by t.at desc,t.id desc),'[]') from (
   select m.created_at as at,m.id,mawatheeq_private.archive_file_brief(f)||jsonb_build_object('movementId',m.id,'date',m.payload->>'date','dueDate',m.payload->>'dueDate',
     'purpose',m.payload->>'purpose','receipt',coalesce(m.payload->>'receipt',''),'receivedAt',coalesce(m.payload->>'receivedAt',''),
     'returnClaimedAt',coalesce(m.payload->>'returnClaimedAt',''),'sentBy',coalesce(nullif(u.display_name,''),u.username),'sentAt',m.created_at,
     'current',(mawatheeq_private.archive_state(f.id)->>'lastId')::uuid is not distinct from m.id,
     'steps',(select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'type',n.payload->>'type','date',n.payload->>'date','holder',n.payload->>'holder',
        'toState',n.payload->>'toState','purpose',n.payload->>'purpose','notes',n.payload->>'notes','at',n.created_at,
        'by',coalesce(nullif(b.display_name,''),b.username),'location',coalesce(nullif(concat_ws(' · ',l.payload->>'code',l.payload->>'name'),''),'')) order by n.created_at,n.id),'[]')
      from mawatheeq_private.department_records n
      join mawatheeq_private.accounts b on b.id=n.created_by
      left join mawatheeq_private.department_records l on l.id::text=nullif(n.payload->>'locationId','') and l.kind='location'
      where n.workspace='archive' and n.kind='movement' and n.subject_id=m.subject_id and n.payload->>'status'='posted' and (n.created_at,n.id)>(m.created_at,m.id)
       and (n.created_at,n.id)<=coalesce((select (e.created_at,e.id) from mawatheeq_private.department_records e where e.workspace='archive' and e.kind='movement'
         and e.subject_id=m.subject_id and e.payload->>'status'='posted' and e.payload->>'toState'='in' and (e.created_at,e.id)>(m.created_at,m.id) order by e.created_at,e.id limit 1),
         (n.created_at,n.id)))) as j
   from mawatheeq_private.department_records m
   join mawatheeq_private.department_records f on f.id=m.subject_id
   join mawatheeq_private.accounts u on u.id=m.created_by
   where m.workspace='archive' and m.kind='movement' and m.payload->>'type'='checkout' and m.payload->>'holderId'=actor::text and m.payload->>'status'='posted'
   order by m.created_at desc,m.id desc limit 300) t),
  'requests',(select coalesce(jsonb_agg(mawatheeq_private.archive_file_brief(f)||jsonb_build_object('id',r.id,'neededBy',r.payload->>'neededBy','purpose',r.payload->>'purpose',
     'status',r.payload->>'status','decisionNote',r.payload->>'decisionNote','createdAt',r.created_at,'updatedAt',r.updated_at,'removed',r.archived,
     'movementId',(select m.id from mawatheeq_private.department_records m where m.workspace='archive' and m.kind='movement' and m.subject_id=r.subject_id
       and m.payload->>'type'='checkout' and m.payload->>'holderId'=actor::text and m.payload->>'status'='posted' and m.created_at>=r.created_at order by m.created_at,m.id limit 1))
     order by r.created_at desc),'[]')
   from mawatheeq_private.department_records r join mawatheeq_private.department_records f on f.id=r.subject_id
   where r.workspace='archive' and r.kind='request' and r.payload->>'requesterId'=actor::text));
end $$;

revoke all on function mawatheeq_private.archive_request(text,text,jsonb),mawatheeq_private.archive_request_handover(text,text,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
