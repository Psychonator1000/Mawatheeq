begin;
-- The owner picks a job role when creating or editing an account (manager, lawyer, secretary, ...).
-- The role only labels the account and preselects its settings in the editor; authority still comes
-- solely from the stored sections, case scope and edit/export flags.
alter function mawatheeq_private.save_access(uuid,jsonb,integer) rename to save_access_named;
create function mawatheeq_private.save_access(p_user uuid,p_permissions jsonb,p_revision integer) returns jsonb
language plpgsql set search_path='' as $$
declare v_role text; result jsonb;
begin
 if p_permissions ? 'jobRole' then
  v_role:=p_permissions->>'jobRole';
  if jsonb_typeof(p_permissions->'jobRole')<>'string' or v_role not in ('manager','lawyer','secretary','collections','accountant','hr','custom') then
   raise exception 'دور الموظف غير صالح.';
  end if;
 end if;
 result:=mawatheeq_private.save_access_named(p_user,p_permissions-'jobRole',p_revision);
 if v_role is not null then
  update mawatheeq_private.member_access set permissions=permissions||jsonb_build_object('jobRole',v_role) where user_id=p_user;
  update mawatheeq_private.access_changes set after_permissions=after_permissions||jsonb_build_object('jobRole',v_role)
   where id=(select max(id) from mawatheeq_private.access_changes where user_id=p_user);
  result:=result||jsonb_build_object('jobRole',v_role);
 end if;
 return result;
end $$;
revoke all on function mawatheeq_private.save_access(uuid,jsonb,integer),mawatheeq_private.save_access_named(uuid,jsonb,integer) from public,anon,authenticated;
commit;
