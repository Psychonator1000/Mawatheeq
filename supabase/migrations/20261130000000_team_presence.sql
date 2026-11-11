begin;
-- Who is online, for «فريق المكتب»: every open app says it is there about once a minute («ping»); the owner looking
-- through someone's account does not count as that person. Only whoever may see the whole chart (the owner, admins with
-- the staff or reviews power) is told when each person was last seen. Safe to run again.

create table if not exists mawatheeq_private.presence (
  user_id uuid primary key references mawatheeq_private.accounts(id) on delete cascade,
  last_seen timestamptz not null default now()
);
alter table mawatheeq_private.presence enable row level security;
revoke all on mawatheeq_private.presence from public,anon,authenticated;

create or replace function mawatheeq_private.team_chart() returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'lines',(select coalesce(jsonb_agg(jsonb_build_object('userId',t.user_id,'managerId',t.manager_id,'areaId',t.area_id)),'[]') from mawatheeq_private.team_lines t),
  'areas',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'role',a.role,'workspace',a.workspace,'parentUser',a.parent_user,'parentArea',a.parent_area) order by a.created_at),'[]') from mawatheeq_private.team_areas a),
  'extras',(select coalesce(jsonb_agg(jsonb_build_object('userId',x.user_id,'areaId',x.area_id) order by x.created_at),'[]') from mawatheeq_private.team_extras x),
  'order',(select coalesce(jsonb_object_agg(o.node,o.position),'{}') from mawatheeq_private.team_order o),
  'layout',(select coalesce(jsonb_object_agg(l.node,jsonb_build_array(l.x,l.y)),'{}') from mawatheeq_private.team_layout l),
  'flow',(select coalesce(jsonb_object_agg(f.node,f.dir),'{}') from mawatheeq_private.team_flow f),
  'bosses',(select coalesce(jsonb_agg(jsonb_build_object('userId',b.user_id,'managerId',b.manager_id) order by b.created_at),'[]') from mawatheeq_private.team_bosses b),
  'seen',(select coalesce(jsonb_object_agg(p.user_id,p.last_seen),'{}') from mawatheeq_private.presence p),
  'now',to_jsonb(clock_timestamp()));
$$;

do $$ declare d text; anchor text:=$q$ elsif p_action='delete_area' then$q$; begin
 d:=pg_get_functiondef('mawatheeq_private.daily_request(text,text,jsonb)'::regprocedure);
 if position($q$p_action='ping'$q$ in d)=0 then
  if position(anchor in d)=0 then raise exception 'daily_request is not the expected version'; end if;
  d:=replace(d,anchor,$q$ elsif p_action='ping' then
  -- «I am here», from any open app; not when the owner is looking through someone else's account.
  if not exists(select 1 from mawatheeq_private.sessions s where s.token_hash=extensions.digest(p_token,'sha256') and s.impersonated_by is not null) then
   insert into mawatheeq_private.presence(user_id,last_seen) values(actor,clock_timestamp())
   on conflict (user_id) do update set last_seen=excluded.last_seen where mawatheeq_private.presence.last_seen<clock_timestamp()-interval '20 seconds';
  end if;
  return '{}'::jsonb;

$q$||anchor);
  execute d;
 end if;
end $$;

revoke all on function mawatheeq_private.daily_request(text,text,jsonb),mawatheeq_private.team_chart() from public,anon,authenticated;
grant execute on function mawatheeq_private.daily_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
