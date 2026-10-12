begin;
-- HR employee files may name the local account they belong to, so every account appears in HR.
-- The link is optional and unique; HR files stay separate records with their own history.
create unique index department_employee_account on mawatheeq_private.department_records((payload->>'accountId'))
 where workspace='hr' and kind='employee' and coalesce(payload->>'accountId','')<>'';

alter function mawatheeq_private.department_payload(text,text,jsonb) rename to department_payload_base;
create function mawatheeq_private.department_payload(w text,k text,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb:=mawatheeq_private.department_payload_base(w,k,p); v_account text;
begin
 if w='hr' and k='employee' then
  v_account:=btrim(coalesce(p->>'accountId',''));
  if v_account<>'' and (v_account !~ '^[0-9a-f-]{36}$' or not exists(select 1 from mawatheeq_private.accounts where id=v_account::uuid)) then
   raise exception 'حساب الدخول المرتبط غير موجود.'; end if;
  result:=result||jsonb_build_object('accountId',v_account);
 end if;
 return result;
end $$;

-- HR staff see the office's active accounts (names only) so each one can have an employee file.
alter function mawatheeq_private.department_request(text,text,jsonb) rename to department_request_base;
create function mawatheeq_private.department_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 if p_action<>'staff_accounts' then return mawatheeq_private.department_request_base(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'hr'));
 return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'username',a.username,'displayName',coalesce(a.display_name,''),'role',m.role) order by a.username),'[]')
  from mawatheeq_private.accounts a join public.mawatheeq_members m on m.user_id=a.id where a.enabled);
end $$;
revoke all on function mawatheeq_private.department_request(text,text,jsonb),mawatheeq_private.department_request_base(text,text,jsonb),
 mawatheeq_private.department_payload(text,text,jsonb),mawatheeq_private.department_payload_base(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.department_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
