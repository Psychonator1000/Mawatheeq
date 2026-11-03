begin;
-- The archive follows the cases (14 November 2026). Every case with a code has one paper file, numbered «ARC-» and the
-- code («ARC-T» and the code for an insurance case, which keeps its own register number), titled «client ضد opponent»
-- from the case. When a case is added its file is created; when its code, insurance flag, client or opponent change,
-- its file follows. The paper file's own details (location, movements, notes, retention…) are never touched.
-- Safe to run again.

create or replace function mawatheeq_private.archive_number(p jsonb) returns text language sql immutable set search_path='' as $$
 select case when coalesce(p->>'code','')='' then null
  else 'ARC-'||(case when coalesce((p->>'insurance')::boolean,false) then 'T' else '' end)||(p->>'code') end
$$;
create or replace function mawatheeq_private.archive_title(p jsonb) returns text language sql immutable set search_path='' as $$
 select left(concat_ws(' ضد ',nullif(coalesce(nullif(p->>'clientEntityName',''),p->>'client'),''),nullif(p->>'opponent','')),300)
$$;

create or replace function mawatheeq_private.archive_follow_case() returns trigger language plpgsql security definer set search_path='' as $$
declare want text:=mawatheeq_private.archive_number(new.payload); title text:=mawatheeq_private.archive_title(new.payload); f record; owner uuid;
begin
 if want is null then return new; end if;
 -- This case's file: the one linked to it, else the one already carrying its number (another court level of it).
 select r.id,r.payload into f from mawatheeq_private.department_records r
  where r.workspace='archive' and r.kind='file' and (r.case_id=new.id or lower(r.payload->>'number')=lower(want))
  order by (r.case_id=new.id) desc, r.created_at limit 1;
 if found then
  if f.payload->>'number' is distinct from want and not exists(select 1 from mawatheeq_private.department_records r
     where r.workspace='archive' and r.kind='file' and lower(r.payload->>'number')=lower(want) and r.id<>f.id) then
   update mawatheeq_private.department_records set payload=payload||jsonb_build_object('number',want) where id=f.id;
  end if;
  if f.payload->>'title' is distinct from title then
   update mawatheeq_private.department_records set payload=payload||jsonb_build_object('title',title) where id=f.id;
  end if;
 elsif not new.archived then
  select user_id into owner from public.mawatheeq_members where role='owner' limit 1;
  insert into mawatheeq_private.department_records(id,workspace,kind,case_id,payload,revision,archived,created_by,updated_by)
  values(gen_random_uuid(),'archive','file',new.id,jsonb_build_object('type','ملف قضية','notes','أُدرج تلقائياً مع القضية','pages','','volume','','originals','no',
   'intakeDate','','locationId','','confidential','no','retentionUntil','','number',want,'title',title),1,false,owner,owner);
 end if;
 return new;
end $$;
drop trigger if exists archive_follows_case on public.mawatheeq_cases;
create trigger archive_follows_case after insert or update of payload,archived on public.mawatheeq_cases for each row execute function mawatheeq_private.archive_follow_case();

revoke all on function mawatheeq_private.archive_number(jsonb),mawatheeq_private.archive_title(jsonb),mawatheeq_private.archive_follow_case() from public,anon,authenticated;
commit;
