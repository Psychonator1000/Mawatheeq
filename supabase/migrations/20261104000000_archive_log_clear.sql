begin;
-- Clearing the movement log (4 November 2026): the office owner can remove the movements dated within a chosen range.
-- The custody the archive stands on is never lost; for each file these stay whatever their date:
-- * its latest movement (where the file is and who holds it) and its latest placement in a drawer;
-- * while the file is out, every movement since it last came back in (the hand-out still running);
-- * a return that came back short until what is missing is settled.
-- Every clearing is recorded with its range, who did it and how many movements went, and shows under the log.
-- Cabinets can be arranged on the storage map: a place keeps its cabinet's «position» in its room (empty keeps the
-- order by code).
-- Safe to run again.

-- Places keep a position for their cabinet.
create or replace function mawatheeq_private.archive_payload(k text,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb; f text;
begin
 if k='location' then
  result:=mawatheeq_private.department_fields(p,array['code','name','cabinet','shelf','box','capacity','notes','position']);
  if result->>'position'<>'' and result->>'position' !~ '^[0-9]{1,6}$' then raise exception 'ترتيب الخزانة رقم صحيح.'; end if;
  if length(result->>'code') not between 1 and 40 or length(result->>'name') not between 1 and 200 then raise exception 'أكمل رمز الموقع واسمه.'; end if;
  if result->>'capacity'<>'' and result->>'capacity' !~ '^[0-9]{1,5}$' then raise exception 'السعة عدد ملفات صحيح.'; end if;
  foreach f in array array['cabinet','shelf','box'] loop if length(result->>f)>40 then raise exception 'راجع الخزانة والرف والصندوق.'; end if; end loop;
 elsif k='file' then
  result:=mawatheeq_private.department_fields(p,array['number','title','type','volume','pages','locationId','originals','confidential','intakeDate','retentionUntil','notes','contents']);
  if length(result->>'number') not between 1 and 40 or result->>'number' !~ '^[A-Za-z0-9./ $+%-]+$' then raise exception 'رقم الأرشيف أحرف لاتينية وأرقام وشرطة فقط.'; end if;
  if length(result->>'title') not between 1 and 300 or length(result->>'type') not between 1 and 100 or length(result->>'volume')>40 then raise exception 'أكمل عنوان الملف ونوعه.'; end if;
  if result->>'pages'<>'' and result->>'pages' !~ '^[0-9]{1,6}$' then raise exception 'عدد الأوراق رقم صحيح.'; end if;
  if length(result->>'contents')>4000 then raise exception 'قائمة محتويات الملف طويلة جداً.'; end if;
  if result->>'originals' not in ('yes','no') or result->>'confidential' not in ('yes','no') then raise exception 'حدد الأصول والسرية.'; end if;
  perform mawatheeq_private.department_date(result->>'intakeDate'); perform mawatheeq_private.department_date(result->>'retentionUntil');
 elsif k='movement' then
  result:=mawatheeq_private.department_fields(p,array['type','date','holder','holderId','purpose','dueDate','locationId','notes']);
  if result->>'type' not in ('checkout','court','client','return','move','audit') then raise exception 'اختر نوع الحركة.'; end if;
  perform mawatheeq_private.department_date(result->>'date',true); perform mawatheeq_private.department_date(result->>'dueDate');
  if result->>'type' in ('checkout','court','client') and length(result->>'holder') not between 1 and 200 then raise exception 'حدد مستلم الملف.'; end if;
  if result->>'dueDate'<>'' and result->>'dueDate'<result->>'date' then raise exception 'موعد الإعادة يسبق تاريخ التسليم.'; end if;
  if result->>'type'='move' and result->>'locationId'='' then raise exception 'اختر الموقع الجديد.'; end if;
  if length(result->>'holder')>200 or length(result->>'purpose')>500 then raise exception 'النص طويل جداً.'; end if;
 elsif k='request' then
  result:=mawatheeq_private.department_fields(p,array['requester','requesterId','neededBy','purpose','status','notes','decisionNote']);
  if length(result->>'requester') not between 1 and 200 or result->>'status' not in ('pending','ready','done','declined') then raise exception 'أكمل اسم طالب الملف وحالة الطلب.'; end if;
  perform mawatheeq_private.department_date(result->>'neededBy');
  if result->>'status'='declined' and result->>'decisionNote'='' then raise exception 'دوّن سبب الاعتذار عن الطلب.'; end if;
 else raise exception 'نوع السجل غير متاح.';
 end if;
 foreach f in array array['holderId','requesterId','locationId'] loop
  if result ? f and result->>f<>'' and result->>f !~ '^[0-9a-f-]{36}$' then raise exception 'مرجع غير صالح: %.',f; end if;
 end loop;
 return result;
end $$;

create table if not exists mawatheeq_private.archive_log_clears (
 id uuid primary key default gen_random_uuid(),
 from_date date not null, to_date date not null,
 removed integer not null, kept integer not null,
 actor_id uuid not null references mawatheeq_private.accounts(id),
 created_at timestamptz not null default clock_timestamp()
);
alter table mawatheeq_private.archive_log_clears enable row level security;
revoke all on mawatheeq_private.archive_log_clears from public,anon,authenticated;

do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='archive_request_returns') then
  alter function mawatheeq_private.archive_request(text,text,jsonb) rename to archive_request_returns;
 end if;
end $$;

create or replace function mawatheeq_private.archive_request(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; v_from date; v_to date; v_ids uuid[]; v_kept integer; v_removed integer;
begin
 if p_action='log_clears' then
  actor:=mawatheeq_private.authorize(p_token);
  perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'archive'));
  return jsonb_build_object('canClear',mawatheeq_private.is_owner(),'clears',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'from',c.from_date,'to',c.to_date,
    'removed',c.removed,'kept',c.kept,'at',c.created_at,'by',coalesce(nullif(a.display_name,''),a.username)) order by c.created_at desc),'[]')
   from mawatheeq_private.archive_log_clears c join mawatheeq_private.accounts a on a.id=c.actor_id));
 end if;
 if p_action<>'clear_log' then return mawatheeq_private.archive_request_returns(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 if not mawatheeq_private.is_owner() then raise exception 'مسح سجل الحركة متاح لمسؤول المكتب فقط.' using errcode='42501'; end if;
 if coalesce(p_data->>'from','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_data->>'to','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'حدد بداية الفترة ونهايتها.'; end if;
 v_from:=(p_data->>'from')::date; v_to:=(p_data->>'to')::date;
 if v_from>v_to then raise exception 'بداية الفترة بعد نهايتها.'; end if;
 perform pg_advisory_xact_lock(hashtext('archive-log-clear'));
 with mv as (
  select m.id,m.subject_id,m.created_at,m.payload from mawatheeq_private.department_records m where m.workspace='archive' and m.kind='movement'
 ), keep as (
  -- Latest movement and latest placement of every file.
  select (mawatheeq_private.archive_state(f.id)->>'lastId')::uuid as id from mawatheeq_private.department_records f where f.workspace='archive' and f.kind='file'
  union select (select m.id from mv m where m.subject_id=f.id and m.payload->>'status'='posted' and (m.payload->>'locationId'<>'' or m.payload->>'unplaced'='yes')
    order by m.created_at desc,m.id desc limit 1) from mawatheeq_private.department_records f where f.workspace='archive' and f.kind='file'
  -- The running hand-out of a file that is out.
  union select m.id from mawatheeq_private.department_records f join mv m on m.subject_id=f.id
   where f.workspace='archive' and f.kind='file' and mawatheeq_private.archive_state(f.id)->>'state'<>'in'
    and m.created_at>coalesce((select max(i.created_at) from mv i where i.subject_id=f.id and i.payload->>'status'='posted' and i.payload->>'toState'='in'),'-infinity'::timestamptz)
  -- Short returns not yet settled.
  union select m.id from mv m where m.payload->>'type'='return' and m.payload->>'status'='posted' and m.payload->>'returnCheck'='missing' and coalesce(m.payload->>'missingResolvedAt','')=''
 )
 select array_agg(m.id) filter (where m.id not in (select k.id from keep k where k.id is not null)),
  count(*) filter (where m.id in (select k.id from keep k where k.id is not null))
 into v_ids,v_kept
 from mv m where (m.payload->>'date')::date between v_from and v_to;
 v_ids:=coalesce(v_ids,'{}'); v_removed:=cardinality(v_ids);
 delete from mawatheeq_private.department_changes where record_id=any(v_ids);
 delete from mawatheeq_private.department_records where id=any(v_ids);
 insert into mawatheeq_private.archive_log_clears(from_date,to_date,removed,kept,actor_id) values(v_from,v_to,v_removed,coalesce(v_kept,0),actor);
 return jsonb_build_object('removed',v_removed,'kept',coalesce(v_kept,0));
end $$;

revoke all on function mawatheeq_private.archive_request(text,text,jsonb),mawatheeq_private.archive_request_returns(text,text,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
