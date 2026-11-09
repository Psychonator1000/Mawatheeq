begin;
-- Fast case reads, second step (9 November 2026). Taking each stored light form still went through a pass that took
-- apart the 500 cases of a page and built them again (about 0.8 s a page). The read now selects the stored light form
-- itself, and that pass is switched off. What a read returns is unchanged. Safe to run again.
do $$
declare d text; n int;
 old_sel text:='c.id,c.payload,c.revision,c.archived';
 new_sel text:='c.id,case when coalesce((p_data->>''light'')::boolean,false) then coalesce(c.light,mawatheeq_private.trim_case(c.payload)) else c.payload end payload,c.revision,c.archived';
 old_pass text:='if p_action in (''cases_page'',''cases_changes'') and coalesce((p_data->>''light'')::boolean,false) then';
 new_pass text:='if false and p_action in (''cases_page'',''cases_changes'') then -- the light form now comes from the read itself';
begin
 d:=pg_get_functiondef('mawatheeq_private.local_request_register(text,text,jsonb)'::regprocedure);
 if position(new_sel in d)=0 then
  n:=(length(d)-length(replace(d,old_sel,'')))/length(old_sel);
  if n<>2 then raise exception 'local_request_register no longer reads cases where expected (% places)',n; end if;
  execute replace(d,old_sel,new_sel);
 end if;
 d:=pg_get_functiondef('mawatheeq_private.local_request_view(text,text,jsonb)'::regprocedure);
 if position(new_pass in d)=0 then
  if position(old_pass in d)=0 then raise exception 'local_request_view no longer has the light pass where expected'; end if;
  execute replace(d,old_pass,new_pass);
 end if;
end $$;
notify pgrst,'reload schema';
commit;
