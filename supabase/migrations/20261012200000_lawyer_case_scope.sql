begin;
-- "His own cases": an account limited to selected cases may also list lawyer names. Every case whose lawyer field
-- matches one of them (same normalization as imports) is included, so cases added or reassigned later follow the
-- lawyer without the owner ticking them one by one. Hand-picked caseIds keep working alongside the names.
create function mawatheeq_private.lawyer_case(p_user uuid,p_case text) returns boolean
language sql stable set search_path='' as $$
 select coalesce(jsonb_typeof(mawatheeq_private.access_for(p_user)->'lawyerNames')='array'
  and mawatheeq_private.access_for(p_user)->>'caseScope'='selected'
  and exists(select 1 from public.mawatheeq_cases c where c.id=p_case and mawatheeq_private.normalized(c.payload->>'lawyer')<>''
   and mawatheeq_private.normalized(c.payload->>'lawyer') in (select mawatheeq_private.normalized(x) from jsonb_array_elements_text(mawatheeq_private.access_for(p_user)->'lawyerNames') x)),false);
$$;
create or replace function mawatheeq_private.can_case(p_user uuid,p_case text) returns boolean
language sql stable set search_path='' as $$
 select mawatheeq_private.can_read_cases(p_user) and
   (mawatheeq_private.access_for(p_user)->>'caseScope'='all' or (mawatheeq_private.access_for(p_user)->'caseIds') ? p_case or mawatheeq_private.lawyer_case(p_user,p_case));
$$;
create or replace function mawatheeq_private.case_assigned(p_user uuid,p_case text) returns boolean
language sql stable set search_path='' as $$
 select coalesce(mawatheeq_private.access_for(p_user)->>'caseScope'='all' or (mawatheeq_private.access_for(p_user)->'caseIds') ? p_case or mawatheeq_private.lawyer_case(p_user,p_case),false);
$$;

-- Saving permissions validates and keeps the lawyer names; everything else (revision check, audit, session
-- revocation) stays in the existing function.
alter function mawatheeq_private.save_access(uuid,jsonb,integer) rename to save_access_base;
create function mawatheeq_private.save_access(p_user uuid,p_permissions jsonb,p_revision integer) returns jsonb
language plpgsql set search_path='' as $$
declare names jsonb:='[]'; result jsonb;
begin
 if p_permissions ? 'lawyerNames' then
  if jsonb_typeof(p_permissions->'lawyerNames')<>'array' or jsonb_array_length(p_permissions->'lawyerNames')>20
   or exists(select 1 from jsonb_array_elements(p_permissions->'lawyerNames') n where jsonb_typeof(n)<>'string' or length(btrim(n#>>'{}')) not between 1 and 200) then
   raise exception 'أسماء المحامين في الصلاحيات غير صالحة.';
  end if;
  if p_permissions->>'caseScope'='selected' then
   select coalesce(jsonb_agg(distinct btrim(n)),'[]') into names from jsonb_array_elements_text(p_permissions->'lawyerNames') n;
  end if;
 end if;
 result:=mawatheeq_private.save_access_base(p_user,p_permissions-'lawyerNames',p_revision);
 if jsonb_array_length(names)>0 then
  update mawatheeq_private.member_access set permissions=permissions||jsonb_build_object('lawyerNames',names) where user_id=p_user;
  update mawatheeq_private.access_changes set after_permissions=after_permissions||jsonb_build_object('lawyerNames',names)
   where id=(select max(id) from mawatheeq_private.access_changes where user_id=p_user);
  result:=result||jsonb_build_object('lawyerNames',names);
 end if;
 return result;
end $$;
revoke all on function mawatheeq_private.lawyer_case(uuid,text),mawatheeq_private.can_case(uuid,text),mawatheeq_private.case_assigned(uuid,text),
 mawatheeq_private.save_access(uuid,jsonb,integer),mawatheeq_private.save_access_base(uuid,jsonb,integer) from public,anon,authenticated;
commit;
