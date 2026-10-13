begin;
-- Supplementing the website from a newer office workbook (13 October 2026). Each row is matched to a judgment by its
-- automatic number and judgment date (then the opponent when that is not enough), or by office code, date and opponent
-- when it has no automatic number. Rows matching a closed court level are left alone.
-- * A matched judgment receives only the values its empty fields lack. A different nonempty value never replaces the
--   website's: it is listed in «importReview» for a person to decide, once per value, with the workbook row.
-- * An unmatched row is added as a new judgment. Two judgments sharing number and date with different parties are
--   reported as ambiguous and left alone.
-- * Invalid dates reported by the reader are listed for review.
-- A dry run returns the same counts without writing. Requires the settings power, like the existing import.

create function mawatheeq_private.import_text(v text) returns text
language sql immutable set search_path='' as $$
 select btrim(regexp_replace(mawatheeq_private.normalized(v),'[[:punct:]«»،؛\s]+',' ','g'));
$$;

create function mawatheeq_private.import_workbook(p_cases jsonb,p_file text,p_dry boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 input jsonb; c jsonb; r public.mawatheeq_cases%rowtype; p jsonb; f text; v text; cur text; lines text; line text; ids text[]; label text; shown text;
 added int:=0; updated int:=0; filled int:=0; flagged int:=0; conflicts int:=0; unchanged int:=0; ambiguous int:=0; closed int:=0;
 new_rows jsonb:='[]'; ambiguous_rows jsonb:='[]';
 fields text[]:=array['code','client','clientGroup','opponent','role','type','ruling','outcome','appealRecorded','appealConfirmation','notes','executionNote',
  'executionStage','noActionConfirmation','caseNumber','court','subject','lawyer','casePerson','casePersonRole','copyDate','notificationDate','announcementDate',
  'originalDate','executionOpenDate','executionProcedureDate'];
 labels jsonb:='{"code":"الكود","client":"الموكل","clientGroup":"الموكل الموحد","opponent":"الخصم","role":"الصفة","type":"نوع الحكم","ruling":"منطوق الحكم",
  "outcome":"حالة الحكم","appealRecorded":"الطعن","appealConfirmation":"تأكيد إجراء الخصم","notes":"ملاحظات","executionNote":"ملاحظات التنفيذ",
  "executionStage":"مرحلة التنفيذ","noActionConfirmation":"تأكيد عدم اتخاذ أي إجراء","caseNumber":"رقم القضية","court":"المحكمة","subject":"موضوع الدعوى",
  "lawyer":"المحامي","casePerson":"الشخص المعني","casePersonRole":"صلة الشخص بالموكل","copyDate":"تاريخ استلام الصيغة التنفيذية",
  "notificationDate":"تاريخ إعلان الصيغة","announcementDate":"تاريخ بداية الإعلان","originalDate":"تاريخ صورة الأصل","executionOpenDate":"تاريخ فتح ملف التنفيذ",
  "executionProcedureDate":"تاريخ إجراءات التنفيذ"}';
begin
 if p_cases is null or jsonb_typeof(p_cases)<>'array' or jsonb_array_length(p_cases)>400 then raise exception 'ملف الاستيراد غير صالح أو يتجاوز 400 سجل في الدفعة.'; end if;
 p_file:=left(btrim(coalesce(p_file,'')),120);
 perform pg_advisory_xact_lock(hashtext('mawatheeq-case-writes'));
 for input in select value from jsonb_array_elements(p_cases) loop
  if jsonb_typeof(input)<>'object' then raise exception 'سجل استيراد غير صالح.'; end if;
  -- Reader metadata is not case data.
  c:=input-'_row'-'_issues'-'id'-'revision'-'stages';
  -- Matching: automatic number and date, narrowed by opponent; else office code, date and opponent.
  if coalesce(c->>'autoNumber','')<>'' then
   select array_agg(id order by id) into ids from public.mawatheeq_cases where payload->>'autoNumber'=c->>'autoNumber' and coalesce(payload->>'date','')=coalesce(c->>'date','');
   if coalesce(array_length(ids,1),0)>1 then
    select array_agg(id order by id) into ids from public.mawatheeq_cases where id=any(ids)
     and left(mawatheeq_private.import_text(payload->>'opponent'),12)=left(mawatheeq_private.import_text(c->>'opponent'),12);
   end if;
  elsif coalesce(c->>'code','')<>'' and coalesce(c->>'date','')<>'' then
   select array_agg(id order by id) into ids from public.mawatheeq_cases where payload->>'code'=c->>'code' and payload->>'date'=c->>'date'
    and left(mawatheeq_private.import_text(payload->>'opponent'),10)=left(mawatheeq_private.import_text(c->>'opponent'),10);
  else ids:=null;
  end if;
  if coalesce(array_length(ids,1),0)>1 then
   ambiguous:=ambiguous+1;
   ambiguous_rows:=ambiguous_rows||jsonb_build_array(jsonb_build_object('row',input->'_row','autoNumber',c->>'autoNumber','date',c->>'date','ids',to_jsonb(ids)));
   continue;
  end if;
  if coalesce(array_length(ids,1),0)=0 then
   -- A row matching a closed court level of a judgment is already recorded there.
   if exists(select 1 from public.mawatheeq_cases x, jsonb_array_elements(case when jsonb_typeof(x.payload->'stages')='array' then x.payload->'stages' else '[]'::jsonb end) st
     where mawatheeq_private.import_key(x.payload||jsonb_build_object('autoNumber',coalesce(st.value->>'autoNumber',''),'date',coalesce(st.value->>'date','')))=mawatheeq_private.import_key(c)) then
    closed:=closed+1; continue; end if;
   select string_agg('• '||value,E'\n') into lines from jsonb_array_elements_text(coalesce(input->'_issues','[]'));
   c:=c||jsonb_build_object('id',gen_random_uuid()::text,'revision',1,'archived',false)
    ||case when lines is not null then jsonb_build_object('importReview',p_file||'، صف '||coalesce(input->>'_row','؟')||E':\n'||lines) else '{}' end;
   perform mawatheeq_private.validate_case(c);
   if not p_dry then
    insert into public.mawatheeq_cases(id,payload,revision,archived) values(c->>'id',c,1,false);
    insert into public.mawatheeq_audit(actor,record_id,action) values(auth.uid(),c->>'id','import_case');
   end if;
   added:=added+1;
   if jsonb_array_length(new_rows)<300 then new_rows:=new_rows||jsonb_build_array(jsonb_build_object('row',input->'_row','code',c->>'code','autoNumber',c->>'autoNumber',
    'date',c->>'date','client',c->>'client','opponent',c->>'opponent','type',c->>'type')); end if;
   continue;
  end if;
  -- One judgment: fill its empty fields, list differing values for review.
  select * into r from public.mawatheeq_cases where id=ids[1] for update;
  p:=r.payload; cur:=coalesce(p->>'importReview',''); lines:='';
  foreach f in array fields loop
   v:=btrim(coalesce(c->>f,''));
   if v='' or (f='outcome' and v='غير محدد') or (f='type' and v='يحتاج مراجعة') then continue; end if;
   if btrim(coalesce(p->>f,''))='' or (f='outcome' and p->>f='غير محدد') or (f='type' and p->>f='يحتاج مراجعة') then
    p:=p||jsonb_build_object(f,v); filled:=filled+1;
   elsif mawatheeq_private.import_text(p->>f)<>mawatheeq_private.import_text(v)
     and not (least(length(mawatheeq_private.import_text(p->>f)),length(mawatheeq_private.import_text(v)))>=8
      and (mawatheeq_private.import_text(p->>f) like mawatheeq_private.import_text(v)||'%' or mawatheeq_private.import_text(v) like mawatheeq_private.import_text(p->>f)||'%')) then
    label:=labels->>f;
    shown:=case when v ~ '^\d{4}-\d{2}-\d{2}$' then to_char(v::date,'DD/MM/YYYY') when length(v)>400 then left(v,400)||'…' else v end;
    line:='• '||label||': «'||shown||'» — تختلف عن الموقع؛ حُفظت القيمة الحالية دون تغيير';
    if position(line in cur)=0 and position(line in lines)=0 then lines:=lines||E'\n'||line; conflicts:=conflicts+1; end if;
   end if;
  end loop;
  for line in select '• '||value from jsonb_array_elements_text(coalesce(input->'_issues','[]')) loop
   if position(line in cur)=0 and position(line in lines)=0 then lines:=lines||E'\n'||line; conflicts:=conflicts+1; end if;
  end loop;
  if lines<>'' then
   p:=p||jsonb_build_object('importReview',btrim(cur||case when cur<>'' then E'\n\n' else '' end||p_file||'، صف '||coalesce(input->>'_row','؟')||'، '||r.id||':'||lines));
   flagged:=flagged+1;
  end if;
  if p is distinct from r.payload then
   p:=p||jsonb_build_object('revision',r.revision+1);
   perform mawatheeq_private.validate_case(p);
   if not p_dry then
    update public.mawatheeq_cases set payload=p,revision=r.revision+1,updated_at=now() where id=r.id;
    insert into public.mawatheeq_audit(actor,record_id,action) values(auth.uid(),r.id,'update_case');
   end if;
   updated:=updated+1;
  else unchanged:=unchanged+1;
  end if;
 end loop;
 return jsonb_build_object('dryRun',p_dry,'added',added,'updated',updated,'filled',filled,'flagged',flagged,'conflicts',conflicts,'unchanged',unchanged,
  'ambiguous',ambiguous,'closedLevel',closed,'newRows',new_rows,'ambiguousRows',ambiguous_rows);
end $$;

-- The request is authorized like every other: a valid session and the settings power (or the owner).
alter function mawatheeq_private.local_request(text,text,jsonb) rename to local_request_access;
create function mawatheeq_private.local_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 if p_action<>'import_workbook' then return mawatheeq_private.local_request_access(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 perform mawatheeq_private.require_access(mawatheeq_private.is_owner());
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>2000000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 return mawatheeq_private.import_workbook(p_data->'cases',p_data->>'file',coalesce((p_data->>'dryRun')::boolean,true));
end $$;

-- The workbook import needs the settings power, as the existing import does.
create or replace function mawatheeq_private.set_power(p_token text,p_fn text,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare v_power text;
begin
 v_power:=case p_fn
  when 'office' then case when p_action in ('context','create_member','reset_member_password','set_member_password','set_member_enabled','set_member_access',
    'access_history','rename_member','set_display_name','switch_user','account_history') then 'staff' when p_action='export_page' then 'backup' when p_action='review' then 'reviews' end
  when 'local' then case when p_action in ('import_cases','import_workbook','save_rules') then 'settings' when p_action='save_case' then 'reviews' end
  when 'client' then case when p_action in ('list','merge') then 'settings' end
  when 'department' then case when p_action='backup_page' then 'backup' end
  when 'comment' then case when p_action='delete' then 'chat' end
  when 'chat' then case when p_action in ('summary','messages','file_download') then 'chat' end
 end;
 if v_power is not null and exists(select 1 from mawatheeq_private.sessions where token_hash=extensions.digest(coalesce(p_token,''),'sha256') and impersonated_by is not null) then
  v_power:=null; end if;
 perform set_config('mawatheeq.power',coalesce(v_power,''),true);
end $$;

revoke all on function mawatheeq_private.import_text(text),mawatheeq_private.import_workbook(jsonb,text,boolean),mawatheeq_private.local_request(text,text,jsonb),
 mawatheeq_private.local_request_access(text,text,jsonb),mawatheeq_private.set_power(text,text,text) from public,anon,authenticated;
grant execute on function mawatheeq_private.local_request(text,text,jsonb),mawatheeq_private.set_power(text,text,text) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
