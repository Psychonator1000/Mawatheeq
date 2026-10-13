begin;
-- Collection files and cases (13 October 2026). Cases grow out of collection files, so a file may exist before any case:
-- * a collection file's case is optional. Without one, the file needs all-case scope, like other office-wide records;
-- * one case may come from several files (one lawsuit for several debts of the same person);
-- * «link_case» attaches a file to a case or detaches it, from the file or from the case; its statements and payments
--   follow, so case scope keeps governing all of them. It is recorded in the file's history;
-- * «case_files» lists the files of one case and «find_files» searches files to attach, both within the
--   collections section and case scope;
-- * file numbers (code) are unique, so repeated imports never duplicate a file;
-- * files imported from the previous system keep its statuses (سوفت، تحت الرفع، سكت، حفظ), the customer's number at
--   the client company, the court file number as written, and the defendant's job/residence note.

alter table mawatheeq_private.department_records drop constraint department_records_check;
alter table mawatheeq_private.department_records add constraint department_records_check check(
 (workspace='collections' and kind='file' and subject_id is null)
 or (workspace='collections' and kind in ('statement','payment') and subject_id is not null)
 or (workspace='accounting' and kind='entry' and subject_id is null)
 or (workspace='hr' and case_id is null and (kind='employee' and subject_id is null or kind='leave' and subject_id is not null))
 or (workspace='archive' and kind='location' and case_id is null and subject_id is null)
 or (workspace='archive' and kind='file' and subject_id is null)
 or (workspace='archive' and kind in ('movement','request') and subject_id is not null));
drop index mawatheeq_private.department_collection_case;
create unique index department_collection_code on mawatheeq_private.department_records(lower(payload->>'code')) where workspace='collections' and kind='file' and coalesce(payload->>'code','')<>'';
-- Papers can be prepared before the lawsuit exists.
alter table mawatheeq_private.department_outputs alter column case_revision drop not null;

alter function mawatheeq_private.department_payload(text,text,jsonb) rename to department_payload_followup;
create function mawatheeq_private.department_payload(w text,k text,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare status text; extra jsonb; result jsonb;
begin
 if not (w='collections' and k='file') then return mawatheeq_private.department_payload_followup(w,k,p); end if;
 status:=btrim(coalesce(p->>'fileStatus',''));
 result:=mawatheeq_private.department_payload_followup(w,k,case when status in ('سوفت','تحت الرفع','سكت','حفظ') then p||'{"fileStatus":""}'::jsonb else p end);
 extra:=mawatheeq_private.department_fields(p,array['customerId','fileAutoNumber','defendantJob']);
 if length(extra->>'customerId')>60 or length(extra->>'fileAutoNumber')>60 or length(extra->>'defendantJob')>200 then raise exception 'راجع رقم العميل ورقم الملف الآلي.'; end if;
 return result||extra||case when status in ('سوفت','تحت الرفع','سكت','حفظ') then jsonb_build_object('fileStatus',status) else '{}' end;
end $$;

alter function mawatheeq_private.department_request(text,text,jsonb) rename to department_request_links;
create function mawatheeq_private.department_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; item jsonb; r mawatheeq_private.department_records%rowtype; old jsonb; v_case text; q text; result jsonb;
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' or p_data->>'workspace' is distinct from 'collections' then
  return mawatheeq_private.department_request_links(p_token,p_action,p_data); end if;
 if p_action='save_record' and p_data->'record'->>'kind' in ('statement','payment') then
  -- A statement or payment carries its file's case, whether or not the file has one.
  item:=p_data->'record';
  select * into r from mawatheeq_private.department_records where id=nullif(item->>'subjectId','')::uuid and workspace='collections' and kind='file' and not archived;
  if r.id is null or r.case_id is distinct from nullif(item->>'caseId','') then raise exception 'اختر ملف تحصيل فعالاً.'; end if;
  if r.case_id is null then
   -- The earlier wrapper compares case ids with «=»; a file without a case is checked here instead, with the same rules.
   if item->>'kind'='payment' and exists(select 1 from mawatheeq_private.department_records where id=(item->>'id')::uuid) then
    raise exception 'الحركة المالية ثابتة؛ ألغها بسبب ثم أضف التصحيح.'; end if;
   return mawatheeq_private.department_request_hr(p_token,p_action,p_data);
  end if;
  return mawatheeq_private.department_request_links(p_token,p_action,p_data);
 end if;
 if p_action not in ('link_case','case_files','find_files') then return mawatheeq_private.department_request_links(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
 perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'collections'));
 if p_action='case_files' then
  v_case:=nullif(p_data->>'caseId','');
  perform mawatheeq_private.require_access(v_case is not null and mawatheeq_private.department_visible(actor,'collections',v_case));
  select coalesce(jsonb_agg(mawatheeq_private.department_json(t) order by t.created_at),'[]') into result from mawatheeq_private.department_records t
   where t.workspace='collections' and t.kind='file' and t.case_id=v_case;
  return result;
 elsif p_action='find_files' then
  q:=mawatheeq_private.import_text(left(coalesce(p_data->>'q',''),80));
  if length(q)<2 then return '[]'; end if;
  select coalesce(jsonb_agg(mawatheeq_private.department_json(t)),'[]') into result from (
   select * from mawatheeq_private.department_records t where t.workspace='collections' and t.kind='file' and not t.archived
    and mawatheeq_private.department_visible(actor,'collections',t.case_id)
    and mawatheeq_private.import_text(concat_ws(' ',t.payload->>'code',t.payload->>'defendant',t.payload->>'civilId',t.payload->>'account',t.payload->>'customerId',t.payload->>'company')) like '%'||q||'%'
    order by t.payload->>'code' limit 20) t;
  return result;
 end if;
 -- link_case: attach the file to a case, or detach it (caseId empty).
 perform mawatheeq_private.require_access((a->>'canEdit')::boolean);
 perform pg_advisory_xact_lock(hashtext('department-record-'||coalesce(p_data->>'id','')));
 select * into r from mawatheeq_private.department_records where id=(p_data->>'id')::uuid and workspace='collections' and kind='file' for update;
 v_case:=nullif(p_data->>'caseId','');
 perform mawatheeq_private.require_access(r.id is not null and mawatheeq_private.department_visible(actor,'collections',r.case_id)
  and mawatheeq_private.department_visible(actor,'collections',v_case));
 if r.archived then raise exception 'أعد فتح الملف المؤرشف قبل ربطه.'; end if;
 if r.revision is distinct from (p_data->>'revision')::integer then raise exception 'تغير السجل. أعد تحميله قبل الحفظ.' using errcode='40001'; end if;
 if v_case is not null and not exists(select 1 from public.mawatheeq_cases where id=v_case) then raise exception 'اختر قضية محفوظة.'; end if;
 if r.case_id is not distinct from v_case then return mawatheeq_private.department_json(r); end if;
 old:=mawatheeq_private.department_json(r);
 -- A link changes which case's papers apply, so a previous source review no longer stands.
 update mawatheeq_private.department_records set case_id=v_case,review=null,revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where id=r.id returning * into r;
 update mawatheeq_private.department_records set case_id=v_case,updated_at=clock_timestamp() where workspace='collections' and subject_id=r.id;
 insert into mawatheeq_private.department_changes(record_id,before_record,after_record,revision,actor_id) values(r.id,old,mawatheeq_private.department_json(r),r.revision,actor);
 return mawatheeq_private.department_json(r);
end $$;

revoke all on function mawatheeq_private.department_payload(text,text,jsonb),mawatheeq_private.department_payload_followup(text,text,jsonb),
 mawatheeq_private.department_request(text,text,jsonb),mawatheeq_private.department_request_links(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.department_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
