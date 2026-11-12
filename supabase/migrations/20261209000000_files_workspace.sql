-- «الملفات» (owner, 12 November 2026): the office's file room. The files themselves stay on the office's network share
-- and never reach the server; the server only lets the section be given (and holds it for the owner) and gives the
-- workspace the case list it files under (codes, clients, opponents), with the same case rules as the other desks.
-- Safe to run again.

-- Saving permissions accepts «files»; everything else stays in the existing functions.
do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='save_access_files') then
  alter function mawatheeq_private.save_access(uuid,jsonb,integer) rename to save_access_files;
 end if;
end $$;
create or replace function mawatheeq_private.save_access(p_user uuid,p_permissions jsonb,p_revision integer) returns jsonb
language plpgsql set search_path='' as $$
declare files boolean:=false; p jsonb:=p_permissions; result jsonb;
begin
 if jsonb_typeof(p) is not distinct from 'object' and jsonb_typeof(p->'sections') is not distinct from 'array' then
  files:=p->'sections' ? 'files';
  p:=jsonb_set(p,'{sections}',coalesce((select jsonb_agg(s) from jsonb_array_elements(p->'sections') s where s<>'"files"'::jsonb),'[]'));
 end if;
 result:=mawatheeq_private.save_access_files(p_user,p,p_revision);
 if files then
  update mawatheeq_private.member_access set permissions=jsonb_set(permissions,'{sections}',(permissions->'sections')||'["files"]'::jsonb)
   where user_id=p_user returning permissions||jsonb_build_object('revision',revision) into result;
  update mawatheeq_private.access_changes set after_permissions=jsonb_set(after_permissions,'{sections}',coalesce(after_permissions->'sections','[]'::jsonb)||'["files"]'::jsonb)
   where id=(select max(id) from mawatheeq_private.access_changes where user_id=p_user);
 end if;
 return result;
end $$;
revoke all on function mawatheeq_private.save_access(uuid,jsonb,integer),mawatheeq_private.save_access_files(uuid,jsonb,integer) from public,anon,authenticated;

-- The owner's full access includes the new section.
do $$ declare d text; begin
 d:=pg_get_functiondef('mawatheeq_private.access_for(uuid)'::regprocedure);
 if position('"files"' in d)=0 then
  if position('"archive"]' in d)=0 then raise exception 'access_for is not as expected'; end if;
  execute replace(d,'"archive"]','"archive","files"]');
 end if;
end $$;

-- The workspace's case list: staff holding «files» read the cases their access allows, as the other desks do.
do $$ declare d text; begin
 d:=pg_get_functiondef('mawatheeq_private.department_request_insflag(text,text,jsonb)'::regprocedure);
 if position('''files''' in d)=0 then
  if position('w in (''secretary'',''collections'',''accounting'')' in d)=0 then raise exception 'department_request_insflag is not as expected'; end if;
  execute replace(d,'w in (''secretary'',''collections'',''accounting'')','w in (''secretary'',''collections'',''accounting'',''files'')');
 end if;
end $$;
