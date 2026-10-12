begin;
-- Staff chat: one-to-one and group conversations inside the app. Members read and write their conversations; the
-- office owner may review any conversation (read-only unless a member), and the chat panel tells staff so.
-- Messages may reference people, cases, clients and work items. A reference only opens for a reader who may see
-- that record; others see the label the sender typed. Senders edit or delete their messages for 15 minutes.
-- Attachments (≤5 MB) live in a private bucket and are reached through the local-files function, which asks
-- chat_request whether the session may use the file.
create table mawatheeq_private.chat_conversations (
 id uuid primary key, kind text not null check(kind in ('direct','group')),
 title text not null default '' check(length(title)<=80), direct_key text unique,
 created_by uuid not null references mawatheeq_private.accounts(id),
 created_at timestamptz not null default clock_timestamp(), last_message_at timestamptz
);
create table mawatheeq_private.chat_members (
 conversation_id uuid not null references mawatheeq_private.chat_conversations(id), user_id uuid not null references mawatheeq_private.accounts(id),
 joined_at timestamptz not null default clock_timestamp(), left_at timestamptz, last_read bigint not null default 0,
 primary key(conversation_id,user_id)
);
create index chat_members_user on mawatheeq_private.chat_members(user_id) where left_at is null;
create table mawatheeq_private.chat_messages (
 id bigint generated always as identity primary key,
 conversation_id uuid not null references mawatheeq_private.chat_conversations(id),
 sender_id uuid not null references mawatheeq_private.accounts(id), client_id uuid not null,
 kind text not null default 'message' check(kind in ('message','event')),
 body text not null default '' check(length(body)<=4000), refs jsonb not null default '[]', file jsonb,
 created_at timestamptz not null default clock_timestamp(), edited_at timestamptz, deleted_at timestamptz,
 unique(conversation_id,client_id)
);
create index chat_messages_conversation on mawatheeq_private.chat_messages(conversation_id,id);
create table mawatheeq_private.chat_files (
 path text primary key, conversation_id uuid not null references mawatheeq_private.chat_conversations(id),
 uploader uuid not null references mawatheeq_private.accounts(id), name text not null, size integer not null, mime text not null,
 message_id bigint references mawatheeq_private.chat_messages(id), created_at timestamptz not null default clock_timestamp()
);
revoke all on mawatheeq_private.chat_conversations,mawatheeq_private.chat_members,mawatheeq_private.chat_messages,mawatheeq_private.chat_files from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mawatheeq-chat','mawatheeq-chat',false,5242880,array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/msword','application/vnd.ms-excel'])
on conflict(id) do nothing;

create function mawatheeq_private.chat_name(p_user uuid) returns text
language sql stable set search_path='' as $$ select coalesce(nullif(display_name,''),username) from mawatheeq_private.accounts where id=p_user; $$;
-- Whether a reader may open a referenced record.
create function mawatheeq_private.chat_ref_ok(p_user uuid,p_ref jsonb) returns boolean
language sql stable set search_path='' as $$
 select case p_ref->>'type'
  when 'user' then exists(select 1 from mawatheeq_private.accounts where id::text=p_ref->>'id')
  when 'case' then exists(select 1 from public.mawatheeq_cases where id=p_ref->>'id') and mawatheeq_private.can_case(p_user,p_ref->>'id')
  when 'client' then mawatheeq_private.access_for(p_user)->>'caseScope'='all' and mawatheeq_private.has_section(p_user,'clients')
   and exists(select 1 from mawatheeq_private.client_entities where id::text=p_ref->>'id')
  when 'work' then exists(select 1 from mawatheeq_private.work_items w where w.id::text=p_ref->>'id'
   and (mawatheeq_private.can_work_payload(p_user,w.payload) or (coalesce(w.payload->>'caseId','')='' and w.created_by=p_user)))
  else false end;
$$;
create function mawatheeq_private.chat_member(p_conversation uuid,p_user uuid) returns boolean
language sql stable set search_path='' as $$ select exists(select 1 from mawatheeq_private.chat_members where conversation_id=p_conversation and user_id=p_user and left_at is null); $$;

create function mawatheeq_private.chat_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; owner boolean; v_conv uuid; v_other uuid; v_msg mawatheeq_private.chat_messages%rowtype; v_refs jsonb; v_body text; v_file jsonb;
 v_q text; result jsonb; v_id bigint; v_names text; v_path text;
begin
 actor:=mawatheeq_private.authorize(p_token); owner:=mawatheeq_private.is_owner();
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>20000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 v_conv:=nullif(p_data->>'conversationId','')::uuid;
 case p_action
 when 'people' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',coalesce(nullif(a.display_name,''),a.username),'username',a.username) order by coalesce(nullif(a.display_name,''),a.username)),'[]')
   from mawatheeq_private.accounts a join public.mawatheeq_members m on m.user_id=a.id where a.enabled and a.id<>actor);
 when 'summary' then
  return jsonb_build_object('owner',owner,'conversations',(select coalesce(jsonb_agg(x order by x->>'lastAt' desc nulls last),'[]') from (
   select jsonb_build_object('id',c.id,'kind',c.kind,'title',c.title,'lastAt',coalesce(c.last_message_at,c.created_at),
    'isMember',mm.user_id is not null,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',mawatheeq_private.chat_name(m.user_id)) order by m.joined_at),'[]') from mawatheeq_private.chat_members m where m.conversation_id=c.id and m.left_at is null),
    'last',(select jsonb_build_object('body',case when l.deleted_at is not null then 'حُذفت هذه الرسالة' when l.body='' and l.file is not null then '📎 '||(l.file->>'name') else left(l.body,120) end,'sender',mawatheeq_private.chat_name(l.sender_id),'mine',l.sender_id=actor,'kind',l.kind)
      from mawatheeq_private.chat_messages l where l.conversation_id=c.id order by l.id desc limit 1),
    'unread',case when mm.user_id is null then 0 else (select count(*) from mawatheeq_private.chat_messages u where u.conversation_id=c.id and u.id>mm.last_read and u.sender_id<>actor and u.kind='message' and u.deleted_at is null) end) x
   from mawatheeq_private.chat_conversations c left join mawatheeq_private.chat_members mm on mm.conversation_id=c.id and mm.user_id=actor and mm.left_at is null
   where mm.user_id is not null or owner) t));
 when 'messages' then
  perform mawatheeq_private.require_access(mawatheeq_private.chat_member(v_conv,actor) or (owner and exists(select 1 from mawatheeq_private.chat_conversations where id=v_conv)));
  return (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'senderId',m.sender_id,'senderName',mawatheeq_private.chat_name(m.sender_id),'mine',m.sender_id=actor,
    'body',case when m.deleted_at is null then m.body else '' end,'deleted',m.deleted_at is not null,'createdAt',m.created_at,'editedAt',m.edited_at,
    'editable',m.sender_id=actor and m.kind='message' and m.deleted_at is null and m.created_at>clock_timestamp()-interval '15 minutes',
    'file',case when m.deleted_at is null then m.file end,
    'refs',case when m.deleted_at is not null then '[]'::jsonb else (select coalesce(jsonb_agg(r||jsonb_build_object('ok',mawatheeq_private.chat_ref_ok(actor,r))),'[]') from jsonb_array_elements(m.refs) r) end) order by m.id),'[]')
   from (select * from mawatheeq_private.chat_messages where conversation_id=v_conv and id>coalesce((p_data->>'after')::bigint,0)
    and (p_data->>'before' is null or id<(p_data->>'before')::bigint) order by id desc limit 80) m);
 when 'search' then
  v_q:=mawatheeq_private.normalized(left(coalesce(p_data->>'q',''),60));
  if length(v_q)<1 then return '[]'; end if;
  return coalesce((select jsonb_agg(x) from (
   (select jsonb_build_object('type','user','id',a.id,'label',coalesce(nullif(a.display_name,''),a.username),'sub','@'||a.username) x from mawatheeq_private.accounts a join public.mawatheeq_members m on m.user_id=a.id
     where a.enabled and mawatheeq_private.normalized(coalesce(a.display_name,'')||' '||a.username) like '%'||v_q||'%' limit 5)
   union all
   (select jsonb_build_object('type','case','id',c.id,'label',coalesce(nullif(c.payload->>'code',''),nullif(c.payload->>'autoNumber',''),'قضية'),'sub',coalesce(c.payload->>'client','')||' ضد '||coalesce(c.payload->>'opponent','')) from public.mawatheeq_cases c
     where mawatheeq_private.normalized(concat_ws(' ',c.payload->>'code',c.payload->>'autoNumber',c.payload->>'caseNumber',c.payload->>'client',c.payload->>'opponent')) like '%'||v_q||'%'
      and mawatheeq_private.can_case(actor,c.id) limit 8)
   union all
   (select jsonb_build_object('type','client','id',e.id,'label',e.payload->>'name','sub','موكل') from mawatheeq_private.client_entities e
     where e.merged_into is null and mawatheeq_private.access_for(actor)->>'caseScope'='all' and mawatheeq_private.has_section(actor,'clients')
      and mawatheeq_private.normalized(e.payload->>'name') like '%'||v_q||'%' limit 4)
   union all
   (select jsonb_build_object('type','work','id',w.id,'label',w.payload->>'title','sub',(case when w.payload->>'kind'='hearing' then 'جلسة ' else 'مهمة ' end)||coalesce(w.payload->>'dueDate','')) from mawatheeq_private.work_items w
     where mawatheeq_private.normalized(w.payload->>'title') like '%'||v_q||'%' and (mawatheeq_private.can_work_payload(actor,w.payload) or (coalesce(w.payload->>'caseId','')='' and w.created_by=actor)) limit 4)
  ) t),'[]');
 when 'start_direct' then
  v_other:=(p_data->>'userId')::uuid;
  if v_other=actor or not exists(select 1 from mawatheeq_private.accounts a join public.mawatheeq_members m on m.user_id=a.id where a.id=v_other and a.enabled) then raise exception 'اختر زميلاً فعالاً.'; end if;
  select id into v_conv from mawatheeq_private.chat_conversations where direct_key=least(actor::text,v_other::text)||':'||greatest(actor::text,v_other::text);
  if v_conv is null then
   v_conv:=gen_random_uuid();
   insert into mawatheeq_private.chat_conversations(id,kind,direct_key,created_by) values(v_conv,'direct',least(actor::text,v_other::text)||':'||greatest(actor::text,v_other::text),actor);
   insert into mawatheeq_private.chat_members(conversation_id,user_id) values(v_conv,actor),(v_conv,v_other);
  end if;
  return jsonb_build_object('id',v_conv);
 when 'create_group','add_members' then
  if jsonb_typeof(p_data->'memberIds')<>'array' or jsonb_array_length(p_data->'memberIds')>50
   or exists(select 1 from jsonb_array_elements_text(p_data->'memberIds') i where i !~ '^[0-9a-f-]{36}$' or not exists(select 1 from mawatheeq_private.accounts a join public.mawatheeq_members m on m.user_id=a.id where a.id=i::uuid and a.enabled)) then
   raise exception 'اختر زملاء فعالين.'; end if;
  if p_action='create_group' then
   if length(btrim(coalesce(p_data->>'title','')))=0 or length(p_data->>'title')>80 then raise exception 'اكتب اسماً للمجموعة (حتى 80 حرفاً).'; end if;
   v_conv:=gen_random_uuid();
   insert into mawatheeq_private.chat_conversations(id,kind,title,created_by,last_message_at) values(v_conv,'group',btrim(p_data->>'title'),actor,clock_timestamp());
   insert into mawatheeq_private.chat_members(conversation_id,user_id) values(v_conv,actor);
  else
   perform mawatheeq_private.require_access(mawatheeq_private.chat_member(v_conv,actor) and exists(select 1 from mawatheeq_private.chat_conversations where id=v_conv and kind='group'));
  end if;
  insert into mawatheeq_private.chat_members(conversation_id,user_id) select v_conv,i::uuid from jsonb_array_elements_text(p_data->'memberIds') i where i::uuid<>actor
   on conflict(conversation_id,user_id) do update set left_at=null,joined_at=clock_timestamp() where mawatheeq_private.chat_members.left_at is not null;
  select string_agg(mawatheeq_private.chat_name(i::uuid),'، ') into v_names from jsonb_array_elements_text(p_data->'memberIds') i where i::uuid<>actor;
  insert into mawatheeq_private.chat_messages(conversation_id,sender_id,client_id,kind,body) values(v_conv,actor,gen_random_uuid(),'event',
   case when p_action='create_group' then 'أنشأ '||mawatheeq_private.chat_name(actor)||' المجموعة'||coalesce(' مع '||v_names,'') else 'أضاف '||mawatheeq_private.chat_name(actor)||': '||coalesce(v_names,'') end);
  update mawatheeq_private.chat_conversations set last_message_at=clock_timestamp() where id=v_conv;
  return jsonb_build_object('id',v_conv);
 when 'rename' then
  perform mawatheeq_private.require_access(mawatheeq_private.chat_member(v_conv,actor) and exists(select 1 from mawatheeq_private.chat_conversations where id=v_conv and kind='group'));
  if length(btrim(coalesce(p_data->>'title','')))=0 or length(p_data->>'title')>80 then raise exception 'اكتب اسماً للمجموعة (حتى 80 حرفاً).'; end if;
  update mawatheeq_private.chat_conversations set title=btrim(p_data->>'title'),last_message_at=clock_timestamp() where id=v_conv;
  insert into mawatheeq_private.chat_messages(conversation_id,sender_id,client_id,kind,body) values(v_conv,actor,gen_random_uuid(),'event','غيّر '||mawatheeq_private.chat_name(actor)||' اسم المجموعة إلى «'||btrim(p_data->>'title')||'»');
  return jsonb_build_object('id',v_conv);
 when 'leave' then
  perform mawatheeq_private.require_access(mawatheeq_private.chat_member(v_conv,actor) and exists(select 1 from mawatheeq_private.chat_conversations where id=v_conv and kind='group'));
  update mawatheeq_private.chat_members set left_at=clock_timestamp() where conversation_id=v_conv and user_id=actor;
  insert into mawatheeq_private.chat_messages(conversation_id,sender_id,client_id,kind,body) values(v_conv,actor,gen_random_uuid(),'event','غادر '||mawatheeq_private.chat_name(actor)||' المجموعة');
  return '{}'::jsonb;
 when 'send' then
  perform mawatheeq_private.require_access(mawatheeq_private.chat_member(v_conv,actor));
  v_body:=btrim(coalesce(p_data->>'body',''));
  if length(v_body)>4000 then raise exception 'الرسالة طويلة جداً (حتى 4000 حرف).'; end if;
  -- Keep only well-formed references the sender may open.
  select coalesce(jsonb_agg(jsonb_build_object('type',r->>'type','id',r->>'id','label',left(coalesce(r->>'label',''),200))),'[]') into v_refs
   from (select r from jsonb_array_elements(case when jsonb_typeof(p_data->'refs')='array' then p_data->'refs' else '[]'::jsonb end) r limit 20) t
   where r->>'type' in ('user','case','client','work') and length(coalesce(r->>'id',''))between 1 and 100 and mawatheeq_private.chat_ref_ok(actor,r);
  if coalesce(p_data->>'filePath','')<>'' then
   select jsonb_build_object('path',f.path,'name',f.name,'size',f.size,'mime',f.mime) into v_file from mawatheeq_private.chat_files f
    where f.path=p_data->>'filePath' and f.conversation_id=v_conv and f.uploader=actor and f.message_id is null;
   if v_file is null then raise exception 'تعذر إرفاق الملف. أعد رفعه.'; end if;
  end if;
  if v_body='' and v_file is null then raise exception 'اكتب رسالة أو أرفق ملفاً.'; end if;
  insert into mawatheeq_private.chat_messages(conversation_id,sender_id,client_id,body,refs,file) values(v_conv,actor,(p_data->>'clientId')::uuid,v_body,v_refs,v_file)
   on conflict(conversation_id,client_id) do nothing returning id into v_id;
  if v_id is null then select id into v_id from mawatheeq_private.chat_messages where conversation_id=v_conv and client_id=(p_data->>'clientId')::uuid; return jsonb_build_object('id',v_id); end if;
  if v_file is not null then update mawatheeq_private.chat_files set message_id=v_id where path=v_file->>'path'; end if;
  update mawatheeq_private.chat_conversations set last_message_at=clock_timestamp() where id=v_conv;
  update mawatheeq_private.chat_members set last_read=greatest(last_read,v_id) where conversation_id=v_conv and user_id=actor;
  return jsonb_build_object('id',v_id);
 when 'edit','delete' then
  select * into v_msg from mawatheeq_private.chat_messages where id=(p_data->>'id')::bigint for update;
  perform mawatheeq_private.require_access(v_msg.id is not null and v_msg.sender_id=actor and v_msg.kind='message' and v_msg.deleted_at is null and mawatheeq_private.chat_member(v_msg.conversation_id,actor));
  if v_msg.created_at<=clock_timestamp()-interval '15 minutes' then raise exception 'يمكن تعديل الرسالة أو حذفها خلال 15 دقيقة من إرسالها فقط.'; end if;
  if p_action='delete' then
   update mawatheeq_private.chat_messages set deleted_at=clock_timestamp(),body='',refs='[]' where id=v_msg.id;
  else
   v_body:=btrim(coalesce(p_data->>'body',''));
   if v_body='' and v_msg.file is null or length(v_body)>4000 then raise exception 'اكتب نص الرسالة (حتى 4000 حرف).'; end if;
   select coalesce(jsonb_agg(jsonb_build_object('type',r->>'type','id',r->>'id','label',left(coalesce(r->>'label',''),200))),'[]') into v_refs
    from (select r from jsonb_array_elements(case when jsonb_typeof(p_data->'refs')='array' then p_data->'refs' else '[]'::jsonb end) r limit 20) t
    where r->>'type' in ('user','case','client','work') and length(coalesce(r->>'id',''))between 1 and 100 and mawatheeq_private.chat_ref_ok(actor,r);
   update mawatheeq_private.chat_messages set body=v_body,refs=v_refs,edited_at=clock_timestamp() where id=v_msg.id;
  end if;
  return '{}'::jsonb;
 when 'read' then
  update mawatheeq_private.chat_members set last_read=greatest(last_read,coalesce((p_data->>'lastId')::bigint,0)) where conversation_id=v_conv and user_id=actor and left_at is null;
  return '{}'::jsonb;
 when 'file_upload' then
  perform mawatheeq_private.require_access(mawatheeq_private.chat_member(v_conv,actor));
  if coalesce((p_data->>'size')::integer,0) not between 1 and 5242880 then raise exception 'حجم الملف يجب ألا يتجاوز 5 ميغابايت.'; end if;
  if coalesce(p_data->>'mime','') not in ('image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/msword','application/vnd.ms-excel') then raise exception 'نوع الملف غير مدعوم. الصور وPDF وWord وExcel فقط.'; end if;
  v_path:='chat/'||v_conv::text||'/'||gen_random_uuid()::text;
  insert into mawatheeq_private.chat_files(path,conversation_id,uploader,name,size,mime) values(v_path,v_conv,actor,left(coalesce(nullif(btrim(p_data->>'name'),''),'ملف'),160),(p_data->>'size')::integer,p_data->>'mime');
  return jsonb_build_object('path',v_path);
 when 'file_download' then
  select f.path into v_path from mawatheeq_private.chat_files f join mawatheeq_private.chat_messages m on m.id=f.message_id
   where f.path=p_data->>'path' and m.deleted_at is null and (mawatheeq_private.chat_member(f.conversation_id,actor) or owner);
  perform mawatheeq_private.require_access(v_path is not null);
  return jsonb_build_object('path',v_path);
 else raise exception 'العملية المطلوبة غير متاحة.';
 end case;
end $$;

create function public.mawatheeq_chat_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.chat_request(p_token,p_action,p_data); $$;
revoke all on function mawatheeq_private.chat_name(uuid),mawatheeq_private.chat_ref_ok(uuid,jsonb),mawatheeq_private.chat_member(uuid,uuid),
 mawatheeq_private.chat_request(text,text,jsonb),public.mawatheeq_chat_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.chat_request(text,text,jsonb),public.mawatheeq_chat_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
