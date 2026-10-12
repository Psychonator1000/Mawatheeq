begin;
-- Collections follow-up (13 October 2026, modelled on the office's previous collections system):
-- * more file data: file and execution status, arrival date, debt reason, instalments, delay, batch, accounting
--   contract, order-of-payment fee, promissory note, four tags, required action, closing date and reason, assignee;
-- * file statements (إفادات): calls, execution, opponent addresses and administrative notes with a review date and
--   status, linked to one file;
-- * file payments: payments on the file, payments made directly to the client (سداد خارجي) and expenses. Posted
--   payments are never edited; they are cancelled with a reason, like accounting entries.
-- Statements and payments carry their file's case, so case scope and the collections section govern them exactly
-- like the file itself. A statement or payment never changes the file, so it does not clear the file's source review.

alter table mawatheeq_private.department_records drop constraint department_records_check;
alter table mawatheeq_private.department_records add constraint department_records_check check(
 (workspace='collections' and kind='file' and case_id is not null and subject_id is null)
 or (workspace='collections' and kind in ('statement','payment') and case_id is not null and subject_id is not null)
 or (workspace='accounting' and kind='entry' and subject_id is null)
 or (workspace='hr' and case_id is null and (kind='employee' and subject_id is null or kind='leave' and subject_id is not null)));
drop index mawatheeq_private.department_collection_case;
create unique index department_collection_case on mawatheeq_private.department_records(case_id) where workspace='collections' and kind='file';

alter function mawatheeq_private.department_payload(text,text,jsonb) rename to department_payload_hr;
create function mawatheeq_private.department_payload(w text,k text,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb; extra jsonb; f text; decimals integer:=3; minor bigint;
begin
 if w='collections' and k='file' then
  result:=mawatheeq_private.department_payload_hr(w,k,p);
  extra:=mawatheeq_private.department_fields(p,array['fileStatus','executionStatus','arrivalDate','debtReason','installment','installmentsTotal','delayDays',
   'overdueAmount','batchNumber','accountingContract','orderFee','promissoryAmount','promissoryDate','promissoryDueDate','tag1','tag2','tag3','tag4',
   'requiredAction','closedDate','closedReason','assignedTo']);
  if extra->>'fileStatus' not in ('','تحصيل ودي','جاهز للمحكمة','أمر أداء','دعوى قضائية','تنفيذ','تقسيط','مسدد','موقوف','مغلق') then raise exception 'اختر حالة الملف من القائمة.'; end if;
  if extra->>'executionStatus' not in ('','لم يُفتح','مفتوح','حجز','منع سفر','ضبط وإحضار','حبس','مسدد','مغلق') then raise exception 'اختر حالة ملف التنفيذ من القائمة.'; end if;
  foreach f in array array['installment','installmentsTotal','overdueAmount','orderFee','promissoryAmount'] loop
   if extra->>f<>'' and extra->>f !~ '^[0-9]{1,9}([.][0-9]{1,3})?$' then raise exception 'راجع المبلغ في %: أرقام بالدينار حتى ثلاث خانات عشرية.',f; end if;
  end loop;
  if extra->>'delayDays'<>'' and extra->>'delayDays' !~ '^[0-9]{1,5}$' then raise exception 'عدد أيام التأخير رقم صحيح.'; end if;
  foreach f in array array['arrivalDate','promissoryDate','promissoryDueDate','closedDate'] loop perform mawatheeq_private.department_date(extra->>f); end loop;
  foreach f in array array['tag1','tag2','tag3','tag4','batchNumber','accountingContract','assignedTo'] loop
   if length(extra->>f)>100 then raise exception 'النص طويل جداً: %.',f; end if;
  end loop;
  return result||extra;
 elsif w='collections' and k='statement' then
  result:=mawatheeq_private.department_fields(p,array['category','action','reviewDate','status','text','phone','contactParty','method']);
  if result->>'category' not in ('calls','execution','addresses','admin') or result->>'status' not in ('done','notDone','postponed')
   or result->>'contactParty' not in ('','defendant','client','other') or result->>'method' not in ('','phone','whatsapp') then raise exception 'اختر نوع الإفادة وحالتها من القوائم.'; end if;
  if length(result->>'action') not between 1 and 200 or length(result->>'text') not between 1 and 5000 then raise exception 'اختر الإجراء واكتب نص الإفادة.'; end if;
  if result->>'phone'<>'' and result->>'phone' !~ '^[+0-9 ]{4,30}$' then raise exception 'رقم الاتصال أرقام فقط.'; end if;
  perform mawatheeq_private.department_date(result->>'reviewDate',true);
  return result;
 elsif w='collections' and k='payment' then
  result:=mawatheeq_private.department_fields(p,array['type','date','amount','method','reference','notes']);
  if result->>'type' not in ('payment','external','expense') then raise exception 'اختر نوع الحركة.'; end if;
  perform mawatheeq_private.department_date(result->>'date',true);
  if result->>'amount' !~ '^[0-9]{1,9}([.][0-9]{1,3})?$' then raise exception 'المبلغ بالدينار حتى ثلاث خانات عشرية.'; end if;
  minor:=((result->>'amount')::numeric*1000)::bigint;
  if minor<=0 then raise exception 'أدخل مبلغاً موجباً.'; end if;
  if length(result->>'method')>50 or length(result->>'reference')>200 then raise exception 'راجع طريقة السداد والمرجع.'; end if;
  return result||jsonb_build_object('amountMinor',minor::text,'status','posted','voidReason','');
 end if;
 return mawatheeq_private.department_payload_hr(w,k,p);
end $$;

alter function mawatheeq_private.department_request(text,text,jsonb) rename to department_request_hr;
create function mawatheeq_private.department_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; item jsonb; v_id uuid; v_kind text; r mawatheeq_private.department_records%rowtype; old jsonb; result jsonb;
 follow text[]:=array['fileStatus','executionStatus','arrivalDate','debtReason','installment','installmentsTotal','delayDays','overdueAmount','batchNumber',
  'accountingContract','orderFee','promissoryAmount','promissoryDate','promissoryDueDate','tag1','tag2','tag3','tag4','requiredAction','closedDate','closedReason','assignedTo'];
begin
 if coalesce(p_data->>'workspace','')<>'collections' or p_data is null or jsonb_typeof(p_data)<>'object' then
  return mawatheeq_private.department_request_hr(p_token,p_action,p_data); end if;
 if p_action='save_record' then
  item:=p_data->'record'; v_kind:=item->>'kind';
  if v_kind in ('statement','payment') then
   actor:=mawatheeq_private.authorize(p_token);
   if not exists(select 1 from mawatheeq_private.department_records f where f.id=nullif(item->>'subjectId','')::uuid and f.workspace='collections'
     and f.kind='file' and f.case_id=nullif(item->>'caseId','') and not f.archived) then raise exception 'اختر ملف تحصيل فعالاً.'; end if;
   if v_kind='payment' and exists(select 1 from mawatheeq_private.department_records where id=(item->>'id')::uuid) then
    raise exception 'الحركة المالية ثابتة؛ ألغها بسبب ثم أضف التصحيح.'; end if;
  elsif v_kind is distinct from 'file' then raise exception 'نوع السجل غير متاح.';
  else
   -- Follow-up fields (status, assignee, instalments, tags, closing…) are not source data for the papers: changing
   -- only them keeps a valid source review. Any change to the source data clears it as before.
   select * into r from mawatheeq_private.department_records where id=(item->>'id')::uuid;
   result:=mawatheeq_private.department_request_hr(p_token,p_action,p_data);
   if r.id is not null and r.review is not null and (r.review->>'recordRevision')::integer=r.revision
    and (r.payload-follow)=(result->'payload')-follow then
    update mawatheeq_private.department_records set review=r.review||jsonb_build_object('recordRevision',revision) where id=r.id returning * into r;
    result:=mawatheeq_private.department_json(r);
   end if;
   return result;
  end if;
 elsif p_action in ('archive_record','review_file','generate','outputs','void_record') then
  v_id:=(p_data->>'id')::uuid;
  select kind into v_kind from mawatheeq_private.department_records where id=v_id;
  if p_action='archive_record' and v_kind='payment' then raise exception 'ألغِ الحركة المالية بسبب بدلاً من حذفها.'; end if;
  if p_action in ('review_file','generate','outputs') and v_kind is distinct from 'file' then raise exception 'هذه العملية لملف التحصيل نفسه.'; end if;
  if p_action='void_record' then
   actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
   perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'collections') and (a->>'canEdit')::boolean);
   perform pg_advisory_xact_lock(hashtext('department-record-'||v_id::text));
   select * into r from mawatheeq_private.department_records where id=v_id for update;
   perform mawatheeq_private.require_access(r.id is not null and r.workspace='collections' and r.kind='payment' and mawatheeq_private.department_visible(actor,'collections',r.case_id));
   if r.revision is distinct from (p_data->>'revision')::integer then raise exception 'تغير السجل. أعد تحميله قبل الحفظ.' using errcode='40001'; end if;
   if r.payload->>'status'<>'posted' or length(btrim(coalesce(p_data->>'reason',''))) not between 1 and 2000 then raise exception 'الحركة ملغاة بالفعل أو سبب الإلغاء غير مكتمل.'; end if;
   old:=mawatheeq_private.department_json(r);
   update mawatheeq_private.department_records set payload=payload||jsonb_build_object('status','void','voidReason',btrim(p_data->>'reason')),revision=revision+1,updated_by=actor,updated_at=clock_timestamp()
    where id=r.id returning * into r;
   insert into mawatheeq_private.department_changes(record_id,before_record,after_record,revision,actor_id) values(r.id,old,mawatheeq_private.department_json(r),r.revision,actor);
   return mawatheeq_private.department_json(r);
  end if;
 end if;
 return mawatheeq_private.department_request_hr(p_token,p_action,p_data);
end $$;

revoke all on function mawatheeq_private.department_payload(text,text,jsonb),mawatheeq_private.department_payload_hr(text,text,jsonb),
 mawatheeq_private.department_request(text,text,jsonb),mawatheeq_private.department_request_hr(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.department_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
