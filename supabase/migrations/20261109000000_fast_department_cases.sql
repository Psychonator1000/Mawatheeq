begin;
-- Faster case lists in the department screens (9 November 2026). Collections, archive, accounting and the secretary
-- desk read the office's cases (for their case pickers) 500 at a time before showing anything, checking access case by
-- case and looking the reader's permissions up again for every case. With seven thousand cases each batch took about a
-- second and the screen waited on fifteen of them. The permissions are now read once per batch and each case is checked
-- against them directly, with the same rules: the whole office, the cases picked for the reader, or the cases of the
-- lawyers named for them. A batch may also be up to 2000 cases. Who may ask is unchanged: the archive for staff with the
-- archive section; secretary, collections and accounting for staff with that section; never human resources.
-- Safe to run again.

do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='department_request_case_checks') then
  alter function mawatheeq_private.department_request(text,text,jsonb) rename to department_request_case_checks;
 end if;
end $$;

create or replace function mawatheeq_private.department_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; w text; v_offset integer; v_limit integer; v_all boolean; v_names text[]; result jsonb;
begin
 if p_action<>'cases_page' then return mawatheeq_private.department_request_case_checks(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>250000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 w:=p_data->>'workspace';
 if w='archive' then perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'archive'));
 else perform mawatheeq_private.require_access(w in ('secretary','collections','accounting') and mawatheeq_private.has_section(actor,w)); end if;
 v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),1000000));
 v_limit:=greatest(1,least(coalesce((p_data->>'limit')::integer,500),2000));
 a:=mawatheeq_private.access_for(actor);
 v_all:=a->>'caseScope'='all';
 if not v_all and jsonb_typeof(a->'lawyerNames')='array' then
  select array_agg(mawatheeq_private.normalized(x)) into v_names from jsonb_array_elements_text(a->'lawyerNames') x;
 end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
  select cs.id,coalesce(cs.payload->>'code','') as code,coalesce(cs.payload->>'autoNumber','') as "autoNumber",
   coalesce(cs.payload->>'client','') as client,coalesce(cs.payload->>'clientGroup','') as "clientGroup",
   coalesce(e.payload->>'name','') as "clientEntityName",coalesce(cs.payload->>'opponent','') as opponent,cs.revision,cs.archived
  from public.mawatheeq_cases cs left join mawatheeq_private.client_entities e on e.id::text=cs.payload->>'clientEntityId'
  where v_all or (a->'caseIds') ? cs.id
   or (v_names is not null and mawatheeq_private.normalized(cs.payload->>'lawyer')<>'' and mawatheeq_private.normalized(cs.payload->>'lawyer')=any(v_names))
  order by cs.id limit v_limit offset v_offset) t;
 return result;
end $$;

revoke all on function mawatheeq_private.department_request(text,text,jsonb),mawatheeq_private.department_request_case_checks(text,text,jsonb) from public,anon,authenticated;
-- The website's entry point calls this one with the caller's rights, as before.
grant execute on function mawatheeq_private.department_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
