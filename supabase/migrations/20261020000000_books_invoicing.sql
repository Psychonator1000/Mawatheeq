begin;
-- Books, phase 2 (20 October 2026): customer invoices, vendor bills, credit notes, payment terms, services and payments.
-- * An invoice or bill is a journal entry built from its service lines: each line goes to its income or expense account
--   and the total to the receivable or payable account, split by the payment term into dated instalments. It is
--   numbered when confirmed (INV/2026/0001; credit notes RINV/2026/0001).
-- * A payment is an entry in a bank or cash journal (PBNK1/2026/0001) against the receivable or payable account. Payments
--   are matched to instalments in part or in full; what is left open shows on each line and on the invoice
--   (not paid / partly paid / paid / reversed). A payment larger than the invoice leaves an outstanding credit that
--   can be applied to another invoice of the same partner.
-- * The entries of the old simple ledger are moved into the books once, on request: fees become customer invoices,
--   receipts customer payments matched to the oldest open invoices, and expenses vendor bills paid at once.
-- The phase 1 request function is kept and wrapped: posting, resetting and reversing still go through it.

alter table mawatheeq_private.acc_settings add column receivable_account uuid references mawatheeq_private.acc_accounts(id),
 add column payable_account uuid references mawatheeq_private.acc_accounts(id), add column invoice_note text not null default '';
update mawatheeq_private.acc_settings set receivable_account=(select id from mawatheeq_private.acc_accounts where code='121000'),
 payable_account=(select id from mawatheeq_private.acc_accounts where code='211000');

create table mawatheeq_private.acc_payment_terms (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (length(btrim(name)) between 1 and 120),
 lines jsonb not null check (jsonb_typeof(lines)='array' and jsonb_array_length(lines) between 1 and 12),
 note text not null default '', active boolean not null default true, revision integer not null default 1
);
insert into mawatheeq_private.acc_payment_terms(name,lines) values
 ('فوري','[{"kind":"balance","days":0}]'),('15 يوماً','[{"kind":"balance","days":15}]'),('30 يوماً','[{"kind":"balance","days":30}]'),
 ('نصف مقدماً والباقي بعد 30 يوماً','[{"kind":"percent","percent":50,"days":0},{"kind":"balance","days":30}]');
create table mawatheeq_private.acc_products (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (length(btrim(name)) between 1 and 160),
 income_account uuid references mawatheeq_private.acc_accounts(id), expense_account uuid references mawatheeq_private.acc_accounts(id),
 sale_price numeric(18,3) not null default 0 check (sale_price>=0), purchase_price numeric(18,3) not null default 0 check (purchase_price>=0),
 description text not null default '', active boolean not null default true, revision integer not null default 1
);
insert into mawatheeq_private.acc_products(name,income_account,expense_account) values
 ('أتعاب محاماة',(select id from mawatheeq_private.acc_accounts where code='401000'),null),
 ('أتعاب تحصيل',(select id from mawatheeq_private.acc_accounts where code='402000'),null),
 ('أتعاب استشارة',(select id from mawatheeq_private.acc_accounts where code='403000'),null),
 ('رسوم محكمة مستردة من الموكل',(select id from mawatheeq_private.acc_accounts where code='133000'),(select id from mawatheeq_private.acc_accounts where code='504000')),
 ('إيجار المكتب',null,(select id from mawatheeq_private.acc_accounts where code='502000')),
 ('قرطاسية ولوازم',null,(select id from mawatheeq_private.acc_accounts where code='505000'));

alter table mawatheeq_private.acc_moves add column invoice_date_due date, add column payment_term_id uuid references mawatheeq_private.acc_payment_terms(id),
 add column payment_type text check (payment_type in ('inbound','outbound')), add column partner_type text check (partner_type in ('customer','vendor')),
 add column amount_total numeric(18,3) not null default 0, add column amount_residual numeric(18,3) not null default 0,
 add column payment_state text not null default 'n/a' check (payment_state in ('n/a','not_paid','partial','paid','reversed'));
alter table mawatheeq_private.acc_move_lines add column kind text not null default 'line' check (kind in ('line','product','term','payment')),
 add column product_id uuid references mawatheeq_private.acc_products(id), add column quantity numeric(18,3) not null default 1,
 add column price_unit numeric(18,3) not null default 0, add column discount numeric(6,2) not null default 0 check (discount between 0 and 100),
 add column amount_residual numeric(18,3) not null default 0, add column reconciled boolean not null default false;
create index acc_move_lines_open on mawatheeq_private.acc_move_lines(account_id,partner_id) where amount_residual>0;
create table mawatheeq_private.acc_partials (
 id uuid primary key default gen_random_uuid(),
 debit_line uuid not null references mawatheeq_private.acc_move_lines(id) on delete cascade,
 credit_line uuid not null references mawatheeq_private.acc_move_lines(id) on delete cascade,
 amount numeric(18,3) not null check (amount>0),
 created_by uuid not null references mawatheeq_private.accounts(id), created_at timestamptz not null default clock_timestamp()
);
create index acc_partials_debit on mawatheeq_private.acc_partials(debit_line);
create index acc_partials_credit on mawatheeq_private.acc_partials(credit_line);
create table mawatheeq_private.acc_sequences_prefixed (journal_id uuid not null references mawatheeq_private.acc_journals(id), year integer not null, prefix text not null, next integer not null default 1, primary key(journal_id,year,prefix));
revoke all on mawatheeq_private.acc_payment_terms,mawatheeq_private.acc_products,mawatheeq_private.acc_partials,mawatheeq_private.acc_sequences_prefixed from public,anon,authenticated;

-- What is still open on a line of a reconcilable account, and on the invoice or payment that holds it.
create function mawatheeq_private.acc_refresh_line(p_line uuid) returns void language sql set search_path='' as $$
 update mawatheeq_private.acc_move_lines l set amount_residual=x.res,reconciled=x.rec and x.res=0
 from (select l2.id,a.reconcile rec,case when a.reconcile and m.state='posted' then greatest(abs(l2.debit-l2.credit)-coalesce((select sum(p.amount) from mawatheeq_private.acc_partials p where p.debit_line=l2.id or p.credit_line=l2.id),0),0) else 0 end res
  from mawatheeq_private.acc_move_lines l2 join mawatheeq_private.acc_accounts a on a.id=l2.account_id join mawatheeq_private.acc_moves m on m.id=l2.move_id where l2.id=p_line) x
 where l.id=x.id;
$$;
create function mawatheeq_private.acc_refresh_move(p_move uuid) returns void language plpgsql set search_path='' as $$
declare v_line uuid; tot numeric; res numeric; m mawatheeq_private.acc_moves%rowtype; reversed boolean;
begin
 for v_line in select id from mawatheeq_private.acc_move_lines where move_id=p_move loop perform mawatheeq_private.acc_refresh_line(v_line); end loop;
 select * into m from mawatheeq_private.acc_moves where id=p_move;
 select coalesce(sum(abs(debit-credit)),0),coalesce(sum(amount_residual),0) into tot,res from mawatheeq_private.acc_move_lines where move_id=p_move and kind in ('term','payment');
 if m.state<>'posted' then res:=tot; end if;
 -- An invoice settled only by its own credit notes is reversed rather than paid.
 select exists(select 1 from mawatheeq_private.acc_partials p join mawatheeq_private.acc_move_lines a on a.id in (p.debit_line,p.credit_line) and a.move_id=p_move
   join mawatheeq_private.acc_move_lines b on b.id in (p.debit_line,p.credit_line) and b.id<>a.id)
  and not exists(select 1 from mawatheeq_private.acc_partials p join mawatheeq_private.acc_move_lines a on a.id in (p.debit_line,p.credit_line) and a.move_id=p_move
   join mawatheeq_private.acc_move_lines b on b.id in (p.debit_line,p.credit_line) and b.id<>a.id join mawatheeq_private.acc_moves o on o.id=b.move_id where o.reversed_from is distinct from p_move) into reversed;
 update mawatheeq_private.acc_moves set amount_total=tot,amount_residual=res,payment_state=case
   when move_type='entry' and payment_type is null then 'n/a' when state<>'posted' or tot=0 then 'not_paid'
   when res=0 then case when reversed and move_type in ('out_invoice','in_invoice') then 'reversed' else 'paid' end when res<tot then 'partial' else 'not_paid' end
 where id=p_move;
end $$;
-- Match open debit and credit lines of one account and partner, oldest due first; returns the amount matched.
create function mawatheeq_private.acc_reconcile(p_lines uuid[],p_actor uuid) returns numeric language plpgsql set search_path='' as $$
declare d record; c record; amt numeric; total numeric:=0; v_move uuid;
begin
 if (select count(distinct account_id) from mawatheeq_private.acc_move_lines where id=any(p_lines))>1
  or (select count(distinct coalesce(partner_id::text,'')) from mawatheeq_private.acc_move_lines where id=any(p_lines))>1 then
  raise exception 'لا تُطابق إلا حركات الحساب نفسه والشريك نفسه.'; end if;
 if exists(select 1 from mawatheeq_private.acc_move_lines l join mawatheeq_private.acc_moves m on m.id=l.move_id join mawatheeq_private.acc_accounts a on a.id=l.account_id
  where l.id=any(p_lines) and (m.state<>'posted' or not a.reconcile)) then raise exception 'لا يُطابق إلا قيد مرحّل على حساب يسمح بالمطابقة.'; end if;
 loop
  select l.id,l.amount_residual res into d from mawatheeq_private.acc_move_lines l join mawatheeq_private.acc_moves m on m.id=l.move_id
   where l.id=any(p_lines) and l.debit>0 and l.amount_residual>0 order by coalesce(l.date_maturity,m.date),m.date,l.seq limit 1;
  select l.id,l.amount_residual res into c from mawatheeq_private.acc_move_lines l join mawatheeq_private.acc_moves m on m.id=l.move_id
   where l.id=any(p_lines) and l.credit>0 and l.amount_residual>0 order by coalesce(l.date_maturity,m.date),m.date,l.seq limit 1;
  exit when d.id is null or c.id is null;
  amt:=least(d.res,c.res);
  insert into mawatheeq_private.acc_partials(debit_line,credit_line,amount,created_by) values(d.id,c.id,amt,p_actor);
  perform mawatheeq_private.acc_refresh_line(d.id); perform mawatheeq_private.acc_refresh_line(c.id);
  total:=total+amt; d:=null; c:=null;
 end loop;
 for v_move in select distinct move_id from mawatheeq_private.acc_move_lines where id=any(p_lines) loop perform mawatheeq_private.acc_refresh_move(v_move); end loop;
 return total;
end $$;
-- Undo every match touching an entry (before it is reset to draft or reversed).
create function mawatheeq_private.acc_unreconcile_move(p_move uuid) returns void language plpgsql set search_path='' as $$
declare v_moves uuid[];
begin
 select array_agg(distinct l.move_id) into v_moves from mawatheeq_private.acc_partials p join mawatheeq_private.acc_move_lines l on l.id in (p.debit_line,p.credit_line)
  where p.debit_line in (select id from mawatheeq_private.acc_move_lines where move_id=p_move) or p.credit_line in (select id from mawatheeq_private.acc_move_lines where move_id=p_move);
 delete from mawatheeq_private.acc_partials where debit_line in (select id from mawatheeq_private.acc_move_lines where move_id=p_move) or credit_line in (select id from mawatheeq_private.acc_move_lines where move_id=p_move);
 perform mawatheeq_private.acc_refresh_move(x) from unnest(coalesce(v_moves,array[p_move])) x;
end $$;

-- Writes an invoice's service lines and its dated instalments on the receivable or payable account.
create function mawatheeq_private.acc_write_invoice_lines(p_move uuid,p_lines jsonb) returns void language plpgsql set search_path='' as $$
declare m mawatheeq_private.acc_moves%rowtype; s mawatheeq_private.acc_settings%rowtype; l jsonb; t jsonb; i integer:=0; n integer; k integer:=0;
 v_qty numeric; v_price numeric; v_disc numeric; v_sub numeric; v_total numeric:=0; v_rest numeric; v_amt numeric; v_acc uuid; v_prod mawatheeq_private.acc_products%rowtype;
 product_debit boolean; term_acc uuid; terms jsonb; v_due date; v_last date;
begin
 select * into m from mawatheeq_private.acc_moves where id=p_move; select * into s from mawatheeq_private.acc_settings;
 product_debit:=m.move_type in ('in_invoice','out_refund');
 term_acc:=case when m.move_type in ('out_invoice','out_refund') then s.receivable_account else s.payable_account end;
 if term_acc is null then raise exception 'حدد حساب الذمم المدينة والدائنة في إعدادات الفوترة.'; end if;
 delete from mawatheeq_private.acc_move_lines where move_id=p_move;
 for l in select value from jsonb_array_elements(p_lines) loop
  i:=i+1;
  v_prod:=null;
  if coalesce(l->>'productId','')<>'' then select * into v_prod from mawatheeq_private.acc_products where id=(l->>'productId')::uuid;
   if v_prod.id is null then raise exception 'السطر %: اختر خدمة محفوظة.',i; end if; end if;
  v_qty:=case when coalesce(btrim(l->>'quantity'),'')='' then 1 else mawatheeq_private.acc_amount(l->>'quantity') end;
  v_price:=mawatheeq_private.acc_amount(l->>'priceUnit');
  v_disc:=coalesce(nullif(btrim(l->>'discount'),'')::numeric,0);
  if v_disc<0 or v_disc>100 then raise exception 'السطر %: الخصم بين 0 و100٪.',i; end if;
  v_sub:=round(v_qty*v_price*(1-v_disc/100),3);
  if v_sub=0 and coalesce(btrim(l->>'label'),'')='' and v_prod.id is null then continue; end if;
  if m.move_type in ('in_invoice','in_refund') then v_acc:=coalesce(nullif(l->>'accountId','')::uuid,v_prod.expense_account); else v_acc:=coalesce(nullif(l->>'accountId','')::uuid,v_prod.income_account); end if;
  if v_acc is null or not exists(select 1 from mawatheeq_private.acc_accounts where id=v_acc and not deprecated) then raise exception 'السطر %: اختر حساباً فعالاً.',i; end if;
  if coalesce(l->>'caseId','')<>'' and not exists(select 1 from public.mawatheeq_cases where id=l->>'caseId') then raise exception 'السطر %: اختر قضية محفوظة.',i; end if;
  k:=k+1;
  insert into mawatheeq_private.acc_move_lines(move_id,seq,kind,account_id,partner_id,case_id,label,product_id,quantity,price_unit,discount,debit,credit)
   values(p_move,k,'product',v_acc,m.partner_id,coalesce(nullif(l->>'caseId',''),m.case_id),left(coalesce(nullif(btrim(l->>'label'),''),v_prod.name,''),300),v_prod.id,v_qty,v_price,v_disc,
    case when product_debit then v_sub else 0 end,case when product_debit then 0 else v_sub end);
  v_total:=v_total+v_sub;
 end loop;
 if v_total<=0 then raise exception 'أضف بنداً واحداً على الأقل بمبلغ.'; end if;
 select lines into terms from mawatheeq_private.acc_payment_terms where id=m.payment_term_id;
 terms:=coalesce(terms,jsonb_build_array(jsonb_build_object('kind','balance','days',greatest(coalesce(m.invoice_date_due,m.date)-m.date,0))));
 n:=jsonb_array_length(terms); v_rest:=v_total; i:=0;
 for t in select value from jsonb_array_elements(terms) loop
  i:=i+1;
  v_amt:=case when t->>'kind'='percent' and i<n then least(round(v_total*(t->>'percent')::numeric/100,3),v_rest) else v_rest end;
  v_rest:=v_rest-v_amt; v_due:=m.date+coalesce((t->>'days')::integer,0); v_last:=greatest(v_last,v_due);
  if v_amt>0 then k:=k+1;
   insert into mawatheeq_private.acc_move_lines(move_id,seq,kind,account_id,partner_id,case_id,label,debit,credit,date_maturity)
    values(p_move,k,'term',term_acc,m.partner_id,m.case_id,case when n>1 then 'الدفعة '||i||' من '||n else 'المستحق' end,case when product_debit then 0 else v_amt end,case when product_debit then v_amt else 0 end,v_due);
  end if;
 end loop;
 update mawatheeq_private.acc_moves set invoice_date_due=v_last where id=p_move;
 perform mawatheeq_private.acc_refresh_move(p_move);
end $$;

-- A payment entry: the bank or cash account against the receivable or payable account.
create function mawatheeq_private.acc_write_payment_lines(p_move uuid,p_amount numeric) returns void language plpgsql set search_path='' as $$
declare m mawatheeq_private.acc_moves%rowtype; s mawatheeq_private.acc_settings%rowtype; j mawatheeq_private.acc_journals%rowtype; v_acc uuid; inbound boolean;
begin
 select * into m from mawatheeq_private.acc_moves where id=p_move; select * into s from mawatheeq_private.acc_settings; select * into j from mawatheeq_private.acc_journals where id=m.journal_id;
 if j.type not in ('bank','cash') or j.default_account is null then raise exception 'اختر دفتر بنك أو صندوق له حساب.'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'اكتب مبلغ الدفعة.'; end if;
 v_acc:=case when m.partner_type='vendor' then s.payable_account else s.receivable_account end; inbound:=m.payment_type='inbound';
 delete from mawatheeq_private.acc_move_lines where move_id=p_move;
 insert into mawatheeq_private.acc_move_lines(move_id,seq,kind,account_id,partner_id,case_id,label,debit,credit) values
  (p_move,1,'line',j.default_account,m.partner_id,m.case_id,coalesce(nullif(m.ref,''),case when inbound then 'مقبوضات' else 'مدفوعات' end),case when inbound then p_amount else 0 end,case when inbound then 0 else p_amount end),
  (p_move,2,'payment',v_acc,m.partner_id,m.case_id,coalesce(nullif(m.ref,''),case when inbound then 'مقبوضات' else 'مدفوعات' end),case when inbound then 0 else p_amount end,case when inbound then p_amount else 0 end);
 perform mawatheeq_private.acc_refresh_move(p_move);
end $$;

-- An invoice, bill or payment with everything the screens show: lines with their quantities and what is open,
-- the payments matched to it, and the partner's open credits it can still use.
create function mawatheeq_private.acc_document_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select mawatheeq_private.acc_move_json(m.id)||jsonb_build_object('invoiceDateDue',m.invoice_date_due,'paymentTermId',coalesce(m.payment_term_id::text,''),
  'paymentType',coalesce(m.payment_type,''),'partnerType',coalesce(m.partner_type,''),'amountTotal',m.amount_total::text,'amountResidual',m.amount_residual::text,'paymentState',m.payment_state,
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'kind',l.kind,'accountId',l.account_id,'partnerId',coalesce(l.partner_id::text,''),'caseId',coalesce(l.case_id,''),'label',l.label,
    'productId',coalesce(l.product_id::text,''),'quantity',l.quantity::text,'priceUnit',l.price_unit::text,'discount',l.discount::text,'debit',l.debit::text,'credit',l.credit::text,
    'dateMaturity',l.date_maturity,'residual',l.amount_residual::text,'reconciled',l.reconciled) order by l.seq) from mawatheeq_private.acc_move_lines l where l.move_id=m.id),'[]'),
  'matches',coalesce((select jsonb_agg(jsonb_build_object('partialId',p.id,'amount',p.amount::text,'moveId',o.id,'name',o.name,'date',o.date,'moveType',o.move_type,'paymentType',coalesce(o.payment_type,'')) order by o.date,o.name)
    from mawatheeq_private.acc_partials p join mawatheeq_private.acc_move_lines a on a.id in (p.debit_line,p.credit_line) and a.move_id=m.id
    join mawatheeq_private.acc_move_lines b on b.id in (p.debit_line,p.credit_line) and b.id<>a.id join mawatheeq_private.acc_moves o on o.id=b.move_id),'[]'),
  'outstanding',case when m.state='posted' and m.amount_residual>0 then coalesce((select jsonb_agg(jsonb_build_object('lineId',o.id,'moveId',om.id,'name',om.name,'date',om.date,'amount',o.amount_residual::text) order by om.date)
    from mawatheeq_private.acc_move_lines o join mawatheeq_private.acc_moves om on om.id=o.move_id
    where om.id<>m.id and om.state='posted' and o.amount_residual>0 and o.partner_id is not distinct from m.partner_id
     and exists(select 1 from mawatheeq_private.acc_move_lines t where t.move_id=m.id and t.kind in ('term','payment') and t.amount_residual>0 and t.account_id=o.account_id and (t.debit>0)<>(o.debit>0))),'[]') else '[]' end)
 from mawatheeq_private.acc_moves m where m.id=p_id;
$$;

-- Phase 2 requests; everything else goes to the phase 1 function.
alter function mawatheeq_private.books_request(text,text,jsonb) rename to books_request_core;
create function mawatheeq_private.books_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; can_edit boolean; can_config boolean; v_lock date; l jsonb; v_id uuid; m mawatheeq_private.acc_moves%rowtype; j mawatheeq_private.acc_journals%rowtype;
 s mawatheeq_private.acc_settings%rowtype; old jsonb; result jsonb; v_prefix text; v_year integer; v_seq integer; v_lines uuid[]; v_amount numeric; v_signed numeric; v_new uuid;
 r record; v_partner uuid; v_counts jsonb:='{}'; v_rev integer;
begin
 if p_action not in ('setup','get_move','post','reset_draft','cancel','reverse','save_move','save_invoice','save_payment','register_payment','credit_note','add_outstanding','remove_partial',
  'list_documents','save_term','save_product','save_invoicing','convert_ledger') then return mawatheeq_private.books_request_core(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
 perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'accounting') and a->>'caseScope'='all');
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>500000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 can_edit:=coalesce((a->>'canEdit')::boolean,false); can_config:=mawatheeq_private.is_owner();
 v_lock:=coalesce(mawatheeq_private.acc_locked_until(can_config),'0001-01-01');
 if p_action in ('save_invoice','save_payment','register_payment','credit_note','add_outstanding','remove_partial','save_product') then perform mawatheeq_private.require_access(can_edit); end if;
 if p_action in ('save_term','save_invoicing','convert_ledger') then perform mawatheeq_private.require_access(can_edit and can_config); end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select * into s from mawatheeq_private.acc_settings;
 case p_action
 when 'setup' then
  return mawatheeq_private.books_request_core(p_token,'setup',p_data)||jsonb_build_object(
   'paymentTerms',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'lines',t.lines,'note',t.note,'active',t.active,'revision',t.revision) order by t.name),'[]') from mawatheeq_private.acc_payment_terms t),
   'products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'incomeAccount',coalesce(p.income_account::text,''),'expenseAccount',coalesce(p.expense_account::text,''),
     'salePrice',p.sale_price::text,'purchasePrice',p.purchase_price::text,'description',p.description,'active',p.active,'revision',p.revision) order by p.name),'[]') from mawatheeq_private.acc_products p),
   'invoicing',jsonb_build_object('receivableAccount',coalesce(s.receivable_account::text,''),'payableAccount',coalesce(s.payable_account::text,''),'invoiceNote',s.invoice_note,'revision',s.revision),
   'documentStats',(select jsonb_object_agg(k,jsonb_build_object('draft',(select count(*) from mawatheeq_private.acc_moves where move_type=k and state='draft'),
     'open',(select count(*) from mawatheeq_private.acc_moves where move_type=k and state='posted' and amount_residual>0),
     'openAmount',(select coalesce(sum(amount_residual),0) from mawatheeq_private.acc_moves where move_type=k and state='posted')::text,
     'late',(select count(*) from mawatheeq_private.acc_moves where move_type=k and state='posted' and amount_residual>0 and invoice_date_due<(now() at time zone 'Asia/Kuwait')::date),
     'lateAmount',(select coalesce(sum(amount_residual),0) from mawatheeq_private.acc_moves where move_type=k and state='posted' and amount_residual>0 and invoice_date_due<(now() at time zone 'Asia/Kuwait')::date)::text))
    from unnest(array['out_invoice','out_refund','in_invoice','in_refund']) k),
   'partnerBalances',(select coalesce(jsonb_object_agg(x.pid,jsonb_build_object('receivable',x.rec::text,'payable',x.pay::text)),'{}') from (
     select bl.partner_id pid,sum(case when bl.account_id=s.receivable_account then (case when bl.debit>0 then 1 else -1 end)*bl.amount_residual else 0 end) rec,
      sum(case when bl.account_id=s.payable_account then (case when bl.credit>0 then 1 else -1 end)*bl.amount_residual else 0 end) pay
     from mawatheeq_private.acc_move_lines bl where bl.amount_residual>0 and bl.partner_id is not null group by bl.partner_id) x));
 when 'get_move' then
  result:=mawatheeq_private.acc_document_json((p_data->>'id')::uuid);
  if result is null then raise exception 'لم يعد هذا القيد موجوداً.'; end if;
  return result;
 when 'save_move' then
  if coalesce(p_data->'move'->>'id','')<>'' and exists(select 1 from mawatheeq_private.acc_moves where id=(p_data->'move'->>'id')::uuid and (move_type<>'entry' or payment_type is not null)) then
   raise exception 'هذا القيد فاتورة أو دفعة؛ عدّله من شاشتها.'; end if;
  return mawatheeq_private.books_request_core(p_token,p_action,p_data);
 when 'post' then
  select * into m from mawatheeq_private.acc_moves where id=(p_data->>'id')::uuid;
  if m.id is null then raise exception 'لم يعد هذا القيد موجوداً.'; end if;
  if m.state='draft' and (m.move_type<>'entry' or m.payment_type is not null) then
   if m.partner_id is null then raise exception 'اختر % قبل التأكيد.',case when m.partner_type='vendor' or m.move_type in ('in_invoice','in_refund') then 'المورد' else 'العميل' end; end if;
   if m.date<=v_lock then raise exception 'تاريخ المستند ضمن فترة مقفلة (حتى %).',to_char(v_lock,'DD/MM/YYYY'); end if;
   if m.name='/' and (m.move_type in ('out_refund','in_refund') or m.payment_type is not null) then
    v_prefix:=case when m.payment_type is not null then 'P' else 'R' end; v_year:=extract(year from m.date)::integer;
    insert into mawatheeq_private.acc_sequences_prefixed(journal_id,year,prefix,next) values(m.journal_id,v_year,v_prefix,2)
     on conflict(journal_id,year,prefix) do update set next=mawatheeq_private.acc_sequences_prefixed.next+1 returning next-1 into v_seq;
    update mawatheeq_private.acc_moves set name=v_prefix||(select code from mawatheeq_private.acc_journals where id=m.journal_id)||'/'||v_year||'/'||lpad(v_seq::text,4,'0') where id=m.id;
   end if;
  end if;
  perform mawatheeq_private.books_request_core(p_token,'post',p_data);
  perform mawatheeq_private.acc_refresh_move(m.id);
  -- A credit note made from an invoice settles it as far as it goes.
  if m.reversed_from is not null and m.move_type in ('out_refund','in_refund') then
   select array_agg(id) into v_lines from mawatheeq_private.acc_move_lines where kind='term' and amount_residual>0 and move_id in (m.id,m.reversed_from);
   if coalesce(array_length(v_lines,1),0)>1 and (select count(distinct account_id) from mawatheeq_private.acc_move_lines where id=any(v_lines))=1
    and (select count(distinct coalesce(partner_id::text,'')) from mawatheeq_private.acc_move_lines where id=any(v_lines))=1 then perform mawatheeq_private.acc_reconcile(v_lines,actor); end if;
  end if;
  return mawatheeq_private.acc_document_json(m.id);
 when 'reset_draft','cancel' then
  select * into m from mawatheeq_private.acc_moves where id=(p_data->>'id')::uuid;
  if m.id is not null and m.date>v_lock and m.state='posted' and p_action='reset_draft' and not exists(select 1 from mawatheeq_private.acc_moves rv where rv.reversed_from=m.id and rv.state='posted' and rv.move_type='entry') then
   perform mawatheeq_private.acc_unreconcile_move(m.id); end if;
  perform mawatheeq_private.books_request_core(p_token,p_action,p_data);
  perform mawatheeq_private.acc_refresh_move(m.id);
  return mawatheeq_private.acc_document_json(m.id);
 when 'reverse' then
  select * into m from mawatheeq_private.acc_moves where id=(p_data->>'id')::uuid;
  if m.move_type<>'entry' then raise exception 'تُعكس الفاتورة بإشعار دائن.'; end if;
  if m.id is not null and m.state='posted' and m.date>v_lock then perform mawatheeq_private.acc_unreconcile_move(m.id); end if;
  result:=mawatheeq_private.books_request_core(p_token,'reverse',p_data);
  v_new:=(result->>'id')::uuid;
  -- The reversal settles the original on every reconcilable account.
  for r in select o.id oid,n.id nid from mawatheeq_private.acc_move_lines o join mawatheeq_private.acc_move_lines n on n.move_id=v_new and n.seq=o.seq
   join mawatheeq_private.acc_accounts x on x.id=o.account_id where o.move_id=m.id and x.reconcile loop
   perform mawatheeq_private.acc_reconcile(array[r.oid,r.nid],actor);
  end loop;
  perform mawatheeq_private.acc_refresh_move(m.id); perform mawatheeq_private.acc_refresh_move(v_new);
  return mawatheeq_private.acc_document_json(v_new);
 when 'save_invoice' then
  l:=p_data->'invoice'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or jsonb_typeof(l)<>'object' or jsonb_typeof(l->'lines')<>'array' or jsonb_array_length(l->'lines')>300 then raise exception 'بيانات الفاتورة غير صالحة.'; end if;
  if coalesce(l->>'moveType','') not in ('out_invoice','out_refund','in_invoice','in_refund') then raise exception 'نوع المستند غير صالح.'; end if;
  select * into j from mawatheeq_private.acc_journals where id=nullif(l->>'journalId','')::uuid;
  if j.id is null or not j.active or j.type<>(case when l->>'moveType' in ('out_invoice','out_refund') then 'sale' else 'purchase' end) then
   raise exception 'اختر دفتر % فعالاً.',case when l->>'moveType' in ('out_invoice','out_refund') then 'المبيعات' else 'المشتريات' end; end if;
  if coalesce(l->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'اختر تاريخ الفاتورة.'; end if;
  if (l->>'date')::date<=v_lock then raise exception 'تاريخ الفاتورة ضمن فترة مقفلة (حتى %).',to_char(v_lock,'DD/MM/YYYY'); end if;
  if coalesce(l->>'dueDate','')<>'' and (l->>'dueDate')::date<(l->>'date')::date then raise exception 'تاريخ الاستحقاق قبل تاريخ الفاتورة.'; end if;
  if coalesce(l->>'partnerId','')<>'' and not exists(select 1 from mawatheeq_private.acc_partners where id=(l->>'partnerId')::uuid) then raise exception 'اختر شريكاً محفوظاً.'; end if;
  if coalesce(l->>'caseId','')<>'' and not exists(select 1 from public.mawatheeq_cases where id=l->>'caseId') then raise exception 'اختر قضية محفوظة.'; end if;
  if coalesce(l->>'paymentTermId','')<>'' and not exists(select 1 from mawatheeq_private.acc_payment_terms where id=(l->>'paymentTermId')::uuid) then raise exception 'اختر شرط دفع محفوظاً.'; end if;
  if v_id is null then
   insert into mawatheeq_private.acc_moves(journal_id,move_type,date,ref,narration,partner_id,case_id,invoice_date_due,payment_term_id,created_by,updated_by,payment_state)
    values(j.id,l->>'moveType',(l->>'date')::date,left(coalesce(l->>'ref',''),200),left(coalesce(l->>'narration',''),4000),nullif(l->>'partnerId','')::uuid,nullif(l->>'caseId',''),
     nullif(l->>'dueDate','')::date,nullif(l->>'paymentTermId','')::uuid,actor,actor,'not_paid') returning * into m;
  else
   select * into m from mawatheeq_private.acc_moves where id=v_id for update;
   if m.id is null then raise exception 'لم يعد هذا المستند موجوداً.'; end if;
   if m.revision<>coalesce((l->>'revision')::integer,0) then raise exception 'عُدّل المستند من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
   if m.state<>'draft' then raise exception 'المستند المؤكد لا يُعدّل؛ أعده إلى مسودة أولاً.'; end if;
   if m.move_type<>l->>'moveType' then raise exception 'لا يتغير نوع المستند بعد إنشائه.'; end if;
   if m.journal_id<>j.id and m.name<>'/' then raise exception 'لا يمكن نقل مستند مرقّم إلى دفتر آخر.'; end if;
   old:=mawatheeq_private.acc_document_json(m.id);
   update mawatheeq_private.acc_moves set journal_id=j.id,date=(l->>'date')::date,ref=left(coalesce(l->>'ref',''),200),narration=left(coalesce(l->>'narration',''),4000),
    partner_id=nullif(l->>'partnerId','')::uuid,case_id=nullif(l->>'caseId',''),invoice_date_due=nullif(l->>'dueDate','')::date,payment_term_id=nullif(l->>'paymentTermId','')::uuid,
    revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where id=m.id returning * into m;
  end if;
  perform mawatheeq_private.acc_write_invoice_lines(m.id,l->'lines');
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('move',m.id,'save',old,mawatheeq_private.acc_document_json(m.id),actor);
  return mawatheeq_private.acc_document_json(m.id);
 when 'save_payment' then
  l:=p_data->'payment'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or jsonb_typeof(l)<>'object' then raise exception 'بيانات الدفعة غير صالحة.'; end if;
  if coalesce(l->>'paymentType','') not in ('inbound','outbound') or coalesce(l->>'partnerType','') not in ('customer','vendor') then raise exception 'حدد نوع الدفعة.'; end if;
  select * into j from mawatheeq_private.acc_journals where id=nullif(l->>'journalId','')::uuid;
  if j.id is null or not j.active or j.type not in ('bank','cash') then raise exception 'اختر دفتر بنك أو صندوق فعالاً.'; end if;
  if coalesce(l->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'اختر تاريخ الدفعة.'; end if;
  if (l->>'date')::date<=v_lock then raise exception 'تاريخ الدفعة ضمن فترة مقفلة (حتى %).',to_char(v_lock,'DD/MM/YYYY'); end if;
  if coalesce(l->>'partnerId','')<>'' and not exists(select 1 from mawatheeq_private.acc_partners where id=(l->>'partnerId')::uuid) then raise exception 'اختر شريكاً محفوظاً.'; end if;
  if coalesce(l->>'caseId','')<>'' and not exists(select 1 from public.mawatheeq_cases where id=l->>'caseId') then raise exception 'اختر قضية محفوظة.'; end if;
  v_amount:=mawatheeq_private.acc_amount(l->>'amount');
  if v_id is null then
   insert into mawatheeq_private.acc_moves(journal_id,date,ref,narration,partner_id,case_id,payment_type,partner_type,created_by,updated_by,payment_state)
    values(j.id,(l->>'date')::date,left(coalesce(l->>'ref',''),200),left(coalesce(l->>'narration',''),4000),nullif(l->>'partnerId','')::uuid,nullif(l->>'caseId',''),l->>'paymentType',l->>'partnerType',actor,actor,'not_paid') returning * into m;
  else
   select * into m from mawatheeq_private.acc_moves where id=v_id for update;
   if m.id is null or m.payment_type is null then raise exception 'لم تعد هذه الدفعة موجودة.'; end if;
   if m.revision<>coalesce((l->>'revision')::integer,0) then raise exception 'عُدّلت الدفعة من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
   if m.state<>'draft' then raise exception 'الدفعة المرحّلة لا تُعدّل؛ أعدها إلى مسودة أولاً.'; end if;
   if m.journal_id<>j.id and m.name<>'/' then raise exception 'لا يمكن نقل دفعة مرقّمة إلى دفتر آخر.'; end if;
   old:=mawatheeq_private.acc_document_json(m.id);
   update mawatheeq_private.acc_moves set journal_id=j.id,date=(l->>'date')::date,ref=left(coalesce(l->>'ref',''),200),narration=left(coalesce(l->>'narration',''),4000),partner_id=nullif(l->>'partnerId','')::uuid,
    case_id=nullif(l->>'caseId',''),payment_type=l->>'paymentType',partner_type=l->>'partnerType',revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where id=m.id returning * into m;
  end if;
  perform mawatheeq_private.acc_write_payment_lines(m.id,v_amount);
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('move',m.id,'save',old,mawatheeq_private.acc_document_json(m.id),actor);
  return mawatheeq_private.acc_document_json(m.id);
 when 'register_payment' then
  if jsonb_typeof(p_data->'moveIds')<>'array' or jsonb_array_length(p_data->'moveIds') not between 1 and 100 then raise exception 'اختر الفواتير المراد دفعها.'; end if;
  select array_agg(l2.id),sum(l2.amount_residual*case when l2.debit>0 then 1 else -1 end) into v_lines,v_signed from mawatheeq_private.acc_move_lines l2 join mawatheeq_private.acc_moves m2 on m2.id=l2.move_id
   where m2.id in (select (x#>>'{}')::uuid from jsonb_array_elements(p_data->'moveIds') x) and m2.state='posted' and l2.kind='term' and l2.amount_residual>0;
  if v_lines is null or v_signed=0 then raise exception 'لا يوجد مبلغ مستحق في المستندات المختارة.'; end if;
  if (select count(distinct coalesce(partner_id::text,'')) from mawatheeq_private.acc_move_lines where id=any(v_lines))>1 or (select count(distinct account_id) from mawatheeq_private.acc_move_lines where id=any(v_lines))>1 then
   raise exception 'تُدفع معاً مستندات الشريك نفسه فقط.'; end if;
  v_amount:=coalesce(mawatheeq_private.acc_amount(nullif(p_data->>'amount','')),abs(v_signed));
  if v_amount=0 then v_amount:=abs(v_signed); end if;
  select * into j from mawatheeq_private.acc_journals where id=nullif(p_data->>'journalId','')::uuid;
  if j.id is null or not j.active or j.type not in ('bank','cash') then raise exception 'اختر دفتر بنك أو صندوق فعالاً.'; end if;
  if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (p_data->>'date')::date<=v_lock then raise exception 'اختر تاريخ دفع بعد تاريخ الإقفال.'; end if;
  select partner_id into v_partner from mawatheeq_private.acc_move_lines where id=v_lines[1];
  insert into mawatheeq_private.acc_moves(journal_id,date,ref,narration,partner_id,case_id,payment_type,partner_type,created_by,updated_by,payment_state)
   values(j.id,(p_data->>'date')::date,left(coalesce(nullif(btrim(p_data->>'ref'),''),(select string_agg(name,'، ' order by name) from mawatheeq_private.acc_moves where id in (select move_id from mawatheeq_private.acc_move_lines where id=any(v_lines)))),200),'',
    v_partner,(select case when count(distinct case_id)=1 then max(case_id) end from mawatheeq_private.acc_moves where id in (select move_id from mawatheeq_private.acc_move_lines where id=any(v_lines))),
    case when v_signed>0 then 'inbound' else 'outbound' end,case when (select account_id from mawatheeq_private.acc_move_lines where id=v_lines[1])=s.payable_account then 'vendor' else 'customer' end,actor,actor,'not_paid') returning * into m;
  perform mawatheeq_private.acc_write_payment_lines(m.id,v_amount);
  select revision into v_rev from mawatheeq_private.acc_moves where id=m.id;
  perform mawatheeq_private.books_request(p_token,'post',jsonb_build_object('id',m.id,'revision',v_rev));
  perform mawatheeq_private.acc_reconcile(v_lines||(select id from mawatheeq_private.acc_move_lines where move_id=m.id and kind='payment'),actor);
  return mawatheeq_private.acc_document_json(m.id);
 when 'credit_note' then
  select * into m from mawatheeq_private.acc_moves where id=(p_data->>'id')::uuid;
  if m.id is null or m.state<>'posted' or m.move_type not in ('out_invoice','in_invoice') then raise exception 'يُنشأ الإشعار الدائن من فاتورة مؤكدة.'; end if;
  if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (p_data->>'date')::date<=v_lock then raise exception 'اختر تاريخاً للإشعار بعد تاريخ الإقفال.'; end if;
  insert into mawatheeq_private.acc_moves(journal_id,move_type,date,ref,narration,partner_id,case_id,reversed_from,created_by,updated_by,payment_state)
   values(m.journal_id,case when m.move_type='out_invoice' then 'out_refund' else 'in_refund' end,(p_data->>'date')::date,
    left('إشعار دائن: '||m.name||case when coalesce(btrim(p_data->>'reason'),'')<>'' then ' — '||btrim(p_data->>'reason') else '' end,200),m.narration,m.partner_id,m.case_id,m.id,actor,actor,'not_paid') returning id into v_new;
  perform mawatheeq_private.acc_write_invoice_lines(v_new,(select jsonb_agg(jsonb_build_object('productId',coalesce(product_id::text,''),'label',label,'accountId',account_id,'quantity',quantity::text,
   'priceUnit',price_unit::text,'discount',discount::text,'caseId',coalesce(case_id,'')) order by seq) from mawatheeq_private.acc_move_lines where move_id=m.id and kind='product'));
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('move',v_new,'credit_note',null,mawatheeq_private.acc_document_json(v_new),actor);
  if coalesce((p_data->>'post')::boolean,false) then
   select revision into v_rev from mawatheeq_private.acc_moves where id=v_new;
   return mawatheeq_private.books_request(p_token,'post',jsonb_build_object('id',v_new,'revision',v_rev));
  end if;
  return mawatheeq_private.acc_document_json(v_new);
 when 'add_outstanding' then
  select * into m from mawatheeq_private.acc_moves where id=(p_data->>'id')::uuid;
  if m.id is null or m.state<>'posted' then raise exception 'المستند غير مؤكد.'; end if;
  select array_agg(t.id) into v_lines from mawatheeq_private.acc_move_lines t join mawatheeq_private.acc_move_lines o on o.id=(p_data->>'lineId')::uuid and o.account_id=t.account_id and (o.debit>0)<>(t.debit>0)
   where t.move_id=m.id and t.kind in ('term','payment') and t.amount_residual>0;
  if v_lines is null then raise exception 'لا يمكن مطابقة هذه الحركة مع المستند.'; end if;
  perform mawatheeq_private.acc_reconcile(v_lines||(p_data->>'lineId')::uuid,actor);
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('move',m.id,'match',null,jsonb_build_object('lineId',p_data->>'lineId'),actor);
  return mawatheeq_private.acc_document_json(m.id);
 when 'remove_partial' then
  select array_agg(distinct l2.move_id) into v_lines from mawatheeq_private.acc_partials p join mawatheeq_private.acc_move_lines l2 on l2.id in (p.debit_line,p.credit_line) where p.id=(p_data->>'partialId')::uuid;
  if v_lines is null then raise exception 'لم تعد هذه المطابقة موجودة.'; end if;
  if exists(select 1 from mawatheeq_private.acc_moves where id=any(v_lines) and date<=v_lock) then raise exception 'المطابقة تخص مستنداً ضمن فترة مقفلة.'; end if;
  delete from mawatheeq_private.acc_partials where id=(p_data->>'partialId')::uuid;
  perform mawatheeq_private.acc_refresh_move(x) from unnest(v_lines) x;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) select 'move',x,'unmatch',null,null,actor from unnest(v_lines) x;
  return mawatheeq_private.acc_document_json(coalesce(nullif(p_data->>'id','')::uuid,v_lines[1]));
 when 'list_documents' then
  return jsonb_build_object('documents',(select coalesce(jsonb_agg(x order by (x->>'date') desc,x->>'name' desc),'[]') from (
   select jsonb_build_object('id',m2.id,'journalId',m2.journal_id,'name',m2.name,'moveType',m2.move_type,'paymentType',coalesce(m2.payment_type,''),'partnerType',coalesce(m2.partner_type,''),'state',m2.state,'date',m2.date,
    'dueDate',m2.invoice_date_due,'ref',m2.ref,'partnerId',coalesce(m2.partner_id::text,''),'caseId',coalesce(m2.case_id,''),'amountTotal',m2.amount_total::text,'amountResidual',m2.amount_residual::text,
    'paymentState',m2.payment_state,'reversedFrom',coalesce(m2.reversed_from::text,''),'revision',m2.revision) x
   from mawatheeq_private.acc_moves m2
   where (case p_data->>'kind' when 'customer_payment' then m2.payment_type is not null and m2.partner_type='customer' when 'vendor_payment' then m2.payment_type is not null and m2.partner_type='vendor'
     else m2.move_type=p_data->>'kind' end)
    and (coalesce(p_data->>'state','')='' or m2.state=p_data->>'state') and (coalesce(p_data->>'paymentState','')='' or m2.payment_state=p_data->>'paymentState')
    and (coalesce(p_data->>'partnerId','')='' or m2.partner_id=(p_data->>'partnerId')::uuid)
    and (coalesce(p_data->>'overdue','')='' or (m2.state='posted' and m2.amount_residual>0 and m2.invoice_date_due<(now() at time zone 'Asia/Kuwait')::date))
    and (coalesce(p_data->>'from','')='' or m2.date>=(p_data->>'from')::date) and (coalesce(p_data->>'to','')='' or m2.date<=(p_data->>'to')::date)
    and (coalesce(p_data->>'q','')='' or mawatheeq_private.normalized(m2.name||' '||m2.ref||' '||coalesce((select p.name from mawatheeq_private.acc_partners p where p.id=m2.partner_id),'')) like '%'||mawatheeq_private.normalized(p_data->>'q')||'%')
   order by m2.date desc,m2.name desc limit 1000) t));
 when 'save_term' then
  l:=p_data->'term'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or length(btrim(coalesce(l->>'name',''))) not between 1 and 120 then raise exception 'اكتب اسم شرط الدفع.'; end if;
  if jsonb_typeof(l->'lines')<>'array' or jsonb_array_length(l->'lines') not between 1 and 12 then raise exception 'أضف دفعة واحدة على الأقل.'; end if;
  if (select count(*) from jsonb_array_elements(l->'lines') x where x->>'kind'='balance')<>1 or (l->'lines'->-1->>'kind')<>'balance' then raise exception 'آخر دفعة هي «الباقي»، ولا تتكرر.'; end if;
  if exists(select 1 from jsonb_array_elements(l->'lines') x where coalesce(x->>'kind','') not in ('balance','percent') or coalesce(x->>'days','') !~ '^\d{1,4}$'
   or (x->>'kind'='percent' and (coalesce(x->>'percent','') !~ '^\d{1,3}(\.\d{1,2})?$' or (x->>'percent')::numeric not between 0.01 and 99.99))) then raise exception 'راجع الدفعات: نسبة بين 0 و100 وعدد أيام صحيح.'; end if;
  if (select coalesce(sum((x->>'percent')::numeric),0) from jsonb_array_elements(l->'lines') x where x->>'kind'='percent')>=100 then raise exception 'مجموع النسب يجب أن يكون أقل من 100٪ ليبقى «الباقي».'; end if;
  if exists(select 1 from mawatheeq_private.acc_payment_terms where name=btrim(l->>'name') and id is distinct from v_id) then raise exception 'يوجد شرط دفع بهذا الاسم.'; end if;
  if v_id is null then insert into mawatheeq_private.acc_payment_terms(name,lines,note) values(btrim(l->>'name'),l->'lines',left(coalesce(l->>'note',''),500)) returning id into v_id;
  else
   if (select revision from mawatheeq_private.acc_payment_terms where id=v_id) is distinct from coalesce((l->>'revision')::integer,0) then raise exception 'عُدّل شرط الدفع من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
   update mawatheeq_private.acc_payment_terms set name=btrim(l->>'name'),lines=l->'lines',note=left(coalesce(l->>'note',''),500),active=coalesce((l->>'active')::boolean,true),revision=revision+1 where id=v_id;
  end if;
  return jsonb_build_object('id',v_id);
 when 'save_product' then
  l:=p_data->'product'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or length(btrim(coalesce(l->>'name',''))) not between 1 and 160 then raise exception 'اكتب اسم الخدمة.'; end if;
  if exists(select 1 from mawatheeq_private.acc_products where name=btrim(l->>'name') and id is distinct from v_id) then raise exception 'توجد خدمة بهذا الاسم.'; end if;
  if coalesce(l->>'incomeAccount','')='' and coalesce(l->>'expenseAccount','')='' then raise exception 'اختر حساب الإيراد أو حساب المصروف.'; end if;
  if exists(select 1 from unnest(array[nullif(l->>'incomeAccount',''),nullif(l->>'expenseAccount','')]) x where x is not null and not exists(select 1 from mawatheeq_private.acc_accounts where id=x::uuid and not deprecated)) then raise exception 'اختر حساباً فعالاً.'; end if;
  if v_id is null then insert into mawatheeq_private.acc_products(name,income_account,expense_account,sale_price,purchase_price,description)
   values(btrim(l->>'name'),nullif(l->>'incomeAccount','')::uuid,nullif(l->>'expenseAccount','')::uuid,mawatheeq_private.acc_amount(l->>'salePrice'),mawatheeq_private.acc_amount(l->>'purchasePrice'),left(coalesce(l->>'description',''),1000)) returning id into v_id;
  else
   if (select revision from mawatheeq_private.acc_products where id=v_id) is distinct from coalesce((l->>'revision')::integer,0) then raise exception 'عُدّلت الخدمة من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
   update mawatheeq_private.acc_products set name=btrim(l->>'name'),income_account=nullif(l->>'incomeAccount','')::uuid,expense_account=nullif(l->>'expenseAccount','')::uuid,sale_price=mawatheeq_private.acc_amount(l->>'salePrice'),
    purchase_price=mawatheeq_private.acc_amount(l->>'purchasePrice'),description=left(coalesce(l->>'description',''),1000),active=coalesce((l->>'active')::boolean,true),revision=revision+1 where id=v_id;
  end if;
  return jsonb_build_object('id',v_id);
 when 'save_invoicing' then
  if s.revision<>coalesce((p_data->>'revision')::integer,0) then raise exception 'عُدّلت الإعدادات من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
  if not exists(select 1 from mawatheeq_private.acc_accounts where id=nullif(p_data->>'receivableAccount','')::uuid and type='asset_receivable' and reconcile)
   or not exists(select 1 from mawatheeq_private.acc_accounts where id=nullif(p_data->>'payableAccount','')::uuid and type='liability_payable' and reconcile) then
   raise exception 'اختر حساب ذمم مدينة وحساب ذمم دائنة يسمحان بالمطابقة.'; end if;
  if (s.receivable_account<>(p_data->>'receivableAccount')::uuid or s.payable_account<>(p_data->>'payableAccount')::uuid)
   and exists(select 1 from mawatheeq_private.acc_moves where move_type<>'entry' or payment_type is not null) then
   raise exception 'توجد فواتير أو دفعات على الحسابات الحالية؛ لا تتغير حسابات الذمم بعدها.'; end if;
  update mawatheeq_private.acc_settings set receivable_account=(p_data->>'receivableAccount')::uuid,payable_account=(p_data->>'payableAccount')::uuid,invoice_note=left(coalesce(p_data->>'invoiceNote',''),2000),revision=revision+1;
  return '{}'::jsonb;
 when 'convert_ledger' then
  -- The old simple ledger, once: fees → customer invoices, receipts → customer payments, expenses → vendor bills paid at once.
  v_counts:=jsonb_build_object('fees',0,'receipts',0,'expenses',0,'skippedVoid',0,'skippedCurrency',0,'skippedLocked',0,'already',0,'partners',0);
  select * into j from mawatheeq_private.acc_journals where id=nullif(p_data->>'journalId','')::uuid and type in ('bank','cash') and active;
  if j.id is null then raise exception 'اختر دفتر البنك أو الصندوق الذي تُسجل فيه المقبوضات والمصروفات.'; end if;
  for r in select d.id,d.case_id,d.payload p from mawatheeq_private.department_records d where d.workspace='accounting' and d.kind='entry' and not d.archived order by d.payload->>'date',d.created_at loop
   if exists(select 1 from mawatheeq_private.acc_moves where source='ledger:'||r.id) then v_counts:=jsonb_set(v_counts,'{already}',to_jsonb((v_counts->>'already')::int+1)); continue; end if;
   if r.p->>'status'='void' then v_counts:=jsonb_set(v_counts,'{skippedVoid}',to_jsonb((v_counts->>'skippedVoid')::int+1)); continue; end if;
   if coalesce(r.p->>'currency','KWD')<>'KWD' then v_counts:=jsonb_set(v_counts,'{skippedCurrency}',to_jsonb((v_counts->>'skippedCurrency')::int+1)); continue; end if;
   if (r.p->>'date')::date<=v_lock then v_counts:=jsonb_set(v_counts,'{skippedLocked}',to_jsonb((v_counts->>'skippedLocked')::int+1)); continue; end if;
   v_amount:=round((r.p->>'amountMinor')::numeric/1000,3);
   select id into v_partner from mawatheeq_private.acc_partners where mawatheeq_private.normalized(name)=mawatheeq_private.normalized(coalesce(nullif(btrim(r.p->>'party'),''),'بلا طرف')) limit 1;
   if v_partner is null then
    if not coalesce((p_data->>'dryRun')::boolean,true) then
     insert into mawatheeq_private.acc_partners(name,kind) values(left(coalesce(nullif(btrim(r.p->>'party'),''),'بلا طرف'),200),case when r.p->>'type'='expense' then 'vendor' else 'customer' end) returning id into v_partner;
    end if;
    v_counts:=jsonb_set(v_counts,'{partners}',to_jsonb((v_counts->>'partners')::int+1));
   end if;
   v_counts:=jsonb_set(v_counts,array[case r.p->>'type' when 'fee' then 'fees' when 'receipt' then 'receipts' else 'expenses' end],to_jsonb((v_counts->>case r.p->>'type' when 'fee' then 'fees' when 'receipt' then 'receipts' else 'expenses' end)::int+1));
   continue when coalesce((p_data->>'dryRun')::boolean,true);
   if r.p->>'type' in ('fee','expense') then
    insert into mawatheeq_private.acc_moves(journal_id,move_type,date,ref,narration,partner_id,case_id,source,created_by,updated_by,payment_state)
     values((select id from mawatheeq_private.acc_journals where type=case when r.p->>'type'='fee' then 'sale' else 'purchase' end and active order by code limit 1),
      case when r.p->>'type'='fee' then 'out_invoice' else 'in_invoice' end,(r.p->>'date')::date,left(coalesce(r.p->>'reference',''),200),left(coalesce(r.p->>'notes',''),4000),v_partner,r.case_id,'ledger:'||r.id,actor,actor,'not_paid') returning id into v_new;
    perform mawatheeq_private.acc_write_invoice_lines(v_new,jsonb_build_array(jsonb_build_object('label',coalesce(nullif(r.p->>'notes',''),case when r.p->>'type'='fee' then 'أتعاب' else 'مصروفات' end),
     'accountId',(select id from mawatheeq_private.acc_accounts where code=case when r.p->>'type'='fee' then '401000' else '599000' end),'quantity','1','priceUnit',v_amount::text)));
    select revision into v_rev from mawatheeq_private.acc_moves where id=v_new;
    perform mawatheeq_private.books_request(p_token,'post',jsonb_build_object('id',v_new,'revision',v_rev));
    if r.p->>'type'='expense' then
     result:=mawatheeq_private.books_request(p_token,'register_payment',jsonb_build_object('moveIds',jsonb_build_array(v_new),'journalId',j.id,'date',r.p->>'date','ref',coalesce(r.p->>'reference','')));
     update mawatheeq_private.acc_moves set source='ledger:'||r.id||':payment' where id=(result->>'id')::uuid;
    end if;
   else
    insert into mawatheeq_private.acc_moves(journal_id,date,ref,narration,partner_id,case_id,payment_type,partner_type,source,created_by,updated_by,payment_state)
     values(j.id,(r.p->>'date')::date,left(coalesce(r.p->>'reference',''),200),left(coalesce(r.p->>'notes',''),4000),v_partner,r.case_id,'inbound','customer','ledger:'||r.id,actor,actor,'not_paid') returning id into v_new;
    perform mawatheeq_private.acc_write_payment_lines(v_new,v_amount);
    select revision into v_rev from mawatheeq_private.acc_moves where id=v_new;
    perform mawatheeq_private.books_request(p_token,'post',jsonb_build_object('id',v_new,'revision',v_rev));
    -- A receipt pays the client's oldest open fees.
    select array_agg(l2.id) into v_lines from mawatheeq_private.acc_move_lines l2 join mawatheeq_private.acc_moves m2 on m2.id=l2.move_id
     where l2.partner_id=v_partner and l2.account_id=s.receivable_account and m2.state='posted' and l2.amount_residual>0;
    if coalesce(array_length(v_lines,1),0)>1 then perform mawatheeq_private.acc_reconcile(v_lines,actor); end if;
   end if;
  end loop;
  return v_counts||jsonb_build_object('dryRun',coalesce((p_data->>'dryRun')::boolean,true));
 end case;
end $$;

revoke all on function mawatheeq_private.acc_refresh_line(uuid),mawatheeq_private.acc_refresh_move(uuid),mawatheeq_private.acc_reconcile(uuid[],uuid),mawatheeq_private.acc_unreconcile_move(uuid),
 mawatheeq_private.acc_write_invoice_lines(uuid,jsonb),mawatheeq_private.acc_write_payment_lines(uuid,numeric),mawatheeq_private.acc_document_json(uuid),
 mawatheeq_private.books_request(text,text,jsonb),mawatheeq_private.books_request_core(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.books_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
