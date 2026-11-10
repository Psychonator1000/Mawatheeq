begin;
-- The office's tree as a free board on a grid, and people answering to more than one person.
-- • team_layout: where a box was put on the board by hand ('u:' + account id or 'a:' + section id, in board pixels).
--   Boxes never moved by hand keep arranging themselves under their head.
-- • team_bosses: a person who answers to another person besides the one he reports through (two colleagues in IT, each
--   listening to a different boss). That boss reads his reports too, as the head of his main line does. Loops are refused.
-- • team_flow: which way a head's branch grows: down (the default), to the left or to the right.
-- Safe to run again.

create table if not exists mawatheeq_private.team_layout (
  node text primary key check (node ~ '^[ua]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  x integer not null check (x between -200000 and 200000),
  y integer not null check (y between -200000 and 200000),
  updated_by uuid references mawatheeq_private.accounts(id),
  updated_at timestamptz not null default now()
);
alter table mawatheeq_private.team_layout enable row level security;
revoke all on mawatheeq_private.team_layout from public,anon,authenticated;

create table if not exists mawatheeq_private.team_flow (
  node text primary key check (node ~ '^[ua]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  dir text not null check (dir in ('left','right')),
  updated_by uuid references mawatheeq_private.accounts(id),
  updated_at timestamptz not null default now()
);
alter table mawatheeq_private.team_flow enable row level security;
revoke all on mawatheeq_private.team_flow from public,anon,authenticated;

create table if not exists mawatheeq_private.team_bosses (
  user_id uuid not null references mawatheeq_private.accounts(id) on delete cascade,
  manager_id uuid not null references mawatheeq_private.accounts(id) on delete cascade,
  updated_by uuid references mawatheeq_private.accounts(id),
  created_at timestamptz not null default now(),
  primary key (user_id,manager_id),
  check (user_id<>manager_id)
);
create index if not exists team_bosses_manager_idx on mawatheeq_private.team_bosses(manager_id);
alter table mawatheeq_private.team_bosses enable row level security;
revoke all on mawatheeq_private.team_bosses from public,anon,authenticated;

-- Everything under a person or a section, at any depth, through the main lines, the sections and the extra bosses.
create or replace function mawatheeq_private.team_nodes_below(p_kind text,p_id uuid) returns table(kind text,id uuid)
language sql stable set search_path='' as $$
 with recursive edges(pk,pid,ck,cid) as (
  select case when t.manager_id is not null then 'u' else 'a' end,coalesce(t.manager_id,t.area_id),'u',t.user_id from mawatheeq_private.team_lines t
  union all
  select case when a.parent_user is not null then 'u' else 'a' end,coalesce(a.parent_user,a.parent_area),'a',a.id from mawatheeq_private.team_areas a
   where a.parent_user is not null or a.parent_area is not null
  union all
  select 'u',b.manager_id,'u',b.user_id from mawatheeq_private.team_bosses b),
 below(kind,id,depth) as (
  select e.ck,e.cid,1 from edges e where e.pk=p_kind and e.pid=p_id
  union
  select e.ck,e.cid,b.depth+1 from below b join edges e on e.pk=b.kind and e.pid=b.id where b.depth<60)
 select distinct b.kind,b.id from below b where not (b.kind=p_kind and b.id=p_id);
$$;

create or replace function mawatheeq_private.team_chart() returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'lines',(select coalesce(jsonb_agg(jsonb_build_object('userId',t.user_id,'managerId',t.manager_id,'areaId',t.area_id)),'[]') from mawatheeq_private.team_lines t),
  'areas',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'role',a.role,'workspace',a.workspace,'parentUser',a.parent_user,'parentArea',a.parent_area) order by a.created_at),'[]') from mawatheeq_private.team_areas a),
  'extras',(select coalesce(jsonb_agg(jsonb_build_object('userId',x.user_id,'areaId',x.area_id) order by x.created_at),'[]') from mawatheeq_private.team_extras x),
  'order',(select coalesce(jsonb_object_agg(o.node,o.position),'{}') from mawatheeq_private.team_order o),
  'layout',(select coalesce(jsonb_object_agg(l.node,jsonb_build_array(l.x,l.y)),'{}') from mawatheeq_private.team_layout l),
  'flow',(select coalesce(jsonb_object_agg(f.node,f.dir),'{}') from mawatheeq_private.team_flow f),
  'bosses',(select coalesce(jsonb_agg(jsonb_build_object('userId',b.user_id,'managerId',b.manager_id) order by b.created_at),'[]') from mawatheeq_private.team_bosses b));
$$;

do $$ declare d text; anchor text:=$q$ elsif p_action='delete_area' then$q$;
 moved text:=$q$  delete from mawatheeq_private.team_extras x where x.user_id=v_user and x.area_id=v_area;$q$; begin
 d:=pg_get_functiondef('mawatheeq_private.daily_request(text,text,jsonb)'::regprocedure);
 if position('set_layout' in d)=0 then
  if position(anchor in d)=0 or position(moved in d)=0 then raise exception 'daily_request is not the expected version'; end if;
  -- Put under someone as his main line, he is no longer an extra boss of him.
  d:=replace(d,moved,moved||$q$
  delete from mawatheeq_private.team_bosses b where b.user_id=v_user and b.manager_id=v_manager;$q$);
  d:=replace(d,anchor,$q$ elsif p_action='set_layout' then
  -- Boxes placed by hand: {node: [x, y]} places it, {node: null} lets it arrange itself again.
  perform mawatheeq_private.require_access(manager);
  if jsonb_typeof(p_data->'positions') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_data->'positions'))>1000 then raise exception 'مواضع غير صالحة.'; end if;
  delete from mawatheeq_private.team_layout l where l.node in (select k from jsonb_each(p_data->'positions') e(k,v) where jsonb_typeof(v)='null');
  insert into mawatheeq_private.team_layout(node,x,y,updated_by,updated_at)
  select e.k,round((e.v->>0)::numeric)::integer,round((e.v->>1)::numeric)::integer,actor,clock_timestamp() from jsonb_each(p_data->'positions') e(k,v)
  where jsonb_typeof(e.v)='array' and jsonb_array_length(e.v)=2 and jsonb_typeof(e.v->0)='number' and jsonb_typeof(e.v->1)='number'
   and e.k ~ '^[ua]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and abs((e.v->>0)::numeric)<=200000 and abs((e.v->>1)::numeric)<=200000
  on conflict (node) do update set x=excluded.x,y=excluded.y,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  return mawatheeq_private.team_chart();

 elsif p_action='set_flow' then
  -- Which way a head's branch grows: 'down' (the default, nothing kept), 'left' or 'right'.
  perform mawatheeq_private.require_access(manager);
  if coalesce(p_data->>'node','') !~ '^[ua]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or coalesce(p_data->>'dir','') not in ('down','left','right') then raise exception 'اتجاه غير صالح.'; end if;
  if p_data->>'dir'='down' then delete from mawatheeq_private.team_flow where node=p_data->>'node';
  else insert into mawatheeq_private.team_flow(node,dir,updated_by,updated_at) values(p_data->>'node',p_data->>'dir',actor,clock_timestamp())
   on conflict (node) do update set dir=excluded.dir,updated_by=excluded.updated_by,updated_at=excluded.updated_at; end if;
  return mawatheeq_private.team_chart();

 elsif p_action in ('add_boss','remove_boss') then
  -- A person he answers to besides his main line; that boss reads his reports too.
  perform mawatheeq_private.require_access(manager);
  v_user:=nullif(p_data->>'userId','')::uuid;
  v_manager:=nullif(p_data->>'managerId','')::uuid;
  if v_user is null or v_manager is null or not exists(select 1 from mawatheeq_private.accounts where id=v_user) then raise exception 'الحساب غير موجود.'; end if;
  if p_action='remove_boss' then
   delete from mawatheeq_private.team_bosses where user_id=v_user and manager_id=v_manager;
  else
   if not exists(select 1 from mawatheeq_private.accounts where id=v_manager and enabled) then raise exception 'المسؤول المختار غير موجود أو موقوف.'; end if;
   if exists(select 1 from public.mawatheeq_members m where m.user_id=v_user and m.role='owner') then raise exception 'حساب المالك لا يتبع أحداً.'; end if;
   if exists(select 1 from mawatheeq_private.team_lines t where t.user_id=v_user and t.manager_id=v_manager) then raise exception 'يتبعه أصلاً.'; end if;
   lock table mawatheeq_private.team_lines,mawatheeq_private.team_areas,mawatheeq_private.team_bosses in share row exclusive mode;
   if v_manager=v_user or exists(select 1 from mawatheeq_private.team_nodes_below('u',v_user) b where b.kind='u' and b.id=v_manager) then
    raise exception 'لا يتبع أحد من هو تحته في الهيكل.';
   end if;
   insert into mawatheeq_private.team_bosses(user_id,manager_id,updated_by) values(v_user,v_manager,actor) on conflict do nothing;
  end if;
  return mawatheeq_private.team_chart();

$q$||anchor);
  execute d;
 end if;
end $$;

revoke all on function mawatheeq_private.daily_request(text,text,jsonb),mawatheeq_private.team_chart(),mawatheeq_private.team_nodes_below(text,uuid) from public,anon,authenticated;
grant execute on function mawatheeq_private.daily_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
