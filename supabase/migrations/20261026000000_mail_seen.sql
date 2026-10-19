-- Mail read in the app shows as read on the mail server too (Gmail, Outlook, phones), when the mailbox's switch is on.
-- Opening a message (or marking it read) queues the server flag; marking it unread queues its removal. The next fetch of
-- the mailbox, within about a minute, applies them.
begin;

alter table mawatheeq_private.mail_accounts add column mark_seen boolean not null default true;
-- 0 nothing to do, 1 to mark read on the server, 2 marked, -1 to mark unread again.
alter table mawatheeq_private.mail_messages add column seen_sync smallint not null default 0 check (seen_sync in (-1,0,1,2));
create index mail_messages_seen on mawatheeq_private.mail_messages(account_id) where seen_sync in (-1,1);

create or replace function mawatheeq_private.mail_account_json(a mawatheeq_private.mail_accounts,p_user uuid,p_full boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'workspace',a.workspace,'ownerId',coalesce(a.owner_id::text,''),'ownerName',coalesce(mawatheeq_private.mail_person(a.owner_id),''),
  'label',a.label,'address',a.address,'displayName',a.display_name,'provider',a.provider,'active',a.active,'canSend',a.smtp_host<>'',
  'lastSyncAt',a.last_sync_at,'lastError',a.last_error,'lastErrorAt',a.last_error_at,'revision',a.revision,'markSeen',a.mark_seen,
  'rights',to_jsonb(mawatheeq_private.mail_rights(p_user,a.id)))
 ||case when p_full then jsonb_build_object('imapHost',a.imap_host,'imapPort',a.imap_port,'imapSecurity',a.imap_security,'smtpHost',a.smtp_host,'smtpPort',a.smtp_port,
  'username',a.username,'sentFolder',a.sent_folder,'sinceDays',a.since_days) else '{}'::jsonb end;
$$;

-- Queues the server flag for incoming messages of mailboxes with the switch on.
create function mawatheeq_private.mail_queue_seen(p_ids uuid[],p_seen boolean) returns void
language sql security definer set search_path='' as $$
 update mawatheeq_private.mail_messages m set seen_sync=case when p_seen then case when m.seen_sync=-1 then 2 else 1 end else case when m.seen_sync=1 then 0 else -1 end end
 from mawatheeq_private.mail_accounts a
 where a.id=m.account_id and a.mark_seen and m.folder='inbox' and m.uid is not null and m.id=any(p_ids)
  and (case when p_seen then m.seen_sync in (0,-1) else m.seen_sync in (1,2) end);
$$;

alter function mawatheeq_private.mail_request(text,text,jsonb) rename to mail_request_core;
create function mawatheeq_private.mail_request(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
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

alter function mawatheeq_private.mail_service(text,text,jsonb) rename to mail_service_core;
create function mawatheeq_private.mail_service(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a mawatheeq_private.mail_accounts%rowtype; r jsonb;
begin
 case p_action
 when 'pending_seen' then
  actor:=mawatheeq_private.authorize(p_token);
  select * into a from mawatheeq_private.mail_accounts where id=(p_data->>'accountId')::uuid;
  perform mawatheeq_private.require_access(a.id is not null and 'inbox'=any(mawatheeq_private.mail_rights(actor,a.id)));
  return jsonb_build_object('validity',a.inbox_validity,'items',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'uid',x.uid,'seen',x.seen_sync=1)),'[]') from (
   select id,uid,seen_sync from mawatheeq_private.mail_messages where account_id=a.id and a.mark_seen and folder='inbox' and uid is not null and seen_sync in (-1,1) order by uid limit 500) x));
 when 'seen_done' then
  actor:=mawatheeq_private.authorize(p_token);
  select * into a from mawatheeq_private.mail_accounts where id=(p_data->>'accountId')::uuid;
  perform mawatheeq_private.require_access(a.id is not null and 'inbox'=any(mawatheeq_private.mail_rights(actor,a.id)));
  update mawatheeq_private.mail_messages set seen_sync=case seen_sync when 1 then 2 when -1 then 0 else seen_sync end
   where account_id=a.id and id in (select (y#>>'{}')::uuid from jsonb_array_elements(coalesce(p_data->'ids','[]')) y);
  return jsonb_build_object('ok',true);
 else
  r:=mawatheeq_private.mail_service_core(p_token,p_action,p_data);
  -- The core checked who may save this mailbox; the switch rides along with the rest of its settings.
  if p_action='save_account' and (p_data->'account') ? 'markSeen' then
   update mawatheeq_private.mail_accounts set mark_seen=coalesce((p_data->'account'->>'markSeen')::boolean,true) where id=(r->>'id')::uuid
    returning * into a;
   r:=mawatheeq_private.mail_account_json(a,mawatheeq_private.authorize(p_token),true);
  end if;
  return r;
 end case;
end $$;

revoke all on function mawatheeq_private.mail_queue_seen(uuid[],boolean),mawatheeq_private.mail_request_core(text,text,jsonb),mawatheeq_private.mail_service_core(text,text,jsonb),
 mawatheeq_private.mail_request(text,text,jsonb),mawatheeq_private.mail_service(text,text,jsonb),mawatheeq_private.mail_account_json(mawatheeq_private.mail_accounts,uuid,boolean) from public,anon,authenticated;
grant execute on function mawatheeq_private.mail_request(text,text,jsonb) to anon,authenticated,service_role;
grant execute on function mawatheeq_private.mail_service(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
