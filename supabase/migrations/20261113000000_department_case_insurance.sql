begin;
-- The departments' case list also says whether each case is an insurance case (13 November 2026). Insurance cases
-- keep their own register numbers, so the archive needs it to tell insurance case 12 (its paper file «ARC-T12») from
-- base case 12 («ARC-12»). Safe to run again.
do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='department_request_insflag') then
  alter function mawatheeq_private.department_request(text,text,jsonb) rename to department_request_insflag;
 end if;
end $$;
create or replace function mawatheeq_private.department_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb:=mawatheeq_private.department_request_insflag(p_token,p_action,p_data);
begin
 if p_action='cases_page' and jsonb_typeof(result)='array' then
  select coalesce(jsonb_agg(r||jsonb_build_object('insurance',coalesce((c.payload->>'insurance')::boolean,false)) order by i),'[]') into result
   from jsonb_array_elements(result) with ordinality t(r,i) left join public.mawatheeq_cases c on c.id=r->>'id';
 end if;
 return result;
end $$;
revoke all on function mawatheeq_private.department_request(text,text,jsonb),mawatheeq_private.department_request_insflag(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.department_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
