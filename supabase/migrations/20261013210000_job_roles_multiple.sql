begin;
-- Several jobs per employee, and more jobs (13 October 2026). «jobRoles» lists every job the employee does, main one
-- first; «jobRole» stays the main job for older screens. New jobs: محامٍ متدرب، باحث قانوني، مترجم، استقبال، إدخال
-- بيانات، مندوب، سائق، عامل خدمات، مطوّر برمجيات، مهندس شبكات، دعم فني، مهندس. As before, jobs only label the
-- account and preselect settings; authority comes solely from the saved sections, case scope and edit/export flags.
-- The earlier functions know the earlier jobs, so the others pass through them as «custom» and are stored afterwards,
-- with the audit entry.
alter function mawatheeq_private.save_access(uuid,jsonb,integer) rename to save_access_jobs;
create function mawatheeq_private.save_access(p_user uuid,p_permissions jsonb,p_revision integer) returns jsonb
language plpgsql set search_path='' as $$
declare p jsonb:=p_permissions; roles jsonb; main text; v jsonb; result jsonb;
 known text[]:=array['manager','lawyer','traineeLawyer','counsel','legalResearcher','translator','secretary','receptionist','sessionsClerk',
  'executionClerk','collections','callCenter','accountant','hr','archivist','dataEntry','courier','representative','driver','officeAdmin','officeBoy',
  'developer','networkEngineer','itSupport','engineer','custom'];
 older text[]:=array['manager','lawyer','secretary','collections','accountant','hr','custom','archivist','counsel','callCenter','courier',
  'sessionsClerk','officeAdmin','executionClerk'];
begin
 if jsonb_typeof(p) is distinct from 'object' then return mawatheeq_private.save_access_jobs(p_user,p,p_revision); end if;
 if p ? 'jobRoles' then
  if jsonb_typeof(p->'jobRoles')<>'array' or jsonb_array_length(p->'jobRoles')>8 then raise exception 'راجع دور الموظف.'; end if;
  roles:='[]';
  for v in select value from jsonb_array_elements(p->'jobRoles') loop
   if jsonb_typeof(v)<>'string' or not (v#>>'{}'=any(known)) then raise exception 'راجع دور الموظف.'; end if;
   if not roles @> jsonb_build_array(v) then roles:=roles||jsonb_build_array(v); end if;
  end loop;
 elsif jsonb_typeof(p->'jobRole') is not distinct from 'string' and p->>'jobRole'=any(known) and not (p->>'jobRole'=any(older)) then
  roles:=jsonb_build_array(p->>'jobRole');
 end if;
 if roles is null then return mawatheeq_private.save_access_jobs(p_user,p,p_revision); end if;
 main:=roles->>0;
 p:=(p-'jobRoles'-'jobRole')||case when main is null then '{}' when main=any(older) then jsonb_build_object('jobRole',main) else '{"jobRole":"custom"}' end;
 perform mawatheeq_private.save_access_jobs(p_user,p,p_revision);
 update mawatheeq_private.member_access set permissions=(permissions-'jobRole'-'jobRoles')
   ||case when main is null then '{}' else jsonb_build_object('jobRole',main,'jobRoles',roles) end
  where user_id=p_user returning permissions||jsonb_build_object('revision',revision) into result;
 update mawatheeq_private.access_changes set after_permissions=(after_permissions-'jobRole'-'jobRoles')
   ||case when main is null then '{}' else jsonb_build_object('jobRole',main,'jobRoles',roles) end
  where id=(select max(id) from mawatheeq_private.access_changes where user_id=p_user);
 return result;
end $$;
revoke all on function mawatheeq_private.save_access(uuid,jsonb,integer),mawatheeq_private.save_access_jobs(uuid,jsonb,integer) from public,anon,authenticated;
commit;
