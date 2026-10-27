begin;
-- Only what changed (7 November 2026). Every open copy of the website re-read every case it may see every 30 seconds.
-- Now it keeps what it has and asks for «cases_changes»: the cases changed since its last look, with a fingerprint
-- (count and a hash of every visible case and its revision) to confirm that nothing was added, removed or hidden that
-- it missed; if the fingerprint disagrees it reads everything again. Each case records the moment it last changed.
-- The same access rules as «cases_page» (see 20261106). Safe to run again.

create or replace function mawatheeq_private.touch_case() returns trigger
language plpgsql set search_path='' as $$ begin new.updated_at:=clock_timestamp(); return new; end $$;
drop trigger if exists mawatheeq_cases_touch on public.mawatheeq_cases;
create trigger mawatheeq_cases_touch before update on public.mawatheeq_cases
 for each row when (old.* is distinct from new.*) execute function mawatheeq_private.touch_case();
create index if not exists mawatheeq_cases_updated_idx on public.mawatheeq_cases(updated_at);
revoke all on function mawatheeq_private.touch_case() from public,anon,authenticated;

create or replace function mawatheeq_private.local_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; v_offset integer; v_all boolean; v_names text[]; v_since timestamptz; v_count integer; v_print text; result jsonb;
begin
 if p_action not in ('cases_page','cases_changes') then return mawatheeq_private.local_request_case_checks(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>2000000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 perform mawatheeq_private.require_access(mawatheeq_private.can_read_cases(actor));
 a:=mawatheeq_private.access_for(actor);
 v_all:=a->>'caseScope'='all';
 if not v_all and jsonb_typeof(a->'lawyerNames')='array' then
  select array_agg(mawatheeq_private.normalized(x)) into v_names from jsonb_array_elements_text(a->'lawyerNames') x;
 end if;
 if p_action='cases_page' then
  v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),1000000));
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from
   (select c.id,c.payload,c.revision,c.archived from public.mawatheeq_cases c
    where v_all or (a->'caseIds') ? c.id
     or (v_names is not null and mawatheeq_private.normalized(c.payload->>'lawyer')<>'' and mawatheeq_private.normalized(c.payload->>'lawyer')=any(v_names))
    order by c.id limit 500 offset v_offset) t;
  return result;
 end if;
 -- «cases_changes»: a minute of overlap covers a save whose transaction began before the last look but ended after it.
 v_since:=case when coalesce(p_data->>'since','')~'^\d{4}-' then (p_data->>'since')::timestamptz-interval '1 minute' else 'infinity'::timestamptz end;
 with visible as (
  select c.id,c.payload,c.revision,c.archived,c.updated_at from public.mawatheeq_cases c
  where v_all or (a->'caseIds') ? c.id
   or (v_names is not null and mawatheeq_private.normalized(c.payload->>'lawyer')<>'' and mawatheeq_private.normalized(c.payload->>'lawyer')=any(v_names)))
 select count(*),encode(extensions.digest(coalesce(string_agg(id||':'||revision,',' order by id collate "C"),''),'sha256'),'hex'),
  (select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'payload',v.payload,'revision',v.revision,'archived',v.archived)),'[]')
    from (select * from visible where updated_at>=v_since order by id limit 2001) v)
 into v_count,v_print,result from visible;
 return jsonb_build_object('asOf',clock_timestamp(),'count',v_count,'fingerprint',v_print,
  'more',jsonb_array_length(result)>2000,'rows',case when jsonb_array_length(result)>2000 then '[]'::jsonb else result end);
end $$;

revoke all on function mawatheeq_private.local_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.local_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
