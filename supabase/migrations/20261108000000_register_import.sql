begin;
-- One-time import of the old system's case registers (8 November 2026), to be removed once done. The office owner sends
-- the registers in batches; each case is matched by its automatic number (a case without one by its register's code)
-- and the register wins: code, client, role, opponent, subject, court, case number and file status are set from it,
-- and every session and judgment the case lacks is added to its open record at the highest level. A case the app does
-- not have is created. Client files are linked by name through the existing link (a new name opens a client file to
-- review). «dryRun» counts everything and writes nothing. Safe to run again; a batch re-sent adds nothing twice.

create or replace function mawatheeq_private.import_register(p_items jsonb,p_dry boolean,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 it jsonb; h jsonb; pr jsonb; r public.mawatheeq_cases%rowtype; ids text[]; v_target text; v_id text; p jsonb; e jsonb; v_key text;
 matched int:=0; updated int:=0; created int:=0; added int:=0; several int:=0; invalid int:=0; client_moves int:=0;
 code_changes jsonb:='[]'; new_clients text[]:='{}';
begin
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 then raise exception 'دفعة السجل غير صالحة أو تتجاوز 100 قضية.'; end if;
 perform pg_advisory_xact_lock(hashtext('mawatheeq-case-writes'));
 for it in select value from jsonb_array_elements(p_items) loop
  h:=it->'header';
  if jsonb_typeof(it)<>'object' or coalesce(it->>'autoNumber','') !~ '^[0-9]{0,20}$' or jsonb_typeof(h)<>'object' or btrim(coalesce(h->>'client',''))=''
   or jsonb_typeof(it->'procedures')<>'array' or jsonb_typeof(it->'newCase')<>'object' or (coalesce(it->>'autoNumber','')='' and coalesce(it->>'code','')='') then
   invalid:=invalid+1; continue; end if;
  v_key:=mawatheeq_private.client_key(h->>'client');
  if not exists(select 1 from mawatheeq_private.client_entities ent where ent.merged_into is null and (mawatheeq_private.client_key(ent.payload->>'name')=v_key
    or exists(select 1 from jsonb_array_elements_text(ent.payload->'aliases') a where mawatheeq_private.client_key(a)=v_key)))
   and not (btrim(h->>'client')=any(new_clients)) then new_clients:=new_clients||btrim(h->>'client'); end if;
  if it->>'autoNumber'<>'' then
   select array_agg(id order by id) into ids from public.mawatheeq_cases where payload->>'autoNumber'=it->>'autoNumber';
  else
   select array_agg(id order by id) into ids from public.mawatheeq_cases where coalesce(payload->>'autoNumber','')='' and payload->>'code'=it->>'code'
    and coalesce((payload->>'insurance')::boolean,false)=coalesce((it->>'insurance')::boolean,false);
  end if;
  if coalesce(array_length(ids,1),0)=0 then
   v_id:=gen_random_uuid()::text;
   p:=(it->'newCase')-'id'-'revision'-'archived'-'clientEntityId'-'clientContactId'||jsonb_build_object('id',v_id,'revision',1);
   perform mawatheeq_private.validate_case(p);
   if not p_dry then
    insert into public.mawatheeq_cases(id,payload,revision,archived) values(v_id,p,1,false);
    insert into public.mawatheeq_audit(actor,record_id,action) values(p_actor,v_id,'register_import_case');
   end if;
   created:=created+1; added:=added+jsonb_array_length(it->'procedures'); continue;
  end if;
  matched:=matched+1; if array_length(ids,1)>1 then several:=several+1; end if;
  -- The history goes to the open record at the highest court level.
  select id into v_target from public.mawatheeq_cases where id=any(ids)
   order by archived, case coalesce(payload->>'stage','') when 'تمييز' then 3 when 'استئناف' then 2 else 1 end desc, id limit 1;
  foreach v_id in array ids loop
   select * into r from public.mawatheeq_cases where id=v_id for update;
   p:=r.payload;
   if coalesce(p->>'code','') is distinct from coalesce(h->>'code','') and jsonb_array_length(code_changes)<2000 then
    code_changes:=code_changes||jsonb_build_array(jsonb_build_object('autoNumber',it->>'autoNumber','from',coalesce(p->>'code',''),'to',h->>'code','client',h->>'client'));
   end if;
   -- Another client than the one linked: the link is made again from the name.
   select ent.payload into e from mawatheeq_private.client_entities ent where ent.id::text=p->>'clientEntityId';
   if e is null or (mawatheeq_private.client_key(e->>'name')<>v_key and not exists(select 1 from jsonb_array_elements_text(e->'aliases') a where mawatheeq_private.client_key(a)=v_key)) then
    p:=p||jsonb_build_object('clientEntityId','','clientContactId',''); client_moves:=client_moves+1;
   end if;
   p:=p||h;
   if v_id=v_target then
    for pr in select value from jsonb_array_elements(it->'procedures') loop
     if exists(select 1 from jsonb_array_elements(coalesce(p->'procedures','[]')) x where coalesce(x->>'date','')=coalesce(pr->>'date','') and x->>'kind'=pr->>'kind') then continue; end if;
     p:=jsonb_set(p,'{procedures}',coalesce(p->'procedures','[]')||jsonb_build_array(pr)); added:=added+1;
    end loop;
   end if;
   if p is distinct from r.payload then
    p:=p||jsonb_build_object('revision',r.revision+1);
    perform mawatheeq_private.validate_case(p);
    if not p_dry then
     update public.mawatheeq_cases set payload=p,revision=r.revision+1 where id=v_id;
     insert into public.mawatheeq_audit(actor,record_id,action) values(p_actor,v_id,'register_import_update');
    end if;
    updated:=updated+1;
   end if;
  end loop;
 end loop;
 return jsonb_build_object('dryRun',p_dry,'matched',matched,'updated',updated,'created',created,'entriesAdded',added,'several',several,
  'invalid',invalid,'clientMoves',client_moves,'codeChanges',code_changes,'newClients',to_jsonb(new_clients));
end $$;

do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='local_request_register') then
  alter function mawatheeq_private.local_request(text,text,jsonb) rename to local_request_register;
 end if;
end $$;
create or replace function mawatheeq_private.local_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 if p_action<>'import_register' then return mawatheeq_private.local_request_register(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 perform mawatheeq_private.require_access(mawatheeq_private.is_owner());
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>4000000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 return mawatheeq_private.import_register(p_data->'items',coalesce((p_data->>'dryRun')::boolean,true),actor);
end $$;

revoke all on function mawatheeq_private.import_register(jsonb,boolean,uuid),mawatheeq_private.local_request(text,text,jsonb),
 mawatheeq_private.local_request_register(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.local_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
