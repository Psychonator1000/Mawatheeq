begin;
-- Court roll import (15 October 2026). The office's «رول الجلسات» report lists each hearing with its case. Each case is
-- matched by its automatic number only (narrowed by court level when one number has several records):
-- * a matched case gains the sessions held (date, decision, next date) it does not have yet, and its empty case
--   number, court, subject, lawyer and opponent are filled from the roll;
-- * an unmatched case is added as an ongoing case, coded by the roll's own numbering when that code is free;
-- * every hearing from today on is added to «المهام والجلسات» unless the case already has one that day, assigned to
--   the lawyer named on the roll when an account has that name (otherwise to the person importing);
-- * an open hearing on a day the roll shows as held is closed with the roll's decision.
-- A dry run returns the same counts without writing. Like the workbook import, it needs the settings power.

create function mawatheeq_private.import_roll(p_cases jsonb,p_file text,p_dry boolean,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 c jsonb; s jsonb; u jsonb; h jsonb; p jsonb; r public.mawatheeq_cases%rowtype; ids text[]; v_id text; v_code text; v_assignee uuid; w mawatheeq_private.work_items%rowtype; item jsonb;
 f text; changed boolean; v_level text;
 matched int:=0; created int:=0; ambiguous int:=0; invalid int:=0; sessions_added int:=0; sessions_known int:=0; hearings_added int:=0; hearings_known int:=0; hearings_closed int:=0; filled int:=0;
 ambiguous_rows jsonb:='[]'; created_rows jsonb:='[]'; taken_codes jsonb:='[]'; unknown_lawyers text[]:='{}'; new_clients text[]:='{}';
 v_today date:=(now() at time zone 'Asia/Kuwait')::date;
begin
 if p_cases is null or jsonb_typeof(p_cases)<>'array' or jsonb_array_length(p_cases)>150 then raise exception 'ملف الرول غير صالح أو يتجاوز 150 قضية في الدفعة.'; end if;
 p_file:=left(btrim(coalesce(p_file,'')),120);
 perform pg_advisory_xact_lock(hashtext('mawatheeq-case-writes'));
 for c in select value from jsonb_array_elements(p_cases) loop
  if jsonb_typeof(c)<>'object' or coalesce(c->>'autoNumber','') !~ '^[0-9]{1,20}$' or btrim(coalesce(c->>'client',''))=''
   or jsonb_typeof(c->'sessions')<>'array' or jsonb_typeof(c->'upcoming')<>'array' or jsonb_typeof(c->'held')<>'array' or jsonb_typeof(c->'newCase')<>'object' then
   invalid:=invalid+1; continue; end if;
  -- Matching: the automatic number; several records with one number are narrowed by court level.
  select array_agg(id order by id) into ids from public.mawatheeq_cases where payload->>'autoNumber'=c->>'autoNumber' and not archived;
  if coalesce(array_length(ids,1),0)>1 then
   select array_agg(id order by id) into ids from public.mawatheeq_cases where id=any(ids)
    and coalesce(nullif(payload->>'stage',''),case when payload->>'type'='حكم تمييز' then 'تمييز' when payload->>'type'='حكم استئناف' then 'استئناف' else 'ابتدائي' end)=coalesce(nullif(c->>'stage',''),'ابتدائي');
  end if;
  if coalesce(array_length(ids,1),0)>1 then
   ambiguous:=ambiguous+1;
   if jsonb_array_length(ambiguous_rows)<100 then ambiguous_rows:=ambiguous_rows||jsonb_build_array(jsonb_build_object('autoNumber',c->>'autoNumber','client',c->>'client','ids',to_jsonb(ids))); end if;
   continue;
  end if;
  if coalesce(array_length(ids,1),0)=1 then
   -- A known case: fill its empty fields and add the sessions it lacks.
   select * into r from public.mawatheeq_cases where id=ids[1] for update;
   p:=r.payload; changed:=false; v_id:=r.id; matched:=matched+1;
   foreach f in array array['caseNumber','court','subject','lawyer','opponent'] loop
    if btrim(coalesce(p->>f,''))='' and btrim(coalesce(c->>f,''))<>'' then p:=p||jsonb_build_object(f,btrim(c->>f)); filled:=filled+1; changed:=true; end if;
   end loop;
   for s in select value from jsonb_array_elements(c->'sessions') loop
    if exists(select 1 from jsonb_array_elements(coalesce(p->'procedures','[]')) x where x->>'date'=s->>'date' and x->>'kind'=s->>'kind') then sessions_known:=sessions_known+1; continue; end if;
    p:=jsonb_set(p,'{procedures}',coalesce(p->'procedures','[]')||jsonb_build_array(s)); sessions_added:=sessions_added+1; changed:=true;
   end loop;
   if changed then
    p:=p||jsonb_build_object('revision',r.revision+1);
    perform mawatheeq_private.validate_case(p);
    if not p_dry then
     update public.mawatheeq_cases set payload=p,revision=r.revision+1,updated_at=now() where id=r.id;
     insert into public.mawatheeq_audit(actor,record_id,action) values(p_actor,r.id,'roll_update_case');
    end if;
   end if;
  else
   -- A new ongoing case, coded by the roll's numbering when no other case has that code.
   v_code:=btrim(coalesce(c->>'special',''));
   if v_code<>'' and exists(select 1 from public.mawatheeq_cases where payload->>'code'=v_code) then
    if jsonb_array_length(taken_codes)<100 then taken_codes:=taken_codes||jsonb_build_array(jsonb_build_object('code',v_code,'autoNumber',c->>'autoNumber','client',c->>'client')); end if;
    v_code:='';
   end if;
   v_id:=gen_random_uuid()::text;
   p:=(c->'newCase')-'id'-'revision'-'stages'-'archived'||jsonb_build_object('id',v_id,'revision',1,'code',v_code,'autoNumber',c->>'autoNumber','procedures',c->'sessions');
   perform mawatheeq_private.validate_case(p);
   if not exists(select 1 from mawatheeq_private.client_entities ent where ent.merged_into is null and (mawatheeq_private.client_key(ent.payload->>'name')=mawatheeq_private.client_key(c->>'client')
     or exists(select 1 from jsonb_array_elements_text(ent.payload->'aliases') a where mawatheeq_private.client_key(a)=mawatheeq_private.client_key(c->>'client'))))
     and not (btrim(c->>'client')=any(new_clients)) then new_clients:=new_clients||btrim(c->>'client'); end if;
   if not p_dry then
    insert into public.mawatheeq_cases(id,payload,revision,archived) values(v_id,p,1,false);
    insert into public.mawatheeq_audit(actor,record_id,action) values(p_actor,v_id,'roll_import_case');
   end if;
   created:=created+1; sessions_added:=sessions_added+jsonb_array_length(c->'sessions');
   if jsonb_array_length(created_rows)<600 then created_rows:=created_rows||jsonb_build_array(jsonb_build_object('autoNumber',c->>'autoNumber','code',v_code,'client',c->>'client','opponent',c->>'opponent','caseNumber',c->>'caseNumber')); end if;
  end if;
  -- The lawyer named on the roll, when an account has that name.
  select a.id into v_assignee from mawatheeq_private.accounts a join public.mawatheeq_members m on m.user_id=a.id
   where a.enabled and (mawatheeq_private.normalized(coalesce(nullif(a.display_name,''),a.username))=mawatheeq_private.normalized(c->>'lawyer') or a.username=btrim(coalesce(c->>'lawyer',''))) limit 1;
  if v_assignee is null then
   v_assignee:=p_actor;
   if btrim(coalesce(c->>'lawyer',''))<>'' and not (btrim(c->>'lawyer')=any(unknown_lawyers)) then unknown_lawyers:=unknown_lawyers||btrim(c->>'lawyer'); end if;
  end if;
  -- Coming hearings, one per case and day.
  for u in select value from jsonb_array_elements(c->'upcoming') loop
   if coalesce(u->>'dueDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (u->>'dueDate')::date<v_today
    or (coalesce(u->>'dueTime','')<>'' and u->>'dueTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then continue; end if;
   if exists(select 1 from mawatheeq_private.work_items x where x.payload->>'caseId'=v_id and x.payload->>'kind'='hearing' and x.payload->>'dueDate'=u->>'dueDate' and x.payload->>'status'<>'cancelled') then
    hearings_known:=hearings_known+1; continue; end if;
   item:=jsonb_build_object('id',gen_random_uuid(),'caseId',v_id,'title',left(btrim(coalesce(u->>'title','جلسة')),200),'kind','hearing','dueDate',u->>'dueDate','dueTime',coalesce(u->>'dueTime',''),
    'assigneeId',v_assignee,'priority',case when u->>'title' like 'النطق بالحكم%' then 'urgent' else 'normal' end,'status','open',
    'location',left(coalesce(u->>'location',''),500),'notes',left(coalesce(u->>'notes',''),5000),'completionNote','');
   if not p_dry then
    insert into mawatheeq_private.work_items(id,payload,revision,created_by,updated_by) values((item->>'id')::uuid,item,1,p_actor,p_actor);
    insert into mawatheeq_private.work_changes(work_id,before_payload,after_payload,revision,actor_id) values((item->>'id')::uuid,null,item,1,p_actor);
   end if;
   hearings_added:=hearings_added+1;
  end loop;
  -- Open hearings on days the roll shows as held are closed with the roll's decision.
  for h in select value from jsonb_array_elements(c->'held') loop
   for w in select * from mawatheeq_private.work_items x where x.payload->>'caseId'=v_id and x.payload->>'kind'='hearing' and x.payload->>'dueDate'=h->>'date'
     and x.payload->>'status' in ('open','in_progress') for update loop
    item:=w.payload||jsonb_build_object('status','done','completionNote',left(coalesce(nullif(btrim(h->>'note'),''),'سُجلت في رول الجلسات'),5000));
    if not p_dry then
     update mawatheeq_private.work_items set payload=item,revision=w.revision+1,updated_by=p_actor,updated_at=clock_timestamp(),completed_at=clock_timestamp() where id=w.id;
     insert into mawatheeq_private.work_changes(work_id,before_payload,after_payload,revision,actor_id) values(w.id,w.payload,item,w.revision+1,p_actor);
    end if;
    hearings_closed:=hearings_closed+1;
   end loop;
  end loop;
 end loop;
 return jsonb_build_object('dryRun',p_dry,'matched',matched,'created',created,'ambiguous',ambiguous,'invalid',invalid,'filled',filled,
  'sessionsAdded',sessions_added,'sessionsKnown',sessions_known,'hearingsAdded',hearings_added,'hearingsKnown',hearings_known,'hearingsClosed',hearings_closed,
  'ambiguousRows',ambiguous_rows,'createdRows',created_rows,'takenCodes',taken_codes,'unknownLawyers',to_jsonb(unknown_lawyers),'newClients',to_jsonb(new_clients));
end $$;

-- The request is authorized like the workbook import: a valid session and the settings power (or the owner).
alter function mawatheeq_private.local_request(text,text,jsonb) rename to local_request_roll;
create function mawatheeq_private.local_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 if p_action<>'import_roll' then return mawatheeq_private.local_request_roll(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 perform mawatheeq_private.require_access(mawatheeq_private.is_owner());
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>2000000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 return mawatheeq_private.import_roll(p_data->'cases',p_data->>'file',coalesce((p_data->>'dryRun')::boolean,true),actor);
end $$;

create or replace function mawatheeq_private.set_power(p_token text,p_fn text,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare v_power text;
begin
 v_power:=case p_fn
  when 'office' then case when p_action in ('context','create_member','reset_member_password','set_member_password','set_member_enabled','set_member_access',
    'access_history','rename_member','set_display_name','switch_user','account_history') then 'staff' when p_action='export_page' then 'backup' when p_action='review' then 'reviews' end
  when 'local' then case when p_action in ('import_cases','import_workbook','import_roll','save_rules') then 'settings' when p_action='save_case' then 'reviews' end
  when 'client' then case when p_action in ('list','merge') then 'settings' end
  when 'department' then case when p_action='backup_page' then 'backup' end
  when 'comment' then case when p_action='delete' then 'chat' end
  when 'chat' then case when p_action in ('summary','messages','file_download') then 'chat' end
 end;
 if v_power is not null and exists(select 1 from mawatheeq_private.sessions where token_hash=extensions.digest(coalesce(p_token,''),'sha256') and impersonated_by is not null) then
  v_power:=null; end if;
 perform set_config('mawatheeq.power',coalesce(v_power,''),true);
end $$;

revoke all on function mawatheeq_private.import_roll(jsonb,text,boolean,uuid),mawatheeq_private.local_request(text,text,jsonb),
 mawatheeq_private.local_request_roll(text,text,jsonb),mawatheeq_private.set_power(text,text,text) from public,anon,authenticated;
grant execute on function mawatheeq_private.local_request(text,text,jsonb),mawatheeq_private.set_power(text,text,text) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
