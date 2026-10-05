begin;

-- Additive only: no existing case, account or document is changed or approved.
create table mawatheeq_private.case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.mawatheeq_cases(id),
  document_id uuid not null references public.mawatheeq_documents(id),
  kind text not null check(kind in ('judgment','announcement','both','other')),
  reference text not null, pages text not null default '',
  active boolean not null default true, revision integer not null default 1,
  created_by uuid not null references mawatheeq_private.accounts(id),
  created_at timestamptz not null default now(),
  unique(case_id,document_id)
);
create index case_evidence_document_idx on mawatheeq_private.case_evidence(document_id);
create table mawatheeq_private.case_reviews (
  id bigint generated always as identity primary key,
  case_id text not null references public.mawatheeq_cases(id),
  scope text not null check(scope in ('judgment','announcement')),
  decision text not null check(decision in ('verified','needs_review')),
  case_revision integer not null,
  evidence jsonb not null default '[]', details jsonb not null,
  reviewer_id uuid not null references mawatheeq_private.accounts(id),
  created_at timestamptz not null default now()
);
create index case_reviews_case_scope_idx on mawatheeq_private.case_reviews(case_id,scope,id desc);
create table mawatheeq_private.case_changes (
  id bigint generated always as identity primary key,
  case_id text not null references public.mawatheeq_cases(id),
  before_payload jsonb, after_payload jsonb not null, revision integer not null,
  actor_id uuid references mawatheeq_private.accounts(id), created_at timestamptz not null default now()
);
create index case_changes_case_idx on mawatheeq_private.case_changes(case_id,id desc);
create table mawatheeq_private.work_items (
  id uuid primary key, payload jsonb not null, revision integer not null default 1,
  created_by uuid not null references mawatheeq_private.accounts(id),
  updated_by uuid not null references mawatheeq_private.accounts(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create table mawatheeq_private.work_changes (
  id bigint generated always as identity primary key,
  work_id uuid not null references mawatheeq_private.work_items(id),
  before_payload jsonb, after_payload jsonb not null, revision integer not null,
  actor_id uuid not null references mawatheeq_private.accounts(id), created_at timestamptz not null default now()
);
create index work_changes_item_idx on mawatheeq_private.work_changes(work_id,id desc);
alter table mawatheeq_private.case_evidence enable row level security;
alter table mawatheeq_private.case_reviews enable row level security;
alter table mawatheeq_private.case_changes enable row level security;
alter table mawatheeq_private.work_items enable row level security;
alter table mawatheeq_private.work_changes enable row level security;
revoke all on mawatheeq_private.case_evidence,mawatheeq_private.case_reviews,mawatheeq_private.case_changes,mawatheeq_private.work_items,mawatheeq_private.work_changes from public,anon,authenticated;

create function mawatheeq_private.record_case_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into mawatheeq_private.case_changes(case_id,before_payload,after_payload,revision,actor_id)
  values(new.id,case when tg_op='UPDATE' then old.payload else null end,new.payload,new.revision,auth.uid());
  return new;
end $$;
create trigger office_case_history after insert or update on public.mawatheeq_cases
for each row execute function mawatheeq_private.record_case_change();

create function mawatheeq_private.office_review_json(r mawatheeq_private.case_reviews) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'caseId',r.case_id,'scope',r.scope,'decision',r.decision,
   'caseRevision',r.case_revision,'evidence',r.evidence,'details',r.details,
   'reviewer',a.username,'createdAt',r.created_at,
   'current',r.decision='verified' and c.revision=r.case_revision and not exists (
     select 1 from jsonb_array_elements(r.evidence) e
     left join mawatheeq_private.case_evidence l on l.id=(e->>'id')::uuid
     left join public.mawatheeq_documents d on d.id=l.document_id
     where l.id is null or not l.active or l.revision<>(e->>'linkRevision')::integer
       or d.id is null or d.revision<>(e->>'documentRevision')::integer or d.file_key is null
   ))
 from public.mawatheeq_cases c join mawatheeq_private.accounts a on a.id=r.reviewer_id where c.id=r.case_id;
$$;
create function mawatheeq_private.office_work_json(w mawatheeq_private.work_items) returns jsonb
language sql stable set search_path='' as $$
 select w.payload||jsonb_build_object('id',w.id,'revision',w.revision,'createdBy',a.username,'updatedBy',b.username,
   'createdAt',w.created_at,'updatedAt',w.updated_at,'completedAt',w.completed_at)
 from mawatheeq_private.accounts a,mawatheeq_private.accounts b where a.id=w.created_by and b.id=w.updated_by;
$$;

create function mawatheeq_private.office_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; v_actor uuid; v_owner boolean; v_offset integer; v_id uuid; v_case text;
  c public.mawatheeq_cases%rowtype; e mawatheeq_private.case_evidence%rowtype;
  r mawatheeq_private.case_reviews%rowtype; w mawatheeq_private.work_items%rowtype;
  item jsonb; v_evidence jsonb; v_scope text; v_decision text; v_password text; v_username text;
  v_next integer; v_old jsonb; v_completed timestamptz; v_date text;
begin
  -- This gate validates token expiry, enabled account, membership and password rotation.
  perform mawatheeq_private.local_request(p_token,'rules','{}');
  v_actor:=auth.uid(); v_owner:=mawatheeq_private.is_owner();
  if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>1000000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
  v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),10000000));
  if p_action='context' then
    select jsonb_agg(jsonb_build_object('id',a.id,'username',a.username,'role',m.role,'enabled',a.enabled,'mustChangePassword',a.must_change_password) order by a.username)
      into result from mawatheeq_private.accounts a join public.mawatheeq_members m on m.user_id=a.id;
    return jsonb_build_object('members',coalesce(result,'[]'),'canManage',v_owner,'user',mawatheeq_private.local_request(p_token,'session','{}'));
  elsif p_action='reviews_page' then
    select coalesce(jsonb_agg(mawatheeq_private.office_review_json(t)),'[]') into result from
      (select distinct on(case_id,scope) * from mawatheeq_private.case_reviews order by case_id,scope,id desc limit 500 offset v_offset) t;
  elsif p_action='work_page' then
    select coalesce(jsonb_agg(mawatheeq_private.office_work_json(t)),'[]') into result from
      (select * from mawatheeq_private.work_items order by id limit 500 offset v_offset) t;
  elsif p_action in ('case_file','case_history') then
    v_case:=p_data->>'caseId';
    if not exists(select 1 from public.mawatheeq_cases where id=v_case) then raise exception 'احفظ القضية أولاً.'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'revision',t.revision,'before',t.before_payload,'after',t.after_payload,'actor',a.username,'createdAt',t.created_at) order by t.id desc),'[]') into result
      from (select * from mawatheeq_private.case_changes where case_id=v_case order by id desc limit 50 offset v_offset) t left join mawatheeq_private.accounts a on a.id=t.actor_id;
    if p_action='case_history' then return result; end if;
    result:=jsonb_build_object('history',result);
    select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'caseId',l.case_id,'documentId',l.document_id,'kind',l.kind,'reference',l.reference,'pages',l.pages,'revision',l.revision,'filename',d.filename,'documentRevision',d.revision,'createdAt',l.created_at) order by l.created_at desc),'[]') into v_evidence
      from mawatheeq_private.case_evidence l join public.mawatheeq_documents d on d.id=l.document_id where l.case_id=v_case and l.active;
    result:=result||jsonb_build_object('evidence',v_evidence);
    select coalesce(jsonb_agg(mawatheeq_private.office_review_json(t) order by t.id desc),'[]') into v_evidence
      from (select * from mawatheeq_private.case_reviews where case_id=v_case order by id desc limit 50) t;
    result:=result||jsonb_build_object('reviews',v_evidence);
    select coalesce(jsonb_agg(mawatheeq_private.office_review_json(t)),'[]') into v_evidence
      from (select distinct on(scope) * from mawatheeq_private.case_reviews where case_id=v_case order by scope,id desc) t;
    result:=result||jsonb_build_object('latestReviews',v_evidence);
  elsif p_action='link_evidence' then
    select * into c from public.mawatheeq_cases where id=p_data->>'caseId' for update;
    if c.id is null then raise exception 'احفظ القضية أولاً.'; end if;
    v_id:=(p_data->>'documentId')::uuid;
    if not exists(select 1 from public.mawatheeq_documents where id=v_id and file_key is not null) then raise exception 'اختر مستند PDF محفوظاً.'; end if;
    if coalesce(p_data->>'kind','') not in ('judgment','announcement','both','other') or length(btrim(coalesce(p_data->>'reference',''))) not between 1 and 1000 or length(coalesce(p_data->>'pages',''))>100 then raise exception 'أكمل نوع المستند ومرجعه أو صفحاته.'; end if;
    select * into e from mawatheeq_private.case_evidence where case_id=c.id and document_id=v_id for update;
    if e.id is not null and e.revision<>coalesce((p_data->>'revision')::integer,0) then raise exception 'تغير رابط المستند. أعد تحميل الملف.' using errcode='40001'; end if;
    if e.id is null then
      insert into mawatheeq_private.case_evidence(case_id,document_id,kind,reference,pages,created_by)
        values(c.id,v_id,p_data->>'kind',btrim(p_data->>'reference'),coalesce(p_data->>'pages',''),v_actor) returning * into e;
    else
      update mawatheeq_private.case_evidence set kind=p_data->>'kind',reference=btrim(p_data->>'reference'),pages=coalesce(p_data->>'pages',''),active=true,revision=revision+1 where id=e.id returning * into e;
    end if;
    insert into public.mawatheeq_audit(actor,record_id,action) values(v_actor,c.id,'link_case_evidence:'||e.id::text);
    return jsonb_build_object('id',e.id,'caseId',e.case_id,'documentId',e.document_id,'kind',e.kind,'reference',e.reference,'pages',e.pages,'revision',e.revision);
  elsif p_action='review' then
    v_scope:=p_data->>'scope'; v_decision:=p_data->>'decision';
    if coalesce(v_scope,'') not in ('judgment','announcement') or coalesce(v_decision,'') not in ('verified','needs_review') or length(btrim(coalesce(p_data->>'notes',''))) not between 1 and 5000 then raise exception 'أكمل نوع المراجعة ونتيجتها وملاحظاتها.'; end if;
    if v_decision='verified' and not v_owner then raise exception 'اعتماد المراجعة متاح لمسؤول المكتب فقط.' using errcode='42501'; end if;
    select * into c from public.mawatheeq_cases where id=p_data->>'caseId' for update;
    if c.id is null or c.revision is distinct from (p_data->>'caseRevision')::integer then raise exception 'تغير السجل. احفظ التعديلات وأعد تحميل القضية قبل اعتمادها.' using errcode='40001'; end if;
    if c.archived then raise exception 'استعد القضية من الأرشيف قبل المراجعة.'; end if;
    v_evidence:='[]';
    if v_decision='verified' then
      if coalesce((p_data->>'confirmed')::boolean,false) is not true then raise exception 'يلزم تأكيد مطابقة البيانات للمستند الأصلي.'; end if;
      if jsonb_typeof(p_data->'evidenceIds') is distinct from 'array' or jsonb_array_length(p_data->'evidenceIds') not between 0 and 20 then raise exception 'راجع قائمة المرفقات المختارة.'; end if;
      -- Freeze linked documents until the review snapshot is written. A stale form
      -- must never approve attachment content/reference the reviewer has not seen.
      perform 1 from mawatheeq_private.case_evidence l join public.mawatheeq_documents d on d.id=l.document_id
        where l.case_id=c.id and l.id in (select value::uuid from jsonb_array_elements_text(p_data->'evidenceIds')) for share of l,d;
      select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'documentId',d.id,'filename',d.filename,'documentRevision',d.revision,'linkRevision',l.revision,'kind',l.kind,'reference',l.reference,'pages',l.pages,'fileKey',d.file_key)),'[]') into v_evidence
      from mawatheeq_private.case_evidence l join public.mawatheeq_documents d on d.id=l.document_id
      where l.case_id=c.id and l.active and d.file_key is not null and l.id in (select value::uuid from jsonb_array_elements_text(p_data->'evidenceIds'));
      if jsonb_array_length(v_evidence)<>jsonb_array_length(p_data->'evidenceIds') then raise exception 'راجع المستندات؛ يجب أن تكون محفوظة ومرتبطة بنفس القضية.'; end if;
      if exists(select 1 from jsonb_array_elements(v_evidence) x
        where (x->>'linkRevision')::integer is distinct from (p_data#>>array['evidenceVersions',x->>'id','linkRevision'])::integer
           or (x->>'documentRevision')::integer is distinct from (p_data#>>array['evidenceVersions',x->>'id','documentRevision'])::integer)
        then raise exception 'تغير المستند أو مرجعه. أعد تحميل ملف التحقق وطابق المصدر مجدداً.' using errcode='40001'; end if;
      if jsonb_array_length(v_evidence)>0 and not exists(select 1 from jsonb_array_elements(v_evidence) x where x->>'kind' in (v_scope,'both')) then raise exception 'اختر مستند حكم للمراجعة أو مستند إعلان لإثبات الإعلان بحسب نوع المراجعة.'; end if;
      if coalesce(p_data->>'sourceType','') not in ('court_record','paper_original','client_original') or length(btrim(coalesce(p_data->>'sourceReference',''))) not between 1 and 2000 then raise exception 'حدد المصدر الذي راجعته ومرجعه. إرفاق PDF اختياري.'; end if;
      if v_scope='judgment' and (coalesce(c.payload->>'autoNumber','')='' or coalesce(c.payload->>'date','')='' or coalesce(c.payload->>'opponent','')='' or coalesce(c.payload->>'ruling','')='' or coalesce(c.payload->>'type','') not in ('حكم أول درجة','حكم استئناف','حكم تمييز','إشكال') or coalesce(c.payload->>'outcome','') not in ('لصالحنا','غير صالحنا')) then raise exception 'أكمل الرقم الآلي والأطراف وتاريخ الحكم ونوعه ومنطوقه ونتيجته قبل الاعتماد.'; end if;
      if v_scope='announcement' then
        if coalesce(c.payload->>'notificationDate','')='' or p_data->>'noticeDate' is distinct from c.payload->>'notificationDate' then raise exception 'تاريخ الإعلان بالمستند يجب أن يطابق تاريخ الإعلان المحفوظ في القضية.'; end if;
        if length(btrim(coalesce(p_data->>'method',''))) not between 1 and 500 or length(btrim(coalesce(p_data->>'recipient',''))) not between 1 and 500 or length(btrim(coalesce(p_data->>'result',''))) not between 1 and 2000 then raise exception 'أكمل وسيلة الإعلان والمعلن إليه ونتيجة الإعلان بالمستند.'; end if;
      end if;
    end if;
    insert into mawatheeq_private.case_reviews(case_id,scope,decision,case_revision,evidence,details,reviewer_id)
    values(c.id,v_scope,v_decision,c.revision,v_evidence,jsonb_build_object('notes',btrim(p_data->>'notes'),'sourceType',p_data->>'sourceType','sourceReference',p_data->>'sourceReference','noticeDate',p_data->>'noticeDate','method',p_data->>'method','recipient',p_data->>'recipient','result',p_data->>'result'),v_actor) returning * into r;
    insert into public.mawatheeq_audit(actor,record_id,action) values(v_actor,c.id,'review_'||v_scope||':'||v_decision);
    return mawatheeq_private.office_review_json(r);
  elsif p_action='save_work' then
    item:=p_data->'item'; v_id:=(item->>'id')::uuid; v_case:=nullif(item->>'caseId',''); v_date:=item->>'dueDate';
    if item is null or jsonb_typeof(item)<>'object' or v_id is null or length(btrim(coalesce(item->>'title',''))) not between 1 and 200
       or coalesce(item->>'kind','') not in ('task','hearing') or coalesce(item->>'status','') not in ('open','in_progress','done','cancelled')
       or coalesce(item->>'priority','') not in ('normal','urgent') or length(coalesce(item->>'notes',''))>5000 or length(coalesce(item->>'location',''))>500
       or length(coalesce(item->>'completionNote',''))>5000 then raise exception 'راجع عنوان المهمة ونوعها وحالتها.'; end if;
    if coalesce(v_date,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'اختر تاريخ الموعد.'; end if;
    perform v_date::date;
    if coalesce(item->>'dueTime','')<>'' and (item->>'dueTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'راجع وقت الموعد.'; end if;
    if item->>'kind'='hearing' and v_case is null then raise exception 'اربط الجلسة بقضية محفوظة.'; end if;
    if not exists(select 1 from mawatheeq_private.accounts a join public.mawatheeq_members m on m.user_id=a.id where a.id=(item->>'assigneeId')::uuid and a.enabled) then raise exception 'اختر موظفاً فعالاً مسؤولاً عن الموعد.'; end if;
    if item->>'status'='done' and btrim(coalesce(item->>'completionNote',''))='' then raise exception 'دوّن نتيجة المهمة أو قرار الجلسة قبل إتمامها.'; end if;
    perform pg_advisory_xact_lock(hashtext('office-work-'||v_id::text));
    select * into w from mawatheeq_private.work_items where id=v_id for update;
    if w.id is not null and w.revision<>coalesce((item->>'revision')::integer,0) then raise exception 'تم تعديل الموعد. أعد تحميله قبل الحفظ.' using errcode='40001'; end if;
    if v_case is not null and not exists(select 1 from public.mawatheeq_cases where id=v_case and (not archived or (w.id is not null and w.payload->>'caseId'=v_case))) then raise exception 'اختر قضية نشطة محفوظة. يمكن إغلاق عمل سابق مرتبط بقضية مؤرشفة.'; end if;
    v_old:=w.payload; v_next:=coalesce(w.revision,0)+1;
    v_completed:=case when item->>'status'='done' then case when w.payload->>'status'='done' then w.completed_at else clock_timestamp() end else null end;
    item:=jsonb_build_object('id',v_id,'caseId',coalesce(v_case,''),'title',btrim(item->>'title'),'kind',item->>'kind','dueDate',v_date,'dueTime',coalesce(item->>'dueTime',''),'assigneeId',item->>'assigneeId','priority',item->>'priority','status',item->>'status','location',coalesce(item->>'location',''),'notes',coalesce(item->>'notes',''),'completionNote',coalesce(item->>'completionNote',''));
    insert into mawatheeq_private.work_items(id,payload,revision,created_by,updated_by,completed_at) values(v_id,item,v_next,v_actor,v_actor,v_completed)
    on conflict(id) do update set payload=excluded.payload,revision=excluded.revision,updated_by=v_actor,updated_at=clock_timestamp(),completed_at=v_completed returning * into w;
    insert into mawatheeq_private.work_changes(work_id,before_payload,after_payload,revision,actor_id) values(v_id,v_old,item,v_next,v_actor);
    return mawatheeq_private.office_work_json(w);
  elsif p_action='work_history' then
    select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'revision',t.revision,'before',t.before_payload,'after',t.after_payload,'actor',a.username,'createdAt',t.created_at) order by t.id desc),'[]') into result
      from (select * from mawatheeq_private.work_changes where work_id=(p_data->>'id')::uuid order by id desc limit 50 offset v_offset) t join mawatheeq_private.accounts a on a.id=t.actor_id;
  elsif p_action in ('create_member','reset_member_password','set_member_enabled') then
    if not v_owner then raise exception 'إدارة المستخدمين متاحة لمسؤول المكتب فقط.' using errcode='42501'; end if;
    v_id:=nullif(p_data->>'id','')::uuid;
    if p_action<>'create_member' and not exists(select 1 from public.mawatheeq_members where user_id=v_id and role='editor') then raise exception 'يمكن إدارة حسابات الموظفين فقط؛ حساب مسؤول المكتب محفوظ.'; end if;
    if p_action in ('create_member','reset_member_password') then
      v_password:=p_data->>'password';
      if length(coalesce(v_password,''))<12 or octet_length(v_password)>72 then raise exception 'كلمة المرور المؤقتة: 12 حرفاً على الأقل وبحد أقصى 72 بايت.'; end if;
    end if;
    if p_action='create_member' then
      v_username:=lower(btrim(coalesce(p_data->>'username','')));
      if v_username !~ '^[a-z0-9][a-z0-9_.-]{2,31}$' then raise exception 'اسم المستخدم 3 إلى 32 حرفاً إنجليزياً أو رقماً أو . _ -'; end if;
      if exists(select 1 from mawatheeq_private.accounts where username=v_username) then raise exception 'اسم المستخدم مستخدم بالفعل.'; end if;
      insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values(v_username,extensions.crypt(v_password,extensions.gen_salt('bf',10)),true) returning id into v_id;
      insert into public.mawatheeq_members(user_id,role) values(v_id,'editor');
    elsif p_action='reset_member_password' then
      update mawatheeq_private.accounts set password_hash=extensions.crypt(v_password,extensions.gen_salt('bf',10)),must_change_password=true,failures=0,locked_until=null where id=v_id;
      delete from mawatheeq_private.sessions where user_id=v_id;
    else
      if jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'حالة الحساب غير صالحة.'; end if;
      update mawatheeq_private.accounts set enabled=(p_data->>'enabled')::boolean where id=v_id;
      if not (p_data->>'enabled')::boolean then delete from mawatheeq_private.sessions where user_id=v_id; end if;
    end if;
    insert into public.mawatheeq_audit(actor,record_id,action) values(v_actor,v_id::text,p_action);
    select jsonb_build_object('id',a.id,'username',a.username,'role',m.role,'enabled',a.enabled,'mustChangePassword',a.must_change_password) into result
      from mawatheeq_private.accounts a join public.mawatheeq_members m on m.user_id=a.id where a.id=v_id;
  elsif p_action='export_page' then
    -- Allowlist only; never export credentials or sessions.
    case p_data->>'kind'
      when 'case_reviews' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select * from mawatheeq_private.case_reviews order by id limit 100 offset v_offset) t;
      when 'case_evidence' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select * from mawatheeq_private.case_evidence order by id limit 100 offset v_offset) t;
      when 'case_changes' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select * from mawatheeq_private.case_changes order by id limit 100 offset v_offset) t;
      when 'work_items' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select * from mawatheeq_private.work_items order by id limit 100 offset v_offset) t;
      when 'work_changes' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select * from mawatheeq_private.work_changes order by id limit 100 offset v_offset) t;
      else raise exception 'العملية المطلوبة غير متاحة.';
    end case;
  else raise exception 'العملية المطلوبة غير متاحة.';
  end if;
  return coalesce(result,'null');
end $$;

create function public.mawatheeq_office_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.office_request(p_token,p_action,p_data); $$;
revoke all on function mawatheeq_private.record_case_change(),mawatheeq_private.office_review_json(mawatheeq_private.case_reviews),mawatheeq_private.office_work_json(mawatheeq_private.work_items),mawatheeq_private.office_request(text,text,jsonb),public.mawatheeq_office_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.office_request(text,text,jsonb),public.mawatheeq_office_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
