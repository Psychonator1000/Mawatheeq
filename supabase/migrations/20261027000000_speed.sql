-- Faster lookups: indexes for the columns the app filters and joins on, and the mail list checks each mailbox's rights
-- once instead of once per message.
begin;

create index if not exists acc_move_lines_case on mawatheeq_private.acc_move_lines(case_id) where case_id is not null;
create index if not exists acc_move_lines_partner on mawatheeq_private.acc_move_lines(partner_id) where partner_id is not null;
create index if not exists acc_moves_case on mawatheeq_private.acc_moves(case_id) where case_id is not null;
create index if not exists acc_moves_partner on mawatheeq_private.acc_moves(partner_id, date) where partner_id is not null;
create index if not exists acc_moves_reversed_from on mawatheeq_private.acc_moves(reversed_from) where reversed_from is not null;
create index if not exists acc_outside_partner on mawatheeq_private.acc_outside(partner_id) where partner_id is not null;
create index if not exists acc_outside_custody_outside on mawatheeq_private.acc_outside_custody(outside_id);
create index if not exists acc_schedule_lines_schedule on mawatheeq_private.acc_schedule_lines(schedule_id);
create index if not exists acc_statement_lines_move on mawatheeq_private.acc_statement_lines(move_id) where move_id is not null;
create index if not exists department_records_kind on mawatheeq_private.department_records(workspace, kind);
create index if not exists sessions_expires on mawatheeq_private.sessions(expires_at);
create index if not exists chat_files_conversation on mawatheeq_private.chat_files(conversation_id);
create index if not exists mail_messages_unread on mawatheeq_private.mail_messages(account_id, sent_at desc) where folder='inbox' and not initial;
create index if not exists mail_messages_assigned on mawatheeq_private.mail_messages(assigned_to) where assigned_to is not null;
create index if not exists mail_reads_user on mawatheeq_private.mail_reads(user_id);

-- The mail list: each mailbox's rights are worked out once; search words are matched literally (% and _ are not wildcards).
create or replace function mawatheeq_private.mail_request(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; actor uuid; v_ws text; v_folder text; v_q text; v_limit integer;
begin
 if p_action='list' then
  actor:=mawatheeq_private.authorize(p_token);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  v_ws:=p_data->>'workspace'; v_folder:=coalesce(nullif(p_data->>'folder',''),'inbox');
  v_q:=nullif(btrim(coalesce(p_data->>'q','')),'');
  if v_q is not null then v_q:='%'||replace(replace(replace(left(v_q,200),'\','\\'),'%','\%'),'_','\_')||'%'; end if;
  v_limit:=least(greatest(coalesce((p_data->>'limit')::integer,50),1),200);
  perform mawatheeq_private.require_access(v_ws is not null and mawatheeq_private.mail_can_open(actor,v_ws));
  return (with acc as (
    select ac.id,mawatheeq_private.mail_rights(actor,ac.id) rights from mawatheeq_private.mail_accounts ac
    where ac.workspace=v_ws and (coalesce(p_data->>'accountId','')='' or ac.id=(p_data->>'accountId')::uuid)),
   pick as (
    select mm,mm.sent_at s,mm.id i from mawatheeq_private.mail_messages mm join acc on acc.id=mm.account_id
    where (v_folder='all' or mm.folder=v_folder) and mm.folder=any(acc.rights)
     and (v_q is null or mm.subject ilike v_q or mm.from_addr ilike v_q or mm.from_name ilike v_q or mm.snippet ilike v_q or mm.to_list::text ilike v_q)
     and (coalesce(p_data->>'filter','')='' or (p_data->>'filter'='unread' and mm.folder='inbox' and not mm.initial and not exists(select 1 from mawatheeq_private.mail_reads rr where rr.message_id=mm.id and rr.user_id=actor))
       or (p_data->>'filter'='open' and mm.folder='inbox' and mm.state='open') or (p_data->>'filter'='mine' and mm.assigned_to=actor))
     and (coalesce(p_data->>'before','')='' or mm.sent_at<(p_data->>'before')::timestamptz)
    order by mm.sent_at desc,mm.id limit v_limit)
   select coalesce(jsonb_agg(mawatheeq_private.mail_summary_json(pick.mm,actor) order by pick.s desc,pick.i),'[]') from pick);
 end if;
 r:=mawatheeq_private.mail_request_core(p_token,p_action,p_data);
 -- The core checked the rights; only what this person could open or mark is queued.
 if p_action='get' and r->>'folder'='inbox' then
  perform mawatheeq_private.mail_queue_seen(array[(r->>'id')::uuid],true);
 elsif p_action='mark' then
  perform mawatheeq_private.mail_queue_seen(array(select (y#>>'{}')::uuid from jsonb_array_elements(p_data->'ids') y
   where exists(select 1 from mawatheeq_private.mail_messages mm where mm.id=(y#>>'{}')::uuid and 'inbox'=any(mawatheeq_private.mail_rights(mawatheeq_private.authorize(p_token),mm.account_id)))),
   coalesce((p_data->>'read')::boolean,true));
 end if;
 return r;
end $$;
revoke all on function mawatheeq_private.mail_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.mail_request(text,text,jsonb) to anon,authenticated,service_role;

analyze mawatheeq_private.acc_move_lines; analyze mawatheeq_private.acc_moves; analyze mawatheeq_private.mail_messages;
notify pgrst,'reload schema';
commit;
