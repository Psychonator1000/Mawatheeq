begin;
-- Case documents (14 October 2026). Every case gets its own list of files: memorandums, document bundles, judgments,
-- notices and so on, each with a title, a category and the date on the document. Several files can be uploaded at
-- once. Anyone who can open the case can list, view and download its files; adding, changing and deleting them needs
-- edit rights on that case. The files live in the private «mawatheeq-case-files» bucket; this function hands out the
-- only paths a session may use and the «local-files» function signs them.
create table mawatheeq_private.case_files (
 id uuid primary key default gen_random_uuid(),
 case_id text not null references public.mawatheeq_cases(id) on delete cascade,
 path text not null unique,
 name text not null,
 title text not null,
 category text not null,
 doc_date date,
 size bigint not null,
 mime text not null,
 uploaded_by uuid not null references mawatheeq_private.accounts(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 revision integer not null default 1
);
create index case_files_case on mawatheeq_private.case_files(case_id,doc_date desc nulls last,created_at desc);
revoke all on mawatheeq_private.case_files from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mawatheeq-case-files','mawatheeq-case-files',false,26214400,array['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/tiff','text/plain',
 'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict(id) do nothing;

create function mawatheeq_private.case_file_categories() returns text[]
language sql immutable set search_path='' as $$
 select array['صحيفة الدعوى','مذكرات','حوافظ مستندات','أحكام','محاضر الجلسات','إعلانات','تقارير الخبراء','بيانات مالية','توكيلات','مراسلات','أخرى'];
$$;
create function mawatheeq_private.case_file_mimes() returns text[]
language sql immutable set search_path='' as $$
 select array['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/tiff','text/plain',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'];
$$;
create function mawatheeq_private.case_file_can_edit(p_user uuid,p_case text) returns boolean
language sql stable set search_path='' as $$
 select coalesce((mawatheeq_private.access_for(p_user)->>'canEdit')::boolean,false) and mawatheeq_private.has_section(p_user,'cases') and mawatheeq_private.can_case(p_user,p_case);
$$;
create function mawatheeq_private.case_file_json(f mawatheeq_private.case_files) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',f.id,'caseId',f.case_id,'name',f.name,'title',f.title,'category',f.category,'docDate',f.doc_date,'size',f.size,'mime',f.mime,
  'uploadedBy',coalesce((select coalesce(nullif(a.display_name,''),a.username) from mawatheeq_private.accounts a where a.id=f.uploaded_by),''),
  'createdAt',f.created_at,'revision',f.revision);
$$;
-- The folder of a case's files. Case ids are free text, so the folder is named by a hash of the id.
create function mawatheeq_private.case_file_folder(p_case text) returns text
language sql immutable set search_path='' as $$ select 'cases/'||md5(p_case)||'/'; $$;

create function mawatheeq_private.case_file_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; v_case text; v_path text; v_title text; v_category text; v_date date; f mawatheeq_private.case_files%rowtype;
begin
 actor:=mawatheeq_private.authorize(p_token);
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>8000 then raise exception 'الطلب غير صالح.'; end if;
 v_case:=nullif(p_data->>'caseId','');
 if p_action in ('update','delete','download') then
  select * into f from mawatheeq_private.case_files where id=(nullif(p_data->>'id',''))::uuid;
  if f.id is null then raise exception 'لم يعد هذا الملف موجوداً. أعد التحميل.'; end if;
  v_case:=f.case_id;
 end if;
 if v_case is null or not exists(select 1 from public.mawatheeq_cases where id=v_case) then raise exception 'القضية غير موجودة.'; end if;
 perform mawatheeq_private.require_access(mawatheeq_private.can_case(actor,v_case));
 if p_action in ('upload','add','update','delete') then perform mawatheeq_private.require_access(mawatheeq_private.case_file_can_edit(actor,v_case)); end if;
 if p_action in ('add','update') then
  v_title:=left(btrim(coalesce(p_data->>'title','')),200);
  v_category:=coalesce(nullif(p_data->>'category',''),'أخرى');
  if not v_category=any(mawatheeq_private.case_file_categories()) then raise exception 'اختر تصنيف المستند من القائمة.'; end if;
  if coalesce(p_data->>'docDate','')<>'' then
   if p_data->>'docDate' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'راجع تاريخ المستند.'; end if;
   v_date:=(p_data->>'docDate')::date;
  end if;
 end if;
 case p_action
 when 'list' then
  return jsonb_build_object('canEdit',mawatheeq_private.case_file_can_edit(actor,v_case),'files',
   (select coalesce(jsonb_agg(mawatheeq_private.case_file_json(x) order by x.doc_date desc nulls last,x.created_at desc),'[]') from mawatheeq_private.case_files x where x.case_id=v_case));
 when 'upload' then
  if coalesce((p_data->>'size')::bigint,0) not between 1 and 26214400 then raise exception 'حجم كل ملف يجب ألا يتجاوز 25 ميغابايت.'; end if;
  if not coalesce(p_data->>'mime','')=any(mawatheeq_private.case_file_mimes()) then raise exception 'نوع الملف غير مدعوم. PDF والصور وWord وExcel وPowerPoint فقط.'; end if;
  return jsonb_build_object('path',mawatheeq_private.case_file_folder(v_case)||gen_random_uuid()::text);
 when 'add' then
  v_path:=coalesce(p_data->>'path','');
  if left(v_path,length(mawatheeq_private.case_file_folder(v_case)))<>mawatheeq_private.case_file_folder(v_case)
   or substr(v_path,length(mawatheeq_private.case_file_folder(v_case))+1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'تعذر حفظ الملف. أعد رفعه.'; end if;
  if not exists(select 1 from storage.objects where bucket_id='mawatheeq-case-files' and name=v_path) then raise exception 'لم يكتمل رفع الملف. أعد رفعه.'; end if;
  if exists(select 1 from mawatheeq_private.case_files where path=v_path) then raise exception 'هذا الملف محفوظ بالفعل.'; end if;
  if coalesce((p_data->>'size')::bigint,0) not between 1 and 26214400 or not coalesce(p_data->>'mime','')=any(mawatheeq_private.case_file_mimes()) then raise exception 'تعذر حفظ الملف. أعد رفعه.'; end if;
  insert into mawatheeq_private.case_files(case_id,path,name,title,category,doc_date,size,mime,uploaded_by)
   values(v_case,v_path,left(coalesce(nullif(btrim(p_data->>'name'),''),'ملف'),200),coalesce(nullif(v_title,''),left(coalesce(nullif(btrim(p_data->>'name'),''),'ملف'),200)),
    v_category,v_date,(p_data->>'size')::bigint,p_data->>'mime',actor) returning * into f;
  insert into public.mawatheeq_audit(actor,record_id,action) values(actor,v_case,'case_file_add:'||f.id::text);
  return mawatheeq_private.case_file_json(f);
 when 'update' then
  if f.revision<>coalesce((p_data->>'revision')::integer,0) then raise exception 'عدّل شخص آخر هذا الملف. أعد التحميل.' using errcode='40001'; end if;
  if v_title='' then raise exception 'اكتب عنوان المستند.'; end if;
  update mawatheeq_private.case_files set title=v_title,category=v_category,doc_date=v_date,updated_at=clock_timestamp(),revision=revision+1 where id=f.id returning * into f;
  return mawatheeq_private.case_file_json(f);
 when 'delete' then
  delete from mawatheeq_private.case_files where id=f.id;
  insert into public.mawatheeq_audit(actor,record_id,action) values(actor,v_case,'case_file_delete:'||f.id::text||':'||left(f.title,120));
  return jsonb_build_object('path',f.path);
 when 'download' then
  return jsonb_build_object('path',f.path,'name',f.name,'mime',f.mime);
 else raise exception 'العملية المطلوبة غير متاحة.';
 end case;
end $$;

create function public.mawatheeq_case_file_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.case_file_request(p_token,p_action,p_data); $$;
revoke all on function mawatheeq_private.case_file_categories(),mawatheeq_private.case_file_mimes(),mawatheeq_private.case_file_can_edit(uuid,text),
 mawatheeq_private.case_file_json(mawatheeq_private.case_files),mawatheeq_private.case_file_folder(text),
 mawatheeq_private.case_file_request(text,text,jsonb),public.mawatheeq_case_file_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.case_file_request(text,text,jsonb),public.mawatheeq_case_file_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
