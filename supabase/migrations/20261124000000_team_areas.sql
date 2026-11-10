begin;
-- «الأقسام» in «الهيكل الوظيفي»: named boxes in the office's tree, each for a kind of work (محامون، مستشارون، محاسبة…).
-- A section sits at the top, under a person or inside another section; a person reports either to a person or to a
-- section. Whoever a section sits under oversees everyone inside it (at any depth), exactly as if they reported to him;
-- people inside the same section do not read each other's reports. The owner or an admin with the staff power arranges
-- them. Safe to run again.

create table if not exists mawatheeq_private.team_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  role text check (role is null or role ~ '^[A-Za-z_]{1,40}$'),
  parent_user uuid references mawatheeq_private.accounts(id) on delete set null,
  parent_area uuid references mawatheeq_private.team_areas(id) on delete set null,
  updated_by uuid references mawatheeq_private.accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_user is null or parent_area is null),
  check (parent_area is distinct from id)
);
alter table mawatheeq_private.team_areas enable row level security;
revoke all on mawatheeq_private.team_areas from public,anon,authenticated;

-- A person now reports to a person or to a section.
alter table mawatheeq_private.team_lines alter column manager_id drop not null;
alter table mawatheeq_private.team_lines add column if not exists area_id uuid references mawatheeq_private.team_areas(id) on delete cascade;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='team_lines_one_parent') then
  alter table mawatheeq_private.team_lines add constraint team_lines_one_parent check ((manager_id is null)<>(area_id is null));
 end if;
end $$;
create index if not exists team_lines_area_idx on mawatheeq_private.team_lines(area_id);

-- Everything under a person or a section, at any depth: people ('u') and sections ('a').
create or replace function mawatheeq_private.team_nodes_below(p_kind text,p_id uuid) returns table(kind text,id uuid)
language sql stable set search_path='' as $$
 with recursive edges(pk,pid,ck,cid) as (
  select case when t.manager_id is not null then 'u' else 'a' end,coalesce(t.manager_id,t.area_id),'u',t.user_id from mawatheeq_private.team_lines t
  union all
  select case when a.parent_user is not null then 'u' else 'a' end,coalesce(a.parent_user,a.parent_area),'a',a.id from mawatheeq_private.team_areas a
   where a.parent_user is not null or a.parent_area is not null),
 below(kind,id,depth) as (
  select e.ck,e.cid,1 from edges e where e.pk=p_kind and e.pid=p_id
  union
  select e.ck,e.cid,b.depth+1 from below b join edges e on e.pk=b.kind and e.pid=b.id where b.depth<60)
 select distinct b.kind,b.id from below b where not (b.kind=p_kind and b.id=p_id);
$$;
-- Everyone a person oversees: the people under him and inside the sections under him, at any depth.
create or replace function mawatheeq_private.team_below(p_user uuid) returns table(user_id uuid)
language sql stable set search_path='' as $$
 select b.id from mawatheeq_private.team_nodes_below('u',p_user) b where b.kind='u';
$$;

create or replace function mawatheeq_private.team_chart() returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'lines',(select coalesce(jsonb_agg(jsonb_build_object('userId',t.user_id,'managerId',t.manager_id,'areaId',t.area_id)),'[]') from mawatheeq_private.team_lines t),
  'areas',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'role',a.role,'parentUser',a.parent_user,'parentArea',a.parent_area) order by a.created_at),'[]') from mawatheeq_private.team_areas a));
$$;

create or replace function mawatheeq_private.daily_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; owner boolean; reviewer boolean; leads boolean; manager boolean; writer boolean; v_date date; v_from date; v_to date; v_today date;
 r mawatheeq_private.daily_reports; result jsonb; v_user uuid; v_manager uuid; v_area uuid; v_parent_user uuid; v_parent_area uuid; v_name text; v_role text;
 old mawatheeq_private.team_areas; team uuid[];
begin
 actor:=mawatheeq_private.authorize(p_token);
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>250000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 a:=mawatheeq_private.access_for(actor);
 owner:=exists(select 1 from public.mawatheeq_members m where m.user_id=actor and m.role='owner');
 -- Everyone's reports: the owner and admins with the staff or reviews power. Their own team's: whoever has people under them.
 reviewer:=owner or coalesce(a->'adminPowers','[]'::jsonb) ?| array['staff','reviews'];
 leads:=exists(select 1 from mawatheeq_private.team_below(actor));
 manager:=owner or coalesce(a->'adminPowers','[]'::jsonb) ? 'staff';
 writer:=owner or coalesce(a->'sections','[]'::jsonb) ? 'daily';
 v_today:=(clock_timestamp() at time zone 'Asia/Kuwait')::date;
 v_date:=coalesce(nullif(p_data->>'date','')::date,v_today);

 if p_action='mine' then
  perform mawatheeq_private.require_access(writer);
  select * into r from mawatheeq_private.daily_reports where user_id=actor and report_date=v_date;
  select coalesce(jsonb_agg(jsonb_build_object('workId',w.id,'title',coalesce(w.payload->>'title',''),'location',coalesce(w.payload->>'location',''),
    'time',coalesce(w.payload->>'dueTime',''),'caseId',case when c.id is not null then c.id end,
    'code',coalesce(c.payload->>'code',''),'caseNumber',coalesce(c.payload->>'caseNumber',''),'court',coalesce(c.payload->>'court',''),
    'client',coalesce(c.payload->>'clientEntityName',c.payload->>'client',''),'opponent',coalesce(c.payload->>'opponent',''))
    order by w.payload->>'dueTime',w.created_at),'[]') into result
  from mawatheeq_private.work_items w
  left join public.mawatheeq_cases c on c.id=w.payload->>'caseId' and mawatheeq_private.can_case(actor,c.id)
  where w.payload->>'kind'='hearing' and w.payload->>'assigneeId'=actor::text and w.payload->>'dueDate'=v_date::text
   and coalesce(w.payload->>'status','') not in ('cancelled');
  return jsonb_build_object('report',case when r.user_id is null then null else mawatheeq_private.daily_row(r) end,'hearings',result);

 elsif p_action='save' then
  perform mawatheeq_private.require_access(writer);
  if v_date>v_today then raise exception 'لا يمكن كتابة تقرير ليوم لم يأتِ بعد.'; end if;
  if jsonb_typeof(p_data->'payload') is distinct from 'object' then raise exception 'محتوى التقرير غير صالح.'; end if;
  select * into r from mawatheeq_private.daily_reports where user_id=actor and report_date=v_date for update;
  if coalesce(r.revision,0) is distinct from coalesce((p_data->>'revision')::integer,0) then
   raise exception 'تغيّر التقرير من نافذة أخرى. أعد تحميله ثم احفظ.' using errcode='40001';
  end if;
  if r.user_id is null then
   insert into mawatheeq_private.daily_reports(user_id,report_date,payload,submitted_at)
   values(actor,v_date,p_data->'payload',case when coalesce((p_data->>'submit')::boolean,false) then clock_timestamp() end) returning * into r;
  else
   update mawatheeq_private.daily_reports set payload=p_data->'payload',revision=revision+1,updated_at=clock_timestamp(),
    submitted_at=case when coalesce((p_data->>'submit')::boolean,false) then clock_timestamp() else submitted_at end
   where user_id=actor and report_date=v_date returning * into r;
  end if;
  return mawatheeq_private.daily_row(r);

 elsif p_action='list' then
  perform mawatheeq_private.require_access(reviewer or leads);
  v_from:=coalesce(nullif(p_data->>'from','')::date,v_date);
  v_to:=coalesce(nullif(p_data->>'to','')::date,v_from);
  if v_to<v_from or v_to-v_from>62 then raise exception 'اختر فترة لا تزيد على شهرين.'; end if;
  -- A team lead reads the people under him and himself; nobody else's report leaves the server.
  if not reviewer then team:=array(select b.user_id from mawatheeq_private.team_below(actor) b)||actor; end if;
  return jsonb_build_object(
   'reports',(select coalesce(jsonb_agg(mawatheeq_private.daily_row(d) order by d.report_date desc,d.updated_at desc),'[]') from mawatheeq_private.daily_reports d
     where d.report_date between v_from and v_to and (team is null or d.user_id=any(team))),
   'expected',(select coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'username',u.username,'displayName',coalesce(u.display_name,'')) order by u.username),'[]')
     from mawatheeq_private.accounts u join mawatheeq_private.member_access ma on ma.user_id=u.id
     where u.enabled and ma.permissions->'sections' ? 'daily' and (team is null or u.id=any(team))));

 elsif p_action='team' then
  -- What this account oversees, and the whole chart for whoever may change it (or reads every report).
  result:=case when manager or reviewer then mawatheeq_private.team_chart() else jsonb_build_object('lines','[]'::jsonb,'areas','[]'::jsonb) end;
  return result||jsonb_build_object('all',reviewer,'leads',leads,'canManage',manager,
   'below',(select coalesce(jsonb_agg(b.user_id),'[]') from mawatheeq_private.team_below(actor) b));

 elsif p_action='set_manager' then
  -- A person goes under a person (managerId), into a section (areaId), or back to the top (neither).
  perform mawatheeq_private.require_access(manager);
  v_user:=nullif(p_data->>'userId','')::uuid;
  v_manager:=nullif(p_data->>'managerId','')::uuid;
  v_area:=nullif(p_data->>'areaId','')::uuid;
  if v_user is null or not exists(select 1 from mawatheeq_private.accounts where id=v_user) then raise exception 'الحساب غير موجود.'; end if;
  if exists(select 1 from public.mawatheeq_members m where m.user_id=v_user and m.role='owner') then raise exception 'حساب المالك في أعلى الهيكل دائماً.'; end if;
  if v_manager is not null and v_area is not null then raise exception 'اختر شخصاً أو قسماً، لا كليهما.'; end if;
  lock table mawatheeq_private.team_lines,mawatheeq_private.team_areas in share row exclusive mode;
  if v_manager is null and v_area is null then
   delete from mawatheeq_private.team_lines where user_id=v_user;
  else
   if v_manager is not null and not exists(select 1 from mawatheeq_private.accounts where id=v_manager and enabled) then raise exception 'المسؤول المختار غير موجود أو موقوف.'; end if;
   if v_area is not null and not exists(select 1 from mawatheeq_private.team_areas where id=v_area) then raise exception 'القسم غير موجود.'; end if;
   -- Serialized so two changes at once cannot close a loop between them.
   if v_manager=v_user or exists(select 1 from mawatheeq_private.team_nodes_below('u',v_user) b where (b.kind='u' and b.id=v_manager) or (b.kind='a' and b.id=v_area)) then
    raise exception 'لا يتبع أحد من هو تحته في الهيكل.';
   end if;
   insert into mawatheeq_private.team_lines(user_id,manager_id,area_id,updated_by,updated_at) values(v_user,v_manager,v_area,actor,clock_timestamp())
   on conflict (user_id) do update set manager_id=excluded.manager_id,area_id=excluded.area_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  end if;
  return mawatheeq_private.team_chart();

 elsif p_action='save_area' then
  -- A new section, or one renamed or moved (under a person, inside another section, or at the top).
  perform mawatheeq_private.require_access(manager);
  v_area:=nullif(p_data->>'id','')::uuid;
  v_name:=btrim(coalesce(p_data->>'name',''));
  v_role:=nullif(p_data->>'role','');
  v_parent_user:=nullif(p_data->>'parentUser','')::uuid;
  v_parent_area:=nullif(p_data->>'parentArea','')::uuid;
  if length(v_name) not between 1 and 60 then raise exception 'اكتب اسماً للقسم (حتى 60 حرفاً).'; end if;
  if v_parent_user is not null and v_parent_area is not null then raise exception 'اختر شخصاً أو قسماً، لا كليهما.'; end if;
  if v_parent_user is not null and exists(select 1 from public.mawatheeq_members m where m.user_id=v_parent_user and m.role='owner') then v_parent_user:=null; end if;
  if v_parent_user is not null and not exists(select 1 from mawatheeq_private.accounts where id=v_parent_user and enabled) then raise exception 'المسؤول المختار غير موجود أو موقوف.'; end if;
  if v_parent_area is not null and not exists(select 1 from mawatheeq_private.team_areas where id=v_parent_area) then raise exception 'القسم غير موجود.'; end if;
  lock table mawatheeq_private.team_lines,mawatheeq_private.team_areas in share row exclusive mode;
  if v_area is null then
   insert into mawatheeq_private.team_areas(name,role,parent_user,parent_area,updated_by) values(v_name,v_role,v_parent_user,v_parent_area,actor);
  else
   select * into old from mawatheeq_private.team_areas where id=v_area for update;
   if old.id is null then raise exception 'القسم غير موجود.'; end if;
   if v_parent_area=v_area or exists(select 1 from mawatheeq_private.team_nodes_below('a',v_area) b where (b.kind='u' and b.id=v_parent_user) or (b.kind='a' and b.id=v_parent_area)) then
    raise exception 'لا يوضع قسم تحت من هو داخله.';
   end if;
   update mawatheeq_private.team_areas set name=v_name,role=v_role,parent_user=v_parent_user,parent_area=v_parent_area,updated_by=actor,updated_at=clock_timestamp() where id=v_area;
  end if;
  return mawatheeq_private.team_chart();

 elsif p_action='delete_area' then
  -- Whoever was inside a removed section moves up to where the section was.
  perform mawatheeq_private.require_access(manager);
  v_area:=nullif(p_data->>'id','')::uuid;
  lock table mawatheeq_private.team_lines,mawatheeq_private.team_areas in share row exclusive mode;
  select * into old from mawatheeq_private.team_areas where id=v_area for update;
  if old.id is null then raise exception 'القسم غير موجود.'; end if;
  if old.parent_user is null and old.parent_area is null then
   delete from mawatheeq_private.team_lines where area_id=v_area;
  else
   update mawatheeq_private.team_lines set manager_id=old.parent_user,area_id=old.parent_area,updated_by=actor,updated_at=clock_timestamp() where area_id=v_area;
  end if;
  update mawatheeq_private.team_areas set parent_user=old.parent_user,parent_area=old.parent_area,updated_by=actor,updated_at=clock_timestamp() where parent_area=v_area;
  delete from mawatheeq_private.team_areas where id=v_area;
  return mawatheeq_private.team_chart();
 end if;
 raise exception 'إجراء غير معروف.';
end $$;

revoke all on function mawatheeq_private.daily_request(text,text,jsonb),mawatheeq_private.team_below(uuid),mawatheeq_private.team_nodes_below(text,uuid),mawatheeq_private.team_chart() from public,anon,authenticated;
grant execute on function mawatheeq_private.daily_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
