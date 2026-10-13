begin;
-- More job roles (13 October 2026): مستشار, كول سنتر, خارجيات, إداري جلسات, موظف إداري, إداري تنفيذ, beside أرشيف.
-- As before, a role only labels the account and preselects its settings; authority still comes solely from the
-- saved sections, case scope and edit/export flags. The earlier functions validate the original role list, so
-- the newer roles pass through them as «custom» and are stored afterwards, with the audit entry.
create or replace function mawatheeq_private.save_access(p_user uuid,p_permissions jsonb,p_revision integer) returns jsonb
language plpgsql set search_path='' as $$
declare archive boolean:=false; v_role text; p jsonb:=p_permissions; result jsonb;
begin
 if jsonb_typeof(p) is not distinct from 'object' and jsonb_typeof(p->'sections') is not distinct from 'array' then
  archive:=p->'sections' ? 'archive';
  p:=jsonb_set(p,'{sections}',coalesce((select jsonb_agg(s) from jsonb_array_elements(p->'sections') s where s<>'"archive"'::jsonb),'[]'));
 end if;
 if jsonb_typeof(p->'jobRole') is not distinct from 'string' and p->>'jobRole' in ('archivist','counsel','callCenter','courier','sessionsClerk','officeAdmin','executionClerk') then
  v_role:=p->>'jobRole'; p:=jsonb_set(p,'{jobRole}','"custom"'); end if;
 result:=mawatheeq_private.save_access_powers(p_user,p,p_revision);
 if archive or v_role is not null then
  update mawatheeq_private.member_access set permissions=permissions
    ||case when archive then jsonb_build_object('sections',(permissions->'sections')||'["archive"]'::jsonb) else '{}' end
    ||case when v_role is not null then jsonb_build_object('jobRole',v_role) else '{}' end
   where user_id=p_user returning permissions||jsonb_build_object('revision',revision) into result;
  update mawatheeq_private.access_changes set after_permissions=after_permissions
    ||case when archive then jsonb_build_object('sections',(after_permissions->'sections')||'["archive"]'::jsonb) else '{}' end
    ||case when v_role is not null then jsonb_build_object('jobRole',v_role) else '{}' end
   where id=(select max(id) from mawatheeq_private.access_changes where user_id=p_user);
 end if;
 return result;
end $$;
revoke all on function mawatheeq_private.save_access(uuid,jsonb,integer) from public,anon,authenticated;
commit;
