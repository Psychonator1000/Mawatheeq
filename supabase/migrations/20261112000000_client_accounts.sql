begin;
-- Client accounts and what every account may see, enforced by the server (12 November 2026).
-- 1. A client account («accountKind» client) sees only the cases of the client files in «clientEntityIds»: its case
--    list is kept in step with those files whenever a case is added or changes client, and it can never edit, export
--    or hold admin powers.
-- 2. The case fields an account's view map hides are removed from every case the server sends it; a client account
--    also gets only the session entries when its «سجل الإجراءات» tab is hidden, and none when «الجلسات» is hidden too.
-- 3. A save keeps the stored value of every field the account may not see or not change, so a hidden or read-only
--    field can never be overwritten from that account.
-- 4. A client account cannot use documents, discussions, chat, mail or the departments.
-- Safe to run again.

-- The payload keys behind each field of the case window, with the card it sits in.
create or replace function mawatheeq_private.view_fields() returns table(field text, card text, keys text[]) language sql immutable set search_path='' as $$
 values ('code','parties',array['code']),('autoNumber','parties',array['autoNumber']),('role','parties',array['role']),('opponent','parties',array['opponent']),
  ('client','parties',array['client','clientGroup','clientEntityId','clientEntityName']),('clientContactId','parties',array['clientContactId','clientContactName']),
  ('casePerson','parties',array['casePerson']),('casePersonRole','parties',array['casePersonRole']),
  ('caseNumber','judgment',array['caseNumber']),('court','judgment',array['court']),('type','judgment',array['type']),('date','judgment',array['date']),
  ('outcome','judgment',array['outcome']),('lawyer','judgment',array['lawyer']),('ruling','judgment',array['ruling']),('subject','judgment',array['subject']),
  ('flags','classify',array['insurance','executionFile','telecom']),('notes','classify',array['notes']),
  ('contractNumber','contract',array['contractNumber']),('contractDate','contract',array['contractDate']),('contractFee','contract',array['contractFee']),
  ('contractWaived','contract',array['contractWaived']),('stayed','stay',array['stayed','stayDate']),('stayReason','stay',array['stayReason'])
$$;
-- A field's mode: the strictest of its own setting, its card's and the «بيانات الحكم» tab's.
create or replace function mawatheeq_private.view_field_mode(p_view jsonb,p_field text,p_card text) returns text language sql immutable set search_path='' as $$
 select case when 'hide' in (m1,m2,m3) then 'hide' when 'read' in (m1,m2,m3) then 'read' else 'show' end
 from (select coalesce(p_view->>('field:'||p_field),'') m1,coalesce(p_view->>('card:'||p_card),'') m2,coalesce(p_view->>'tab:case','') m3) x
$$;
create or replace function mawatheeq_private.case_keys_in_mode(p_view jsonb,p_modes text[]) returns text[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(k),'{}') from mawatheeq_private.view_fields() f, unnest(f.keys) k
  where jsonb_typeof(p_view)='object' and mawatheeq_private.view_field_mode(p_view,f.field,f.card)=any(p_modes)
$$;
-- A case as an account may see it.
create or replace function mawatheeq_private.case_for_view(p_payload jsonb,p_view jsonb,p_kind text) returns jsonb language plpgsql immutable set search_path='' as $$
declare p jsonb:=p_payload; hidden text[];
begin
 if jsonb_typeof(p)<>'object' or jsonb_typeof(p_view)<>'object' then return p; end if;
 hidden:=mawatheeq_private.case_keys_in_mode(p_view,array['hide']);
 if cardinality(hidden)>0 then p:=p-hidden; end if;
 if p_kind='client' and jsonb_typeof(p->'procedures')='array' then
  if p_view->>'tab:sessions'='hide' and p_view->>'tab:history'='hide' then p:=p||'{"procedures":[]}';
  elsif p_view->>'tab:history'='hide' then
   p:=p||jsonb_build_object('procedures',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(p->'procedures') x where x->>'kind' in ('جلسة','جلسة خبراء')));
  end if;
 end if;
 return p;
end $$;

-- Client accounts: their case list follows their client files.
create or replace function mawatheeq_private.client_case_ids(p_entities jsonb) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(c.id order by c.id),'[]') from public.mawatheeq_cases c
  where jsonb_typeof(p_entities)='array' and p_entities ? (c.payload->>'clientEntityId')
$$;
create or replace function mawatheeq_private.sync_client_cases() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update mawatheeq_private.member_access m set permissions=jsonb_set(m.permissions,'{caseIds}',
   case when (m.permissions->'clientEntityIds') ? (new.payload->>'clientEntityId')
    then (case when (m.permissions->'caseIds') ? new.id then m.permissions->'caseIds' else coalesce(m.permissions->'caseIds','[]')||jsonb_build_array(new.id) end)
    else coalesce((select jsonb_agg(x) from jsonb_array_elements(m.permissions->'caseIds') x where x#>>'{}'<>new.id),'[]') end)
  where m.permissions->>'accountKind'='client'
   and ((m.permissions->'clientEntityIds') ? (new.payload->>'clientEntityId')) is distinct from ((m.permissions->'caseIds') ? new.id);
 return new;
end $$;
drop trigger if exists client_account_cases on public.mawatheeq_cases;
create trigger client_account_cases after insert or update of payload on public.mawatheeq_cases for each row execute function mawatheeq_private.sync_client_cases();

do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='save_access_view') then
  alter function mawatheeq_private.save_access(uuid,jsonb,integer) rename to save_access_view;
 end if;
end $$;
create or replace function mawatheeq_private.save_access(p_user uuid,p_permissions jsonb,p_revision integer) returns jsonb
language plpgsql set search_path='' as $$
declare p jsonb:=p_permissions;
begin
 if jsonb_typeof(p)='object' and p->>'accountKind'='client' then
  if jsonb_typeof(p->'clientEntityIds') is distinct from 'array' or jsonb_array_length(p->'clientEntityIds')=0 then
   raise exception 'اختر ملف الموكل الذي يرى هذا الحساب قضاياه.'; end if;
  -- A client account: only its own cases, read only, no export, no admin powers, only the cases pages.
  p:=(p-'lawyerNames')||jsonb_build_object('caseScope','selected','caseIds',mawatheeq_private.client_case_ids(p->'clientEntityIds'),
   'canEdit',false,'canExport',false,'adminPowers','[]'::jsonb,
   'sections',(select coalesce(jsonb_agg(s),'[]') from jsonb_array_elements_text(coalesce(p->'sections','[]')) s where s in ('overview','cases')));
 end if;
 return mawatheeq_private.save_access_view(p_user,p,p_revision);
end $$;

-- Every case the server sends follows the account's view map; saves keep what the account may not see or change.
do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='local_request_view') then
  alter function mawatheeq_private.local_request(text,text,jsonb) rename to local_request_view;
 end if;
end $$;
create or replace function mawatheeq_private.local_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; v jsonb; kind text; locked text[]; stored jsonb; result jsonb; d jsonb:=p_data;
begin
 if p_action not in ('cases_page','cases_changes','case_full','save_case') then return mawatheeq_private.local_request_view(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 a:=mawatheeq_private.access_for(actor); v:=a->'view'; kind:=coalesce(a->>'accountKind','');
 if jsonb_typeof(v) is distinct from 'object' or v='{}'::jsonb then return mawatheeq_private.local_request_view(p_token,p_action,p_data); end if;
 if p_action='save_case' and jsonb_typeof(d->'case')='object' then
  locked:=mawatheeq_private.case_keys_in_mode(v,array['hide','read']);
  if cardinality(locked)>0 then
   select c.payload into stored from public.mawatheeq_cases c where c.id=d->'case'->>'id';
   d:=jsonb_set(d,'{case}',((d->'case')-locked)||coalesce((select jsonb_object_agg(k,stored->k) from unnest(locked) k where stored ? k),'{}'));
  end if;
 end if;
 result:=mawatheeq_private.local_request_view(p_token,p_action,d);
 if p_action='cases_page' and jsonb_typeof(result)='array' then
  select coalesce(jsonb_agg(r||jsonb_build_object('payload',mawatheeq_private.case_for_view(r->'payload',v,kind)) order by i),'[]') into result from jsonb_array_elements(result) with ordinality t(r,i);
 elsif p_action='cases_changes' and jsonb_typeof(result->'rows')='array' then
  result:=jsonb_set(result,'{rows}',(select coalesce(jsonb_agg(r||jsonb_build_object('payload',mawatheeq_private.case_for_view(r->'payload',v,kind)) order by i),'[]') from jsonb_array_elements(result->'rows') with ordinality t(r,i)));
 elsif p_action in ('case_full','save_case') and jsonb_typeof(result)='object' and jsonb_typeof(result->'payload')='object' then
  result:=result||jsonb_build_object('payload',mawatheeq_private.case_for_view(result->'payload',v,kind));
 end if;
 return result;
end $$;

-- A client account stays out of documents, discussions, chat, mail and the departments.
create or replace function mawatheeq_private.refuse_client(p_token text) returns void language plpgsql security definer set search_path='' as $$
begin
 if mawatheeq_private.access_for(mawatheeq_private.authorize(p_token))->>'accountKind'='client' then
  raise exception 'هذا القسم غير متاح لحساب الموكل.' using errcode='P0001'; end if;
end $$;
create or replace function public.mawatheeq_case_file_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql set search_path='' as $$
begin perform mawatheeq_private.refuse_client(p_token); return mawatheeq_private.case_file_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then raise exception '%', sqlerrm using errcode='PT409'; end $$;
create or replace function public.mawatheeq_comment_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql set search_path='' as $$
begin perform mawatheeq_private.refuse_client(p_token); perform mawatheeq_private.set_power(p_token,'comment',p_action); return mawatheeq_private.comment_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then raise exception '%', sqlerrm using errcode='PT409'; end $$;

create or replace function public.mawatheeq_chat_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql set search_path='' as $$
begin perform mawatheeq_private.refuse_client(p_token); perform mawatheeq_private.set_power(p_token,'chat',p_action); return mawatheeq_private.chat_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then raise exception '%', sqlerrm using errcode='PT409'; end $$;
create or replace function public.mawatheeq_mail_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql set search_path='' as $$
begin perform mawatheeq_private.refuse_client(p_token); return mawatheeq_private.mail_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then raise exception '%', sqlerrm using errcode='PT409'; end $$;
create or replace function public.mawatheeq_department_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql set search_path='' as $$
begin perform mawatheeq_private.refuse_client(p_token); perform mawatheeq_private.set_power(p_token,'department',p_action); return mawatheeq_private.department_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then raise exception '%', sqlerrm using errcode='PT409'; end $$;

revoke all on function mawatheeq_private.view_fields(),mawatheeq_private.view_field_mode(jsonb,text,text),mawatheeq_private.case_keys_in_mode(jsonb,text[]),
 mawatheeq_private.case_for_view(jsonb,jsonb,text),mawatheeq_private.client_case_ids(jsonb),mawatheeq_private.sync_client_cases(),
 mawatheeq_private.save_access(uuid,jsonb,integer),mawatheeq_private.save_access_view(uuid,jsonb,integer),
 mawatheeq_private.local_request(text,text,jsonb),mawatheeq_private.local_request_view(text,text,jsonb),mawatheeq_private.refuse_client(text) from public,anon,authenticated;
grant execute on function mawatheeq_private.local_request(text,text,jsonb) to anon,authenticated,service_role;
-- The request functions run as the caller; the client check only refuses, so they may call it.
grant execute on function mawatheeq_private.refuse_client(text) to anon,authenticated,service_role;
grant execute on function public.mawatheeq_case_file_request(text,text,jsonb),public.mawatheeq_comment_request(text,text,jsonb),public.mawatheeq_chat_request(text,text,jsonb),
 public.mawatheeq_mail_request(text,text,jsonb),public.mawatheeq_department_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
