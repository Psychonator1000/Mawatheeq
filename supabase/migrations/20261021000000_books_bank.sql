begin;
-- Books, phase 3 (21 October 2026): bank and cash.
-- * Bank and cash statements: entered by hand or imported from the bank's file, each with its opening and closing
--   balance. Every statement line is matched once: to open invoices and bills (it then pays them, any difference going
--   to a chosen account), to a payment already recorded in that journal, or straight to an account (bank charges,
--   owner drawings…). Matching can be undone; the entry it made is cancelled and the invoices reopen.
-- * Payment methods with cheque details; received and issued cheques followed from held to deposited and cleared, or
--   bounced (the payment is reversed and the invoice is open again).
-- * Transfers between bank and cash accounts, and batch payments: many invoices paid at once, one payment per partner,
--   grouped under one batch number for the deposit or transfer slip.
-- The phase 2 request function is kept and wrapped again.

create table mawatheeq_private.acc_statements (
 id uuid primary key default gen_random_uuid(),
 journal_id uuid not null references mawatheeq_private.acc_journals(id),
 name text not null check (length(btrim(name)) between 1 and 120),
 date date not null,
 balance_start numeric(18,3) not null default 0, balance_end_real numeric(18,3) not null default 0,
 note text not null default '', source_file text not null default '',
 revision integer not null default 1,
 created_by uuid not null references mawatheeq_private.accounts(id), created_at timestamptz not null default clock_timestamp()
);
create table mawatheeq_private.acc_statement_lines (
 id uuid primary key default gen_random_uuid(),
 statement_id uuid not null references mawatheeq_private.acc_statements(id) on delete cascade,
 seq integer not null default 0,
 date date not null,
 label text not null default '', ref text not null default '', partner_name text not null default '',
 partner_id uuid references mawatheeq_private.acc_partners(id),
 amount numeric(18,3) not null check (amount<>0),
 move_id uuid references mawatheeq_private.acc_moves(id),
 reconciled boolean not null default false
);
create index acc_statement_lines_open on mawatheeq_private.acc_statement_lines(statement_id) where not reconciled;
create table mawatheeq_private.acc_batches (
 id uuid primary key default gen_random_uuid(),
 name text not null unique, journal_id uuid not null references mawatheeq_private.acc_journals(id),
 batch_type text not null check (batch_type in ('inbound','outbound')), date date not null, method text not null default 'transfer',
 created_by uuid not null references mawatheeq_private.accounts(id), created_at timestamptz not null default clock_timestamp()
);
alter table mawatheeq_private.acc_moves add column payment_method text not null default 'transfer' check (payment_method in ('transfer','cash','cheque','knet','card')),
 add column cheque_number text not null default '', add column cheque_date date, add column cheque_bank text not null default '',
 add column cheque_state text check (cheque_state in ('held','deposited','cleared','bounced')),
 add column batch_id uuid references mawatheeq_private.acc_batches(id), add column statement_line_id uuid references mawatheeq_private.acc_statement_lines(id) on delete set null;
revoke all on mawatheeq_private.acc_statements,mawatheeq_private.acc_statement_lines,mawatheeq_private.acc_batches from public,anon,authenticated;

create function mawatheeq_private.acc_statement_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',st.id,'journalId',st.journal_id,'name',st.name,'date',st.date,'balanceStart',st.balance_start::text,'balanceEnd',st.balance_end_real::text,'note',st.note,
  'sourceFile',st.source_file,'revision',st.revision,
  'computedEnd',(st.balance_start+coalesce((select sum(amount) from mawatheeq_private.acc_statement_lines where statement_id=st.id),0))::text,
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',sl.id,'date',sl.date,'label',sl.label,'ref',sl.ref,'partnerName',sl.partner_name,'partnerId',coalesce(sl.partner_id::text,''),
    'amount',sl.amount::text,'reconciled',sl.reconciled,'moveId',coalesce(sl.move_id::text,''),'moveName',coalesce((select name from mawatheeq_private.acc_moves where id=sl.move_id),'')) order by sl.seq,sl.date)
   from mawatheeq_private.acc_statement_lines sl where sl.statement_id=st.id),'[]'))
 from mawatheeq_private.acc_statements st where st.id=p_id;
$$;
-- Writes a posted bank or cash entry: the journal's account against the counterpart lines given; returns its id.
create function mawatheeq_private.acc_post_entry(p_token text,p_journal uuid,p_date date,p_ref text,p_partner uuid,p_source text,p_bank numeric,p_lines jsonb) returns uuid language plpgsql set search_path='' as $$
declare v_move uuid; v_acc uuid; x jsonb; i integer:=1; v_rev integer;
begin
 select default_account into v_acc from mawatheeq_private.acc_journals where id=p_journal;
 insert into mawatheeq_private.acc_moves(journal_id,date,ref,partner_id,source,created_by,updated_by) values(p_journal,p_date,left(coalesce(p_ref,''),200),p_partner,p_source,auth.uid(),auth.uid()) returning id into v_move;
 insert into mawatheeq_private.acc_move_lines(move_id,seq,account_id,partner_id,label,debit,credit) values(v_move,1,v_acc,p_partner,left(coalesce(p_ref,''),300),greatest(p_bank,0),greatest(-p_bank,0));
 for x in select value from jsonb_array_elements(p_lines) loop
  i:=i+1;
  insert into mawatheeq_private.acc_move_lines(move_id,seq,account_id,partner_id,label,debit,credit,kind)
   values(v_move,i,(x->>'accountId')::uuid,coalesce(nullif(x->>'partnerId','')::uuid,p_partner),left(coalesce(nullif(x->>'label',''),p_ref,''),300),greatest((x->>'amount')::numeric,0),greatest(-(x->>'amount')::numeric,0),coalesce(nullif(x->>'kind',''),'line'));
 end loop;
 select revision into v_rev from mawatheeq_private.acc_moves where id=v_move;
 perform mawatheeq_private.books_request(p_token,'post',jsonb_build_object('id',v_move,'revision',v_rev));
 return v_move;
end $$;

-- Signed amounts for statement lines and balances (a minus sign for money going out).
create function mawatheeq_private.acc_amount_signed(v text) returns numeric language plpgsql immutable set search_path='' as $$
begin
 if coalesce(btrim(v),'')='' then return 0; end if;
 if btrim(v) ~ '^-' then return -mawatheeq_private.acc_amount(substr(btrim(v),2)); end if;
 return mawatheeq_private.acc_amount(v);
end $$;

alter function mawatheeq_private.acc_document_json(uuid) rename to acc_document_core_json;
-- The document view also shows how a payment was made.
create or replace function mawatheeq_private.acc_document_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select mawatheeq_private.acc_document_core_json(p_id)||coalesce((select jsonb_build_object('method',payment_method,'chequeNumber',cheque_number,'chequeDate',cheque_date,'chequeBank',cheque_bank,'chequeState',coalesce(cheque_state,''),
  'batch',coalesce((select name from mawatheeq_private.acc_batches where id=batch_id),''),'statementLine',coalesce(statement_line_id::text,'')) from mawatheeq_private.acc_moves where id=p_id),'{}');
$$;

alter function mawatheeq_private.books_request(text,text,jsonb) rename to books_request_inv;
create function mawatheeq_private.books_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; can_edit boolean; can_config boolean; v_lock date; result jsonb; l jsonb; x jsonb; v_id uuid; v_line mawatheeq_private.acc_statement_lines%rowtype;
 v_st mawatheeq_private.acc_statements%rowtype; j mawatheeq_private.acc_journals%rowtype; j2 mawatheeq_private.acc_journals%rowtype; s mawatheeq_private.acc_settings%rowtype;
 v_move uuid; v_rest numeric; v_take numeric; v_amount numeric; v_partner uuid; v_lines jsonb; v_pairs jsonb:='[]'; v_items uuid[]; r record; i integer; v_skipped integer:=0; v_added integer:=0;
 v_batch uuid; v_year integer; v_seq integer; v_prefix text; v_payments jsonb:='[]'; v_pay jsonb; v_rev integer;
begin
 if p_action not in ('setup','save_payment','register_payment','save_statement','list_statements','get_statement','delete_statement','reconcile_suggestions','reconcile_line','unreconcile_line',
  'transfer','batch_pay','list_batches','list_cheques','set_cheque') then return mawatheeq_private.books_request_inv(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
 perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'accounting') and a->>'caseScope'='all');
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>2000000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 can_edit:=coalesce((a->>'canEdit')::boolean,false); can_config:=mawatheeq_private.is_owner();
 v_lock:=coalesce(mawatheeq_private.acc_locked_until(can_config),'0001-01-01');
 if p_action in ('save_statement','delete_statement','reconcile_line','unreconcile_line','transfer','batch_pay','set_cheque') then perform mawatheeq_private.require_access(can_edit); end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select * into s from mawatheeq_private.acc_settings;
 case p_action
 when 'setup' then
  return mawatheeq_private.books_request_inv(p_token,'setup',p_data)||jsonb_build_object('bank',(select coalesce(jsonb_object_agg(jb.id,jsonb_build_object(
    'booksBalance',coalesce((select sum(ml.debit-ml.credit) from mawatheeq_private.acc_move_lines ml join mawatheeq_private.acc_moves mm on mm.id=ml.move_id where mm.state='posted' and ml.account_id=jb.default_account),0)::text,
    'statementBalance',coalesce((select (st.balance_end_real)::text from mawatheeq_private.acc_statements st where st.journal_id=jb.id order by st.date desc,st.created_at desc limit 1),''),
    'lastStatementDate',(select max(st.date) from mawatheeq_private.acc_statements st where st.journal_id=jb.id),
    'toReconcile',(select count(*) from mawatheeq_private.acc_statement_lines sl join mawatheeq_private.acc_statements st on st.id=sl.statement_id where st.journal_id=jb.id and not sl.reconciled),
    'chequesHeld',(select count(*) from mawatheeq_private.acc_moves mm where mm.journal_id=jb.id and mm.state='posted' and mm.payment_method='cheque' and mm.cheque_state in ('held','deposited')))),'{}')
   from mawatheeq_private.acc_journals jb where jb.type in ('bank','cash')));
 when 'save_payment','register_payment' then
  l:=case when p_action='save_payment' then p_data->'payment' else p_data end;
  if coalesce(nullif(l->>'method',''),'transfer') not in ('transfer','cash','cheque','knet','card') then raise exception 'طريقة الدفع غير صالحة.'; end if;
  if l->>'method'='cheque' and coalesce(btrim(l->>'chequeNumber'),'')='' then raise exception 'اكتب رقم الشيك.'; end if;
  result:=mawatheeq_private.books_request_inv(p_token,p_action,p_data);
  update mawatheeq_private.acc_moves set payment_method=coalesce(nullif(l->>'method',''),'transfer'),cheque_number=left(coalesce(l->>'chequeNumber',''),40),cheque_date=nullif(l->>'chequeDate','')::date,
   cheque_bank=left(coalesce(l->>'chequeBank',''),80),cheque_state=case when l->>'method'='cheque' then coalesce(cheque_state,'held') end where id=(result->>'id')::uuid;
  return mawatheeq_private.acc_document_json((result->>'id')::uuid)||(select jsonb_build_object('method',payment_method,'chequeNumber',cheque_number,'chequeDate',cheque_date,'chequeBank',cheque_bank,'chequeState',coalesce(cheque_state,''))
   from mawatheeq_private.acc_moves where id=(result->>'id')::uuid);
 when 'save_statement' then
  l:=p_data->'statement'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or jsonb_typeof(l->'lines')<>'array' or jsonb_array_length(l->'lines')>5000 then raise exception 'بيانات الكشف غير صالحة.'; end if;
  select * into j from mawatheeq_private.acc_journals where id=nullif(l->>'journalId','')::uuid;
  if j.id is null or j.type not in ('bank','cash') then raise exception 'اختر دفتر بنك أو صندوق.'; end if;
  if coalesce(l->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'اختر تاريخ الكشف.'; end if;
  if v_id is null then
   insert into mawatheeq_private.acc_statements(journal_id,name,date,balance_start,balance_end_real,note,source_file,created_by)
    values(j.id,coalesce(nullif(btrim(l->>'name'),''),'كشف '||to_char((l->>'date')::date,'DD/MM/YYYY')),(l->>'date')::date,mawatheeq_private.acc_amount_signed(l->>'balanceStart'),mawatheeq_private.acc_amount_signed(l->>'balanceEnd'),
     left(coalesce(l->>'note',''),1000),left(coalesce(l->>'sourceFile',''),200),actor) returning * into v_st;
  else
   select * into v_st from mawatheeq_private.acc_statements where id=v_id for update;
   if v_st.id is null then raise exception 'لم يعد هذا الكشف موجوداً.'; end if;
   if v_st.revision<>coalesce((l->>'revision')::integer,0) then raise exception 'عُدّل الكشف من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
   update mawatheeq_private.acc_statements set name=coalesce(nullif(btrim(l->>'name'),''),name),date=(l->>'date')::date,balance_start=mawatheeq_private.acc_amount_signed(l->>'balanceStart'),
    balance_end_real=mawatheeq_private.acc_amount_signed(l->>'balanceEnd'),note=left(coalesce(l->>'note',''),1000),revision=revision+1 where id=v_id returning * into v_st;
   -- Matched lines stay as they are; the others are replaced by the lines sent.
   delete from mawatheeq_private.acc_statement_lines where statement_id=v_id and not reconciled;
  end if;
  i:=coalesce((select max(seq) from mawatheeq_private.acc_statement_lines where statement_id=v_st.id),0);
  for x in select value from jsonb_array_elements(l->'lines') loop
   continue when coalesce(x->>'id','')<>'' and exists(select 1 from mawatheeq_private.acc_statement_lines where id=(x->>'id')::uuid and reconciled);
   if coalesce(x->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'السطر %: تاريخ غير صالح.',i+1; end if;
   v_amount:=mawatheeq_private.acc_amount_signed(x->>'amount');
   if v_amount=0 then v_skipped:=v_skipped+1; continue; end if;
   -- The same movement already in another statement of this journal is not added twice.
   if coalesce((p_data->>'skipDuplicates')::boolean,false) and exists(select 1 from mawatheeq_private.acc_statement_lines o join mawatheeq_private.acc_statements os on os.id=o.statement_id
     where os.journal_id=j.id and o.statement_id<>v_st.id and o.date=(x->>'date')::date and o.amount=v_amount and mawatheeq_private.normalized(o.label)=mawatheeq_private.normalized(coalesce(x->>'label',''))) then
    v_skipped:=v_skipped+1; continue; end if;
   v_partner:=nullif(x->>'partnerId','')::uuid;
   if v_partner is null and coalesce(btrim(x->>'partnerName'),'')<>'' then
    select id into v_partner from mawatheeq_private.acc_partners where mawatheeq_private.normalized(name)=mawatheeq_private.normalized(x->>'partnerName') limit 1; end if;
   i:=i+1; v_added:=v_added+1;
   insert into mawatheeq_private.acc_statement_lines(statement_id,seq,date,label,ref,partner_name,partner_id,amount)
    values(v_st.id,i,(x->>'date')::date,left(coalesce(x->>'label',''),300),left(coalesce(x->>'ref',''),100),left(coalesce(x->>'partnerName',''),200),v_partner,v_amount);
  end loop;
  return mawatheeq_private.acc_statement_json(v_st.id)||jsonb_build_object('added',v_added,'skipped',v_skipped);
 when 'list_statements' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',st.id,'journalId',st.journal_id,'name',st.name,'date',st.date,'balanceStart',st.balance_start::text,'balanceEnd',st.balance_end_real::text,
    'computedEnd',(st.balance_start+coalesce((select sum(amount) from mawatheeq_private.acc_statement_lines where statement_id=st.id),0))::text,
    'lines',(select count(*) from mawatheeq_private.acc_statement_lines where statement_id=st.id),'open',(select count(*) from mawatheeq_private.acc_statement_lines where statement_id=st.id and not reconciled))
    order by st.date desc,st.created_at desc),'[]') from mawatheeq_private.acc_statements st where coalesce(p_data->>'journalId','')='' or st.journal_id=(p_data->>'journalId')::uuid);
 when 'get_statement' then
  result:=mawatheeq_private.acc_statement_json((p_data->>'id')::uuid);
  if result is null then raise exception 'لم يعد هذا الكشف موجوداً.'; end if;
  return result;
 when 'delete_statement' then
  if exists(select 1 from mawatheeq_private.acc_statement_lines where statement_id=(p_data->>'id')::uuid and reconciled) then raise exception 'في الكشف سطور مطابقة؛ فك مطابقتها أولاً.'; end if;
  delete from mawatheeq_private.acc_statements where id=(p_data->>'id')::uuid;
  return '{}'::jsonb;
 when 'reconcile_suggestions' then
  select * into v_line from mawatheeq_private.acc_statement_lines where id=(p_data->>'lineId')::uuid;
  if v_line.id is null then raise exception 'لم يعد هذا السطر موجوداً.'; end if;
  select * into v_st from mawatheeq_private.acc_statements where id=v_line.statement_id;
  return jsonb_build_object(
   -- Open instalments on the side the money goes: money in pays customers' invoices (or a supplier's refund), money out pays bills.
   'items',(select coalesce(jsonb_agg(z.j order by z.score desc,z.d),'[]') from (select jsonb_build_object('lineId',ol.id,'moveId',om.id,'name',om.name,'date',om.date,'dueDate',ol.date_maturity,'partnerId',coalesce(ol.partner_id::text,''),
      'partner',coalesce((select name from mawatheeq_private.acc_partners where id=ol.partner_id),''),'residual',ol.amount_residual::text,'ref',om.ref) j,
      (case when ol.partner_id is not distinct from v_line.partner_id and v_line.partner_id is not null then 4 else 0 end)+(case when ol.amount_residual=abs(v_line.amount) then 3 else 0 end)
       +(case when om.name<>'/' and position(mawatheeq_private.normalized(om.name) in mawatheeq_private.normalized(v_line.label||' '||v_line.ref))>0 then 5 else 0 end)
       +(case when om.ref<>'' and position(mawatheeq_private.normalized(om.ref) in mawatheeq_private.normalized(v_line.label||' '||v_line.ref))>0 then 2 else 0 end) score,coalesce(ol.date_maturity,om.date) d
     from mawatheeq_private.acc_move_lines ol join mawatheeq_private.acc_moves om on om.id=ol.move_id
     where om.state='posted' and ol.amount_residual>0 and ol.account_id in (s.receivable_account,s.payable_account) and ((v_line.amount>0)=(ol.debit>0))
      and (v_line.partner_id is null or ol.partner_id=v_line.partner_id or ol.amount_residual=abs(v_line.amount) or (om.name<>'/' and position(mawatheeq_private.normalized(om.name) in mawatheeq_private.normalized(v_line.label||' '||v_line.ref))>0))
     order by 2 desc limit 40) z),
   -- Payments already recorded in this journal and not yet found on a statement.
   'payments',(select coalesce(jsonb_agg(jsonb_build_object('moveId',pm.id,'name',pm.name,'date',pm.date,'partner',coalesce((select name from mawatheeq_private.acc_partners where id=pm.partner_id),''),
     'amount',pm.amount_total::text,'method',pm.payment_method,'chequeNumber',pm.cheque_number) order by (pm.amount_total=abs(v_line.amount)) desc,abs(pm.date-v_line.date)),'[]')
    from mawatheeq_private.acc_moves pm where pm.journal_id=v_st.journal_id and pm.state='posted' and pm.payment_type=(case when v_line.amount>0 then 'inbound' else 'outbound' end) and pm.statement_line_id is null
     and not exists(select 1 from mawatheeq_private.acc_statement_lines sx where sx.move_id=pm.id)));
 when 'reconcile_line' then
  select * into v_line from mawatheeq_private.acc_statement_lines where id=(p_data->>'lineId')::uuid for update;
  if v_line.id is null then raise exception 'لم يعد هذا السطر موجوداً.'; end if;
  if v_line.reconciled then raise exception 'طوبق هذا السطر من قبل.'; end if;
  if v_line.date<=v_lock then raise exception 'تاريخ السطر ضمن فترة مقفلة (حتى %).',to_char(v_lock,'DD/MM/YYYY'); end if;
  select * into v_st from mawatheeq_private.acc_statements where id=v_line.statement_id;
  select * into j from mawatheeq_private.acc_journals where id=v_st.journal_id;
  if p_data->>'mode'='payment' then
   select id into v_move from mawatheeq_private.acc_moves where id=(p_data->>'paymentId')::uuid and journal_id=j.id and state='posted' and payment_type is not null and statement_line_id is null;
   if v_move is null then raise exception 'اختر دفعة مرحّلة في هذا الدفتر لم تُطابق بعد.'; end if;
   if (select amount_total*case when payment_type='inbound' then 1 else -1 end from mawatheeq_private.acc_moves where id=v_move)<>v_line.amount then raise exception 'مبلغ الدفعة لا يساوي مبلغ السطر.'; end if;
   update mawatheeq_private.acc_moves set statement_line_id=v_line.id,cheque_state=case when payment_method='cheque' then 'cleared' else cheque_state end where id=v_move;
  elsif p_data->>'mode'='items' then
   if jsonb_typeof(p_data->'itemLineIds')<>'array' or jsonb_array_length(p_data->'itemLineIds')=0 then raise exception 'اختر الفواتير المطابقة.'; end if;
   select array_agg(ol.id order by coalesce(ol.date_maturity,om.date),om.date) into v_items from mawatheeq_private.acc_move_lines ol join mawatheeq_private.acc_moves om on om.id=ol.move_id
    where ol.id in (select (y#>>'{}')::uuid from jsonb_array_elements(p_data->'itemLineIds') y) and om.state='posted' and ol.amount_residual>0 and ((v_line.amount>0)=(ol.debit>0));
   if v_items is null then raise exception 'الفواتير المختارة لم تعد مفتوحة.'; end if;
   if (select count(distinct partner_id) from mawatheeq_private.acc_move_lines where id=any(v_items))>1 then raise exception 'تُطابق في السطر الواحد فواتير شريك واحد.'; end if;
   select partner_id into v_partner from mawatheeq_private.acc_move_lines where id=v_items[1];
   v_rest:=abs(v_line.amount); v_lines:='[]';
   for r in select ol.id,ol.account_id,ol.amount_residual from mawatheeq_private.acc_move_lines ol where ol.id=any(v_items) order by array_position(v_items,ol.id) loop
    exit when v_rest<=0;
    v_take:=least(v_rest,r.amount_residual); v_rest:=v_rest-v_take;
    v_lines:=v_lines||jsonb_build_object('accountId',r.account_id,'amount',(-sign(v_line.amount)*v_take)::text,'label',v_line.label,'kind','payment','match',r.id);
   end loop;
   if v_rest>0 then
    if coalesce(p_data->>'writeoffAccountId','')<>'' then
     if not exists(select 1 from mawatheeq_private.acc_accounts where id=(p_data->>'writeoffAccountId')::uuid and not deprecated) then raise exception 'اختر حساب الفرق.'; end if;
     v_lines:=v_lines||jsonb_build_object('accountId',p_data->>'writeoffAccountId','amount',(-sign(v_line.amount)*v_rest)::text,'label',coalesce(nullif(p_data->>'writeoffLabel',''),'فرق مطابقة'));
    else -- What is left stays as the partner's credit (an advance).
     v_lines:=v_lines||jsonb_build_object('accountId',(v_lines->0->>'accountId'),'amount',(-sign(v_line.amount)*v_rest)::text,'label',v_line.label,'kind','payment');
    end if;
   end if;
   v_move:=mawatheeq_private.acc_post_entry(p_token,j.id,v_line.date,coalesce(nullif(v_line.label,''),v_line.ref),v_partner,'statement:'||v_line.id,v_line.amount,v_lines);
   for x in select value from jsonb_array_elements(v_lines) loop
    continue when x->>'match' is null;
    perform mawatheeq_private.acc_reconcile(array[(x->>'match')::uuid,(select ml.id from mawatheeq_private.acc_move_lines ml where ml.move_id=v_move and ml.kind='payment' and ml.account_id=(x->>'accountId')::uuid
     and abs(ml.debit-ml.credit)=abs((x->>'amount')::numeric) and ml.amount_residual>0 order by ml.seq limit 1)],actor);
   end loop;
   perform mawatheeq_private.acc_refresh_move(v_move);
  elsif p_data->>'mode'='account' then
   if not exists(select 1 from mawatheeq_private.acc_accounts where id=nullif(p_data->>'accountId','')::uuid and not deprecated) then raise exception 'اختر الحساب المقابل.'; end if;
   if (p_data->>'accountId')::uuid=j.default_account then raise exception 'اختر حساباً غير حساب البنك نفسه.'; end if;
   v_partner:=coalesce(nullif(p_data->>'partnerId','')::uuid,v_line.partner_id);
   v_move:=mawatheeq_private.acc_post_entry(p_token,j.id,v_line.date,coalesce(nullif(p_data->>'label',''),nullif(v_line.label,''),v_line.ref),v_partner,'statement:'||v_line.id,v_line.amount,
    jsonb_build_array(jsonb_build_object('accountId',p_data->>'accountId','amount',(-v_line.amount)::text,'label',coalesce(nullif(p_data->>'label',''),v_line.label))));
  else raise exception 'اختر طريقة المطابقة.';
  end if;
  update mawatheeq_private.acc_statement_lines set reconciled=true,move_id=v_move,partner_id=coalesce(partner_id,(select partner_id from mawatheeq_private.acc_moves where id=v_move)) where id=v_line.id;
  return mawatheeq_private.acc_statement_json(v_st.id);
 when 'unreconcile_line' then
  select * into v_line from mawatheeq_private.acc_statement_lines where id=(p_data->>'lineId')::uuid for update;
  if v_line.id is null or not v_line.reconciled then raise exception 'السطر غير مطابق.'; end if;
  if v_line.date<=v_lock then raise exception 'تاريخ السطر ضمن فترة مقفلة (حتى %).',to_char(v_lock,'DD/MM/YYYY'); end if;
  if exists(select 1 from mawatheeq_private.acc_moves where id=v_line.move_id and source='statement:'||v_line.id) then
   -- The entry the match made is cancelled (kept, numbered, for the record) and what it paid is open again.
   perform mawatheeq_private.acc_unreconcile_move(v_line.move_id);
   update mawatheeq_private.acc_moves set state='cancel',revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where id=v_line.move_id;
   perform mawatheeq_private.acc_refresh_move(v_line.move_id);
   insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('move',v_line.move_id,'cancel',null,jsonb_build_object('statementLine',v_line.id),actor);
  else
   update mawatheeq_private.acc_moves set statement_line_id=null where id=v_line.move_id;
  end if;
  update mawatheeq_private.acc_statement_lines set reconciled=false,move_id=null where id=v_line.id;
  return mawatheeq_private.acc_statement_json(v_line.statement_id);
 when 'transfer' then
  select * into j from mawatheeq_private.acc_journals where id=nullif(p_data->>'fromJournalId','')::uuid and type in ('bank','cash') and active;
  select * into j2 from mawatheeq_private.acc_journals where id=nullif(p_data->>'toJournalId','')::uuid and type in ('bank','cash') and active;
  if j.id is null or j2.id is null or j.id=j2.id then raise exception 'اختر حسابين مختلفين للتحويل.'; end if;
  v_amount:=mawatheeq_private.acc_amount(p_data->>'amount');
  if v_amount<=0 then raise exception 'اكتب مبلغ التحويل.'; end if;
  if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (p_data->>'date')::date<=v_lock then raise exception 'اختر تاريخاً بعد تاريخ الإقفال.'; end if;
  v_move:=mawatheeq_private.acc_post_entry(p_token,j.id,(p_data->>'date')::date,coalesce(nullif(btrim(p_data->>'ref'),''),'تحويل إلى '||j2.name),null,'transfer',-v_amount,
   jsonb_build_array(jsonb_build_object('accountId',j2.default_account,'amount',v_amount::text,'label','تحويل من '||j.name)));
  return mawatheeq_private.acc_document_json(v_move);
 when 'batch_pay' then
  if jsonb_typeof(p_data->'moveIds')<>'array' or jsonb_array_length(p_data->'moveIds') not between 1 and 300 then raise exception 'اختر المستندات المراد دفعها.'; end if;
  select * into j from mawatheeq_private.acc_journals where id=nullif(p_data->>'journalId','')::uuid and type in ('bank','cash') and active;
  if j.id is null then raise exception 'اختر دفتر بنك أو صندوق فعالاً.'; end if;
  if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (p_data->>'date')::date<=v_lock then raise exception 'اختر تاريخ دفع بعد تاريخ الإقفال.'; end if;
  if (select count(distinct case when move_type in ('out_invoice','in_refund') then 'in' else 'out' end) from mawatheeq_private.acc_moves
   where id in (select (y#>>'{}')::uuid from jsonb_array_elements(p_data->'moveIds') y))>1 then raise exception 'ادفع فواتير العملاء وفواتير الموردين في دفعتين منفصلتين.'; end if;
  v_prefix:=case when (select move_type from mawatheeq_private.acc_moves where id=(p_data->'moveIds'->>0)::uuid) in ('out_invoice','in_refund') then 'BIN' else 'BOUT' end;
  v_year:=extract(year from (p_data->>'date')::date)::integer;
  insert into mawatheeq_private.acc_sequences_prefixed(journal_id,year,prefix,next) values(j.id,v_year,v_prefix,2) on conflict(journal_id,year,prefix) do update set next=mawatheeq_private.acc_sequences_prefixed.next+1 returning next-1 into v_seq;
  insert into mawatheeq_private.acc_batches(name,journal_id,batch_type,date,method,created_by) values(v_prefix||'/'||j.code||'/'||v_year||'/'||lpad(v_seq::text,4,'0'),j.id,case when v_prefix='BIN' then 'inbound' else 'outbound' end,
   (p_data->>'date')::date,coalesce(nullif(p_data->>'method',''),'transfer'),actor) returning id into v_batch;
  for r in select mm.partner_id,jsonb_agg(mm.id) ids from mawatheeq_private.acc_moves mm where mm.id in (select (y#>>'{}')::uuid from jsonb_array_elements(p_data->'moveIds') y)
    and mm.state='posted' and mm.amount_residual>0 and mm.move_type in ('out_invoice','out_refund','in_invoice','in_refund') group by mm.partner_id loop
   v_pay:=mawatheeq_private.books_request(p_token,'register_payment',jsonb_build_object('moveIds',r.ids,'journalId',j.id,'date',p_data->>'date','method',coalesce(nullif(p_data->>'method',''),'transfer'),'ref',coalesce(p_data->>'ref','')));
   update mawatheeq_private.acc_moves set batch_id=v_batch where id=(v_pay->>'id')::uuid;
   v_payments:=v_payments||jsonb_build_object('id',v_pay->>'id','name',v_pay->>'name','partnerId',v_pay->>'partnerId','amount',v_pay->>'amountTotal');
  end loop;
  if jsonb_array_length(v_payments)=0 then raise exception 'لا يوجد مبلغ مستحق في المستندات المختارة.'; end if;
  return jsonb_build_object('id',v_batch,'name',(select name from mawatheeq_private.acc_batches where id=v_batch),'payments',v_payments);
 when 'list_batches' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'journalId',b.journal_id,'type',b.batch_type,'date',b.date,'method',b.method,
    'payments',(select coalesce(jsonb_agg(jsonb_build_object('id',pm.id,'name',pm.name,'state',pm.state,'partner',coalesce((select name from mawatheeq_private.acc_partners where id=pm.partner_id),''),'amount',pm.amount_total::text) order by pm.name),'[]')
     from mawatheeq_private.acc_moves pm where pm.batch_id=b.id),
    'total',(select coalesce(sum(amount_total),0) from mawatheeq_private.acc_moves where batch_id=b.id and state='posted')::text) order by b.date desc,b.name desc),'[]') from mawatheeq_private.acc_batches b);
 when 'list_cheques' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',pm.id,'name',pm.name,'date',pm.date,'paymentType',pm.payment_type,'partner',coalesce((select name from mawatheeq_private.acc_partners where id=pm.partner_id),''),
    'amount',pm.amount_total::text,'chequeNumber',pm.cheque_number,'chequeDate',pm.cheque_date,'chequeBank',pm.cheque_bank,'chequeState',coalesce(pm.cheque_state,''),'journalId',pm.journal_id) order by coalesce(pm.cheque_date,pm.date)),'[]')
   from mawatheeq_private.acc_moves pm where pm.payment_method='cheque' and pm.state='posted' and (coalesce(p_data->>'state','')='' or pm.cheque_state=p_data->>'state'));
 when 'set_cheque' then
  select id into v_move from mawatheeq_private.acc_moves where id=(p_data->>'id')::uuid and payment_method='cheque' and state='posted';
  if v_move is null then raise exception 'لم يعد هذا الشيك موجوداً.'; end if;
  if coalesce(p_data->>'state','') not in ('held','deposited','cleared','bounced') then raise exception 'حالة الشيك غير صالحة.'; end if;
  if (select cheque_state from mawatheeq_private.acc_moves where id=v_move)='bounced' then raise exception 'الشيك المرتجع لا تتغير حالته؛ سجّل دفعة جديدة.'; end if;
  if p_data->>'state'='bounced' then
   -- A bounced cheque reverses its payment, so the invoices it paid are open again.
   if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (p_data->>'date')::date<=v_lock then raise exception 'اختر تاريخ الارتجاع بعد تاريخ الإقفال.'; end if;
   perform mawatheeq_private.books_request(p_token,'reverse',jsonb_build_object('id',v_move,'date',p_data->>'date','reason','شيك مرتجع'));
  end if;
  update mawatheeq_private.acc_moves set cheque_state=p_data->>'state' where id=v_move;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('move',v_move,'cheque_'||(p_data->>'state'),null,null,actor);
  return jsonb_build_object('id',v_move,'chequeState',p_data->>'state');
 end case;
end $$;


revoke all on function mawatheeq_private.acc_statement_json(uuid),mawatheeq_private.acc_document_core_json(uuid),mawatheeq_private.acc_document_json(uuid),mawatheeq_private.acc_post_entry(text,uuid,date,text,uuid,text,numeric,jsonb),mawatheeq_private.acc_amount_signed(text),
 mawatheeq_private.books_request(text,text,jsonb),mawatheeq_private.books_request_inv(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.books_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
