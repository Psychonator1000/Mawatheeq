begin;
-- Sections tied to a workspace: a section may stand for one of the office's workspaces (القضايا، السكرتارية، التحصيل،
-- المحاسبة، الموارد البشرية، الأرشيف). The page that moves people between sections then sets their pages to that
-- workspace alone through the ordinary permission save (revision check, audit entry, sessions ended), so the server
-- enforces it at once. One section per workspace is made here, at the top, unless one exists already. Safe to run again.

alter table mawatheeq_private.team_areas add column if not exists workspace text
  check (workspace is null or workspace in ('legal','secretary','collections','accounting','hr','archive'));

insert into mawatheeq_private.team_areas(name,role,workspace)
select v.name,v.role,v.workspace from (values
  ('القضايا','lawyer','legal',1),('السكرتارية','secretary','secretary',2),('التحصيل','collections','collections',3),
  ('المحاسبة','accountant','accounting',4),('الموارد البشرية','hr','hr',5),('الأرشيف','archivist','archive',6)) v(name,role,workspace,n)
where not exists(select 1 from mawatheeq_private.team_areas a where a.workspace=v.workspace)
order by v.n;

create or replace function mawatheeq_private.team_chart() returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'lines',(select coalesce(jsonb_agg(jsonb_build_object('userId',t.user_id,'managerId',t.manager_id,'areaId',t.area_id)),'[]') from mawatheeq_private.team_lines t),
  'areas',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'role',a.role,'workspace',a.workspace,'parentUser',a.parent_user,'parentArea',a.parent_area) order by a.created_at),'[]') from mawatheeq_private.team_areas a));
$$;

-- Saving a section keeps its workspace (given with the save; a save without it keeps the one it has).
do $$ declare d text; begin
 d:=pg_get_functiondef('mawatheeq_private.daily_request(text,text,jsonb)'::regprocedure);
 if position('v_workspace' in d)=0 then
  if position('v_role text;' in d)=0 or position($q$v_role:=nullif(p_data->>'role','');$q$ in d)=0
   or position('insert into mawatheeq_private.team_areas(name,role,parent_user,parent_area,updated_by) values(v_name,v_role,v_parent_user,v_parent_area,actor);' in d)=0
   or position('set name=v_name,role=v_role,parent_user=' in d)=0 then
   raise exception 'daily_request is not the expected version';
  end if;
  d:=replace(d,'v_role text;','v_role text; v_workspace text;');
  d:=replace(d,$q$v_role:=nullif(p_data->>'role','');$q$,$q$v_role:=nullif(p_data->>'role','');
  v_workspace:=case when p_data ? 'workspace' then nullif(p_data->>'workspace','') else (select a.workspace from mawatheeq_private.team_areas a where a.id=nullif(p_data->>'id','')::uuid) end;$q$);
  d:=replace(d,'insert into mawatheeq_private.team_areas(name,role,parent_user,parent_area,updated_by) values(v_name,v_role,v_parent_user,v_parent_area,actor);',
   'insert into mawatheeq_private.team_areas(name,role,workspace,parent_user,parent_area,updated_by) values(v_name,v_role,v_workspace,v_parent_user,v_parent_area,actor);');
  d:=replace(d,'set name=v_name,role=v_role,parent_user=','set name=v_name,role=v_role,workspace=v_workspace,parent_user=');
  execute d;
 end if;
end $$;

revoke all on function mawatheeq_private.daily_request(text,text,jsonb),mawatheeq_private.team_chart() from public,anon,authenticated;
grant execute on function mawatheeq_private.daily_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
