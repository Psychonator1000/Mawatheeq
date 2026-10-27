begin;
-- Faster case loading (6 November 2026). Opening the workspace read the cases 500 at a time and checked access for
-- every single case, looking the reader's permissions up several times per case. With well over a thousand cases a page
-- took close to the 3 seconds the website's requests are allowed, and under load it went over and failed with
-- «canceling statement due to statement timeout». The permissions are now read once per page and each case is checked
-- against them directly, with the same rules: the whole office, the cases picked for the reader, or the cases of the
-- lawyers named for them. Requests are also allowed 10 seconds, so a busy moment slows a page instead of failing it.
-- Safe to run again.

do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='local_request_case_checks') then
  alter function mawatheeq_private.local_request(text,text,jsonb) rename to local_request_case_checks;
 end if;
end $$;

create or replace function mawatheeq_private.local_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; v_offset integer; v_all boolean; v_names text[]; result jsonb;
begin
 if p_action<>'cases_page' then return mawatheeq_private.local_request_case_checks(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>2000000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 perform mawatheeq_private.require_access(mawatheeq_private.can_read_cases(actor));
 v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),1000000));
 a:=mawatheeq_private.access_for(actor);
 v_all:=a->>'caseScope'='all';
 if not v_all and jsonb_typeof(a->'lawyerNames')='array' then
  select array_agg(mawatheeq_private.normalized(x)) into v_names from jsonb_array_elements_text(a->'lawyerNames') x;
 end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from
  (select c.id,c.payload,c.revision,c.archived from public.mawatheeq_cases c
   where v_all or (a->'caseIds') ? c.id
    or (v_names is not null and mawatheeq_private.normalized(c.payload->>'lawyer')<>'' and mawatheeq_private.normalized(c.payload->>'lawyer')=any(v_names))
   order by c.id limit 500 offset v_offset) t;
 return result;
end $$;

revoke all on function mawatheeq_private.local_request(text,text,jsonb),mawatheeq_private.local_request_case_checks(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.local_request(text,text,jsonb) to anon,authenticated,service_role;

-- The website calls the database as «anon»; give its requests room for a busy moment.
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then execute 'alter role anon set statement_timeout = ''10s'''; end if;
end $$;
notify pgrst,'reload config';
notify pgrst,'reload schema';
commit;
