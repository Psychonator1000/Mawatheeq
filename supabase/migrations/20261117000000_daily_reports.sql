begin;
-- «التقرير اليومي»: each lawyer's report of their day (hearings attended, administrative work inside the courts, visits
-- to other bodies, other work, pending follow-ups and notes), one per person per day.
-- The «daily» section lets an account write its own report; it grants no access to cases, so an account holding only
-- this section sees no case at all. The owner and admins holding the staff or reviews power read everyone's reports.
-- Safe to run again.

create table if not exists mawatheeq_private.daily_reports (
  user_id uuid not null references mawatheeq_private.accounts(id),
  report_date date not null,
  payload jsonb not null default '{}' check (jsonb_typeof(payload)='object' and length(payload::text)<=200000),
  submitted_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,report_date)
);
create index if not exists daily_reports_date_idx on mawatheeq_private.daily_reports(report_date);
alter table mawatheeq_private.daily_reports enable row level security;
revoke all on mawatheeq_private.daily_reports from public,anon,authenticated;

create or replace function mawatheeq_private.daily_row(r mawatheeq_private.daily_reports) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('userId',r.user_id,'username',a.username,'displayName',coalesce(a.display_name,''),'date',r.report_date,
  'payload',r.payload,'submittedAt',r.submitted_at,'updatedAt',r.updated_at,'revision',r.revision)
 from mawatheeq_private.accounts a where a.id=r.user_id;
$$;

create or replace function mawatheeq_private.daily_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; owner boolean; reviewer boolean; writer boolean; v_date date; v_from date; v_to date; v_today date;
 r mawatheeq_private.daily_reports; result jsonb;
begin
 actor:=mawatheeq_private.authorize(p_token);
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>250000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 a:=mawatheeq_private.access_for(actor);
 owner:=exists(select 1 from public.mawatheeq_members m where m.user_id=actor and m.role='owner');
 reviewer:=owner or coalesce(a->'adminPowers','[]'::jsonb) ?| array['staff','reviews'];
 writer:=owner or coalesce(a->'sections','[]'::jsonb) ? 'daily';
 v_today:=(clock_timestamp() at time zone 'Asia/Kuwait')::date;
 v_date:=coalesce(nullif(p_data->>'date','')::date,v_today);

 if p_action='mine' then
  perform mawatheeq_private.require_access(writer);
  select * into r from mawatheeq_private.daily_reports where user_id=actor and report_date=v_date;
  -- The hearings assigned to this person that day, to start the report with; case details only where the account
  -- may read the case.
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
  perform mawatheeq_private.require_access(reviewer);
  v_from:=coalesce(nullif(p_data->>'from','')::date,v_date);
  v_to:=coalesce(nullif(p_data->>'to','')::date,v_from);
  if v_to<v_from or v_to-v_from>62 then raise exception 'اختر فترة لا تزيد على شهرين.'; end if;
  return jsonb_build_object(
   'reports',(select coalesce(jsonb_agg(mawatheeq_private.daily_row(d) order by d.report_date desc,d.updated_at desc),'[]') from mawatheeq_private.daily_reports d where d.report_date between v_from and v_to),
   -- Everyone expected to report: enabled accounts holding the section.
   'expected',(select coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'username',u.username,'displayName',coalesce(u.display_name,'')) order by u.username),'[]')
     from mawatheeq_private.accounts u join mawatheeq_private.member_access ma on ma.user_id=u.id
     where u.enabled and ma.permissions->'sections' ? 'daily'));
 end if;
 raise exception 'إجراء غير معروف.';
end $$;

create or replace function public.mawatheeq_daily_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.daily_request(p_token,p_action,p_data); $$;
revoke all on function mawatheeq_private.daily_request(text,text,jsonb),mawatheeq_private.daily_row(mawatheeq_private.daily_reports) from public,anon,authenticated;
revoke all on function public.mawatheeq_daily_request(text,text,jsonb) from public;
grant execute on function mawatheeq_private.daily_request(text,text,jsonb) to anon,authenticated,service_role;
grant execute on function public.mawatheeq_daily_request(text,text,jsonb) to anon,authenticated,service_role;

-- Saving permissions accepts the «daily» section; everything else (validation, revision check, powers, view map,
-- audit entry, session revocation) stays in the existing functions.
do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='save_access_daily') then
  alter function mawatheeq_private.save_access(uuid,jsonb,integer) rename to save_access_daily;
 end if;
end $$;
create or replace function mawatheeq_private.save_access(p_user uuid,p_permissions jsonb,p_revision integer) returns jsonb
language plpgsql set search_path='' as $$
declare daily boolean:=false; p jsonb:=p_permissions; result jsonb;
begin
 if jsonb_typeof(p) is not distinct from 'object' and jsonb_typeof(p->'sections') is not distinct from 'array' then
  daily:=p->'sections' ? 'daily';
  p:=jsonb_set(p,'{sections}',coalesce((select jsonb_agg(s) from jsonb_array_elements(p->'sections') s where s<>'"daily"'::jsonb),'[]'));
 end if;
 result:=mawatheeq_private.save_access_daily(p_user,p,p_revision);
 if daily then
  update mawatheeq_private.member_access set permissions=jsonb_set(permissions,'{sections}',(permissions->'sections')||'["daily"]'::jsonb)
   where user_id=p_user returning permissions||jsonb_build_object('revision',revision) into result;
  update mawatheeq_private.access_changes set after_permissions=jsonb_set(after_permissions,'{sections}',coalesce(after_permissions->'sections','[]'::jsonb)||'["daily"]'::jsonb)
   where id=(select max(id) from mawatheeq_private.access_changes where user_id=p_user);
 end if;
 return result;
end $$;
revoke all on function mawatheeq_private.save_access(uuid,jsonb,integer),mawatheeq_private.save_access_daily(uuid,jsonb,integer) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
