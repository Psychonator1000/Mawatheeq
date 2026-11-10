begin;
-- «الهيكل الوظيفي»: who each account reports to. Everyone keeps writing their own daily report; an account with people
-- under it also reads their reports and performance, and those of everyone under them, down the whole line (a lawyer
-- leading lawyers sees his team; the head above him sees him and his team too). The owner and admins holding the staff
-- or reviews power still read everyone's reports. The owner or an admin with the staff power sets the lines.
-- Safe to run again.

create table if not exists mawatheeq_private.team_lines (
  user_id uuid primary key references mawatheeq_private.accounts(id) on delete cascade,
  manager_id uuid not null references mawatheeq_private.accounts(id) on delete cascade,
  updated_by uuid references mawatheeq_private.accounts(id),
  updated_at timestamptz not null default now(),
  check (user_id<>manager_id)
);
create index if not exists team_lines_manager_idx on mawatheeq_private.team_lines(manager_id);
alter table mawatheeq_private.team_lines enable row level security;
revoke all on mawatheeq_private.team_lines from public,anon,authenticated;

-- Everyone under an account, at any depth (the account itself left out); a line can never loop, but the walk stops anyway.
create or replace function mawatheeq_private.team_below(p_user uuid) returns table(user_id uuid)
language sql stable set search_path='' as $$
 with recursive below(id,depth) as (
  select t.user_id,1 from mawatheeq_private.team_lines t where t.manager_id=p_user
  union
  select t.user_id,b.depth+1 from mawatheeq_private.team_lines t join below b on t.manager_id=b.id where b.depth<50)
 select distinct id from below where id<>p_user;
$$;

create or replace function mawatheeq_private.daily_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; owner boolean; reviewer boolean; leads boolean; manager boolean; writer boolean; v_date date; v_from date; v_to date; v_today date;
 r mawatheeq_private.daily_reports; result jsonb; v_user uuid; v_manager uuid; team uuid[];
begin
 actor:=mawatheeq_private.authorize(p_token);
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>250000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 a:=mawatheeq_private.access_for(actor);
 owner:=exists(select 1 from public.mawatheeq_members m where m.user_id=actor and m.role='owner');
 -- Everyone's reports: the owner and admins with the staff or reviews power. Their own team's: whoever has people under them.
 reviewer:=owner or coalesce(a->'adminPowers','[]'::jsonb) ?| array['staff','reviews'];
 leads:=exists(select 1 from mawatheeq_private.team_lines t where t.manager_id=actor);
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
   -- Everyone expected to report: enabled accounts holding the section.
   'expected',(select coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'username',u.username,'displayName',coalesce(u.display_name,'')) order by u.username),'[]')
     from mawatheeq_private.accounts u join mawatheeq_private.member_access ma on ma.user_id=u.id
     where u.enabled and ma.permissions->'sections' ? 'daily' and (team is null or u.id=any(team))));

 elsif p_action='team' then
  -- What this account oversees, and the whole chart for whoever may change it (or reads every report).
  return jsonb_build_object('all',reviewer,'leads',leads,'canManage',manager,
   'below',(select coalesce(jsonb_agg(b.user_id),'[]') from mawatheeq_private.team_below(actor) b),
   'lines',case when manager or reviewer then (select coalesce(jsonb_agg(jsonb_build_object('userId',t.user_id,'managerId',t.manager_id)),'[]') from mawatheeq_private.team_lines t) else '[]'::jsonb end);

 elsif p_action='set_manager' then
  perform mawatheeq_private.require_access(manager);
  v_user:=nullif(p_data->>'userId','')::uuid;
  v_manager:=nullif(p_data->>'managerId','')::uuid;
  if v_user is null or not exists(select 1 from mawatheeq_private.accounts where id=v_user) then raise exception 'الحساب غير موجود.'; end if;
  if exists(select 1 from public.mawatheeq_members m where m.user_id=v_user and m.role='owner') then raise exception 'حساب المالك في أعلى الهيكل دائماً.'; end if;
  if v_manager is null then
   delete from mawatheeq_private.team_lines where user_id=v_user;
  else
   if not exists(select 1 from mawatheeq_private.accounts where id=v_manager and enabled) then raise exception 'المسؤول المختار غير موجود أو موقوف.'; end if;
   -- Serialized so two changes at once cannot close a loop between them.
   lock table mawatheeq_private.team_lines in share row exclusive mode;
   if v_manager=v_user or v_manager in (select b.user_id from mawatheeq_private.team_below(v_user) b) then
    raise exception 'لا يتبع أحد من هو تحته في الهيكل.';
   end if;
   insert into mawatheeq_private.team_lines(user_id,manager_id,updated_by,updated_at) values(v_user,v_manager,actor,clock_timestamp())
   on conflict (user_id) do update set manager_id=excluded.manager_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('userId',t.user_id,'managerId',t.manager_id)),'[]') from mawatheeq_private.team_lines t);
 end if;
 raise exception 'إجراء غير معروف.';
end $$;

revoke all on function mawatheeq_private.daily_request(text,text,jsonb),mawatheeq_private.team_below(uuid) from public,anon,authenticated;
grant execute on function mawatheeq_private.daily_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
