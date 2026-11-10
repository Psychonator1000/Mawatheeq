begin;
-- A block of people on the board (the people with nobody under them, side by side under their head) can be dragged as a
-- whole: its place is kept as 'g:' + the head's node, an offset from the head, so it still follows him when he moves.
-- Safe to run again.

alter table mawatheeq_private.team_layout drop constraint if exists team_layout_node_check;
alter table mawatheeq_private.team_layout add constraint team_layout_node_check
  check (node ~ '^(g:)?[ua]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

do $$ declare d text; old text:=$q$and e.k ~ '^[ua]:[0-9a-f]{8}$q$; begin
 d:=pg_get_functiondef('mawatheeq_private.daily_request(text,text,jsonb)'::regprocedure);
 if position($q$and e.k ~ '^(g:)?[ua]:$q$ in d)=0 then
  if position(old in d)=0 then raise exception 'daily_request is not the expected version'; end if;
  d:=replace(d,old,$q$and e.k ~ '^(g:)?[ua]:[0-9a-f]{8}$q$);
  execute d;
 end if;
end $$;

revoke all on function mawatheeq_private.daily_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.daily_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
