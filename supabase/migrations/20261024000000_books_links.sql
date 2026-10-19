begin;
-- Books, phase 6 (24 October 2026): the books joined to the rest of the office.
-- * Outside transactions: money paid or received outside the office for a case (court and execution fees, deposits,
--   withdrawals, expert fees, bail…), each with the proof that was issued (receipt, cheque, deposit slip…) and where
--   that ORIGINAL is now — with the employee, in the office safe, in the archive file, at the court, with the client —
--   with a log of every hand-over. Posted to the books (fees paid for a client wait to be billed back to them), and
--   billed to the client in one invoice.
-- * Invoices from a case: the client's accounting partner is found or created from the client file.
-- * A case's money in one call: its invoices, payments and outside transactions.
-- * Payroll posted to the books for a month, then paid from the bank.
-- * Collection payments moved into the books as money held for clients.
-- * Monthly figures for the dashboard charts.

insert into mawatheeq_private.acc_accounts(code,name,type,reconcile) values
 ('217000','مبالغ محصلة لحساب الموكلين','liability_current',false),('101300','عهدة المندوب','asset_cash',false)
on conflict(code) do nothing;
insert into mawatheeq_private.acc_journals(code,name,type,default_account)
 select 'CSH2','عهدة المندوب','cash',(select id from mawatheeq_private.acc_accounts where code='101300') where not exists(select 1 from mawatheeq_private.acc_journals where code='CSH2');

create table mawatheeq_private.acc_outside (
 id uuid primary key default gen_random_uuid(),
 case_id text references public.mawatheeq_cases(id),
 partner_id uuid references mawatheeq_private.acc_partners(id),
 date date not null,
 kind text not null check (length(btrim(kind)) between 1 and 80),
 direction text not null check (direction in ('out','in')),
 entity text not null default '',
 amount numeric(18,3) not null check (amount>0),
 method text not null default 'cash' check (method in ('cash','cheque','knet','transfer','petty')),
 reference text not null default '', cheque_number text not null default '',
 doc_type text not null default '', handled_by text not null default '',
 billable boolean not null default true,
 state text not null default 'draft' check (state in ('draft','posted','billed','cancelled')),
 journal_id uuid references mawatheeq_private.acc_journals(id), move_id uuid references mawatheeq_private.acc_moves(id), invoice_id uuid references mawatheeq_private.acc_moves(id),
 original_state text not null default 'staff' check (original_state in ('none','staff','safe','archive','court','client','lost')),
 original_holder text not null default '', archive_ref text not null default '',
 notes text not null default '', revision integer not null default 1,
 created_by uuid not null references mawatheeq_private.accounts(id), created_at timestamptz not null default clock_timestamp()
);
create index acc_outside_case on mawatheeq_private.acc_outside(case_id,date);
create table mawatheeq_private.acc_outside_custody (
 id bigint generated always as identity primary key, outside_id uuid not null references mawatheeq_private.acc_outside(id) on delete cascade,
 date date not null, to_state text not null, holder text not null default '', note text not null default '',
 actor_id uuid not null references mawatheeq_private.accounts(id), created_at timestamptz not null default clock_timestamp()
);
revoke all on mawatheeq_private.acc_outside,mawatheeq_private.acc_outside_custody from public,anon,authenticated;

create function mawatheeq_private.acc_outside_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',o.id,'caseId',coalesce(o.case_id,''),'partnerId',coalesce(o.partner_id::text,''),'date',o.date,'kind',o.kind,'direction',o.direction,'entity',o.entity,'amount',o.amount::text,
  'method',o.method,'reference',o.reference,'chequeNumber',o.cheque_number,'docType',o.doc_type,'handledBy',o.handled_by,'billable',o.billable,'state',o.state,'journalId',coalesce(o.journal_id::text,''),
  'moveId',coalesce(o.move_id::text,''),'moveName',coalesce((select name from mawatheeq_private.acc_moves where id=o.move_id),''),
  'invoiceId',coalesce(o.invoice_id::text,''),'invoiceName',coalesce((select name from mawatheeq_private.acc_moves where id=o.invoice_id),''),
  'originalState',o.original_state,'originalHolder',o.original_holder,'archiveRef',o.archive_ref,'notes',o.notes,'revision',o.revision,
  'createdBy',(select coalesce(nullif(display_name,''),username) from mawatheeq_private.accounts where id=o.created_by),
  'custody',coalesce((select jsonb_agg(jsonb_build_object('date',c.date,'toState',c.to_state,'holder',c.holder,'note',c.note,
    'by',(select coalesce(nullif(display_name,''),username) from mawatheeq_private.accounts where id=c.actor_id),'at',c.created_at) order by c.id desc) from mawatheeq_private.acc_outside_custody c where c.outside_id=o.id),'[]'))
 from mawatheeq_private.acc_outside o where o.id=p_id;
$$;
-- The accounting partner of a client file (or of a name), created when there is none.
create function mawatheeq_private.acc_partner_for(p_entity uuid,p_name text) returns uuid language plpgsql set search_path='' as $$
declare v uuid; v_name text;
begin
 if p_entity is not null then
  select id into v from mawatheeq_private.acc_partners where client_entity_id=p_entity;
  if v is not null then return v; end if;
  select coalesce(nullif(btrim(payload->>'name'),''),p_name) into v_name from mawatheeq_private.client_entities where id=p_entity and merged_into is null;
 end if;
 v_name:=coalesce(nullif(btrim(v_name),''),nullif(btrim(p_name),''));
 if v_name is null then return null; end if;
 select id into v from mawatheeq_private.acc_partners where mawatheeq_private.normalized(name)=mawatheeq_private.normalized(v_name) and (client_entity_id is null or client_entity_id=p_entity) limit 1;
 if v is not null then
  if p_entity is not null then update mawatheeq_private.acc_partners set client_entity_id=p_entity where id=v and client_entity_id is null
   and not exists(select 1 from mawatheeq_private.acc_partners where client_entity_id=p_entity); end if;
  return v;
 end if;
 insert into mawatheeq_private.acc_partners(name,kind,client_entity_id) values(left(v_name,200),'customer',
  case when p_entity is not null and exists(select 1 from mawatheeq_private.client_entities where id=p_entity and merged_into is null) then p_entity end) returning id into v;
 return v;
end $$;

alter function mawatheeq_private.books_request(text,text,jsonb) rename to books_request_adv;
create function mawatheeq_private.books_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; can_edit boolean; can_config boolean; v_lock date; s mawatheeq_private.acc_settings%rowtype; l jsonb; x jsonb; v_id uuid; o mawatheeq_private.acc_outside%rowtype;
 j mawatheeq_private.acc_journals%rowtype; v_move uuid; v_partner uuid; v_acc uuid; r record; v_counts jsonb; v_lines jsonb; v_total numeric; v_month date; i integer; result jsonb; v_rev integer;
begin
 if p_action not in ('setup','partner_for_client','case_books','save_outside','post_outside','cancel_outside','move_original','bill_outside','list_outside',
  'post_payroll','pay_payroll','payroll_status','sync_collections','monthly') then return mawatheeq_private.books_request_adv(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
 perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'accounting') and a->>'caseScope'='all');
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>500000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 can_edit:=coalesce((a->>'canEdit')::boolean,false); can_config:=mawatheeq_private.is_owner();
 v_lock:=coalesce(mawatheeq_private.acc_locked_until(can_config),'0001-01-01');
 if p_action in ('partner_for_client','save_outside','post_outside','cancel_outside','move_original','bill_outside','post_payroll','pay_payroll','sync_collections') then perform mawatheeq_private.require_access(can_edit); end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select * into s from mawatheeq_private.acc_settings;
 case p_action
 when 'setup' then
  return mawatheeq_private.books_request_adv(p_token,'setup',p_data)||jsonb_build_object('links',true,
   'outsideOpen',jsonb_build_object('unbilled',(select count(*) from mawatheeq_private.acc_outside where state='posted' and billable and direction='out'),
    'unbilledAmount',coalesce((select sum(amount) from mawatheeq_private.acc_outside where state='posted' and billable and direction='out'),0)::text,
    'originalsOut',(select count(*) from mawatheeq_private.acc_outside where state<>'cancelled' and original_state in ('staff','court')),
    'lost',(select count(*) from mawatheeq_private.acc_outside where state<>'cancelled' and original_state='lost')));
 when 'partner_for_client' then
  v_partner:=mawatheeq_private.acc_partner_for(nullif(p_data->>'clientEntityId','')::uuid,p_data->>'name');
  if v_partner is null then raise exception 'لا يوجد اسم موكل لهذه القضية.'; end if;
  return (select mawatheeq_private.acc_partner_json(x2) from mawatheeq_private.acc_partners x2 where id=v_partner);
 when 'case_books' then
  return jsonb_build_object(
   'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'moveType',m.move_type,'paymentType',coalesce(m.payment_type,''),'state',m.state,'date',m.date,'dueDate',m.invoice_date_due,
     'amountTotal',m.amount_total::text,'amountResidual',m.amount_residual::text,'paymentState',m.payment_state,'currency',m.currency,'ref',m.ref) order by m.date desc,m.name desc),'[]')
    from mawatheeq_private.acc_moves m where m.state<>'cancel' and (m.case_id=p_data->>'caseId') and (m.move_type<>'entry' or m.payment_type is not null)),
   'outside',(select coalesce(jsonb_agg(mawatheeq_private.acc_outside_json(o2.id) order by o2.date desc),'[]') from mawatheeq_private.acc_outside o2 where o2.case_id=p_data->>'caseId'),
   'totals',jsonb_build_object(
    'invoiced',coalesce((select sum(amount_total) from mawatheeq_private.acc_moves where case_id=p_data->>'caseId' and state='posted' and move_type='out_invoice'),0)-coalesce((select sum(amount_total) from mawatheeq_private.acc_moves where case_id=p_data->>'caseId' and state='posted' and move_type='out_refund'),0),
    'open',coalesce((select sum(amount_residual) from mawatheeq_private.acc_moves where case_id=p_data->>'caseId' and state='posted' and move_type='out_invoice'),0),
    'outsidePaid',coalesce((select sum(amount) from mawatheeq_private.acc_outside where case_id=p_data->>'caseId' and state in ('posted','billed') and direction='out'),0),
    'outsideReceived',coalesce((select sum(amount) from mawatheeq_private.acc_outside where case_id=p_data->>'caseId' and state in ('posted','billed') and direction='in'),0),
    'unbilled',coalesce((select sum(amount) from mawatheeq_private.acc_outside where case_id=p_data->>'caseId' and state='posted' and billable and direction='out'),0)));
 when 'save_outside' then
  l:=p_data->'outside'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or jsonb_typeof(l)<>'object' then raise exception 'بيانات المعاملة غير صالحة.'; end if;
  if length(btrim(coalesce(l->>'kind',''))) not between 1 and 80 then raise exception 'اختر نوع المعاملة.'; end if;
  if coalesce(l->>'direction','') not in ('out','in') then raise exception 'حدد هل دُفع المبلغ أم استُلم.'; end if;
  if coalesce(l->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'اختر تاريخ المعاملة.'; end if;
  if coalesce(l->>'method','cash') not in ('cash','cheque','knet','transfer','petty') then raise exception 'اختر طريقة الدفع.'; end if;
  if coalesce(l->>'originalState','staff') not in ('none','staff','safe','archive','court','client','lost') then raise exception 'حدد مكان الأصل.'; end if;
  if coalesce(l->>'caseId','')<>'' and not exists(select 1 from public.mawatheeq_cases where id=l->>'caseId') then raise exception 'اختر قضية محفوظة.'; end if;
  if coalesce(l->>'partnerId','')<>'' and not exists(select 1 from mawatheeq_private.acc_partners where id=(l->>'partnerId')::uuid) then raise exception 'اختر الموكل.'; end if;
  if mawatheeq_private.acc_amount(l->>'amount')<=0 then raise exception 'اكتب المبلغ.'; end if;
  if l->>'method'='cheque' and coalesce(btrim(l->>'chequeNumber'),'')='' then raise exception 'اكتب رقم الشيك.'; end if;
  if v_id is null then
   insert into mawatheeq_private.acc_outside(case_id,partner_id,date,kind,direction,entity,amount,method,reference,cheque_number,doc_type,handled_by,billable,original_state,original_holder,archive_ref,notes,created_by)
    values(nullif(l->>'caseId',''),nullif(l->>'partnerId','')::uuid,(l->>'date')::date,btrim(l->>'kind'),l->>'direction',left(coalesce(l->>'entity',''),120),mawatheeq_private.acc_amount(l->>'amount'),coalesce(nullif(l->>'method',''),'cash'),
     left(coalesce(l->>'reference',''),80),left(coalesce(l->>'chequeNumber',''),40),left(coalesce(l->>'docType',''),60),left(coalesce(l->>'handledBy',''),120),coalesce((l->>'billable')::boolean,true),
     coalesce(nullif(l->>'originalState',''),'staff'),left(coalesce(l->>'originalHolder',''),120),left(coalesce(l->>'archiveRef',''),80),left(coalesce(l->>'notes',''),2000),actor) returning id into v_id;
   insert into mawatheeq_private.acc_outside_custody(outside_id,date,to_state,holder,note,actor_id) values(v_id,(l->>'date')::date,coalesce(nullif(l->>'originalState',''),'staff'),left(coalesce(l->>'originalHolder',''),120),'تسجيل المعاملة',actor);
  else
   select * into o from mawatheeq_private.acc_outside where id=v_id for update;
   if o.id is null then raise exception 'لم تعد هذه المعاملة موجودة.'; end if;
   if o.revision<>coalesce((l->>'revision')::integer,0) then raise exception 'عُدّلت المعاملة من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
   if o.state<>'draft' then
    -- Once posted only the description changes; the amount and its accounts stay as booked.
    update mawatheeq_private.acc_outside set entity=left(coalesce(l->>'entity',''),120),reference=left(coalesce(l->>'reference',''),80),doc_type=left(coalesce(l->>'docType',''),60),handled_by=left(coalesce(l->>'handledBy',''),120),
     archive_ref=left(coalesce(l->>'archiveRef',''),80),notes=left(coalesce(l->>'notes',''),2000),revision=revision+1 where id=v_id;
   else
    update mawatheeq_private.acc_outside set case_id=nullif(l->>'caseId',''),partner_id=nullif(l->>'partnerId','')::uuid,date=(l->>'date')::date,kind=btrim(l->>'kind'),direction=l->>'direction',entity=left(coalesce(l->>'entity',''),120),
     amount=mawatheeq_private.acc_amount(l->>'amount'),method=coalesce(nullif(l->>'method',''),'cash'),reference=left(coalesce(l->>'reference',''),80),cheque_number=left(coalesce(l->>'chequeNumber',''),40),doc_type=left(coalesce(l->>'docType',''),60),
     handled_by=left(coalesce(l->>'handledBy',''),120),billable=coalesce((l->>'billable')::boolean,true),archive_ref=left(coalesce(l->>'archiveRef',''),80),notes=left(coalesce(l->>'notes',''),2000),revision=revision+1 where id=v_id;
   end if;
  end if;
  return mawatheeq_private.acc_outside_json(v_id);
 when 'post_outside' then
  select * into o from mawatheeq_private.acc_outside where id=(p_data->>'id')::uuid for update;
  if o.id is null or o.state<>'draft' then raise exception 'تُرحّل المعاملة المسودة فقط.'; end if;
  if o.date<=v_lock then raise exception 'تاريخ المعاملة ضمن فترة مقفلة (حتى %).',to_char(v_lock,'DD/MM/YYYY'); end if;
  select * into j from mawatheeq_private.acc_journals where id=nullif(p_data->>'journalId','')::uuid and type in ('bank','cash') and active;
  if j.id is null then raise exception 'اختر من أين دُفع المبلغ أو إلى أين دخل (بنك، صندوق، عهدة).'; end if;
  v_partner:=coalesce(o.partner_id,case when o.case_id is not null then mawatheeq_private.acc_partner_for(nullif((select payload->>'clientEntityId' from public.mawatheeq_cases where id=o.case_id),'')::uuid,
   (select payload->>'client' from public.mawatheeq_cases where id=o.case_id)) end);
  -- Paid out: a fee to recover from the client (or the office's own court fee); received: money held for the client.
  v_acc:=case when o.direction='out' then (select id from mawatheeq_private.acc_accounts where code=case when o.billable then '133000' else '504000' end)
   else (select id from mawatheeq_private.acc_accounts where code='217000') end;
  v_move:=mawatheeq_private.acc_post_lines(p_token,j.id,o.date,o.kind||coalesce(nullif(' — '||o.reference,' — '),'')||coalesce(nullif(' · '||o.entity,' · '),''),v_partner,'outside:'||o.id,
   jsonb_build_array(jsonb_build_object('accountId',v_acc,'debit',case when o.direction='out' then o.amount else 0 end,'credit',case when o.direction='in' then o.amount else 0 end,'caseId',coalesce(o.case_id,'')),
    jsonb_build_object('accountId',j.default_account,'debit',case when o.direction='in' then o.amount else 0 end,'credit',case when o.direction='out' then o.amount else 0 end,'caseId',coalesce(o.case_id,''))));
  update mawatheeq_private.acc_outside set state='posted',journal_id=j.id,move_id=v_move,partner_id=v_partner,revision=revision+1 where id=o.id;
  return mawatheeq_private.acc_outside_json(o.id);
 when 'cancel_outside' then
  select * into o from mawatheeq_private.acc_outside where id=(p_data->>'id')::uuid for update;
  if o.id is null or o.state in ('cancelled','billed') then raise exception 'لا تُلغى معاملة مفوترة أو ملغاة؛ ألغِ الفاتورة أولاً.'; end if;
  if o.state='posted' then
   if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (p_data->>'date')::date<=v_lock then raise exception 'اختر تاريخاً بعد تاريخ الإقفال.'; end if;
   perform mawatheeq_private.books_request(p_token,'reverse',jsonb_build_object('id',o.move_id,'date',p_data->>'date','reason','إلغاء معاملة خارجية'));
  end if;
  update mawatheeq_private.acc_outside set state='cancelled',revision=revision+1 where id=o.id;
  return mawatheeq_private.acc_outside_json(o.id);
 when 'move_original' then
  select * into o from mawatheeq_private.acc_outside where id=(p_data->>'id')::uuid for update;
  if o.id is null then raise exception 'لم تعد هذه المعاملة موجودة.'; end if;
  if coalesce(p_data->>'toState','') not in ('none','staff','safe','archive','court','client','lost') then raise exception 'حدد مكان الأصل.'; end if;
  if p_data->>'toState' in ('staff','court','client') and coalesce(btrim(p_data->>'holder'),'')='' then raise exception 'اكتب اسم من استلم الأصل أو الجهة.'; end if;
  insert into mawatheeq_private.acc_outside_custody(outside_id,date,to_state,holder,note,actor_id) values(o.id,coalesce(nullif(p_data->>'date','')::date,(now() at time zone 'Asia/Kuwait')::date),p_data->>'toState',
   left(coalesce(p_data->>'holder',''),120),left(coalesce(p_data->>'note',''),500),actor);
  update mawatheeq_private.acc_outside set original_state=p_data->>'toState',original_holder=left(coalesce(p_data->>'holder',''),120),
   archive_ref=case when p_data->>'toState'='archive' then left(coalesce(nullif(p_data->>'archiveRef',''),archive_ref),80) else archive_ref end,revision=revision+1 where id=o.id;
  return mawatheeq_private.acc_outside_json(o.id);
 when 'bill_outside' then
  -- Court fees paid for a client, billed back to them in one invoice (the fee account is cleared, the client owes them).
  if jsonb_typeof(p_data->'ids')<>'array' or jsonb_array_length(p_data->'ids')=0 then raise exception 'اختر المعاملات المراد مطالبة الموكل بها.'; end if;
  if (select count(distinct coalesce(partner_id::text,'')) from mawatheeq_private.acc_outside where id in (select (y#>>'{}')::uuid from jsonb_array_elements(p_data->'ids') y))>1 then raise exception 'تُفوتر معاملات موكل واحد معاً.'; end if;
  if exists(select 1 from mawatheeq_private.acc_outside where id in (select (y#>>'{}')::uuid from jsonb_array_elements(p_data->'ids') y) and (state<>'posted' or not billable or direction<>'out' or partner_id is null)) then
   raise exception 'تُفوتر المعاملات المرحّلة المدفوعة عن الموكل فقط.'; end if;
  select partner_id into v_partner from mawatheeq_private.acc_outside where id=(p_data->'ids'->>0)::uuid;
  select jsonb_agg(jsonb_build_object('label',o2.kind||case when o2.reference<>'' then ' — إيصال '||o2.reference else '' end||' ('||to_char(o2.date,'DD/MM/YYYY')||')','accountId',(select id from mawatheeq_private.acc_accounts where code='133000'),
   'quantity','1','priceUnit',o2.amount::text,'caseId',coalesce(o2.case_id,'')) order by o2.date) into v_lines
   from mawatheeq_private.acc_outside o2 where o2.id in (select (y#>>'{}')::uuid from jsonb_array_elements(p_data->'ids') y);
  result:=mawatheeq_private.books_request(p_token,'save_invoice',jsonb_build_object('invoice',jsonb_build_object('moveType','out_invoice','journalId',(select id from mawatheeq_private.acc_journals where type='sale' and active order by code limit 1),
   'date',coalesce(nullif(p_data->>'date',''),to_char((now() at time zone 'Asia/Kuwait')::date,'YYYY-MM-DD')),'partnerId',v_partner,'ref','رسوم ومصروفات مدفوعة عنكم',
   'caseId',(select case when count(distinct case_id)=1 then max(case_id) end from mawatheeq_private.acc_outside where id in (select (y#>>'{}')::uuid from jsonb_array_elements(p_data->'ids') y)),'lines',v_lines)));
  update mawatheeq_private.acc_outside set state='billed',invoice_id=(result->>'id')::uuid,revision=revision+1 where id in (select (y#>>'{}')::uuid from jsonb_array_elements(p_data->'ids') y);
  return result;
 when 'list_outside' then
  return (select coalesce(jsonb_agg(mawatheeq_private.acc_outside_json(o3.id) order by o3.date desc,o3.created_at desc),'[]') from mawatheeq_private.acc_outside o3
   where (coalesce(p_data->>'caseId','')='' or o3.case_id=p_data->>'caseId') and (coalesce(p_data->>'state','')='' or o3.state=p_data->>'state')
    and (coalesce(p_data->>'original','')='' or o3.original_state=p_data->>'original') and (coalesce(p_data->>'partnerId','')='' or o3.partner_id=(p_data->>'partnerId')::uuid)
    and (coalesce(p_data->>'q','')='' or mawatheeq_private.normalized(o3.kind||' '||o3.entity||' '||o3.reference||' '||o3.cheque_number||' '||o3.handled_by||' '||o3.original_holder) like '%'||mawatheeq_private.normalized(p_data->>'q')||'%'));
 when 'post_payroll' then
  if coalesce(p_data->>'month','') !~ '^\d{4}-\d{2}$' then raise exception 'اختر الشهر.'; end if;
  if exists(select 1 from mawatheeq_private.acc_moves where source='payroll:'||(p_data->>'month') and state<>'cancel') then raise exception 'رُحّلت رواتب هذا الشهر من قبل.'; end if;
  if jsonb_typeof(p_data->'lines')<>'array' or jsonb_array_length(p_data->'lines')=0 then raise exception 'لا توجد رواتب بالدينار لهذا الشهر.'; end if;
  v_month:=((p_data->>'month')||'-01')::date; v_total:=0; v_lines:='[]';
  for x in select value from jsonb_array_elements(p_data->'lines') loop
   continue when mawatheeq_private.acc_amount(x->>'amount')=0;
   v_total:=v_total+mawatheeq_private.acc_amount(x->>'amount');
   v_lines:=v_lines||jsonb_build_object('accountId',(select id from mawatheeq_private.acc_accounts where code='213000'),'debit',0,'credit',mawatheeq_private.acc_amount(x->>'amount'),'label','راتب '||left(coalesce(x->>'name',''),100));
  end loop;
  if v_total<=0 then raise exception 'لا توجد رواتب بالدينار لهذا الشهر.'; end if;
  v_move:=mawatheeq_private.acc_post_lines(p_token,(select id from mawatheeq_private.acc_journals where type='general' and active order by code limit 1),
   (v_month+interval '1 month'-interval '1 day')::date,'رواتب '||to_char(v_month,'MM/YYYY'),null,'payroll:'||(p_data->>'month'),
   jsonb_build_array(jsonb_build_object('accountId',(select id from mawatheeq_private.acc_accounts where code='501000'),'debit',v_total,'credit',0,'label','رواتب '||to_char(v_month,'MM/YYYY')))||v_lines);
  return mawatheeq_private.books_request(p_token,'payroll_status',p_data);
 when 'pay_payroll' then
  select * into r from mawatheeq_private.acc_moves where source='payroll:'||(p_data->>'month') and state='posted';
  if r.id is null then raise exception 'رحّل رواتب الشهر أولاً.'; end if;
  if exists(select 1 from mawatheeq_private.acc_moves where source='payroll-pay:'||(p_data->>'month') and state<>'cancel') then raise exception 'صُرفت رواتب هذا الشهر من قبل.'; end if;
  select * into j from mawatheeq_private.acc_journals where id=nullif(p_data->>'journalId','')::uuid and type in ('bank','cash') and active;
  if j.id is null then raise exception 'اختر حساب الصرف.'; end if;
  if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (p_data->>'date')::date<=v_lock then raise exception 'اختر تاريخ الصرف بعد تاريخ الإقفال.'; end if;
  select sum(credit) into v_total from mawatheeq_private.acc_move_lines where move_id=r.id and account_id=(select id from mawatheeq_private.acc_accounts where code='213000');
  perform mawatheeq_private.acc_post_lines(p_token,j.id,(p_data->>'date')::date,'صرف '||r.ref,null,'payroll-pay:'||(p_data->>'month'),
   jsonb_build_array(jsonb_build_object('accountId',(select id from mawatheeq_private.acc_accounts where code='213000'),'debit',v_total,'credit',0),jsonb_build_object('accountId',j.default_account,'debit',0,'credit',v_total)));
  return mawatheeq_private.books_request(p_token,'payroll_status',p_data);
 when 'payroll_status' then
  return jsonb_build_object('month',p_data->>'month',
   'posted',(select jsonb_build_object('id',id,'name',name,'amount',(select sum(debit) from mawatheeq_private.acc_move_lines where move_id=pm.id)::text) from mawatheeq_private.acc_moves pm where source='payroll:'||(p_data->>'month') and state='posted' limit 1),
   'paid',(select jsonb_build_object('id',id,'name',name,'date',date) from mawatheeq_private.acc_moves where source='payroll-pay:'||(p_data->>'month') and state='posted' limit 1));
 when 'sync_collections' then
  -- Collection payments into the books: money collected from debtors is held for the client; expenses on a file are to recover from the client.
  select * into j from mawatheeq_private.acc_journals where id=nullif(p_data->>'journalId','')::uuid and type in ('bank','cash') and active;
  if j.id is null then raise exception 'اختر الحساب الذي دخلت فيه المبالغ المحصلة.'; end if;
  v_counts:=jsonb_build_object('payments',0,'expenses',0,'external',0,'already',0,'locked',0,'amount','0');
  for r in select d.id,d.case_id,d.payload p,f.payload fp from mawatheeq_private.department_records d join mawatheeq_private.department_records f on f.id=d.subject_id
    where d.workspace='collections' and d.kind='payment' and not d.archived and coalesce(d.payload->>'status','posted')='posted' order by d.payload->>'date' loop
   if exists(select 1 from mawatheeq_private.acc_moves where source='collection:'||r.id and state<>'cancel') then v_counts:=jsonb_set(v_counts,'{already}',to_jsonb((v_counts->>'already')::int+1)); continue; end if;
   if r.p->>'type'='external' then v_counts:=jsonb_set(v_counts,'{external}',to_jsonb((v_counts->>'external')::int+1)); continue; end if;
   if (r.p->>'date')::date<=v_lock then v_counts:=jsonb_set(v_counts,'{locked}',to_jsonb((v_counts->>'locked')::int+1)); continue; end if;
   v_counts:=jsonb_set(v_counts,array[case when r.p->>'type'='expense' then 'expenses' else 'payments' end],to_jsonb((v_counts->>case when r.p->>'type'='expense' then 'expenses' else 'payments' end)::int+1));
   v_counts:=jsonb_set(v_counts,'{amount}',to_jsonb(((v_counts->>'amount')::numeric+round((r.p->>'amountMinor')::numeric/1000,3))::text));
   continue when coalesce((p_data->>'dryRun')::boolean,true);
   v_partner:=mawatheeq_private.acc_partner_for(nullif(r.fp->>'clientEntityId','')::uuid,coalesce(nullif(r.fp->>'client',''),(select payload->>'client' from public.mawatheeq_cases where id=r.case_id)));
   perform mawatheeq_private.acc_post_lines(p_token,j.id,(r.p->>'date')::date,case when r.p->>'type'='expense' then 'مصروف تحصيل' else 'تحصيل' end||coalesce(nullif(' — '||(r.p->>'reference'),' — '),'')||' · ملف '||coalesce(r.fp->>'number',r.fp->>'fileNumber',''),
    v_partner,'collection:'||r.id,
    case when r.p->>'type'='expense' then jsonb_build_array(jsonb_build_object('accountId',(select id from mawatheeq_private.acc_accounts where code='133000'),'debit',round((r.p->>'amountMinor')::numeric/1000,3),'credit',0,'caseId',coalesce(r.case_id,'')),
      jsonb_build_object('accountId',j.default_account,'debit',0,'credit',round((r.p->>'amountMinor')::numeric/1000,3),'caseId',coalesce(r.case_id,'')))
     else jsonb_build_array(jsonb_build_object('accountId',j.default_account,'debit',round((r.p->>'amountMinor')::numeric/1000,3),'credit',0,'caseId',coalesce(r.case_id,'')),
      jsonb_build_object('accountId',(select id from mawatheeq_private.acc_accounts where code='217000'),'debit',0,'credit',round((r.p->>'amountMinor')::numeric/1000,3),'caseId',coalesce(r.case_id,''))) end);
  end loop;
  return v_counts||jsonb_build_object('dryRun',coalesce((p_data->>'dryRun')::boolean,true));
 when 'monthly' then
  i:=least(greatest(coalesce((p_data->>'months')::integer,12),1),36);
  v_month:=(date_trunc('month',(now() at time zone 'Asia/Kuwait'))-((i-1)||' month')::interval)::date;
  return (select jsonb_agg(jsonb_build_object('month',to_char(mm,'YYYY-MM'),
    'income',coalesce((select sum(ml.credit-ml.debit) from mawatheeq_private.acc_move_lines ml join mawatheeq_private.acc_moves mv on mv.id=ml.move_id join mawatheeq_private.acc_accounts ma on ma.id=ml.account_id
      where mv.state='posted' and date_trunc('month',mv.date)=mm and ma.type in ('income','income_other')),0)::text,
    'expenses',coalesce((select sum(ml.debit-ml.credit) from mawatheeq_private.acc_move_lines ml join mawatheeq_private.acc_moves mv on mv.id=ml.move_id join mawatheeq_private.acc_accounts ma on ma.id=ml.account_id
      where mv.state='posted' and date_trunc('month',mv.date)=mm and ma.type in ('expense','expense_depreciation','expense_direct_cost')),0)::text,
    'cash',coalesce((select sum(ml.debit-ml.credit) from mawatheeq_private.acc_move_lines ml join mawatheeq_private.acc_moves mv on mv.id=ml.move_id join mawatheeq_private.acc_accounts ma on ma.id=ml.account_id
      where mv.state='posted' and mv.date<mm+interval '1 month' and ma.type='asset_cash'),0)::text) order by mm)
   from generate_series(v_month::timestamp,date_trunc('month',(now() at time zone 'Asia/Kuwait')),interval '1 month') mm);
 end case;
end $$;

revoke all on function mawatheeq_private.acc_outside_json(uuid),mawatheeq_private.acc_partner_for(uuid,text),mawatheeq_private.books_request(text,text,jsonb),mawatheeq_private.books_request_adv(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.books_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
