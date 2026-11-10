begin;
-- Department records load in one or two requests (November 2026). The records list checked access for every record by
-- reading the account's permissions two or three times per record, and paged by 500 with an offset, so each later page
-- re-checked every record before it: the archive's 7,000 paper files took about 15 seconds of server time in 15 requests
-- made one after another. The permissions are now read once per request and checked with the same rules
-- (department_visible_with gives exactly what department_visible gives), and a request may ask for up to 2000 records;
-- without «limit» it still answers 500, as older copies of the app expect. Safe to run again.
create or replace function mawatheeq_private.department_visible_with(a jsonb,p_user uuid,w text,c text) returns boolean
language sql stable set search_path='' as $$
 select coalesce((a->'sections') ? w,false) and (w='hr' or case when c is null then coalesce(a->>'caseScope'='all',false)
  when a->>'caseScope'='all' then true when (a->'caseIds') ? c then true else coalesce(mawatheeq_private.lawyer_case(p_user,c),false) end);
$$;
revoke all on function mawatheeq_private.department_visible_with(jsonb,uuid,text,text) from public,anon,authenticated;
do $$
declare f text; lim text:='limit greatest(1,least(coalesce((p_data->>''limit'')::integer,500),2000)) offset v_offset';
begin
 f:=pg_get_functiondef('mawatheeq_private.department_request_base(text,text,jsonb)'::regprocedure);
 if strpos(f,'department_visible_with')=0 then
  if strpos(f,'where workspace=w and mawatheeq_private.department_visible(actor,workspace,case_id) order by id limit 500 offset v_offset')=0 then
   raise exception 'department_request_base: records_page not as expected'; end if;
  f:=replace(f,'where workspace=w and mawatheeq_private.department_visible(actor,workspace,case_id) order by id limit 500 offset v_offset',
   'where workspace=w and mawatheeq_private.department_visible_with((select mawatheeq_private.access_for(actor)),actor,workspace,case_id) order by id '||lim);
  execute f;
 end if;
 f:=pg_get_functiondef('mawatheeq_private.archive_request_core(text,text,jsonb)'::regprocedure);
 if strpos(f,'department_visible_with')=0 then
  if strpos(f,'(kind=''location'' or mawatheeq_private.department_visible(actor,''archive'',case_id)) order by id limit 500 offset v_offset')=0 then
   raise exception 'archive_request_core: records_page not as expected'; end if;
  f:=replace(f,'(kind=''location'' or mawatheeq_private.department_visible(actor,''archive'',case_id)) order by id limit 500 offset v_offset',
   '(kind=''location'' or mawatheeq_private.department_visible_with((select mawatheeq_private.access_for(actor)),actor,''archive'',case_id)) order by id '||lim);
  execute f;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
