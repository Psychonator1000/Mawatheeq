begin;
-- Collection files and client profiles (13 October 2026):
-- * a collection file may link the client entity it is filed for (clientEntityId), separately from the company name as
--   written on its papers. Linking or changing the client keeps a valid source review, like the follow-up fields;
-- * «client_options» lists client entities (id and name) for the link picker, to staff with the collections section
--   and all-case scope, who may already open caseless files for any client;
-- * «entity_files» lists the collection files of one client entity, within the collections section and case scope,
--   for the client profile.

alter function mawatheeq_private.department_payload(text,text,jsonb) rename to department_payload_cases;
create function mawatheeq_private.department_payload(w text,k text,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb; v text;
begin
 result:=mawatheeq_private.department_payload_cases(w,k,p);
 if not (w='collections' and k='file') then return result; end if;
 v:=btrim(coalesce(p->>'clientEntityId',''));
 if v<>'' and (v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or not exists(select 1 from mawatheeq_private.client_entities where id=v::uuid and merged_into is null)) then
  raise exception 'اختر موكلاً محفوظاً.'; end if;
 return result||jsonb_build_object('clientEntityId',v);
end $$;

alter function mawatheeq_private.department_request(text,text,jsonb) rename to department_request_clients;
create function mawatheeq_private.department_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; r mawatheeq_private.department_records%rowtype; v_entity text; result jsonb;
 follow text[]:=array['fileStatus','executionStatus','arrivalDate','debtReason','installment','installmentsTotal','delayDays','overdueAmount','batchNumber',
  'accountingContract','orderFee','promissoryAmount','promissoryDate','promissoryDueDate','tag1','tag2','tag3','tag4','requiredAction','closedDate','closedReason',
  'assignedTo','clientEntityId'];
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' or p_data->>'workspace' is distinct from 'collections' then
  return mawatheeq_private.department_request_clients(p_token,p_action,p_data); end if;
 if p_action='save_record' and p_data->'record'->>'kind'='file' then
  if coalesce(p_data->'record'->>'id','') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   select * into r from mawatheeq_private.department_records where id=(p_data->'record'->>'id')::uuid and workspace='collections' and kind='file';
  end if;
  result:=mawatheeq_private.department_request_clients(p_token,p_action,p_data);
  -- A change to the client link or follow-up fields only keeps the review the file had.
  if r.id is not null and r.review is not null and (r.review->>'recordRevision')::integer=r.revision
   and (r.payload-follow)=((result->'payload')-follow)
   and exists(select 1 from mawatheeq_private.department_records where id=r.id and review is null) then
   update mawatheeq_private.department_records set review=r.review||jsonb_build_object('recordRevision',revision) where id=r.id returning * into r;
   result:=mawatheeq_private.department_json(r);
  end if;
  return result;
 end if;
 if p_action not in ('client_options','entity_files') then return mawatheeq_private.department_request_clients(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
 perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'collections'));
 if p_action='client_options' then
  perform mawatheeq_private.require_access(a->>'caseScope'='all');
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.payload->>'name') order by e.payload->>'name'),'[]') into result
   from mawatheeq_private.client_entities e where e.merged_into is null;
  return result;
 end if;
 v_entity:=nullif(p_data->>'entityId','');
 perform mawatheeq_private.require_access(v_entity is not null);
 select coalesce(jsonb_agg(mawatheeq_private.department_json(t) order by t.payload->>'code'),'[]') into result
  from mawatheeq_private.department_records t where t.workspace='collections' and t.kind='file' and t.payload->>'clientEntityId'=v_entity
   and mawatheeq_private.department_visible(actor,'collections',t.case_id);
 return result;
end $$;

revoke all on function mawatheeq_private.department_payload(text,text,jsonb),mawatheeq_private.department_payload_cases(text,text,jsonb),
 mawatheeq_private.department_request(text,text,jsonb),mawatheeq_private.department_request_clients(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.department_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
