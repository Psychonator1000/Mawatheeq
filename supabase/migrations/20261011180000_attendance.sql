begin;
-- Additive attendance, payroll estimates and fingerprint-device management for HR and accounting.
-- Existing records, grants and sessions stay untouched. Devices are reached only through a bridge
-- program on the office network, authenticated by a hashed bridge key (no service-role key).

create table mawatheeq_private.att_settings (
  id integer primary key check (id = 1), payload jsonb not null, revision integer not null default 1,
  updated_by uuid references mawatheeq_private.accounts(id), updated_at timestamptz not null default now()
);
insert into mawatheeq_private.att_settings(id,payload) values (1,
 '{"timezone":"Asia/Kuwait","workDays":[0,1,2,3,4],"start":"08:00","end":"16:00","graceMinutes":10,"monthlyLateAllowanceMinutes":60,
   "deductionMode":"warn","dayRateBasis":"30","absenceDeduction":false,"overtime":{"enabled":false,"multiplier":1.25,"minMinutes":30},
   "holidays":[],"currency":"KWD"}');
create table mawatheeq_private.att_profiles (
  employee_id uuid primary key references mawatheeq_private.department_records(id),
  pin text unique check (pin ~ '^[0-9A-Za-z]{1,24}$'),
  salary_minor bigint not null default 0 check (salary_minor >= 0),
  currency text not null default 'KWD' check (currency in ('KWD','SAR','AED','EGP','USD')),
  schedule jsonb, revision integer not null default 1,
  updated_by uuid not null references mawatheeq_private.accounts(id), updated_at timestamptz not null default now()
);
create table mawatheeq_private.att_devices (
  id uuid primary key, name text not null check (length(btrim(name)) between 1 and 80),
  host text not null check (host ~ '^[A-Za-z0-9.-]{1,253}$'), port integer not null default 4370 check (port between 1 and 65535),
  location text not null default '' check (length(location) <= 120), enabled boolean not null default true,
  serial text, info jsonb not null default '{}', status text not null default 'unknown', last_seen timestamptz, last_sync timestamptz, last_error text,
  revision integer not null default 1, created_by uuid not null references mawatheeq_private.accounts(id),
  updated_by uuid not null references mawatheeq_private.accounts(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table mawatheeq_private.att_device_users (
  device_id uuid not null references mawatheeq_private.att_devices(id) on delete cascade, pin text not null, uid integer,
  name text not null default '', role integer not null default 0, card text not null default '', synced_at timestamptz not null default now(),
  primary key (device_id,pin)
);
create table mawatheeq_private.att_punches (
  id bigint generated always as identity primary key, device_id uuid references mawatheeq_private.att_devices(id),
  pin text not null check (pin ~ '^[0-9A-Za-z]{1,24}$'), punched_at timestamptz not null, verify integer, state integer,
  source text not null check (source in ('device','import')), created_by uuid references mawatheeq_private.accounts(id),
  created_at timestamptz not null default now(), unique (pin,punched_at)
);
create index att_punches_time_idx on mawatheeq_private.att_punches(punched_at);
create table mawatheeq_private.att_adjustments (
  id uuid primary key, employee_id uuid not null references mawatheeq_private.department_records(id), day date not null,
  kind text not null check (kind in ('excuse','manual_in','manual_out')), at_time text check (at_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  note text not null check (length(btrim(note)) between 1 and 500), archived boolean not null default false, revision integer not null default 1,
  created_by uuid not null references mawatheeq_private.accounts(id), updated_by uuid not null references mawatheeq_private.accounts(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((kind='excuse' and at_time is null) or (kind<>'excuse' and at_time is not null))
);
create index att_adjustments_day_idx on mawatheeq_private.att_adjustments(day);
create table mawatheeq_private.att_commands (
  id uuid primary key default gen_random_uuid(), device_id uuid not null references mawatheeq_private.att_devices(id) on delete cascade,
  kind text not null check (kind in ('sync_logs','fetch_users','read_info','set_time','add_user','delete_user')),
  payload jsonb not null default '{}', status text not null default 'pending' check (status in ('pending','running','done','failed')),
  result jsonb, error text, requested_by uuid not null references mawatheeq_private.accounts(id),
  created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz
);
create index att_commands_device_idx on mawatheeq_private.att_commands(device_id,created_at desc);
create table mawatheeq_private.att_bridges (
  id uuid primary key default gen_random_uuid(), name text not null check (length(btrim(name)) between 1 and 80),
  key_hash bytea not null unique, version text, created_by uuid not null references mawatheeq_private.accounts(id),
  created_at timestamptz not null default now(), last_seen timestamptz, revoked_at timestamptz
);
create table mawatheeq_private.att_changes (
  id bigint generated always as identity primary key, entity text not null, entity_id text not null,
  before jsonb, after jsonb, actor_id uuid references mawatheeq_private.accounts(id), created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['att_settings','att_profiles','att_devices','att_device_users','att_punches','att_adjustments','att_commands','att_bridges','att_changes'] loop
  execute format('alter table mawatheeq_private.%I enable row level security',t);
  execute format('revoke all on mawatheeq_private.%I from public,anon,authenticated',t);
 end loop; end $$;

create function mawatheeq_private.att_can_view(p_user uuid) returns boolean language sql stable set search_path='' as $$
 select mawatheeq_private.has_section(p_user,'hr') or mawatheeq_private.has_section(p_user,'accounting'); $$;
create function mawatheeq_private.att_can_edit(p_user uuid) returns boolean language sql stable set search_path='' as $$
 select mawatheeq_private.att_can_view(p_user) and coalesce((mawatheeq_private.access_for(p_user)->>'canEdit')::boolean,false); $$;
create function mawatheeq_private.att_can_devices(p_user uuid) returns boolean language sql stable set search_path='' as $$
 select mawatheeq_private.has_section(p_user,'hr') and coalesce((mawatheeq_private.access_for(p_user)->>'canEdit')::boolean,false); $$;
create function mawatheeq_private.att_tz() returns text language sql stable set search_path='' as $$
 select payload->>'timezone' from mawatheeq_private.att_settings where id=1; $$;
create function mawatheeq_private.att_hhmm(v text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(v ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$',false); $$;
create function mawatheeq_private.att_valid_schedule(s jsonb) returns boolean language sql stable set search_path='' as $$
 select jsonb_typeof(s)='object' and mawatheeq_private.att_hhmm(s->>'start') and mawatheeq_private.att_hhmm(s->>'end') and s->>'start'<s->>'end'
  and jsonb_typeof(s->'workDays')='array' and jsonb_array_length(s->'workDays')<=7
  and not exists(select 1 from jsonb_array_elements(s->'workDays') d where jsonb_typeof(d)<>'number' or (d#>>'{}')::numeric not in (0,1,2,3,4,5,6)); $$;
create function mawatheeq_private.att_valid_settings(s jsonb) returns boolean language sql stable set search_path='' as $$
 select mawatheeq_private.att_valid_schedule(s)
  and exists(select 1 from pg_timezone_names where name=s->>'timezone')
  and jsonb_typeof(s->'graceMinutes')='number' and (s->>'graceMinutes')::numeric between 0 and 240
  and jsonb_typeof(s->'monthlyLateAllowanceMinutes')='number' and (s->>'monthlyLateAllowanceMinutes')::numeric between 0 and 10000
  and s->>'deductionMode' in ('warn','deduct') and s->>'dayRateBasis' in ('30','workdays')
  and jsonb_typeof(s->'absenceDeduction')='boolean' and s->>'currency' in ('KWD','SAR','AED','EGP','USD')
  and jsonb_typeof(s->'overtime')='object' and jsonb_typeof(s#>'{overtime,enabled}')='boolean'
  and (s#>>'{overtime,multiplier}')::numeric between 1 and 3 and (s#>>'{overtime,minMinutes}')::numeric between 0 and 600
  and jsonb_typeof(s->'holidays')='array' and jsonb_array_length(s->'holidays')<=200
  and not exists(select 1 from jsonb_array_elements(s->'holidays') h where jsonb_typeof(h)<>'object'
   or coalesce(h->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or length(coalesce(h->>'name',''))>80); $$;
create function mawatheeq_private.att_audit(p_entity text,p_id text,p_before jsonb,p_after jsonb,p_actor uuid) returns void language sql set search_path='' as $$
 insert into mawatheeq_private.att_changes(entity,entity_id,before,after,actor_id) values(p_entity,p_id,p_before,p_after,p_actor); $$;
create function mawatheeq_private.att_device_json(d mawatheeq_private.att_devices) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',d.id,'name',d.name,'host',d.host,'port',d.port,'location',d.location,'enabled',d.enabled,'serial',d.serial,
  'info',d.info,'status',d.status,'lastSeen',d.last_seen,'lastSync',d.last_sync,'lastError',d.last_error,'revision',d.revision,
  'userCount',(select count(*) from mawatheeq_private.att_device_users u where u.device_id=d.id),
  'pendingCommands',(select count(*) from mawatheeq_private.att_commands c where c.device_id=d.id and c.status in ('pending','running'))); $$;
create function mawatheeq_private.att_command_json(c mawatheeq_private.att_commands) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'deviceId',c.device_id,'kind',c.kind,'payload',c.payload,'status',c.status,'result',c.result,'error',c.error,
  'requestedBy',(select username from mawatheeq_private.accounts where id=c.requested_by),'createdAt',c.created_at,'finishedAt',c.finished_at); $$;
create function mawatheeq_private.att_valid_wall(v text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(v ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$',false); $$;

create function mawatheeq_private.attendance_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; tz text; result jsonb; s mawatheeq_private.att_settings%rowtype; pr mawatheeq_private.att_profiles%rowtype;
 dv mawatheeq_private.att_devices%rowtype; adj mawatheeq_private.att_adjustments%rowtype; cmd mawatheeq_private.att_commands%rowtype;
 v_from date; v_to date; v_id uuid; v_key text; v_count integer; v_salary bigint; item jsonb;
begin
 actor:=mawatheeq_private.authorize(p_token);
 perform mawatheeq_private.require_access(mawatheeq_private.att_can_view(actor));
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>3000000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 tz:=mawatheeq_private.att_tz();
 if p_action in ('punches','leaves','adjustments') then
  v_from:=(p_data->>'from')::date; v_to:=(p_data->>'to')::date;
  if v_from is null or v_to is null or v_to<v_from or v_to-v_from>62 then raise exception 'اختر فترة لا تتجاوز شهرين.'; end if;
 end if;
 case p_action
 when 'context' then
  select * into s from mawatheeq_private.att_settings where id=1;
  return jsonb_build_object('settings',s.payload,'revision',s.revision,'today',to_char(now() at time zone tz,'YYYY-MM-DD'),
   'canEdit',mawatheeq_private.att_can_edit(actor),'canManageDevices',mawatheeq_private.att_can_devices(actor),'isHr',mawatheeq_private.has_section(actor,'hr'));
 when 'employees' then
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.payload->>'name','employeeNumber',r.payload->>'employeeNumber','department',r.payload->>'department',
   'title',r.payload->>'title','active',not r.archived and coalesce(r.payload->>'status','active')='active','pin',p.pin,'salaryMinor',coalesce(p.salary_minor,0)::text,
   'currency',coalesce(p.currency,'KWD'),'schedule',p.schedule,'profileRevision',coalesce(p.revision,0)) order by r.payload->>'name'),'[]') into result
   from mawatheeq_private.department_records r left join mawatheeq_private.att_profiles p on p.employee_id=r.id
   where r.workspace='hr' and r.kind='employee';
  return result;
 when 'save_settings' then
  perform mawatheeq_private.require_access(mawatheeq_private.att_can_edit(actor));
  select * into s from mawatheeq_private.att_settings where id=1 for update;
  if s.revision<>(p_data->>'revision')::integer then raise exception 'تغيرت إعدادات الدوام. أعد التحميل قبل الحفظ.' using errcode='40001'; end if;
  if not mawatheeq_private.att_valid_settings(p_data->'settings') then raise exception 'إعدادات الدوام غير صالحة.'; end if;
  update mawatheeq_private.att_settings set payload=p_data->'settings',revision=revision+1,updated_by=actor,updated_at=now() where id=1 returning * into s;
  perform mawatheeq_private.att_audit('settings','1',null,s.payload,actor);
  return jsonb_build_object('settings',s.payload,'revision',s.revision);
 when 'save_profile' then
  perform mawatheeq_private.require_access(mawatheeq_private.att_can_edit(actor));
  v_id:=(p_data->>'employeeId')::uuid; item:=p_data->'profile';
  if not exists(select 1 from mawatheeq_private.department_records where id=v_id and workspace='hr' and kind='employee') then raise exception 'ملف الموظف غير موجود.'; end if;
  if jsonb_typeof(item)<>'object' or coalesce(item->>'salaryMinor','') !~ '^\d{1,15}$' or coalesce(item->>'currency','') not in ('KWD','SAR','AED','EGP','USD')
   or (coalesce(item->>'pin','')<>'' and item->>'pin' !~ '^[0-9A-Za-z]{1,24}$')
   or (item->'schedule' is not null and jsonb_typeof(item->'schedule')<>'null' and not mawatheeq_private.att_valid_schedule(item->'schedule')) then
   raise exception 'بيانات الموظف في الحضور غير صالحة.'; end if;
  perform pg_advisory_xact_lock(hashtext('att-profile-'||v_id::text));
  select * into pr from mawatheeq_private.att_profiles where employee_id=v_id for update;
  if coalesce(pr.revision,0)<>(p_data->>'revision')::integer then raise exception 'تغير ملف الموظف. أعد التحميل قبل الحفظ.' using errcode='40001'; end if;
  if coalesce(item->>'pin','')<>'' and exists(select 1 from mawatheeq_private.att_profiles where pin=item->>'pin' and employee_id<>v_id) then
   raise exception 'رقم البصمة مستخدم لموظف آخر.'; end if;
  insert into mawatheeq_private.att_profiles(employee_id,pin,salary_minor,currency,schedule,updated_by)
   values(v_id,nullif(item->>'pin',''),(item->>'salaryMinor')::bigint,item->>'currency',case when jsonb_typeof(item->'schedule')='object' then item->'schedule' end,actor)
   on conflict(employee_id) do update set pin=excluded.pin,salary_minor=excluded.salary_minor,currency=excluded.currency,schedule=excluded.schedule,
    revision=mawatheeq_private.att_profiles.revision+1,updated_by=actor,updated_at=now() returning * into pr;
  perform mawatheeq_private.att_audit('profile',v_id::text,null,to_jsonb(pr)-'updated_by',actor);
  return jsonb_build_object('employeeId',pr.employee_id,'pin',pr.pin,'salaryMinor',pr.salary_minor::text,'currency',pr.currency,'schedule',pr.schedule,'profileRevision',pr.revision);
 when 'punches' then
  select coalesce(jsonb_agg(jsonb_build_object('pin',p.pin,'at',to_char(p.punched_at at time zone tz,'YYYY-MM-DD"T"HH24:MI:SS'),'source',p.source,'deviceId',p.device_id) order by p.punched_at),'[]') into result
   from mawatheeq_private.att_punches p where p.punched_at>=(v_from::timestamp at time zone tz) and p.punched_at<((v_to+1)::timestamp at time zone tz);
  return result;
 when 'leaves' then
  select coalesce(jsonb_agg(jsonb_build_object('employeeId',r.subject_id,'from',r.payload->>'fromDate','to',r.payload->>'toDate','type',r.payload->>'type')),'[]') into result
   from mawatheeq_private.department_records r where r.workspace='hr' and r.kind='leave' and r.payload->>'status'='approved'
    and r.payload->>'fromDate'<=v_to::text and r.payload->>'toDate'>=v_from::text;
  return result;
 when 'adjustments' then
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employeeId',a.employee_id,'day',a.day,'kind',a.kind,'time',a.at_time,'note',a.note,'revision',a.revision,
   'by',(select username from mawatheeq_private.accounts where id=a.updated_by)) order by a.day),'[]') into result
   from mawatheeq_private.att_adjustments a where not a.archived and a.day between v_from and v_to;
  return result;
 when 'save_adjustment','archive_adjustment' then
  perform mawatheeq_private.require_access(mawatheeq_private.att_can_edit(actor));
  item:=p_data->'item'; v_id:=(item->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtext('att-adjustment-'||v_id::text));
  select * into adj from mawatheeq_private.att_adjustments where id=v_id for update;
  if coalesce(adj.revision,0)<>(item->>'revision')::integer then raise exception 'تغير التعديل. أعد التحميل قبل الحفظ.' using errcode='40001'; end if;
  if p_action='archive_adjustment' then
   if adj.id is null then raise exception 'التعديل غير موجود.'; end if;
   update mawatheeq_private.att_adjustments set archived=true,revision=revision+1,updated_by=actor,updated_at=now() where id=v_id returning * into adj;
  else
   if not exists(select 1 from mawatheeq_private.department_records where id=(item->>'employeeId')::uuid and workspace='hr' and kind='employee') then raise exception 'ملف الموظف غير موجود.'; end if;
   insert into mawatheeq_private.att_adjustments(id,employee_id,day,kind,at_time,note,created_by,updated_by)
    values(v_id,(item->>'employeeId')::uuid,(item->>'day')::date,item->>'kind',nullif(item->>'time',''),btrim(item->>'note'),actor,actor)
    on conflict(id) do update set employee_id=excluded.employee_id,day=excluded.day,kind=excluded.kind,at_time=excluded.at_time,note=excluded.note,
     revision=mawatheeq_private.att_adjustments.revision+1,updated_by=actor,updated_at=now() returning * into adj;
  end if;
  perform mawatheeq_private.att_audit('adjustment',v_id::text,null,to_jsonb(adj),actor);
  return jsonb_build_object('id',adj.id,'revision',adj.revision,'archived',adj.archived);
 when 'import_punches' then
  perform mawatheeq_private.require_access(mawatheeq_private.att_can_devices(actor));
  if jsonb_typeof(p_data->'punches')<>'array' or jsonb_array_length(p_data->'punches')>20000 then raise exception 'ملف البصمات كبير جداً. قسمه إلى أجزاء أصغر.'; end if;
  if exists(select 1 from jsonb_array_elements(p_data->'punches') x where coalesce(x->>'pin','') !~ '^[0-9A-Za-z]{1,24}$' or not mawatheeq_private.att_valid_wall(x->>'wall')) then
   raise exception 'يحتوي الملف على سطور غير صالحة.'; end if;
  with ins as (insert into mawatheeq_private.att_punches(device_id,pin,punched_at,source,created_by)
   select (p_data->>'deviceId')::uuid,x->>'pin',(replace(x->>'wall','T',' ')::timestamp at time zone tz),'import',actor from jsonb_array_elements(p_data->'punches') x
   on conflict(pin,punched_at) do nothing returning 1) select count(*) into v_count from ins;
  perform mawatheeq_private.att_audit('import',coalesce(p_data->>'deviceId','file'),null,jsonb_build_object('rows',jsonb_array_length(p_data->'punches'),'inserted',v_count),actor);
  return jsonb_build_object('inserted',v_count,'skipped',jsonb_array_length(p_data->'punches')-v_count);
 when 'devices','device_users','commands','bridges' then
  perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'hr'));
  if p_action='devices' then
   select coalesce(jsonb_agg(mawatheeq_private.att_device_json(d) order by d.name),'[]') into result from mawatheeq_private.att_devices d;
  elsif p_action='device_users' then
   select coalesce(jsonb_agg(jsonb_build_object('pin',u.pin,'uid',u.uid,'name',u.name,'role',u.role,'card',u.card,'syncedAt',u.synced_at,
    'employeeId',p.employee_id) order by u.pin),'[]') into result
    from mawatheeq_private.att_device_users u left join mawatheeq_private.att_profiles p on p.pin=u.pin where u.device_id=(p_data->>'deviceId')::uuid;
  elsif p_action='commands' then
   select coalesce(jsonb_agg(mawatheeq_private.att_command_json(c) order by c.created_at desc),'[]') into result from
    (select * from mawatheeq_private.att_commands where p_data->>'deviceId' is null or device_id=(p_data->>'deviceId')::uuid order by created_at desc limit 30) c;
  else
   select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'version',b.version,'createdAt',b.created_at,'lastSeen',b.last_seen,'revoked',b.revoked_at is not null) order by b.created_at),'[]') into result
    from mawatheeq_private.att_bridges b;
  end if;
  return result;
 when 'save_device' then
  perform mawatheeq_private.require_access(mawatheeq_private.att_can_devices(actor));
  item:=p_data->'device'; v_id:=(item->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtext('att-device-'||v_id::text));
  select * into dv from mawatheeq_private.att_devices where id=v_id for update;
  if coalesce(dv.revision,0)<>(item->>'revision')::integer then raise exception 'تغير الجهاز. أعد التحميل قبل الحفظ.' using errcode='40001'; end if;
  insert into mawatheeq_private.att_devices(id,name,host,port,location,enabled,created_by,updated_by)
   values(v_id,btrim(item->>'name'),btrim(item->>'host'),coalesce((item->>'port')::integer,4370),coalesce(item->>'location',''),coalesce((item->>'enabled')::boolean,true),actor,actor)
   on conflict(id) do update set name=excluded.name,host=excluded.host,port=excluded.port,location=excluded.location,enabled=excluded.enabled,
    revision=mawatheeq_private.att_devices.revision+1,updated_by=actor,updated_at=now() returning * into dv;
  perform mawatheeq_private.att_audit('device',v_id::text,null,mawatheeq_private.att_device_json(dv),actor);
  return mawatheeq_private.att_device_json(dv);
 when 'queue_command' then
  perform mawatheeq_private.require_access(mawatheeq_private.att_can_devices(actor));
  if not exists(select 1 from mawatheeq_private.att_devices where id=(p_data->>'deviceId')::uuid) then raise exception 'الجهاز غير موجود.'; end if;
  item:=coalesce(p_data->'payload','{}'::jsonb);
  if p_data->>'kind'='add_user' and (coalesce(item->>'pin','') !~ '^[0-9]{1,9}$' or length(coalesce(item->>'name',''))>24) then raise exception 'رقم البصمة يجب أن يكون أرقاماً، والاسم لا يتجاوز 24 حرفاً.'; end if;
  if p_data->>'kind'='delete_user' and coalesce(item->>'pin','') !~ '^[0-9A-Za-z]{1,24}$' then raise exception 'اختر مستخدماً من الجهاز.'; end if;
  insert into mawatheeq_private.att_commands(device_id,kind,payload,requested_by) values((p_data->>'deviceId')::uuid,p_data->>'kind',item,actor) returning * into cmd;
  perform mawatheeq_private.att_audit('command',cmd.id::text,null,mawatheeq_private.att_command_json(cmd),actor);
  return mawatheeq_private.att_command_json(cmd);
 when 'create_bridge','revoke_bridge' then
  perform mawatheeq_private.require_access(mawatheeq_private.att_can_devices(actor));
  if p_action='revoke_bridge' then
   update mawatheeq_private.att_bridges set revoked_at=coalesce(revoked_at,now()) where id=(p_data->>'id')::uuid;
   perform mawatheeq_private.att_audit('bridge',p_data->>'id',null,'{"revoked":true}',actor);
   return '{}';
  end if;
  if length(btrim(coalesce(p_data->>'name','')))=0 then raise exception 'اكتب اسماً للجسر، مثل جهاز الاستقبال.'; end if;
  v_key:=encode(extensions.gen_random_bytes(32),'hex');
  insert into mawatheeq_private.att_bridges(name,key_hash,created_by) values(btrim(p_data->>'name'),extensions.digest(v_key,'sha256'),actor) returning id into v_id;
  perform mawatheeq_private.att_audit('bridge',v_id::text,null,jsonb_build_object('name',p_data->>'name'),actor);
  return jsonb_build_object('id',v_id,'key',v_key);
 else raise exception 'العملية المطلوبة غير متاحة.';
 end case;
end $$;

-- The office bridge authenticates with its own key. It can only read device addresses and report device data.
create function mawatheeq_private.bridge_request(p_key text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare b mawatheeq_private.att_bridges%rowtype; tz text; result jsonb; v_device uuid; v_count integer;
begin
 if p_key is null or p_key !~ '^[a-f0-9]{64}$' then raise exception 'مفتاح الجسر غير صالح.' using errcode='28000'; end if;
 select * into b from mawatheeq_private.att_bridges where key_hash=extensions.digest(p_key,'sha256') and revoked_at is null for update;
 if b.id is null then raise exception 'مفتاح الجسر غير صالح أو ملغى.' using errcode='28000'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>3000000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 update mawatheeq_private.att_bridges set last_seen=now(),version=left(coalesce(p_data->>'version',version),40) where id=b.id;
 tz:=mawatheeq_private.att_tz();
 if p_action in ('punches','device_status','device_users') then
  v_device:=(p_data->>'deviceId')::uuid;
  if not exists(select 1 from mawatheeq_private.att_devices where id=v_device) then raise exception 'الجهاز غير موجود.'; end if;
 end if;
 case p_action
 when 'config' then
  with claimed as (update mawatheeq_private.att_commands c set status='running',started_at=now()
   where c.id in (select id from mawatheeq_private.att_commands where status='pending' order by created_at limit 20 for update skip locked) returning c.*)
  select jsonb_build_object('timezone',tz,
   'devices',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'host',d.host,'port',d.port,'enabled',d.enabled,'lastSync',d.last_sync)),'[]') from mawatheeq_private.att_devices d),
   'commands',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'deviceId',c.device_id,'kind',c.kind,'payload',c.payload)),'[]') from claimed c)) into result;
  return result;
 when 'punches' then
  if jsonb_typeof(p_data->'punches')<>'array' or jsonb_array_length(p_data->'punches')>5000 then raise exception 'دفعة البصمات كبيرة جداً.'; end if;
  with rows as (select x->>'pin' pin,x->>'wall' wall,(x->>'verify')::integer verify,(x->>'state')::integer state from jsonb_array_elements(p_data->'punches') x),
   ins as (insert into mawatheeq_private.att_punches(device_id,pin,punched_at,verify,state,source)
    select v_device,pin,(replace(wall,'T',' ')::timestamp at time zone tz),verify,state,'device' from rows
    where pin ~ '^[0-9A-Za-z]{1,24}$' and mawatheeq_private.att_valid_wall(wall)
    on conflict(pin,punched_at) do nothing returning 1)
  select count(*) into v_count from ins;
  update mawatheeq_private.att_devices set last_sync=now(),last_seen=now(),status='online',last_error=null where id=v_device;
  return jsonb_build_object('inserted',v_count);
 when 'device_status' then
  update mawatheeq_private.att_devices set status=case when p_data->>'status' in ('online','offline') then p_data->>'status' else 'unknown' end,
   last_seen=case when p_data->>'status'='online' then now() else last_seen end,last_error=left(p_data->>'error',300),
   serial=coalesce(left(p_data#>>'{info,serial}',60),serial),info=case when jsonb_typeof(p_data->'info')='object' and length((p_data->'info')::text)<4000 then p_data->'info' else info end
   where id=v_device;
  return '{}';
 when 'device_users' then
  if jsonb_typeof(p_data->'users')<>'array' or jsonb_array_length(p_data->'users')>10000 then raise exception 'قائمة المستخدمين كبيرة جداً.'; end if;
  delete from mawatheeq_private.att_device_users where device_id=v_device;
  insert into mawatheeq_private.att_device_users(device_id,pin,uid,name,role,card)
   select distinct on (x->>'pin') v_device,x->>'pin',(x->>'uid')::integer,left(coalesce(x->>'name',''),60),coalesce((x->>'role')::integer,0),left(coalesce(x->>'card',''),30)
   from jsonb_array_elements(p_data->'users') x where coalesce(x->>'pin','') ~ '^[0-9A-Za-z]{1,24}$';
  return jsonb_build_object('users',(select count(*) from mawatheeq_private.att_device_users where device_id=v_device));
 when 'command_result' then
  update mawatheeq_private.att_commands set status=case when (p_data->>'ok')::boolean then 'done' else 'failed' end,
   result=case when jsonb_typeof(p_data->'result')='object' and length((p_data->'result')::text)<20000 then p_data->'result' end,
   error=left(p_data->>'error',300),finished_at=now()
   where id=(p_data->>'id')::uuid and status='running';
  return '{}';
 else raise exception 'العملية المطلوبة غير متاحة.';
 end case;
end $$;

create function public.mawatheeq_attendance_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.attendance_request(p_token,p_action,p_data); $$;
create function public.mawatheeq_bridge_request(p_key text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.bridge_request(p_key,p_action,p_data); $$;
revoke all on all functions in schema mawatheeq_private from public,anon,authenticated;
revoke all on function public.mawatheeq_department_request(text,text,jsonb),public.mawatheeq_comment_request(text,text,jsonb),
 public.mawatheeq_attendance_request(text,text,jsonb),public.mawatheeq_bridge_request(text,text,jsonb) from public;
grant execute on function mawatheeq_private.local_login(text,text),mawatheeq_private.local_request(text,text,jsonb),mawatheeq_private.client_request(text,text,jsonb),
 mawatheeq_private.office_request(text,text,jsonb),mawatheeq_private.department_request(text,text,jsonb),mawatheeq_private.comment_request(text,text,jsonb),
 mawatheeq_private.attendance_request(text,text,jsonb),mawatheeq_private.bridge_request(text,text,jsonb),
 public.mawatheeq_department_request(text,text,jsonb),public.mawatheeq_comment_request(text,text,jsonb),
 public.mawatheeq_attendance_request(text,text,jsonb),public.mawatheeq_bridge_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
