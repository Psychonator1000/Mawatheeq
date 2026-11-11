begin;
-- «كود القضية» in the daily report finds the case by its code (or its automatic number) even for an account that opens no
-- case, so a lawyer can name the hearing he attended: the answer is only the case's id, code and court (no parties, no
-- other detail), up to ten cases, for whoever writes a daily report. Safe to run again.

do $$ declare d text; anchor text:=$q$ elsif p_action='delete_area' then$q$; begin
 d:=pg_get_functiondef('mawatheeq_private.daily_request(text,text,jsonb)'::regprocedure);
 if position($q$p_action='find_case'$q$ in d)=0 then
  if position(anchor in d)=0 then raise exception 'daily_request is not the expected version'; end if;
  d:=replace(d,anchor,$q$ elsif p_action='find_case' then
  perform mawatheeq_private.require_access(writer);
  v_name:=btrim(coalesce(p_data->>'q',''));
  if length(v_name) not between 1 and 40 then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'code',x.code,'autoNumber',x.auto,'court',x.court,'insurance',x.insurance) order by length(x.code),x.code),'[]') from (
   select c.id,coalesce(c.payload->>'code','') code,coalesce(c.payload->>'autoNumber','') auto,coalesce(c.payload->>'court','') court,coalesce((c.payload->>'insurance')::boolean,false) insurance
   from public.mawatheeq_cases c
   where not c.archived and (c.payload->>'code' ilike replace(replace(v_name,'%',''),'_','')||'%' or c.payload->>'autoNumber'=v_name)
   order by length(coalesce(c.payload->>'code','')),c.payload->>'code' limit 10) x);

$q$||anchor);
  execute d;
 end if;
end $$;

revoke all on function mawatheeq_private.daily_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.daily_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
