-- Email inside each section. A mailbox belongs to a section (القضايا، السكرتارية، التحصيل، المحاسبة، الموارد البشرية،
-- الأرشيف): either shared by the section or a person's own mailbox used in it. Whoever can open the section sees its shared
-- mailboxes and their own; colleagues' mailboxes in the section only when the administrator allows it, separately for
-- incoming mail, outgoing mail and sending from that mailbox. Mail is fetched and sent by the «mail» edge function, which
-- calls mawatheeq_mail_service with the service key; passwords are kept in Supabase Vault and never returned to the browser.
begin;

create table mawatheeq_private.mail_accounts(
 id uuid primary key default gen_random_uuid(),
 workspace text not null check (workspace in ('legal','secretary','collections','accounting','hr','archive')),
 owner_id uuid references mawatheeq_private.accounts(id) on delete set null,
 label text not null default '' check (length(label)<=80),
 address text not null check (address ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(address)<=200),
 display_name text not null default '' check (length(display_name)<=120),
 provider text not null default 'custom' check (provider in ('gmail','outlook','yahoo','zoho','icloud','custom')),
 imap_host text not null check (imap_host ~ '^[A-Za-z0-9.-]{3,200}$'),
 imap_port integer not null default 993 check (imap_port between 1 and 65535),
 imap_security text not null default 'ssl' check (imap_security in ('ssl','starttls')),
 smtp_host text not null default '' check (smtp_host='' or smtp_host ~ '^[A-Za-z0-9.-]{3,200}$'),
 smtp_port integer not null default 465 check (smtp_port between 1 and 65535),
 username text not null check (length(username) between 1 and 200),
 secret_id uuid,
 sent_folder text not null default '' check (length(sent_folder)<=200),
 since_days integer not null default 30 check (since_days between 1 and 365),
 inbox_validity bigint, inbox_uid bigint not null default 0,
 sent_validity bigint, sent_uid bigint not null default 0,
 active boolean not null default true,
 last_sync_at timestamptz, sync_started_at timestamptz,
 last_error text not null default '', last_error_at timestamptz,
 created_by uuid references mawatheeq_private.accounts(id) on delete set null,
 created_at timestamptz not null default now(),
 revision integer not null default 1,
 unique(workspace,address)
);

create table mawatheeq_private.mail_messages(
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references mawatheeq_private.mail_accounts(id) on delete cascade,
 folder text not null check (folder in ('inbox','sent')),
 uid bigint,
 message_id text not null default '',
 in_reply_to text not null default '',
 from_name text not null default '', from_addr text not null default '',
 to_list jsonb not null default '[]', cc_list jsonb not null default '[]',
 reply_to text not null default '',
 subject text not null default '',
 sent_at timestamptz not null default now(),
 snippet text not null default '',
 body_text text not null default '', body_html text not null default '',
 attachments jsonb not null default '[]',
 size integer not null default 0,
 initial boolean not null default false,
 sent_by uuid references mawatheeq_private.accounts(id) on delete set null,
 state text not null default 'open' check (state in ('open','done')),
 assigned_to uuid references mawatheeq_private.accounts(id) on delete set null,
 note text not null default '' check (length(note)<=1000),
 replied_at timestamptz, replied_by uuid references mawatheeq_private.accounts(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(account_id,folder,uid)
);
create index mail_messages_list on mawatheeq_private.mail_messages(account_id,folder,sent_at desc);
create index mail_messages_mid on mawatheeq_private.mail_messages(account_id,message_id) where message_id<>'';

create table mawatheeq_private.mail_reads(
 message_id uuid not null references mawatheeq_private.mail_messages(id) on delete cascade,
 user_id uuid not null references mawatheeq_private.accounts(id) on delete cascade,
 read_at timestamptz not null default now(),
 primary key(message_id,user_id)
);

-- What the administrator allows a person in a section beyond the shared mailboxes and their own.
create table mawatheeq_private.mail_visibility(
 user_id uuid not null references mawatheeq_private.accounts(id) on delete cascade,
 workspace text not null check (workspace in ('legal','secretary','collections','accounting','hr','archive')),
 see_inbox boolean not null default false, see_sent boolean not null default false, can_send boolean not null default false,
 updated_by uuid references mawatheeq_private.accounts(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key(user_id,workspace)
);

-- Used only where Vault is missing (local tests); Supabase projects keep the passwords in Vault.
create table mawatheeq_private.mail_secrets(id uuid primary key default gen_random_uuid(),secret text not null);

alter table mawatheeq_private.mail_accounts enable row level security;
alter table mawatheeq_private.mail_messages enable row level security;
alter table mawatheeq_private.mail_reads enable row level security;
alter table mawatheeq_private.mail_visibility enable row level security;
alter table mawatheeq_private.mail_secrets enable row level security;
revoke all on mawatheeq_private.mail_accounts,mawatheeq_private.mail_messages,mawatheeq_private.mail_reads,mawatheeq_private.mail_visibility,mawatheeq_private.mail_secrets from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mawatheeq-mail','mawatheeq-mail',false,26214400,null) on conflict(id) do nothing;

create function mawatheeq_private.mail_secret_put(p_old uuid,p_value text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
 if to_regproc('vault.create_secret') is not null then
  if p_old is not null then execute 'delete from vault.secrets where id=$1' using p_old; end if;
  execute 'select vault.create_secret($1,$2)' into v using p_value,'mawatheeq-mail-'||gen_random_uuid()::text;
  return v;
 end if;
 if p_old is not null then delete from mawatheeq_private.mail_secrets where id=p_old; end if;
 insert into mawatheeq_private.mail_secrets(secret) values(p_value) returning id into v;
 return v;
end $$;

create function mawatheeq_private.mail_secret_get(p_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare v text;
begin
 if p_id is null then return null; end if;
 if to_regproc('vault.create_secret') is not null then
  execute 'select decrypted_secret from vault.decrypted_secrets where id=$1' into v using p_id; return v; end if;
 return (select secret from mawatheeq_private.mail_secrets where id=p_id);
end $$;

create function mawatheeq_private.mail_secret_drop(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_id is null then return; end if;
 if to_regproc('vault.create_secret') is not null then execute 'delete from vault.secrets where id=$1' using p_id; return; end if;
 delete from mawatheeq_private.mail_secrets where id=p_id;
end $$;

create function mawatheeq_private.mail_can_open(p_user uuid,p_ws text) returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_ws='legal' then mawatheeq_private.can_read_cases(p_user) else mawatheeq_private.has_section(p_user,p_ws) end;
$$;

create function mawatheeq_private.mail_is_owner(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mawatheeq_members where user_id=p_user and role='owner');
$$;

-- Rights of a person on one mailbox: inbox, sent, send.
create function mawatheeq_private.mail_rights(p_user uuid,p_account uuid) returns text[]
language plpgsql stable security definer set search_path='' as $$
declare a mawatheeq_private.mail_accounts%rowtype; v mawatheeq_private.mail_visibility%rowtype; r text[]:='{}';
begin
 select * into a from mawatheeq_private.mail_accounts where id=p_account;
 if a.id is null or not mawatheeq_private.mail_can_open(p_user,a.workspace) then return r; end if;
 if mawatheeq_private.mail_is_owner(p_user) or a.owner_id=p_user then return array['inbox','sent','send']; end if;
 if a.owner_id is null then
  return array['inbox','sent']||case when coalesce((mawatheeq_private.access_for(p_user)->>'canEdit')::boolean,false) then array['send'] else '{}'::text[] end;
 end if;
 select * into v from mawatheeq_private.mail_visibility where user_id=p_user and workspace=a.workspace;
 if v.see_inbox then r:=r||'inbox'::text; end if;
 if v.see_sent then r:=r||'sent'::text; end if;
 if v.can_send then r:=r||'send'::text; end if;
 return r;
end $$;

-- Mailboxes and visibility are managed by the owner or by whoever holds «إدارة الموظفين», never from a switched-into session.
create function mawatheeq_private.mail_admin(p_token text,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select (mawatheeq_private.admin_powers(p_user) ? 'staff') and not exists(select 1 from mawatheeq_private.sessions
  where token_hash=extensions.digest(coalesce(p_token,''),'sha256') and impersonated_by is not null);
$$;

create function mawatheeq_private.mail_person(p_user uuid) returns text
language sql stable security definer set search_path='' as $$
 select coalesce(nullif(display_name,''),username) from mawatheeq_private.accounts where id=p_user;
$$;

create function mawatheeq_private.mail_account_json(a mawatheeq_private.mail_accounts,p_user uuid,p_full boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'workspace',a.workspace,'ownerId',coalesce(a.owner_id::text,''),'ownerName',coalesce(mawatheeq_private.mail_person(a.owner_id),''),
  'label',a.label,'address',a.address,'displayName',a.display_name,'provider',a.provider,'active',a.active,'canSend',a.smtp_host<>'',
  'lastSyncAt',a.last_sync_at,'lastError',a.last_error,'lastErrorAt',a.last_error_at,'revision',a.revision,
  'rights',to_jsonb(mawatheeq_private.mail_rights(p_user,a.id)))
 ||case when p_full then jsonb_build_object('imapHost',a.imap_host,'imapPort',a.imap_port,'imapSecurity',a.imap_security,'smtpHost',a.smtp_host,'smtpPort',a.smtp_port,
  'username',a.username,'sentFolder',a.sent_folder,'sinceDays',a.since_days) else '{}'::jsonb end;
$$;

create function mawatheeq_private.mail_summary_json(m mawatheeq_private.mail_messages,p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'accountId',m.account_id,'folder',m.folder,'fromName',m.from_name,'fromAddr',m.from_addr,'to',m.to_list,'subject',m.subject,
  'sentAt',m.sent_at,'snippet',m.snippet,'attachments',jsonb_array_length(m.attachments),'state',m.state,'assignedTo',coalesce(m.assigned_to::text,''),
  'assignedName',coalesce(mawatheeq_private.mail_person(m.assigned_to),''),'sentBy',coalesce(mawatheeq_private.mail_person(m.sent_by),''),
  'repliedAt',m.replied_at,'repliedBy',coalesce(mawatheeq_private.mail_person(m.replied_by),''),
  'read',m.folder='sent' or m.initial or exists(select 1 from mawatheeq_private.mail_reads r where r.message_id=m.id and r.user_id=p_user));
$$;

create function mawatheeq_private.mail_request(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; admin boolean; a mawatheeq_private.mail_accounts%rowtype; m mawatheeq_private.mail_messages%rowtype; r text[]; v_ws text; v_folder text; v_q text; v_limit integer; result jsonb;
begin
 actor:=mawatheeq_private.authorize(p_token);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 admin:=mawatheeq_private.mail_admin(p_token,actor);
 case p_action
 when 'context' then
  return jsonb_build_object('me',actor,'admin',admin,
   'workspaces',(select coalesce(jsonb_agg(w order by o),'[]') from unnest(array['legal','secretary','collections','accounting','hr','archive']) with ordinality as t(w,o) where mawatheeq_private.mail_can_open(actor,w)),
   'accounts',(select coalesce(jsonb_agg(mawatheeq_private.mail_account_json(x,actor,admin or x.owner_id=actor) order by x.workspace,x.label,x.address),'[]') from mawatheeq_private.mail_accounts x
     where (admin or cardinality(mawatheeq_private.mail_rights(actor,x.id))>0)),
   'visibility',case when admin then (select coalesce(jsonb_agg(jsonb_build_object('userId',v.user_id,'workspace',v.workspace,'inbox',v.see_inbox,'sent',v.see_sent,'send',v.can_send)),'[]') from mawatheeq_private.mail_visibility v) else '[]'::jsonb end,
   -- Colleagues' names and sections, for assigning a message and for the administrator's visibility settings.
   'members',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',coalesce(nullif(x.display_name,''),x.username),'username',x.username,
     'workspaces',(select coalesce(jsonb_agg(w),'[]') from unnest(array['legal','secretary','collections','accounting','hr','archive']) w where mawatheeq_private.mail_can_open(x.id,w))) order by x.username),'[]')
     from mawatheeq_private.accounts x join public.mawatheeq_members mm on mm.user_id=x.id where x.enabled));

 when 'counts' then
  -- Unread incoming mail for the bell: messages fetched on a mailbox's first sync count as already read.
  with mine as (select x.id,x.workspace from mawatheeq_private.mail_accounts x where x.active and 'inbox'=any(mawatheeq_private.mail_rights(actor,x.id))),
  unread as (select mm.*,mine.workspace from mawatheeq_private.mail_messages mm join mine on mine.id=mm.account_id
   where mm.folder='inbox' and not mm.initial and not exists(select 1 from mawatheeq_private.mail_reads rr where rr.message_id=mm.id and rr.user_id=actor))
  select jsonb_build_object('total',(select count(*) from unread),
   'byWorkspace',(select coalesce(jsonb_object_agg(workspace,n),'{}') from (select workspace,count(*) n from unread group by workspace) g),
   'latest',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'workspace',u.workspace,'accountId',u.account_id,'fromName',u.from_name,'fromAddr',u.from_addr,'subject',u.subject,'sentAt',u.sent_at) order by u.sent_at desc),'[]')
     from (select * from unread order by sent_at desc limit 8) u),
   'errors',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'address',x.address,'error',x.last_error)),'[]') from mawatheeq_private.mail_accounts x
     where x.active and x.last_error<>'' and (x.owner_id=actor or (admin and x.id in (select id from mine)))))
  into result;
  return result;

 when 'list' then
  v_ws:=p_data->>'workspace'; v_folder:=coalesce(nullif(p_data->>'folder',''),'inbox'); v_q:=nullif(btrim(coalesce(p_data->>'q','')),'');
  v_limit:=least(greatest(coalesce((p_data->>'limit')::integer,50),1),200);
  perform mawatheeq_private.require_access(v_ws is not null and mawatheeq_private.mail_can_open(actor,v_ws));
  return (select coalesce(jsonb_agg(mawatheeq_private.mail_summary_json(x.mm,actor) order by x.s desc,x.i),'[]') from (
   select mm,mm.sent_at s,mm.id i from mawatheeq_private.mail_messages mm join mawatheeq_private.mail_accounts ac on ac.id=mm.account_id
   where ac.workspace=v_ws and (coalesce(p_data->>'accountId','')='' or ac.id=(p_data->>'accountId')::uuid)
    and (v_folder='all' or mm.folder=v_folder) and mm.folder=any(mawatheeq_private.mail_rights(actor,ac.id))
    and (v_q is null or mm.subject ilike '%'||v_q||'%' or mm.from_addr ilike '%'||v_q||'%' or mm.from_name ilike '%'||v_q||'%' or mm.snippet ilike '%'||v_q||'%' or mm.to_list::text ilike '%'||v_q||'%')
    and (coalesce(p_data->>'filter','')='' or (p_data->>'filter'='unread' and mm.folder='inbox' and not mm.initial and not exists(select 1 from mawatheeq_private.mail_reads rr where rr.message_id=mm.id and rr.user_id=actor))
      or (p_data->>'filter'='open' and mm.folder='inbox' and mm.state='open') or (p_data->>'filter'='mine' and mm.assigned_to=actor))
    and (coalesce(p_data->>'before','')='' or mm.sent_at<(p_data->>'before')::timestamptz)
   order by mm.sent_at desc,mm.id limit v_limit) x);

 when 'get' then
  select * into m from mawatheeq_private.mail_messages where id=(p_data->>'id')::uuid;
  perform mawatheeq_private.require_access(m.id is not null and m.folder=any(mawatheeq_private.mail_rights(actor,m.account_id)));
  if m.folder='inbox' then insert into mawatheeq_private.mail_reads(message_id,user_id) values(m.id,actor) on conflict do nothing; end if;
  return mawatheeq_private.mail_summary_json(m,actor)||jsonb_build_object('cc',m.cc_list,'replyTo',m.reply_to,'messageId',m.message_id,'inReplyTo',m.in_reply_to,
   'text',m.body_text,'html',m.body_html,'attachmentList',m.attachments,'note',m.note,'canSend','send'=any(mawatheeq_private.mail_rights(actor,m.account_id)),
   'readBy',(select coalesce(jsonb_agg(jsonb_build_object('name',mawatheeq_private.mail_person(rr.user_id),'at',rr.read_at) order by rr.read_at),'[]') from mawatheeq_private.mail_reads rr where rr.message_id=m.id));

 when 'mark' then
  if jsonb_typeof(p_data->'ids')<>'array' then raise exception 'بيانات غير صالحة.'; end if;
  if coalesce((p_data->>'read')::boolean,true) then
   insert into mawatheeq_private.mail_reads(message_id,user_id) select mm.id,actor from mawatheeq_private.mail_messages mm
    where mm.id in (select (y#>>'{}')::uuid from jsonb_array_elements(p_data->'ids') y) and mm.folder='inbox' and 'inbox'=any(mawatheeq_private.mail_rights(actor,mm.account_id)) on conflict do nothing;
  else
   delete from mawatheeq_private.mail_reads where user_id=actor and message_id in (select (y#>>'{}')::uuid from jsonb_array_elements(p_data->'ids') y);
   update mawatheeq_private.mail_messages set initial=false where id in (select (y#>>'{}')::uuid from jsonb_array_elements(p_data->'ids') y) and initial
    and 'inbox'=any(mawatheeq_private.mail_rights(actor,account_id));
  end if;
  return jsonb_build_object('ok',true);

 when 'set_state' then
  select * into m from mawatheeq_private.mail_messages where id=(p_data->>'id')::uuid;
  perform mawatheeq_private.require_access(m.id is not null and m.folder=any(mawatheeq_private.mail_rights(actor,m.account_id))
   and coalesce((mawatheeq_private.access_for(actor)->>'canEdit')::boolean,false));
  if coalesce(p_data->>'assignedTo','')<>'' and not exists(select 1 from mawatheeq_private.accounts where id=(p_data->>'assignedTo')::uuid and enabled) then raise exception 'اختر موظفاً.'; end if;
  update mawatheeq_private.mail_messages set state=case when p_data ? 'state' then coalesce(nullif(p_data->>'state',''),state) else state end,
   assigned_to=case when p_data ? 'assignedTo' then nullif(p_data->>'assignedTo','')::uuid else assigned_to end,
   note=case when p_data ? 'note' then left(coalesce(p_data->>'note',''),1000) else note end where id=m.id returning * into m;
  return mawatheeq_private.mail_summary_json(m,actor)||jsonb_build_object('note',m.note);

 when 'delete_account' then
  select * into a from mawatheeq_private.mail_accounts where id=(p_data->>'id')::uuid;
  perform mawatheeq_private.require_access(a.id is not null and (admin or a.owner_id=actor));
  perform mawatheeq_private.mail_secret_drop(a.secret_id);
  delete from mawatheeq_private.mail_accounts where id=a.id;
  return jsonb_build_object('ok',true);

 when 'set_active' then
  select * into a from mawatheeq_private.mail_accounts where id=(p_data->>'id')::uuid;
  perform mawatheeq_private.require_access(a.id is not null and (admin or a.owner_id=actor));
  update mawatheeq_private.mail_accounts set active=coalesce((p_data->>'active')::boolean,true),last_error='',revision=revision+1 where id=a.id returning * into a;
  return mawatheeq_private.mail_account_json(a,actor,true);

 when 'set_visibility' then
  perform mawatheeq_private.require_access(admin);
  v_ws:=p_data->>'workspace';
  if v_ws is null or v_ws not in ('legal','secretary','collections','accounting','hr','archive') then raise exception 'اختر القسم.'; end if;
  if not exists(select 1 from mawatheeq_private.accounts where id=(p_data->>'userId')::uuid) then raise exception 'اختر الموظف.'; end if;
  insert into mawatheeq_private.mail_visibility(user_id,workspace,see_inbox,see_sent,can_send,updated_by,updated_at)
   values((p_data->>'userId')::uuid,v_ws,coalesce((p_data->>'inbox')::boolean,false),coalesce((p_data->>'sent')::boolean,false),coalesce((p_data->>'send')::boolean,false),actor,now())
   on conflict(user_id,workspace) do update set see_inbox=excluded.see_inbox,see_sent=excluded.see_sent,can_send=excluded.can_send,updated_by=actor,updated_at=now();
  return jsonb_build_object('ok',true);
 else raise exception 'Unsupported mail action';
 end case;
end $$;

-- Called only by the edge function (service key) with the person's session token: it never trusts the browser for rights.
create function mawatheeq_private.mail_service(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; admin boolean; a mawatheeq_private.mail_accounts%rowtype; m mawatheeq_private.mail_messages%rowtype; e jsonb; l jsonb; v_id uuid; v_folder text; v_first boolean; v_old bigint; n integer:=0; v_owner uuid;
begin
 actor:=mawatheeq_private.authorize(p_token);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 admin:=mawatheeq_private.mail_admin(p_token,actor);
 case p_action
 when 'due' then
  -- Mailboxes this person can read that have not been fetched in the last minute; claimed so two open windows don't fetch together.
  with picked as (
   update mawatheeq_private.mail_accounts x set sync_started_at=now() where x.id in (
    select y.id from mawatheeq_private.mail_accounts y where y.active and (mawatheeq_private.mail_rights(actor,y.id) && array['inbox','sent'])
     and (coalesce((p_data->>'force')::boolean,false) or y.last_sync_at is null or y.last_sync_at<now()-interval '60 seconds')
     and (y.sync_started_at is null or y.sync_started_at<now()-interval '3 minutes')
     and (coalesce(p_data->>'accountId','')='' or y.id=(p_data->>'accountId')::uuid)
    order by y.last_sync_at nulls first limit 3) returning x.*)
   select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'address',p.address,'imapHost',p.imap_host,'imapPort',p.imap_port,'imapSecurity',p.imap_security,
    'username',p.username,'password',mawatheeq_private.mail_secret_get(p.secret_id),'sentFolder',p.sent_folder,'sinceDays',p.since_days,
    'inboxValidity',p.inbox_validity,'inboxUid',p.inbox_uid,'sentValidity',p.sent_validity,'sentUid',p.sent_uid,'first',p.last_sync_at is null)),'[]') into l from picked p;
  return l;

 when 'ingest' then
  select * into a from mawatheeq_private.mail_accounts where id=(p_data->>'accountId')::uuid for update;
  perform mawatheeq_private.require_access(a.id is not null and (mawatheeq_private.mail_rights(actor,a.id) && array['inbox','sent']));
  v_folder:=p_data->>'folder';
  if v_folder not in ('inbox','sent') then raise exception 'Unsupported folder'; end if;
  v_first:=a.last_sync_at is null;
  v_old:=case v_folder when 'inbox' then a.inbox_validity else a.sent_validity end;
  if v_old is not null and (p_data->>'validity')::bigint is distinct from v_old then
   -- The server renumbered the folder: forget the old numbers; messages are matched again by their Message-ID.
   update mawatheeq_private.mail_messages set uid=null where account_id=a.id and folder=v_folder;
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_data->'messages','[]')) loop
   v_id:=null;
   if coalesce(e->>'messageId','')<>'' then
    select id into v_id from mawatheeq_private.mail_messages where account_id=a.id and folder=v_folder and message_id=e->>'messageId' and (uid is null or uid=(e->>'uid')::bigint) limit 1;
   end if;
   if v_id is not null then
    update mawatheeq_private.mail_messages set uid=(e->>'uid')::bigint where id=v_id;
   else
    insert into mawatheeq_private.mail_messages(account_id,folder,uid,message_id,in_reply_to,from_name,from_addr,to_list,cc_list,reply_to,subject,sent_at,snippet,body_text,body_html,attachments,size,initial)
    values(a.id,v_folder,(e->>'uid')::bigint,left(coalesce(e->>'messageId',''),500),left(coalesce(e->>'inReplyTo',''),500),left(coalesce(e->>'fromName',''),200),left(coalesce(e->>'fromAddr',''),200),
     coalesce(e->'to','[]'),coalesce(e->'cc','[]'),left(coalesce(e->>'replyTo',''),200),left(coalesce(e->>'subject',''),500),coalesce((e->>'date')::timestamptz,now()),
     left(coalesce(e->>'snippet',''),300),left(coalesce(e->>'text',''),200000),left(coalesce(e->>'html',''),500000),coalesce(e->'attachments','[]'),coalesce((e->>'size')::integer,0),v_first)
    on conflict(account_id,folder,uid) do nothing;
    if found then n:=n+1; end if;
   end if;
  end loop;
  if v_folder='inbox' then update mawatheeq_private.mail_accounts set inbox_validity=(p_data->>'validity')::bigint,inbox_uid=greatest(case when v_old is distinct from (p_data->>'validity')::bigint then 0 else inbox_uid end,coalesce((p_data->>'lastUid')::bigint,0)) where id=a.id;
  else update mawatheeq_private.mail_accounts set sent_validity=(p_data->>'validity')::bigint,sent_uid=greatest(case when v_old is distinct from (p_data->>'validity')::bigint then 0 else sent_uid end,coalesce((p_data->>'lastUid')::bigint,0)),
   sent_folder=coalesce(nullif(p_data->>'sentFolder',''),sent_folder) where id=a.id; end if;
  return jsonb_build_object('added',n);

 when 'done' then
  select * into a from mawatheeq_private.mail_accounts where id=(p_data->>'accountId')::uuid;
  perform mawatheeq_private.require_access(a.id is not null and (mawatheeq_private.mail_rights(actor,a.id) && array['inbox','sent']));
  update mawatheeq_private.mail_accounts set sync_started_at=null,
   last_sync_at=case when coalesce((p_data->>'more')::boolean,false) then last_sync_at else now() end,
   last_error=left(coalesce(p_data->>'error',''),500),last_error_at=case when coalesce(p_data->>'error','')<>'' then now() else last_error_at end where id=a.id;
  return jsonb_build_object('ok',true);

 when 'save_account' then
  l:=p_data->'account';
  if l is null or jsonb_typeof(l)<>'object' then raise exception 'بيانات البريد غير صالحة.'; end if;
  if coalesce(l->>'workspace','') not in ('legal','secretary','collections','accounting','hr','archive') then raise exception 'اختر القسم.'; end if;
  v_owner:=nullif(l->>'ownerId','')::uuid;
  -- Anyone in a section may connect their own mailbox to it; shared mailboxes and other people's are set by the administrator.
  perform mawatheeq_private.require_access(admin or (v_owner=actor and mawatheeq_private.mail_can_open(actor,l->>'workspace')));
  if v_owner is not null and not exists(select 1 from mawatheeq_private.accounts where id=v_owner) then raise exception 'اختر الموظف.'; end if;
  v_id:=nullif(l->>'id','')::uuid;
  if v_id is null then
   if coalesce(p_data->>'password','')='' then raise exception 'اكتب كلمة مرور البريد أو كلمة مرور التطبيقات.'; end if;
   insert into mawatheeq_private.mail_accounts(workspace,owner_id,label,address,display_name,provider,imap_host,imap_port,imap_security,smtp_host,smtp_port,username,sent_folder,since_days,created_by,secret_id)
   values(l->>'workspace',v_owner,btrim(coalesce(l->>'label','')),lower(btrim(l->>'address')),btrim(coalesce(l->>'displayName','')),coalesce(nullif(l->>'provider',''),'custom'),
    lower(btrim(l->>'imapHost')),coalesce((l->>'imapPort')::integer,993),coalesce(nullif(l->>'imapSecurity',''),'ssl'),lower(btrim(coalesce(l->>'smtpHost',''))),coalesce((l->>'smtpPort')::integer,465),
    btrim(l->>'username'),btrim(coalesce(l->>'sentFolder','')),coalesce((l->>'sinceDays')::integer,30),actor,mawatheeq_private.mail_secret_put(null,p_data->>'password'))
   returning * into a;
  else
   select * into a from mawatheeq_private.mail_accounts where id=v_id for update;
   perform mawatheeq_private.require_access(a.id is not null and (admin or a.owner_id=actor));
   if a.revision<>coalesce((l->>'revision')::integer,0) then raise exception 'عدّل شخص آخر هذا البريد. أعد فتحه.'; end if;
   update mawatheeq_private.mail_accounts set workspace=l->>'workspace',owner_id=v_owner,label=btrim(coalesce(l->>'label','')),address=lower(btrim(l->>'address')),display_name=btrim(coalesce(l->>'displayName','')),
    provider=coalesce(nullif(l->>'provider',''),'custom'),imap_host=lower(btrim(l->>'imapHost')),imap_port=coalesce((l->>'imapPort')::integer,993),imap_security=coalesce(nullif(l->>'imapSecurity',''),'ssl'),
    smtp_host=lower(btrim(coalesce(l->>'smtpHost',''))),smtp_port=coalesce((l->>'smtpPort')::integer,465),username=btrim(l->>'username'),sent_folder=btrim(coalesce(l->>'sentFolder','')),
    since_days=coalesce((l->>'sinceDays')::integer,30),secret_id=case when coalesce(p_data->>'password','')<>'' then mawatheeq_private.mail_secret_put(secret_id,p_data->>'password') else secret_id end,
    last_error='',revision=revision+1 where id=a.id returning * into a;
  end if;
  return mawatheeq_private.mail_account_json(a,actor,true);

 when 'credentials' then
  -- Stored settings for testing an edited mailbox without retyping its password.
  select * into a from mawatheeq_private.mail_accounts where id=(p_data->>'accountId')::uuid;
  perform mawatheeq_private.require_access(a.id is not null and (admin or a.owner_id=actor or 'send'=any(mawatheeq_private.mail_rights(actor,a.id))));
  return jsonb_build_object('id',a.id,'address',a.address,'displayName',a.display_name,'provider',a.provider,'imapHost',a.imap_host,'imapPort',a.imap_port,'imapSecurity',a.imap_security,
   'smtpHost',a.smtp_host,'smtpPort',a.smtp_port,'username',a.username,'password',mawatheeq_private.mail_secret_get(a.secret_id),'sentFolder',a.sent_folder,
   'canSend','send'=any(mawatheeq_private.mail_rights(actor,a.id)),'sender',mawatheeq_private.mail_person(actor));

 when 'upload_path' then
  select * into a from mawatheeq_private.mail_accounts where id=(p_data->>'accountId')::uuid;
  perform mawatheeq_private.require_access(a.id is not null and 'send'=any(mawatheeq_private.mail_rights(actor,a.id)));
  if coalesce((p_data->>'size')::bigint,0) not between 1 and 15728640 then raise exception 'حجم المرفق يجب ألا يتجاوز 15 ميجابايت.'; end if;
  return jsonb_build_object('path','outgoing/'||a.id||'/'||gen_random_uuid()||'/'||left(regexp_replace(coalesce(p_data->>'name','file'),'[^A-Za-z0-9._-]+','_','g'),100));

 when 'check_paths' then
  -- Files a message may carry: this person's uploads for the mailbox, or attachments of mail they can read (forwarding).
  select * into a from mawatheeq_private.mail_accounts where id=(p_data->>'accountId')::uuid;
  perform mawatheeq_private.require_access(a.id is not null and 'send'=any(mawatheeq_private.mail_rights(actor,a.id)));
  for e in select * from jsonb_array_elements(coalesce(p_data->'paths','[]')) loop
   if not ((e#>>'{}') like 'outgoing/'||a.id::text||'/%' or exists(select 1 from mawatheeq_private.mail_messages mm cross join jsonb_array_elements(mm.attachments) t
     where t->>'path'=(e#>>'{}') and mm.folder=any(mawatheeq_private.mail_rights(actor,mm.account_id)))) then raise exception 'مرفق غير صالح.'; end if;
  end loop;
  return jsonb_build_object('ok',true);

 when 'record_sent' then
  select * into a from mawatheeq_private.mail_accounts where id=(p_data->>'accountId')::uuid;
  perform mawatheeq_private.require_access(a.id is not null and 'send'=any(mawatheeq_private.mail_rights(actor,a.id)));
  l:=p_data->'message';
  insert into mawatheeq_private.mail_messages(account_id,folder,uid,message_id,in_reply_to,from_name,from_addr,to_list,cc_list,subject,sent_at,snippet,body_text,body_html,attachments,size,sent_by)
  values(a.id,'sent',null,left(coalesce(l->>'messageId',''),500),left(coalesce(l->>'inReplyTo',''),500),a.display_name,a.address,coalesce(l->'to','[]'),coalesce(l->'cc','[]'),
   left(coalesce(l->>'subject',''),500),now(),left(coalesce(l->>'snippet',''),300),left(coalesce(l->>'text',''),200000),left(coalesce(l->>'html',''),500000),coalesce(l->'attachments','[]'),coalesce((l->>'size')::integer,0),actor)
  returning * into m;
  if coalesce(p_data->>'replyToId','')<>'' then
   update mawatheeq_private.mail_messages set replied_at=now(),replied_by=actor,state='done'
    where id=(p_data->>'replyToId')::uuid and folder='inbox' and 'inbox'=any(mawatheeq_private.mail_rights(actor,account_id));
  end if;
  return mawatheeq_private.mail_summary_json(m,actor);

 when 'attachment' then
  select * into m from mawatheeq_private.mail_messages where id=(p_data->>'messageId')::uuid;
  perform mawatheeq_private.require_access(m.id is not null and m.folder=any(mawatheeq_private.mail_rights(actor,m.account_id)));
  e:=m.attachments->coalesce((p_data->>'index')::integer,-1);
  if e is null or coalesce(e->>'path','')='' then raise exception 'المرفق غير محفوظ. افتحه من بريدك مباشرة.'; end if;
  return jsonb_build_object('path',e->>'path','name',e->>'name');
 else raise exception 'Unsupported mail service action';
 end case;
end $$;

create function public.mawatheeq_mail_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.mail_request(p_token,p_action,p_data); $$;
create function public.mawatheeq_mail_service(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.mail_service(p_token,p_action,p_data); $$;

revoke all on function mawatheeq_private.mail_secret_put(uuid,text),mawatheeq_private.mail_secret_get(uuid),mawatheeq_private.mail_secret_drop(uuid),
 mawatheeq_private.mail_can_open(uuid,text),mawatheeq_private.mail_is_owner(uuid),mawatheeq_private.mail_rights(uuid,uuid),mawatheeq_private.mail_admin(text,uuid),
 mawatheeq_private.mail_person(uuid),mawatheeq_private.mail_account_json(mawatheeq_private.mail_accounts,uuid,boolean),mawatheeq_private.mail_summary_json(mawatheeq_private.mail_messages,uuid),
 mawatheeq_private.mail_request(text,text,jsonb),mawatheeq_private.mail_service(text,text,jsonb),public.mawatheeq_mail_request(text,text,jsonb),public.mawatheeq_mail_service(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.mail_request(text,text,jsonb),public.mawatheeq_mail_request(text,text,jsonb) to anon,authenticated,service_role;
grant execute on function mawatheeq_private.mail_service(text,text,jsonb),public.mawatheeq_mail_service(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
