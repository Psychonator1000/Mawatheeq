begin;
-- Merging client files (14 October 2026). Merging two client files already moved their cases to the file that stays.
-- It now also moves the collection files linked to the merged file, both as the main client and as an extra plaintiff,
-- so they stay linked and can still be saved (a file linked to a merged-away client could no longer be saved).
alter function mawatheeq_private.merge_clients(uuid,uuid,integer,integer) rename to merge_clients_cases;
create function mawatheeq_private.merge_clients(p_source uuid,p_target uuid,p_source_revision integer,p_target_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; files integer;
begin
 result:=mawatheeq_private.merge_clients_cases(p_source,p_target,p_source_revision,p_target_revision);
 update mawatheeq_private.department_records t set
   payload=case when t.payload->>'clientEntityId'=p_source::text then t.payload||jsonb_build_object('clientEntityId',p_target::text) else t.payload end
    ||case when jsonb_typeof(t.payload->'plaintiffs')='array' then jsonb_build_object('plaintiffs',(select coalesce(jsonb_agg(case when p->>'clientEntityId'=p_source::text
      then p||jsonb_build_object('clientEntityId',p_target::text) else p end order by n),'[]') from jsonb_array_elements(t.payload->'plaintiffs') with ordinality e(p,n))) else '{}' end,
   -- Moving the link is not a data change, so a source review of the current version stays valid.
   review=case when (t.review->>'recordRevision')::integer=t.revision then t.review||jsonb_build_object('recordRevision',t.revision+1) else t.review end,
   revision=t.revision+1,updated_at=now()
  where t.workspace='collections' and t.kind='file' and (t.payload->>'clientEntityId'=p_source::text
   or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(t.payload->'plaintiffs')='array' then t.payload->'plaintiffs' else '[]' end) p where p->>'clientEntityId'=p_source::text));
 get diagnostics files=row_count;
 return result||jsonb_build_object('files',files);
end $$;
revoke all on function mawatheeq_private.merge_clients(uuid,uuid,integer,integer),mawatheeq_private.merge_clients_cases(uuid,uuid,integer,integer) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
