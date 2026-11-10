begin;
-- A person may belong to more sections than the one they report through: an accountant who also uses some of HR's and
-- the secretary's pages sits in «المحاسبة» and is added to «الموارد البشرية» and «السكرتارية» as well. Their place in the
-- tree (and who reads their reports) stays with their main line; the extra sections only add the workspaces they stand
-- for, which the page saves into their permissions through the usual permission save. Safe to run again.

create table if not exists mawatheeq_private.team_extras (
  user_id uuid not null references mawatheeq_private.accounts(id) on delete cascade,
  area_id uuid not null references mawatheeq_private.team_areas(id) on delete cascade,
  updated_by uuid references mawatheeq_private.accounts(id),
  created_at timestamptz not null default now(),
  primary key (user_id,area_id)
);
create index if not exists team_extras_area_idx on mawatheeq_private.team_extras(area_id);
alter table mawatheeq_private.team_extras enable row level security;
revoke all on mawatheeq_private.team_extras from public,anon,authenticated;

create or replace function mawatheeq_private.team_chart() returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'lines',(select coalesce(jsonb_agg(jsonb_build_object('userId',t.user_id,'managerId',t.manager_id,'areaId',t.area_id)),'[]') from mawatheeq_private.team_lines t),
  'areas',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'role',a.role,'workspace',a.workspace,'parentUser',a.parent_user,'parentArea',a.parent_area) order by a.created_at),'[]') from mawatheeq_private.team_areas a),
  'extras',(select coalesce(jsonb_agg(jsonb_build_object('userId',x.user_id,'areaId',x.area_id) order by x.created_at),'[]') from mawatheeq_private.team_extras x));
$$;

-- «add_extra» / «remove_extra»; a person moved into a section is no longer an extra member of it.
do $$ declare d text; anchor text:=$q$ elsif p_action='delete_area' then$q$; moved text:=$q$  return mawatheeq_private.team_chart();

 elsif p_action='save_area' then$q$; begin
 d:=pg_get_functiondef('mawatheeq_private.daily_request(text,text,jsonb)'::regprocedure);
 if position('add_extra' in d)=0 then
  if position(anchor in d)=0 or position(moved in d)=0 then raise exception 'daily_request is not the expected version'; end if;
  d:=replace(d,moved,$q$  delete from mawatheeq_private.team_extras x where x.user_id=v_user and x.area_id=v_area;
  return mawatheeq_private.team_chart();

 elsif p_action='save_area' then$q$);
  d:=replace(d,anchor,$q$ elsif p_action in ('add_extra','remove_extra') then
  -- A section a person belongs to besides their main place (for the workspace it stands for).
  perform mawatheeq_private.require_access(manager);
  v_user:=nullif(p_data->>'userId','')::uuid;
  v_area:=nullif(p_data->>'areaId','')::uuid;
  if v_user is null or not exists(select 1 from mawatheeq_private.accounts where id=v_user) then raise exception 'الحساب غير موجود.'; end if;
  if v_area is null or not exists(select 1 from mawatheeq_private.team_areas where id=v_area) then raise exception 'القسم غير موجود.'; end if;
  if p_action='remove_extra' then
   delete from mawatheeq_private.team_extras where user_id=v_user and area_id=v_area;
  else
   if exists(select 1 from public.mawatheeq_members m where m.user_id=v_user and m.role='owner') then raise exception 'حساب المالك لا يوضع في الأقسام.'; end if;
   if exists(select 1 from mawatheeq_private.team_lines t where t.user_id=v_user and t.area_id=v_area) then raise exception 'هو في هذا القسم أصلاً.'; end if;
   insert into mawatheeq_private.team_extras(user_id,area_id,updated_by) values(v_user,v_area,actor) on conflict do nothing;
  end if;
  return mawatheeq_private.team_chart();

$q$||anchor);
  execute d;
 end if;
end $$;

revoke all on function mawatheeq_private.daily_request(text,text,jsonb),mawatheeq_private.team_chart() from public,anon,authenticated;
grant execute on function mawatheeq_private.daily_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
