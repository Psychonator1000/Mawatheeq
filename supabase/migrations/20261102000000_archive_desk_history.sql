begin;
-- «ملفاتي الورقية» page (2 November 2026): every paper file the archive handed this person, newest first, with
-- whether it is still with them, waits for their receipt, was reported back, or has since returned (and when).
-- Hand-outs that were cancelled are left out. Like the other «desk_*» actions it needs no archive section.

alter function mawatheeq_private.archive_request(text,text,jsonb) rename to archive_request_handover;
create function mawatheeq_private.archive_request(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 if p_action<>'desk_history' then return mawatheeq_private.archive_request_handover(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 return (select coalesce(jsonb_agg(t.j order by t.at desc,t.id desc),'[]') from (
  select m.created_at as at,m.id,mawatheeq_private.archive_file_brief(f)||jsonb_build_object('movementId',m.id,'date',m.payload->>'date','dueDate',m.payload->>'dueDate',
    'purpose',m.payload->>'purpose','receipt',coalesce(m.payload->>'receipt',''),'receivedAt',coalesce(m.payload->>'receivedAt',''),
    'returnClaimedAt',coalesce(m.payload->>'returnClaimedAt',''),'sentBy',coalesce(nullif(u.display_name,''),u.username),'sentAt',m.created_at,
    'current',(mawatheeq_private.archive_state(f.id)->>'lastId')::uuid is not distinct from m.id,
    'next',(select jsonb_build_object('type',n.payload->>'type','date',n.payload->>'date','holder',n.payload->>'holder')
      from mawatheeq_private.department_records n where n.workspace='archive' and n.kind='movement' and n.subject_id=m.subject_id and n.payload->>'status'='posted'
       and (n.created_at,n.id)>(m.created_at,m.id) order by n.created_at,n.id limit 1)) as j
  from mawatheeq_private.department_records m
  join mawatheeq_private.department_records f on f.id=m.subject_id
  join mawatheeq_private.accounts u on u.id=m.created_by
  where m.workspace='archive' and m.kind='movement' and m.payload->>'type'='checkout' and m.payload->>'holderId'=actor::text and m.payload->>'status'='posted'
  order by m.created_at desc,m.id desc limit 500) t);
end $$;

revoke all on function mawatheeq_private.archive_request(text,text,jsonb),mawatheeq_private.archive_request_handover(text,text,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
