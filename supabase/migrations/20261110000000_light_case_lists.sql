begin;
-- Lighter case lists (10 November 2026). With seven thousand cases and the old register's fifty thousand sessions, a
-- first visit read about 20 MB, two thirds of it old session history the lists never show. The app may now ask for the
-- lists «light»: each case keeps its judgments and other entries, every entry of the last six months, entries without a
-- date and its last three sessions; older sessions stay on the server. Such a case is marked «proceduresTrimmed», with
-- the entries it kept in «proceduresKept», and the whole case is read with «case_full» when it is opened or saved.
-- A save that still carries the mark is refused, so a shortened copy can never replace a case's history.
-- Safe to run again.

create or replace function mawatheeq_private.trim_case(p jsonb) returns jsonb language sql immutable set search_path='' as $$
 with e as (select x, ord from jsonb_array_elements(case when jsonb_typeof(p->'procedures')='array' then p->'procedures' else '[]' end) with ordinality t(x,ord)),
 s as (select ord, row_number() over (order by coalesce(x->>'date','') desc, ord desc) rn from e where x->>'kind' in ('جلسة','جلسة خبراء')),
 k as (select x, ord from e where coalesce(x->>'kind','') not in ('جلسة','جلسة خبراء') or coalesce(x->>'date','')='' or x->>'date'>=to_char(current_date-180,'YYYY-MM-DD')
   or ord in (select ord from s where rn<=3))
 select case when (select count(*) from k)=(select count(*) from e) then p
  else p||jsonb_build_object('procedures',(select coalesce(jsonb_agg(x order by ord),'[]') from k),'proceduresTrimmed',true,
   'proceduresKept',(select coalesce(jsonb_agg(x->>'id' order by ord),'[]') from k),'proceduresTotal',(select count(*) from e)) end
$$;

do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='local_request_light') then
  alter function mawatheeq_private.local_request(text,text,jsonb) rename to local_request_light;
 end if;
end $$;

create or replace function mawatheeq_private.local_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; v_all boolean; v_names text[]; result jsonb; v_id text;
begin
 -- A shortened copy is never saved over a case.
 if p_action='save_case' and jsonb_typeof(p_data->'case')='object' and (p_data->'case') ? 'proceduresTrimmed' then
  raise exception 'هذه نسخة مختصرة من القضية. أعد تحميل الصفحة ثم احفظ مرة أخرى.' using errcode='P0001';
 end if;
 if p_action='import_cases' and jsonb_typeof(p_data->'cases')='array' and exists(select 1 from jsonb_array_elements(p_data->'cases') x where jsonb_typeof(x)='object' and x ? 'proceduresTrimmed') then
  raise exception 'هذه نسخة مختصرة من القضايا. أعد تحميل الصفحة ثم استورد مرة أخرى.' using errcode='P0001';
 end if;
 if p_action='case_full' then
  actor:=mawatheeq_private.authorize(p_token);
  perform mawatheeq_private.require_access(mawatheeq_private.can_read_cases(actor));
  v_id:=left(coalesce(p_data->>'id',''),200);
  a:=mawatheeq_private.access_for(actor); v_all:=a->>'caseScope'='all';
  if not v_all and jsonb_typeof(a->'lawyerNames')='array' then
   select array_agg(mawatheeq_private.normalized(x)) into v_names from jsonb_array_elements_text(a->'lawyerNames') x;
  end if;
  select to_jsonb(t) into result from (select c.id,c.payload,c.revision,c.archived from public.mawatheeq_cases c
   where c.id=v_id and (v_all or (a->'caseIds') ? c.id
    or (v_names is not null and mawatheeq_private.normalized(c.payload->>'lawyer')<>'' and mawatheeq_private.normalized(c.payload->>'lawyer')=any(v_names)))) t;
  if result is null then raise exception 'القضية غير موجودة أو غير متاحة لحسابك.' using errcode='P0001'; end if;
  return result;
 end if;
 result:=mawatheeq_private.local_request_light(p_token,p_action,p_data);
 if p_action in ('cases_page','cases_changes') and coalesce((p_data->>'light')::boolean,false) then
  if p_action='cases_page' and jsonb_typeof(result)='array' then
   select coalesce(jsonb_agg(r||jsonb_build_object('payload',mawatheeq_private.trim_case(r->'payload')) order by i),'[]') into result from jsonb_array_elements(result) with ordinality t(r,i);
  elsif p_action='cases_changes' and jsonb_typeof(result->'rows')='array' then
   result:=jsonb_set(result,'{rows}',(select coalesce(jsonb_agg(r||jsonb_build_object('payload',mawatheeq_private.trim_case(r->'payload')) order by i),'[]') from jsonb_array_elements(result->'rows') with ordinality t(r,i)));
  end if;
 end if;
 return result;
end $$;

revoke all on function mawatheeq_private.local_request(text,text,jsonb),mawatheeq_private.local_request_light(text,text,jsonb),mawatheeq_private.trim_case(jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.local_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
