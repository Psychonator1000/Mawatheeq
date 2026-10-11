begin;
-- Device types and door control for fingerprint devices, device removal, and full device-user options.
-- Additive: existing devices default to attendance-only; removing a device keeps its punches (device link cleared).
alter table mawatheeq_private.att_devices
  add column kind text not null default 'attendance' check (kind in ('attendance','access','both')),
  add column door_name text not null default '' check (length(door_name) <= 80),
  add column unlock_seconds integer not null default 5 check (unlock_seconds between 1 and 60),
  add column notes text not null default '' check (length(notes) <= 500);
alter table mawatheeq_private.att_punches drop constraint att_punches_device_id_fkey,
  add constraint att_punches_device_id_fkey foreign key (device_id) references mawatheeq_private.att_devices(id) on delete set null;
alter table mawatheeq_private.att_commands drop constraint att_commands_kind_check,
  add constraint att_commands_kind_check check (kind in ('sync_logs','fetch_users','read_info','set_time','add_user','update_user','delete_user','unlock_door','restart','voice_test','clear_logs'));

create or replace function mawatheeq_private.att_device_json(d mawatheeq_private.att_devices) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',d.id,'name',d.name,'host',d.host,'port',d.port,'location',d.location,'enabled',d.enabled,'serial',d.serial,
  'info',d.info,'status',d.status,'lastSeen',d.last_seen,'lastSync',d.last_sync,'lastError',d.last_error,'revision',d.revision,
  'kind',d.kind,'doorName',d.door_name,'unlockSeconds',d.unlock_seconds,'notes',d.notes,
  'userCount',(select count(*) from mawatheeq_private.att_device_users u where u.device_id=d.id),
  'pendingCommands',(select count(*) from mawatheeq_private.att_commands c where c.device_id=d.id and c.status in ('pending','running'))); $$;

-- The original entry point keeps every other action; device saving, removal and commands are handled here.
alter function mawatheeq_private.attendance_request(text,text,jsonb) rename to attendance_request_core;
create function mawatheeq_private.attendance_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; dv mawatheeq_private.att_devices%rowtype; cmd mawatheeq_private.att_commands%rowtype; item jsonb; v_id uuid; v_kind text;
begin
 if p_action not in ('save_device','delete_device','queue_command') then return mawatheeq_private.attendance_request_core(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 perform mawatheeq_private.require_access(mawatheeq_private.att_can_devices(actor));
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>20000 then raise exception 'الطلب غير صالح.'; end if;
 case p_action
 when 'save_device' then
  item:=p_data->'device'; v_id:=(item->>'id')::uuid;
  if coalesce(item->>'kind','attendance') not in ('attendance','access','both') then raise exception 'نوع الجهاز غير صالح.'; end if;
  perform pg_advisory_xact_lock(hashtext('att-device-'||v_id::text));
  select * into dv from mawatheeq_private.att_devices where id=v_id for update;
  if coalesce(dv.revision,0)<>(item->>'revision')::integer then raise exception 'تغير الجهاز. أعد التحميل قبل الحفظ.' using errcode='40001'; end if;
  insert into mawatheeq_private.att_devices(id,name,host,port,location,enabled,kind,door_name,unlock_seconds,notes,created_by,updated_by)
   values(v_id,btrim(item->>'name'),btrim(item->>'host'),coalesce((item->>'port')::integer,4370),coalesce(item->>'location',''),coalesce((item->>'enabled')::boolean,true),
    coalesce(item->>'kind','attendance'),btrim(coalesce(item->>'doorName','')),coalesce((item->>'unlockSeconds')::integer,5),coalesce(item->>'notes',''),actor,actor)
   on conflict(id) do update set name=excluded.name,host=excluded.host,port=excluded.port,location=excluded.location,enabled=excluded.enabled,
    kind=excluded.kind,door_name=excluded.door_name,unlock_seconds=excluded.unlock_seconds,notes=excluded.notes,
    revision=mawatheeq_private.att_devices.revision+1,updated_by=actor,updated_at=now() returning * into dv;
  perform mawatheeq_private.att_audit('device',v_id::text,null,mawatheeq_private.att_device_json(dv),actor);
  return mawatheeq_private.att_device_json(dv);
 when 'delete_device' then
  v_id:=(p_data->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtext('att-device-'||v_id::text));
  select * into dv from mawatheeq_private.att_devices where id=v_id for update;
  if dv.id is null then raise exception 'الجهاز غير موجود.'; end if;
  if dv.revision<>(p_data->>'revision')::integer then raise exception 'تغير الجهاز. أعد التحميل قبل الحذف.' using errcode='40001'; end if;
  perform mawatheeq_private.att_audit('device',v_id::text,mawatheeq_private.att_device_json(dv),jsonb_build_object('deleted',true),actor);
  delete from mawatheeq_private.att_devices where id=v_id;
  return jsonb_build_object('deleted',v_id);
 else
  select * into dv from mawatheeq_private.att_devices where id=(p_data->>'deviceId')::uuid;
  if dv.id is null then raise exception 'الجهاز غير موجود.'; end if;
  v_kind:=p_data->>'kind'; item:=coalesce(p_data->'payload','{}'::jsonb);
  if v_kind not in ('sync_logs','fetch_users','read_info','set_time','add_user','update_user','delete_user','unlock_door','restart','voice_test','clear_logs') then raise exception 'الأمر غير مدعوم.'; end if;
  if not dv.enabled and v_kind<>'delete_user' then raise exception 'الجهاز معطل. فعّله أولاً.'; end if;
  if v_kind in ('add_user','update_user') then
   if coalesce(item->>'pin','') !~ '^[0-9]{1,9}$' or length(coalesce(item->>'name',''))>24 or coalesce(item->>'role','0') not in ('0','14')
    or coalesce(item->>'card','') !~ '^[0-9]{0,10}$' then raise exception 'رقم البصمة يجب أن يكون أرقاماً، والاسم لا يتجاوز 24 حرفاً، ورقم البطاقة حتى 10 أرقام.'; end if;
   item:=jsonb_build_object('pin',item->>'pin','name',coalesce(item->>'name',''),'role',coalesce(item->>'role','0')::integer,'card',coalesce(item->>'card',''));
  elsif v_kind='delete_user' then
   if coalesce(item->>'pin','') !~ '^[0-9A-Za-z]{1,24}$' then raise exception 'اختر مستخدماً من الجهاز.'; end if;
   item:=jsonb_build_object('pin',item->>'pin');
  elsif v_kind='unlock_door' then
   if dv.kind='attendance' then raise exception 'هذا الجهاز للحضور فقط ولا يتحكم بباب.'; end if;
   item:=jsonb_build_object('seconds',dv.unlock_seconds,'door',dv.door_name);
  else item:='{}';
  end if;
  insert into mawatheeq_private.att_commands(device_id,kind,payload,requested_by) values(dv.id,v_kind,item,actor) returning * into cmd;
  perform mawatheeq_private.att_audit('command',cmd.id::text,null,mawatheeq_private.att_command_json(cmd),actor);
  return mawatheeq_private.att_command_json(cmd);
 end case;
end $$;

revoke all on all functions in schema mawatheeq_private from public,anon,authenticated;
grant execute on function mawatheeq_private.local_login(text,text),mawatheeq_private.local_request(text,text,jsonb),mawatheeq_private.client_request(text,text,jsonb),
 mawatheeq_private.office_request(text,text,jsonb),mawatheeq_private.department_request(text,text,jsonb),mawatheeq_private.comment_request(text,text,jsonb),
 mawatheeq_private.attendance_request(text,text,jsonb),mawatheeq_private.bridge_request(text,text,jsonb),
 public.mawatheeq_department_request(text,text,jsonb),public.mawatheeq_comment_request(text,text,jsonb),
 public.mawatheeq_attendance_request(text,text,jsonb),public.mawatheeq_bridge_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
