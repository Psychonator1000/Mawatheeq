begin;
-- Books, phase 1 (19 October 2026): double-entry accounting in the accounting workspace, as in a full accounting suite.
-- * A chart of accounts (each account has a type that places it in the balance sheet or the profit and loss) and
--   journals (sales, purchases, bank, cash, miscellaneous), seeded for a law office in Kuwaiti dinars.
-- * Partners: customers (linked to a client file when there is one), vendors and others.
-- * Journal entries are saved as drafts and posted when debits equal credits; posting gives the entry its number in
--   its journal and year (e.g. MISC/2026/0001). A posted entry can be reset to draft, a draft cancelled, and a posted
--   entry reversed by a mirror entry; nothing dated on or before a lock date can be posted, changed or reset.
-- * Reports read posted lines only: trial balance and general ledger (the profit and loss and the balance sheet are
--   built from the trial balance).
-- Office-wide books need the accounting section with access to all cases; changing entries needs edit rights; the
-- chart, the journals and the lock dates need the settings power (or the owner).

create table mawatheeq_private.acc_accounts (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check (code ~ '^[0-9A-Za-z.]{1,12}$'),
 name text not null check (length(btrim(name)) between 1 and 160),
 type text not null check (type in ('asset_receivable','asset_cash','asset_current','asset_non_current','asset_prepayments','asset_fixed',
  'liability_payable','liability_credit_card','liability_current','liability_non_current','equity','equity_unaffected',
  'income','income_other','expense','expense_depreciation','expense_direct_cost','off_balance')),
 reconcile boolean not null default false,
 deprecated boolean not null default false,
 note text not null default '',
 revision integer not null default 1,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create table mawatheeq_private.acc_journals (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check (code ~ '^[A-Z0-9]{1,6}$'),
 name text not null check (length(btrim(name)) between 1 and 120),
 type text not null check (type in ('sale','purchase','cash','bank','general')),
 default_account uuid references mawatheeq_private.acc_accounts(id),
 active boolean not null default true,
 revision integer not null default 1,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create table mawatheeq_private.acc_partners (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 1 and 200),
 kind text not null default 'customer' check (kind in ('customer','vendor','both','other')),
 client_entity_id uuid unique references mawatheeq_private.client_entities(id),
 phone text not null default '', email text not null default '', reference text not null default '', note text not null default '',
 active boolean not null default true,
 revision integer not null default 1,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create table mawatheeq_private.acc_moves (
 id uuid primary key default gen_random_uuid(),
 journal_id uuid not null references mawatheeq_private.acc_journals(id),
 name text not null default '/',
 move_type text not null default 'entry' check (move_type in ('entry','out_invoice','out_refund','in_invoice','in_refund','out_receipt','in_receipt')),
 state text not null default 'draft' check (state in ('draft','posted','cancel')),
 date date not null,
 ref text not null default '',
 narration text not null default '',
 partner_id uuid references mawatheeq_private.acc_partners(id),
 case_id text references public.mawatheeq_cases(id),
 reversed_from uuid references mawatheeq_private.acc_moves(id),
 source text not null default '',
 revision integer not null default 1,
 created_by uuid not null references mawatheeq_private.accounts(id), updated_by uuid not null references mawatheeq_private.accounts(id),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 posted_at timestamptz, posted_by uuid references mawatheeq_private.accounts(id)
);
create unique index acc_moves_name on mawatheeq_private.acc_moves(journal_id,name) where name<>'/';
create index acc_moves_date on mawatheeq_private.acc_moves(date,id);
create table mawatheeq_private.acc_move_lines (
 id uuid primary key default gen_random_uuid(),
 move_id uuid not null references mawatheeq_private.acc_moves(id) on delete cascade,
 seq integer not null default 0,
 account_id uuid not null references mawatheeq_private.acc_accounts(id),
 partner_id uuid references mawatheeq_private.acc_partners(id),
 case_id text references public.mawatheeq_cases(id),
 label text not null default '',
 debit numeric(18,3) not null default 0 check (debit>=0),
 credit numeric(18,3) not null default 0 check (credit>=0),
 date_maturity date,
 check (not (debit>0 and credit>0))
);
create index acc_move_lines_move on mawatheeq_private.acc_move_lines(move_id,seq);
create index acc_move_lines_account on mawatheeq_private.acc_move_lines(account_id);
create table mawatheeq_private.acc_sequences (journal_id uuid not null references mawatheeq_private.acc_journals(id), year integer not null, next integer not null default 1, primary key(journal_id,year));
create table mawatheeq_private.acc_settings (id boolean primary key default true check (id), lock_date date, fiscal_lock_date date, tax_lock_date date,
 fiscal_year_end text not null default '12-31' check (fiscal_year_end ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'), currency text not null default 'KWD', revision integer not null default 1);
create table mawatheeq_private.acc_changes (
 id bigint generated always as identity primary key, record_type text not null, record_id uuid not null, action text not null,
 before_payload jsonb, after_payload jsonb, actor_id uuid not null references mawatheeq_private.accounts(id), created_at timestamptz not null default clock_timestamp()
);
create index acc_changes_record on mawatheeq_private.acc_changes(record_id,id desc);
revoke all on mawatheeq_private.acc_accounts,mawatheeq_private.acc_journals,mawatheeq_private.acc_partners,mawatheeq_private.acc_moves,mawatheeq_private.acc_move_lines,
 mawatheeq_private.acc_sequences,mawatheeq_private.acc_settings,mawatheeq_private.acc_changes from public,anon,authenticated;

-- A law office chart of accounts in Kuwaiti dinars, and its journals.
insert into mawatheeq_private.acc_settings(id) values(true);
insert into mawatheeq_private.acc_accounts(code,name,type,reconcile) values
 ('101000','البنك','asset_cash',false),('101100','الصندوق','asset_cash',false),('101200','العهدة النقدية','asset_cash',false),
 ('101900','حساب البنك المعلق','asset_current',false),('101901','مقبوضات قيد التحصيل','asset_current',true),('101902','مدفوعات قيد الصرف','asset_current',true),
 ('121000','ذمم العملاء المدينة','asset_receivable',true),('131000','سلف الموظفين','asset_current',true),('132000','مصروفات مدفوعة مقدماً','asset_prepayments',false),
 ('133000','رسوم ومصروفات قضايا مستردة من الموكلين','asset_current',true),('151000','الأثاث والمعدات','asset_fixed',false),('151900','مجمع الإهلاك','asset_fixed',false),
 ('211000','ذمم الموردين الدائنة','liability_payable',true),('212000','دفعات مقدمة من الموكلين','liability_current',true),('213000','رواتب مستحقة','liability_current',false),
 ('214000','مخصص مكافأة نهاية الخدمة','liability_non_current',false),('215000','ضرائب مستحقة','liability_current',false),
 ('301000','رأس المال','equity',false),('302000','مسحوبات الشركاء','equity',false),('309000','أرباح السنة غير الموزعة','equity_unaffected',false),
 ('401000','أتعاب المحاماة','income',false),('402000','أتعاب التحصيل','income',false),('403000','أتعاب الاستشارات','income',false),('409000','إيرادات أخرى','income_other',false),
 ('501000','الرواتب والأجور','expense',false),('502000','الإيجار','expense',false),('503000','الكهرباء والماء','expense',false),('504000','رسوم المحاكم والقيد','expense_direct_cost',false),
 ('505000','القرطاسية ولوازم المكتب','expense',false),('506000','الهاتف والإنترنت','expense',false),('507000','المواصلات','expense',false),('508000','الإهلاك','expense_depreciation',false),
 ('509000','عمولات بنكية','expense',false),('510000','اشتراكات مهنية','expense',false),('599000','مصروفات أخرى','expense',false);
insert into mawatheeq_private.acc_journals(code,name,type,default_account) values
 ('INV','فواتير العملاء','sale',(select id from mawatheeq_private.acc_accounts where code='401000')),
 ('BILL','فواتير الموردين','purchase',(select id from mawatheeq_private.acc_accounts where code='599000')),
 ('BNK1','البنك','bank',(select id from mawatheeq_private.acc_accounts where code='101000')),
 ('CSH1','الصندوق','cash',(select id from mawatheeq_private.acc_accounts where code='101100')),
 ('MISC','قيود متنوعة','general',null);

create function mawatheeq_private.acc_account_json(a mawatheeq_private.acc_accounts) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',a.id,'code',a.code,'name',a.name,'type',a.type,'reconcile',a.reconcile,'deprecated',a.deprecated,'note',a.note,'revision',a.revision);
$$;
create function mawatheeq_private.acc_journal_json(j mawatheeq_private.acc_journals) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',j.id,'code',j.code,'name',j.name,'type',j.type,'defaultAccount',coalesce(j.default_account::text,''),'active',j.active,'revision',j.revision);
$$;
create function mawatheeq_private.acc_partner_json(p mawatheeq_private.acc_partners) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'name',p.name,'kind',p.kind,'clientEntityId',coalesce(p.client_entity_id::text,''),'phone',p.phone,'email',p.email,'reference',p.reference,'note',p.note,'active',p.active,'revision',p.revision);
$$;
create function mawatheeq_private.acc_move_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id,'journalId',m.journal_id,'name',m.name,'moveType',m.move_type,'state',m.state,'date',m.date,'ref',m.ref,'narration',m.narration,
  'partnerId',coalesce(m.partner_id::text,''),'caseId',coalesce(m.case_id,''),'reversedFrom',coalesce(m.reversed_from::text,''),'source',m.source,'revision',m.revision,
  'reversedBy',coalesce((select r.id::text from mawatheeq_private.acc_moves r where r.reversed_from=m.id and r.state<>'cancel' limit 1),''),
  'createdBy',(select coalesce(nullif(a.display_name,''),a.username) from mawatheeq_private.accounts a where a.id=m.created_by),
  'postedBy',coalesce((select coalesce(nullif(a.display_name,''),a.username) from mawatheeq_private.accounts a where a.id=m.posted_by),''),'postedAt',m.posted_at,
  'debit',coalesce((select sum(debit) from mawatheeq_private.acc_move_lines where move_id=m.id),0)::text,
  'credit',coalesce((select sum(credit) from mawatheeq_private.acc_move_lines where move_id=m.id),0)::text,
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'accountId',l.account_id,'partnerId',coalesce(l.partner_id::text,''),'caseId',coalesce(l.case_id,''),
    'label',l.label,'debit',l.debit::text,'credit',l.credit::text,'dateMaturity',l.date_maturity) order by l.seq) from mawatheeq_private.acc_move_lines l where l.move_id=m.id),'[]'))
 from mawatheeq_private.acc_moves m where m.id=p_id;
$$;
-- The last date that can no longer be changed: the fiscal lock applies to everyone, the period lock to all but the settings power.
create function mawatheeq_private.acc_locked_until(p_config boolean) returns date language sql stable set search_path='' as $$
 select case when p_config then fiscal_lock_date else greatest(coalesce(lock_date,'0001-01-01'),coalesce(fiscal_lock_date,'0001-01-01')) end from mawatheeq_private.acc_settings;
$$;
create function mawatheeq_private.acc_amount(v text) returns numeric language plpgsql immutable set search_path='' as $$
begin
 if coalesce(btrim(v),'')='' then return 0; end if;
 if btrim(v) !~ '^[0-9]{1,14}(\.[0-9]{1,3})?$' then raise exception 'راجع المبلغ «%»: أرقام فقط وحتى ثلاث خانات عشرية.',left(v,30); end if;
 return btrim(v)::numeric;
end $$;

create function mawatheeq_private.books_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; can_edit boolean; can_config boolean; v_lock date; result jsonb; v_id uuid; m mawatheeq_private.acc_moves%rowtype; l jsonb; i integer;
 v_journal mawatheeq_private.acc_journals%rowtype; v_year integer; v_seq integer; v_debit numeric; v_credit numeric; v_from date; v_to date; v_new uuid; old jsonb; s mawatheeq_private.acc_settings%rowtype;
begin
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
 perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'accounting') and a->>'caseScope'='all');
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>500000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 can_edit:=coalesce((a->>'canEdit')::boolean,false); can_config:=mawatheeq_private.is_owner();
 v_lock:=mawatheeq_private.acc_locked_until(can_config);
 if p_action in ('save_move','post','reset_draft','cancel','delete_move','reverse','save_partner') then perform mawatheeq_private.require_access(can_edit); end if;
 if p_action in ('save_account','save_journal','save_settings') then perform mawatheeq_private.require_access(can_edit and can_config); end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 case p_action
 when 'setup' then
  select * into s from mawatheeq_private.acc_settings;
  return jsonb_build_object('canEdit',can_edit,'canConfigure',can_edit and can_config,
   'accounts',(select coalesce(jsonb_agg(mawatheeq_private.acc_account_json(x) order by x.code),'[]') from mawatheeq_private.acc_accounts x),
   'journals',(select coalesce(jsonb_agg(mawatheeq_private.acc_journal_json(x) order by x.type,x.code),'[]') from mawatheeq_private.acc_journals x),
   'partners',(select coalesce(jsonb_agg(mawatheeq_private.acc_partner_json(x) order by x.name),'[]') from mawatheeq_private.acc_partners x),
   'settings',jsonb_build_object('lockDate',s.lock_date,'fiscalLockDate',s.fiscal_lock_date,'taxLockDate',s.tax_lock_date,'fiscalYearEnd',s.fiscal_year_end,'currency',s.currency,'revision',s.revision),
   'journalStats',(select coalesce(jsonb_object_agg(j.id,jsonb_build_object(
     'drafts',(select count(*) from mawatheeq_private.acc_moves mv where mv.journal_id=j.id and mv.state='draft'),
     'posted',(select count(*) from mawatheeq_private.acc_moves mv where mv.journal_id=j.id and mv.state='posted'),
     'balance',coalesce((select sum(l.debit-l.credit) from mawatheeq_private.acc_move_lines l join mawatheeq_private.acc_moves mv on mv.id=l.move_id where mv.state='posted' and l.account_id=j.default_account),0)::text)),'{}')
    from mawatheeq_private.acc_journals j));
 when 'save_account' then
  l:=p_data->'account'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or jsonb_typeof(l)<>'object' then raise exception 'بيانات الحساب غير صالحة.'; end if;
  if btrim(coalesce(l->>'code','')) !~ '^[0-9A-Za-z.]{1,12}$' then raise exception 'رمز الحساب: حتى 12 رقماً أو حرفاً لاتينياً.'; end if;
  if exists(select 1 from mawatheeq_private.acc_accounts where code=btrim(l->>'code') and id is distinct from v_id) then raise exception 'رمز الحساب مستخدم لحساب آخر.'; end if;
  if v_id is null then
   insert into mawatheeq_private.acc_accounts(code,name,type,reconcile,note) values(btrim(l->>'code'),btrim(l->>'name'),l->>'type',coalesce((l->>'reconcile')::boolean,false),left(coalesce(l->>'note',''),1000)) returning id into v_id;
  else
   select to_jsonb(x) into old from mawatheeq_private.acc_accounts x where id=v_id for update;
   if old is null or (old->>'revision')::integer<>coalesce((l->>'revision')::integer,0) then raise exception 'عُدّل الحساب من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
   if old->>'type'<>l->>'type' and exists(select 1 from mawatheeq_private.acc_move_lines x join mawatheeq_private.acc_moves m on m.id=x.move_id where x.account_id=v_id and m.state='posted') then
    raise exception 'لا يمكن تغيير نوع حساب عليه قيود مرحّلة؛ أنشئ حساباً جديداً وأوقف هذا.'; end if;
   update mawatheeq_private.acc_accounts set code=btrim(l->>'code'),name=btrim(l->>'name'),type=l->>'type',reconcile=coalesce((l->>'reconcile')::boolean,false),
    deprecated=coalesce((l->>'deprecated')::boolean,false),note=left(coalesce(l->>'note',''),1000),revision=revision+1,updated_at=clock_timestamp() where id=v_id;
  end if;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) select 'account',v_id,'save',old,to_jsonb(x),actor from mawatheeq_private.acc_accounts x where id=v_id;
  return (select mawatheeq_private.acc_account_json(x) from mawatheeq_private.acc_accounts x where id=v_id);
 when 'save_journal' then
  l:=p_data->'journal'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or jsonb_typeof(l)<>'object' then raise exception 'بيانات الدفتر غير صالحة.'; end if;
  if btrim(coalesce(l->>'code','')) !~ '^[A-Z0-9]{1,6}$' then raise exception 'رمز الدفتر: حتى 6 أحرف لاتينية كبيرة أو أرقام.'; end if;
  if exists(select 1 from mawatheeq_private.acc_journals where code=btrim(l->>'code') and id is distinct from v_id) then raise exception 'رمز الدفتر مستخدم.'; end if;
  if l->>'type' in ('bank','cash') and coalesce(l->>'defaultAccount','')='' then raise exception 'اختر حساب البنك أو الصندوق لهذا الدفتر.'; end if;
  if v_id is null then
   insert into mawatheeq_private.acc_journals(code,name,type,default_account,active) values(btrim(l->>'code'),btrim(l->>'name'),l->>'type',nullif(l->>'defaultAccount','')::uuid,coalesce((l->>'active')::boolean,true)) returning id into v_id;
  else
   select to_jsonb(x) into old from mawatheeq_private.acc_journals x where id=v_id for update;
   if old is null or (old->>'revision')::integer<>coalesce((l->>'revision')::integer,0) then raise exception 'عُدّل الدفتر من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
   if (old->>'code'<>btrim(l->>'code') or old->>'type'<>l->>'type') and exists(select 1 from mawatheeq_private.acc_moves where journal_id=v_id and name<>'/') then
    raise exception 'لا يمكن تغيير رمز أو نوع دفتر له قيود مرقّمة.'; end if;
   update mawatheeq_private.acc_journals set code=btrim(l->>'code'),name=btrim(l->>'name'),type=l->>'type',default_account=nullif(l->>'defaultAccount','')::uuid,
    active=coalesce((l->>'active')::boolean,true),revision=revision+1,updated_at=clock_timestamp() where id=v_id;
  end if;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) select 'journal',v_id,'save',old,to_jsonb(x),actor from mawatheeq_private.acc_journals x where id=v_id;
  return (select mawatheeq_private.acc_journal_json(x) from mawatheeq_private.acc_journals x where id=v_id);
 when 'save_partner' then
  l:=p_data->'partner'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or jsonb_typeof(l)<>'object' or length(btrim(coalesce(l->>'name',''))) not between 1 and 200 then raise exception 'اكتب اسم الشريك.'; end if;
  if coalesce(l->>'clientEntityId','')<>'' and not exists(select 1 from mawatheeq_private.client_entities where id=(l->>'clientEntityId')::uuid and merged_into is null) then raise exception 'اختر موكلاً محفوظاً.'; end if;
  if coalesce(l->>'clientEntityId','')<>'' and exists(select 1 from mawatheeq_private.acc_partners where client_entity_id=(l->>'clientEntityId')::uuid and id is distinct from v_id) then raise exception 'لهذا الموكل شريك محاسبي بالفعل.'; end if;
  if v_id is null then
   insert into mawatheeq_private.acc_partners(name,kind,client_entity_id,phone,email,reference,note) values(btrim(l->>'name'),coalesce(nullif(l->>'kind',''),'customer'),nullif(l->>'clientEntityId','')::uuid,
    left(coalesce(l->>'phone',''),40),left(coalesce(l->>'email',''),120),left(coalesce(l->>'reference',''),60),left(coalesce(l->>'note',''),1000)) returning id into v_id;
  else
   select to_jsonb(x) into old from mawatheeq_private.acc_partners x where id=v_id for update;
   if old is null or (old->>'revision')::integer<>coalesce((l->>'revision')::integer,0) then raise exception 'عُدّل الشريك من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
   update mawatheeq_private.acc_partners set name=btrim(l->>'name'),kind=coalesce(nullif(l->>'kind',''),'customer'),client_entity_id=nullif(l->>'clientEntityId','')::uuid,phone=left(coalesce(l->>'phone',''),40),
    email=left(coalesce(l->>'email',''),120),reference=left(coalesce(l->>'reference',''),60),note=left(coalesce(l->>'note',''),1000),active=coalesce((l->>'active')::boolean,true),revision=revision+1,updated_at=clock_timestamp() where id=v_id;
  end if;
  return (select mawatheeq_private.acc_partner_json(x) from mawatheeq_private.acc_partners x where id=v_id);
 when 'save_settings' then
  select * into s from mawatheeq_private.acc_settings for update;
  if s.revision<>coalesce((p_data->>'revision')::integer,0) then raise exception 'عُدّلت الإعدادات من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
  if coalesce(nullif(p_data->>'fiscalLockDate','')::date,'0001-01-01')<s.fiscal_lock_date then raise exception 'لا يمكن إرجاع تاريخ إقفال السنة المالية إلى الوراء.'; end if;
  if exists(select 1 from mawatheeq_private.acc_moves where state='draft' and date<=greatest(nullif(p_data->>'lockDate','')::date,nullif(p_data->>'fiscalLockDate','')::date)) then
   raise exception 'توجد قيود مسودة قبل تاريخ الإقفال؛ رحّلها أو ألغها أولاً.'; end if;
  update mawatheeq_private.acc_settings set lock_date=nullif(p_data->>'lockDate','')::date,fiscal_lock_date=nullif(p_data->>'fiscalLockDate','')::date,tax_lock_date=nullif(p_data->>'taxLockDate','')::date,
   fiscal_year_end=coalesce(nullif(p_data->>'fiscalYearEnd',''),'12-31'),revision=revision+1;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) select 'settings','00000000-0000-0000-0000-000000000000','save',to_jsonb(s),to_jsonb(x),actor from mawatheeq_private.acc_settings x;
  return '{}'::jsonb;
 when 'list_moves' then
  v_from:=nullif(p_data->>'from','')::date; v_to:=nullif(p_data->>'to','')::date;
  return jsonb_build_object('moves',(select coalesce(jsonb_agg(x order by (x->>'date') desc,x->>'name' desc),'[]') from (
   select jsonb_build_object('id',mv.id,'journalId',mv.journal_id,'name',mv.name,'moveType',mv.move_type,'state',mv.state,'date',mv.date,'ref',mv.ref,'partnerId',coalesce(mv.partner_id::text,''),'caseId',coalesce(mv.case_id,''),
    'amount',coalesce((select sum(debit) from mawatheeq_private.acc_move_lines where move_id=mv.id),0)::text,'reversedFrom',coalesce(mv.reversed_from::text,''),'revision',mv.revision) x
   from mawatheeq_private.acc_moves mv
   where (coalesce(p_data->>'journalId','')='' or mv.journal_id=(p_data->>'journalId')::uuid) and (coalesce(p_data->>'state','')='' or mv.state=p_data->>'state')
    and (v_from is null or mv.date>=v_from) and (v_to is null or mv.date<=v_to)
    and (coalesce(p_data->>'q','')='' or mawatheeq_private.normalized(mv.name||' '||mv.ref||' '||mv.narration||' '||coalesce((select p.name from mawatheeq_private.acc_partners p where p.id=mv.partner_id),'')) like '%'||mawatheeq_private.normalized(p_data->>'q')||'%')
   order by mv.date desc,mv.name desc limit 1000) t));
 when 'get_move' then
  result:=mawatheeq_private.acc_move_json((p_data->>'id')::uuid);
  if result is null then raise exception 'لم يعد هذا القيد موجوداً.'; end if;
  return result;
 when 'save_move' then
  l:=p_data->'move'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or jsonb_typeof(l)<>'object' or jsonb_typeof(l->'lines')<>'array' or jsonb_array_length(l->'lines')>500 then raise exception 'بيانات القيد غير صالحة.'; end if;
  select * into v_journal from mawatheeq_private.acc_journals where id=nullif(l->>'journalId','')::uuid;
  if v_journal.id is null or not v_journal.active then raise exception 'اختر دفتراً فعالاً.'; end if;
  if coalesce(l->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'اختر تاريخ القيد.'; end if;
  if (l->>'date')::date<=v_lock then raise exception 'تاريخ القيد ضمن فترة مقفلة (حتى %).',to_char(v_lock,'DD/MM/YYYY'); end if;
  if coalesce(l->>'partnerId','')<>'' and not exists(select 1 from mawatheeq_private.acc_partners where id=(l->>'partnerId')::uuid) then raise exception 'اختر شريكاً محفوظاً.'; end if;
  if coalesce(l->>'caseId','')<>'' and not exists(select 1 from public.mawatheeq_cases where id=l->>'caseId') then raise exception 'اختر قضية محفوظة.'; end if;
  if v_id is null then
   insert into mawatheeq_private.acc_moves(journal_id,date,ref,narration,partner_id,case_id,created_by,updated_by)
    values(v_journal.id,(l->>'date')::date,left(coalesce(l->>'ref',''),200),left(coalesce(l->>'narration',''),4000),nullif(l->>'partnerId','')::uuid,nullif(l->>'caseId',''),actor,actor) returning * into m;
  else
   select * into m from mawatheeq_private.acc_moves where id=v_id for update;
   if m.id is null then raise exception 'لم يعد هذا القيد موجوداً.'; end if;
   if m.revision<>coalesce((l->>'revision')::integer,0) then raise exception 'عُدّل القيد من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
   if m.state<>'draft' then raise exception 'القيد المرحّل لا يُعدّل؛ أعده إلى مسودة أولاً.'; end if;
   if m.journal_id<>v_journal.id and m.name<>'/' then raise exception 'لا يمكن نقل قيد مرقّم إلى دفتر آخر.'; end if;
   old:=mawatheeq_private.acc_move_json(m.id);
   update mawatheeq_private.acc_moves set journal_id=v_journal.id,date=(l->>'date')::date,ref=left(coalesce(l->>'ref',''),200),narration=left(coalesce(l->>'narration',''),4000),
    partner_id=nullif(l->>'partnerId','')::uuid,case_id=nullif(l->>'caseId',''),revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where id=m.id returning * into m;
   delete from mawatheeq_private.acc_move_lines where move_id=m.id;
  end if;
  i:=0;
  for result in select value from jsonb_array_elements(l->'lines') loop
   i:=i+1;
   if not exists(select 1 from mawatheeq_private.acc_accounts where id=nullif(result->>'accountId','')::uuid and not deprecated) then raise exception 'السطر %: اختر حساباً فعالاً.',i; end if;
   if coalesce(result->>'partnerId','')<>'' and not exists(select 1 from mawatheeq_private.acc_partners where id=(result->>'partnerId')::uuid) then raise exception 'السطر %: اختر شريكاً محفوظاً.',i; end if;
   if coalesce(result->>'caseId','')<>'' and not exists(select 1 from public.mawatheeq_cases where id=result->>'caseId') then raise exception 'السطر %: اختر قضية محفوظة.',i; end if;
   v_debit:=mawatheeq_private.acc_amount(result->>'debit'); v_credit:=mawatheeq_private.acc_amount(result->>'credit');
   if v_debit>0 and v_credit>0 then raise exception 'السطر %: إما مدين أو دائن، لا الاثنان.',i; end if;
   insert into mawatheeq_private.acc_move_lines(move_id,seq,account_id,partner_id,case_id,label,debit,credit,date_maturity)
    values(m.id,i,(result->>'accountId')::uuid,coalesce(nullif(result->>'partnerId','')::uuid,m.partner_id),coalesce(nullif(result->>'caseId',''),m.case_id),left(coalesce(result->>'label',''),300),v_debit,v_credit,nullif(result->>'dateMaturity','')::date);
  end loop;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('move',m.id,'save',old,mawatheeq_private.acc_move_json(m.id),actor);
  return mawatheeq_private.acc_move_json(m.id);
 when 'post','reset_draft','cancel','delete_move' then
  select * into m from mawatheeq_private.acc_moves where id=(p_data->>'id')::uuid for update;
  if m.id is null then raise exception 'لم يعد هذا القيد موجوداً.'; end if;
  if m.revision<>coalesce((p_data->>'revision')::integer,0) then raise exception 'عُدّل القيد من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
  if m.date<=v_lock then raise exception 'القيد ضمن فترة مقفلة (حتى %).',to_char(v_lock,'DD/MM/YYYY'); end if;
  old:=mawatheeq_private.acc_move_json(m.id);
  if p_action='post' then
   if m.state<>'draft' then raise exception 'رُحّل هذا القيد أو أُلغي من قبل.'; end if;
   select coalesce(sum(debit),0),coalesce(sum(credit),0) into v_debit,v_credit from mawatheeq_private.acc_move_lines where move_id=m.id;
   if (select count(*) from mawatheeq_private.acc_move_lines where move_id=m.id and (debit>0 or credit>0))<2 then raise exception 'يحتاج القيد سطرين على الأقل بمبالغ.'; end if;
   if v_debit<>v_credit then raise exception 'القيد غير متوازن: المدين % والدائن % (الفرق %).',v_debit,v_credit,abs(v_debit-v_credit); end if;
   if exists(select 1 from mawatheeq_private.acc_move_lines l join mawatheeq_private.acc_accounts x on x.id=l.account_id where l.move_id=m.id and x.deprecated) then raise exception 'في القيد حساب موقوف.'; end if;
   if m.name='/' then
    v_year:=extract(year from m.date)::integer;
    insert into mawatheeq_private.acc_sequences(journal_id,year,next) values(m.journal_id,v_year,2) on conflict(journal_id,year) do update set next=mawatheeq_private.acc_sequences.next+1 returning next-1 into v_seq;
    select * into v_journal from mawatheeq_private.acc_journals where id=m.journal_id;
    m.name:=v_journal.code||'/'||v_year||'/'||lpad(v_seq::text,4,'0');
   end if;
   update mawatheeq_private.acc_moves set state='posted',name=m.name,posted_at=clock_timestamp(),posted_by=actor,revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where id=m.id;
  elsif p_action='reset_draft' then
   if m.state not in ('posted','cancel') then raise exception 'القيد مسودة بالفعل.'; end if;
   if exists(select 1 from mawatheeq_private.acc_moves r where r.reversed_from=m.id and r.state='posted') then raise exception 'لهذا القيد قيد عكسي مرحّل؛ لا يُعاد إلى مسودة.'; end if;
   update mawatheeq_private.acc_moves set state='draft',revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where id=m.id;
  elsif p_action='cancel' then
   if m.state<>'draft' then raise exception 'يُلغى القيد وهو مسودة فقط؛ أعده إلى مسودة أو اعكسه.'; end if;
   update mawatheeq_private.acc_moves set state='cancel',revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where id=m.id;
  else
   if m.state='posted' or m.name<>'/' then raise exception 'لا يُحذف إلا قيد مسودة لم يُرقّم بعد؛ ألغِ القيد بدلاً من ذلك.'; end if;
   insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('move',m.id,'delete',old,'{}',actor);
   delete from mawatheeq_private.acc_moves where id=m.id;
   return '{}'::jsonb;
  end if;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('move',m.id,p_action,old,mawatheeq_private.acc_move_json(m.id),actor);
  return mawatheeq_private.acc_move_json(m.id);
 when 'reverse' then
  select * into m from mawatheeq_private.acc_moves where id=(p_data->>'id')::uuid for update;
  if m.id is null or m.state<>'posted' then raise exception 'يُعكس القيد المرحّل فقط.'; end if;
  if exists(select 1 from mawatheeq_private.acc_moves r where r.reversed_from=m.id and r.state<>'cancel') then raise exception 'عُكس هذا القيد من قبل.'; end if;
  if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (p_data->>'date')::date<=v_lock then raise exception 'اختر تاريخاً للقيد العكسي بعد تاريخ الإقفال.'; end if;
  insert into mawatheeq_private.acc_moves(journal_id,date,ref,narration,partner_id,case_id,reversed_from,created_by,updated_by)
   values(m.journal_id,(p_data->>'date')::date,left('عكس: '||m.name||case when coalesce(btrim(p_data->>'reason'),'')<>'' then ' — '||btrim(p_data->>'reason') else '' end,200),m.narration,m.partner_id,m.case_id,m.id,actor,actor) returning id into v_new;
  insert into mawatheeq_private.acc_move_lines(move_id,seq,account_id,partner_id,case_id,label,debit,credit,date_maturity)
   select v_new,seq,account_id,partner_id,case_id,label,credit,debit,date_maturity from mawatheeq_private.acc_move_lines where move_id=m.id;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('move',v_new,'reverse',null,mawatheeq_private.acc_move_json(v_new),actor);
  -- The reversal is posted at once.
  select revision into i from mawatheeq_private.acc_moves where id=v_new;
  return mawatheeq_private.books_request(p_token,'post',jsonb_build_object('id',v_new,'revision',i));
 when 'history' then
  return (select coalesce(jsonb_agg(jsonb_build_object('action',c.action,'at',c.created_at,'by',(select coalesce(nullif(a2.display_name,''),a2.username) from mawatheeq_private.accounts a2 where a2.id=c.actor_id)) order by c.id desc),'[]')
   from mawatheeq_private.acc_changes c where c.record_id=(p_data->>'id')::uuid);
 when 'trial_balance' then
  v_from:=nullif(p_data->>'from','')::date; v_to:=coalesce(nullif(p_data->>'to','')::date,'9999-12-31');
  return (select coalesce(jsonb_agg(t.row order by t.code),'[]') from (select x.code,jsonb_build_object('accountId',x.id,'code',x.code,'name',x.name,'type',x.type,
    'opening',coalesce(sum(l.debit-l.credit) filter (where v_from is not null and mv.date<v_from),0)::text,
    'debit',coalesce(sum(l.debit) filter (where v_from is null or mv.date>=v_from),0)::text,
    'credit',coalesce(sum(l.credit) filter (where v_from is null or mv.date>=v_from),0)::text,
    'balance',coalesce(sum(l.debit-l.credit),0)::text) row
   from mawatheeq_private.acc_accounts x join mawatheeq_private.acc_move_lines l on l.account_id=x.id join mawatheeq_private.acc_moves mv on mv.id=l.move_id and mv.state='posted' and mv.date<=v_to
   group by x.id,x.code,x.name,x.type) t);
 when 'general_ledger' then
  v_from:=nullif(p_data->>'from','')::date; v_to:=coalesce(nullif(p_data->>'to','')::date,'9999-12-31');
  return (select coalesce(jsonb_agg(jsonb_build_object('moveId',mv.id,'name',mv.name,'date',mv.date,'ref',mv.ref,'label',l.label,'accountId',l.account_id,'partnerId',coalesce(l.partner_id::text,''),
    'caseId',coalesce(l.case_id,''),'debit',l.debit::text,'credit',l.credit::text) order by x.code,mv.date,mv.name,l.seq),'[]')
   from mawatheeq_private.acc_move_lines l join mawatheeq_private.acc_moves mv on mv.id=l.move_id and mv.state='posted' join mawatheeq_private.acc_accounts x on x.id=l.account_id
   where (v_from is null or mv.date>=v_from) and mv.date<=v_to and (coalesce(p_data->>'accountId','')='' or l.account_id=(p_data->>'accountId')::uuid));
 else raise exception 'العملية المطلوبة غير متاحة.';
 end case;
end $$;

create function public.mawatheeq_books_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
begin perform mawatheeq_private.set_power(p_token,'books',p_action); return mawatheeq_private.books_request(p_token,p_action,p_data); end $$;

-- Changing the chart, the journals and the lock dates needs the settings power.
create or replace function mawatheeq_private.set_power(p_token text,p_fn text,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare v_power text;
begin
 v_power:=case p_fn
  when 'office' then case when p_action in ('context','create_member','reset_member_password','set_member_password','set_member_enabled','set_member_access',
    'access_history','rename_member','set_display_name','switch_user','account_history') then 'staff' when p_action='export_page' then 'backup' when p_action='review' then 'reviews' end
  when 'local' then case when p_action in ('import_cases','import_workbook','import_roll','save_rules') then 'settings' when p_action='save_case' then 'reviews' end
  when 'client' then case when p_action in ('list','merge') then 'settings' end
  when 'department' then case when p_action='backup_page' then 'backup' end
  when 'comment' then case when p_action='delete' then 'chat' end
  when 'chat' then case when p_action in ('summary','messages','file_download') then 'chat' end
  when 'books' then 'settings'
 end;
 if v_power is not null and exists(select 1 from mawatheeq_private.sessions where token_hash=extensions.digest(coalesce(p_token,''),'sha256') and impersonated_by is not null) then
  v_power:=null; end if;
 perform set_config('mawatheeq.power',coalesce(v_power,''),true);
end $$;

revoke all on function mawatheeq_private.acc_account_json(mawatheeq_private.acc_accounts),mawatheeq_private.acc_journal_json(mawatheeq_private.acc_journals),
 mawatheeq_private.acc_partner_json(mawatheeq_private.acc_partners),mawatheeq_private.acc_move_json(uuid),mawatheeq_private.acc_locked_until(boolean),mawatheeq_private.acc_amount(text),
 mawatheeq_private.books_request(text,text,jsonb),public.mawatheeq_books_request(text,text,jsonb),mawatheeq_private.set_power(text,text,text) from public,anon,authenticated;
grant execute on function mawatheeq_private.books_request(text,text,jsonb),public.mawatheeq_books_request(text,text,jsonb),mawatheeq_private.set_power(text,text,text) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
