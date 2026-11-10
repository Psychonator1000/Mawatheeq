begin;
-- The order of the boxes in the office's tree: people (and sections) side by side under the same head are shown in the
-- order the owner arranged them by dragging, as icons on a phone are. Nodes are 'u:' + account id or 'a:' + section id;
-- one position each, among whatever siblings it has. Safe to run again.

create table if not exists mawatheeq_private.team_order (
  node text primary key check (node ~ '^[ua]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  position integer not null,
  updated_by uuid references mawatheeq_private.accounts(id),
  updated_at timestamptz not null default now()
);
alter table mawatheeq_private.team_order enable row level security;
revoke all on mawatheeq_private.team_order from public,anon,authenticated;

create or replace function mawatheeq_private.team_chart() returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'lines',(select coalesce(jsonb_agg(jsonb_build_object('userId',t.user_id,'managerId',t.manager_id,'areaId',t.area_id)),'[]') from mawatheeq_private.team_lines t),
  'areas',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'role',a.role,'workspace',a.workspace,'parentUser',a.parent_user,'parentArea',a.parent_area) order by a.created_at),'[]') from mawatheeq_private.team_areas a),
  'extras',(select coalesce(jsonb_agg(jsonb_build_object('userId',x.user_id,'areaId',x.area_id) order by x.created_at),'[]') from mawatheeq_private.team_extras x),
  'order',(select coalesce(jsonb_object_agg(o.node,o.position),'{}') from mawatheeq_private.team_order o));
$$;

-- «set_order»: the given boxes, in this order, take positions 0, 1, 2… (the siblings of one head, as arranged).
do $$ declare d text; anchor text:=$q$ elsif p_action='delete_area' then$q$; begin
 d:=pg_get_functiondef('mawatheeq_private.daily_request(text,text,jsonb)'::regprocedure);
 if position('set_order' in d)=0 then
  if position(anchor in d)=0 then raise exception 'daily_request is not the expected version'; end if;
  d:=replace(d,anchor,$q$ elsif p_action='set_order' then
  perform mawatheeq_private.require_access(manager);
  if jsonb_typeof(p_data->'nodes') is distinct from 'array' or jsonb_array_length(p_data->'nodes')>500 then raise exception 'ترتيب غير صالح.'; end if;
  insert into mawatheeq_private.team_order(node,position,updated_by,updated_at)
  select n.value,(n.ordinality-1)::integer,actor,clock_timestamp() from jsonb_array_elements_text(p_data->'nodes') with ordinality n
  where n.value ~ '^[ua]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  on conflict (node) do update set position=excluded.position,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  return mawatheeq_private.team_chart();

$q$||anchor);
  execute d;
 end if;
end $$;

revoke all on function mawatheeq_private.daily_request(text,text,jsonb),mawatheeq_private.team_chart() from public,anon,authenticated;
grant execute on function mawatheeq_private.daily_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
