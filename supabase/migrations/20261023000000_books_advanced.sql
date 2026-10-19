begin;
-- Books, phase 5 (23 October 2026): the advanced features.
-- * Taxes, off until switched on: percentage or fixed, included in the price or added to it, for sales or purchases,
--   each with its account; invoice lines carry them, tax lines are added per tax, and a tax report sums base and tax.
-- * Currencies with dated exchange rates (Kuwaiti dinars per unit): an invoice, bill or journal entry in another
--   currency is booked in dinars at its date's rate, keeps its amounts in the currency, and what is left open after
--   payment only because the rate moved is settled as an exchange gain or loss.
-- * Cost centres on any line, with a report; budgets per account (and cost centre) against what was actually booked.
-- * Fixed assets with straight-line depreciation, and income or expenses spread over months (deferred), all as
--   schedules whose monthly entries are posted when due; an asset can be sold or scrapped.
-- * Recurring entries and invoices, created (and posted, if chosen) each period.
-- * Payment follow-up: reminder levels by days late, who is due for which reminder, and a record of each one sent.
-- * Year-end: a checklist of what is still open, then the year is closed with the fiscal lock date.
-- The phase 4 request function is kept and wrapped.

-- Accounts the new features post to.
insert into mawatheeq_private.acc_accounts(code,name,type,reconcile) values
 ('134000','ضريبة المدخلات القابلة للاسترداد','asset_current',false),('216000','ضريبة المخرجات المستحقة','liability_current',false),
 ('212100','إيرادات مقبوضة مقدماً','liability_current',false),('152000','تحسينات المكتب والتجهيزات','asset_fixed',false),
 ('303000','الأرباح المحتجزة','equity',false),('409100','أرباح فروق العملة','income_other',false),('599100','خسائر فروق العملة','expense',false),
 ('409200','أرباح بيع أصول','income_other',false),('599200','خسائر استبعاد أصول','expense',false)
on conflict(code) do nothing;

alter table mawatheeq_private.acc_settings add column taxes_enabled boolean not null default false,
 add column exchange_gain_account uuid references mawatheeq_private.acc_accounts(id), add column exchange_loss_account uuid references mawatheeq_private.acc_accounts(id);
update mawatheeq_private.acc_settings set exchange_gain_account=(select id from mawatheeq_private.acc_accounts where code='409100'),exchange_loss_account=(select id from mawatheeq_private.acc_accounts where code='599100');

create table mawatheeq_private.acc_taxes (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (length(btrim(name)) between 1 and 120),
 type_use text not null check (type_use in ('sale','purchase')),
 amount_type text not null default 'percent' check (amount_type in ('percent','fixed')),
 amount numeric(12,4) not null check (amount>=0),
 price_include boolean not null default false,
 account_id uuid not null references mawatheeq_private.acc_accounts(id),
 active boolean not null default true, revision integer not null default 1
);
insert into mawatheeq_private.acc_taxes(name,type_use,amount,account_id) values
 ('ضريبة مبيعات 5٪','sale',5,(select id from mawatheeq_private.acc_accounts where code='216000')),
 ('ضريبة مشتريات 5٪','purchase',5,(select id from mawatheeq_private.acc_accounts where code='134000'));
alter table mawatheeq_private.acc_products add column sale_taxes uuid[] not null default '{}', add column purchase_taxes uuid[] not null default '{}';

create table mawatheeq_private.acc_currencies (code text primary key check (code ~ '^[A-Z]{3}$'), name text not null, active boolean not null default true);
insert into mawatheeq_private.acc_currencies(code,name,active) values ('KWD','دينار كويتي',true),('USD','دولار أمريكي',true),('EUR','يورو',true),('GBP','جنيه إسترليني',false),
 ('SAR','ريال سعودي',true),('AED','درهم إماراتي',true),('BHD','دينار بحريني',false),('QAR','ريال قطري',false),('OMR','ريال عماني',false),('EGP','جنيه مصري',false);
create table mawatheeq_private.acc_rates (
 currency text not null references mawatheeq_private.acc_currencies(code), date date not null, rate numeric(18,8) not null check (rate>0),
 created_by uuid references mawatheeq_private.accounts(id), primary key(currency,date)
);
create table mawatheeq_private.acc_analytic_accounts (
 id uuid primary key default gen_random_uuid(), code text not null default '', name text not null unique check (length(btrim(name)) between 1 and 120),
 plan text not null default 'مراكز التكلفة', active boolean not null default true, revision integer not null default 1
);
alter table mawatheeq_private.acc_move_lines drop constraint acc_move_lines_kind_check;
alter table mawatheeq_private.acc_move_lines add constraint acc_move_lines_kind_check check (kind in ('line','product','term','payment','tax')),
 add column tax_ids uuid[] not null default '{}', add column tax_id uuid references mawatheeq_private.acc_taxes(id), add column tax_base numeric(18,3),
 add column amount_currency numeric(18,3), add column analytic_id uuid references mawatheeq_private.acc_analytic_accounts(id);
alter table mawatheeq_private.acc_moves add column currency text not null default 'KWD' references mawatheeq_private.acc_currencies(code),
 add column currency_rate numeric(18,8) not null default 1, add column amount_total_currency numeric(18,3) not null default 0;

create table mawatheeq_private.acc_budgets (
 id uuid primary key default gen_random_uuid(), name text not null check (length(btrim(name)) between 1 and 120), date_from date not null, date_to date not null check (date_to>=date_from),
 note text not null default '', revision integer not null default 1
);
create table mawatheeq_private.acc_budget_lines (
 id uuid primary key default gen_random_uuid(), budget_id uuid not null references mawatheeq_private.acc_budgets(id) on delete cascade,
 account_id uuid not null references mawatheeq_private.acc_accounts(id), analytic_id uuid references mawatheeq_private.acc_analytic_accounts(id), amount numeric(18,3) not null
);
create table mawatheeq_private.acc_schedules (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('asset','deferred_revenue','deferred_expense')),
 name text not null check (length(btrim(name)) between 1 and 160),
 journal_id uuid not null references mawatheeq_private.acc_journals(id),
 debit_account uuid not null references mawatheeq_private.acc_accounts(id), credit_account uuid not null references mawatheeq_private.acc_accounts(id),
 asset_account uuid references mawatheeq_private.acc_accounts(id),
 value numeric(18,3) not null check (value>0), salvage numeric(18,3) not null default 0 check (salvage>=0),
 months integer not null check (months between 1 and 600), first_date date not null,
 state text not null default 'draft' check (state in ('draft','running','closed')),
 partner_id uuid references mawatheeq_private.acc_partners(id), case_id text references public.mawatheeq_cases(id), analytic_id uuid references mawatheeq_private.acc_analytic_accounts(id),
 ref text not null default '', revision integer not null default 1, created_by uuid not null references mawatheeq_private.accounts(id), created_at timestamptz not null default clock_timestamp()
);
create table mawatheeq_private.acc_schedule_lines (
 id uuid primary key default gen_random_uuid(), schedule_id uuid not null references mawatheeq_private.acc_schedules(id) on delete cascade,
 seq integer not null, date date not null, amount numeric(18,3) not null, move_id uuid references mawatheeq_private.acc_moves(id)
);
create table mawatheeq_private.acc_recurring (
 id uuid primary key default gen_random_uuid(), name text not null check (length(btrim(name)) between 1 and 160),
 kind text not null check (kind in ('entry','out_invoice','in_invoice')), template jsonb not null,
 interval_months integer not null default 1 check (interval_months between 1 and 24), next_date date not null, end_date date,
 auto_post boolean not null default false, active boolean not null default true, last_run date, revision integer not null default 1
);
create table mawatheeq_private.acc_followup_levels (
 id uuid primary key default gen_random_uuid(), days integer not null unique check (days between 0 and 3650), name text not null, message text not null default '', revision integer not null default 1
);
insert into mawatheeq_private.acc_followup_levels(days,name,message) values
 (7,'تذكير ودي','نود تذكيركم بأن الفواتير المبينة أدناه قد تجاوزت موعد استحقاقها، ونرجو التكرم بسدادها.'),
 (30,'تذكير ثانٍ','لم نتلقَّ بعد سداد الفواتير المبينة أدناه رغم تذكيرنا السابق، ونرجو المبادرة إلى السداد.'),
 (60,'إنذار أخير','نحيطكم علماً بأن الفواتير المبينة أدناه ما زالت غير مسددة، وسنضطر إلى اتخاذ الإجراءات اللازمة ما لم يتم السداد.');
create table mawatheeq_private.acc_followups (
 id uuid primary key default gen_random_uuid(), partner_id uuid not null references mawatheeq_private.acc_partners(id), level_id uuid references mawatheeq_private.acc_followup_levels(id),
 date date not null, note text not null default '', actor_id uuid not null references mawatheeq_private.accounts(id), created_at timestamptz not null default clock_timestamp()
);
revoke all on mawatheeq_private.acc_taxes,mawatheeq_private.acc_currencies,mawatheeq_private.acc_rates,mawatheeq_private.acc_analytic_accounts,mawatheeq_private.acc_budgets,mawatheeq_private.acc_budget_lines,
 mawatheeq_private.acc_schedules,mawatheeq_private.acc_schedule_lines,mawatheeq_private.acc_recurring,mawatheeq_private.acc_followup_levels,mawatheeq_private.acc_followups from public,anon,authenticated;

-- Dinars for one unit of a currency on a date: the latest rate on or before it.
create function mawatheeq_private.acc_rate(p_currency text,p_date date) returns numeric language plpgsql stable set search_path='' as $$
declare v numeric;
begin
 if coalesce(p_currency,'KWD')='KWD' then return 1; end if;
 select rate into v from mawatheeq_private.acc_rates where currency=p_currency and date<=p_date order by date desc limit 1;
 if v is null then raise exception 'لا يوجد سعر صرف لـ % في % أو قبله؛ أضفه في العملات.',p_currency,to_char(p_date,'DD/MM/YYYY'); end if;
 return v;
end $$;

-- Invoice lines again, now with taxes (when switched on), another currency and cost centres.
create or replace function mawatheeq_private.acc_write_invoice_lines(p_move uuid,p_lines jsonb) returns void language plpgsql set search_path='' as $$
declare m mawatheeq_private.acc_moves%rowtype; s mawatheeq_private.acc_settings%rowtype; l jsonb; t jsonb; i integer:=0; n integer; k integer:=0;
 v_qty numeric; v_price numeric; v_disc numeric; v_sub numeric; v_base numeric; v_total numeric:=0; v_total_cur numeric:=0; v_rest numeric; v_amt numeric; v_acc uuid; v_prod mawatheeq_private.acc_products%rowtype;
 product_debit boolean; term_acc uuid; terms jsonb; v_due date; v_last date; v_rate numeric; v_taxes uuid[]; v_tax mawatheeq_private.acc_taxes%rowtype; v_tax_amt numeric;
 tax_tot jsonb:='{}'; tax_base jsonb:='{}'; x record; v_kwd numeric; v_kwd_total numeric:=0; v_last_term integer;
begin
 select * into m from mawatheeq_private.acc_moves where id=p_move; select * into s from mawatheeq_private.acc_settings;
 product_debit:=m.move_type in ('in_invoice','out_refund');
 term_acc:=case when m.move_type in ('out_invoice','out_refund') then s.receivable_account else s.payable_account end;
 if term_acc is null then raise exception 'حدد حساب الذمم المدينة والدائنة في إعدادات الفوترة.'; end if;
 v_rate:=m.currency_rate;
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
  if coalesce(l->>'analyticId','')<>'' and not exists(select 1 from mawatheeq_private.acc_analytic_accounts where id=(l->>'analyticId')::uuid) then raise exception 'السطر %: اختر مركز تكلفة محفوظاً.',i; end if;
  -- Taxes of the line (only when taxes are switched on): those included in the price come out of the line amount.
  v_taxes:='{}'; v_base:=v_sub;
  if s.taxes_enabled and jsonb_typeof(l->'taxIds')='array' then
   select coalesce(array_agg((y#>>'{}')::uuid),'{}') into v_taxes from jsonb_array_elements(l->'taxIds') y where coalesce(y#>>'{}','')<>'';
   for v_tax in select * from mawatheeq_private.acc_taxes where id=any(v_taxes) loop
    if v_tax.type_use<>(case when m.move_type in ('out_invoice','out_refund') then 'sale' else 'purchase' end) then raise exception 'السطر %: الضريبة «%» ليست لهذا النوع من الفواتير.',i,v_tax.name; end if;
    if v_tax.price_include and v_tax.amount_type='percent' then v_base:=round(v_base/(1+v_tax.amount/100),3); end if;
   end loop;
   for v_tax in select * from mawatheeq_private.acc_taxes where id=any(v_taxes) loop
    v_tax_amt:=case when v_tax.amount_type='percent' then round(v_base*v_tax.amount/100,3) else round(v_tax.amount*v_qty,3) end;
    if v_tax.price_include and v_tax.amount_type='percent' and (select count(*) from mawatheeq_private.acc_taxes where id=any(v_taxes) and price_include)=1 then v_tax_amt:=v_sub-v_base; end if;
    tax_tot:=jsonb_set(tax_tot,array[v_tax.id::text],to_jsonb(coalesce((tax_tot->>v_tax.id::text)::numeric,0)+v_tax_amt));
    tax_base:=jsonb_set(tax_base,array[v_tax.id::text],to_jsonb(coalesce((tax_base->>v_tax.id::text)::numeric,0)+v_base));
   end loop;
  end if;
  k:=k+1; v_kwd:=round(v_base*v_rate,3);
  insert into mawatheeq_private.acc_move_lines(move_id,seq,kind,account_id,partner_id,case_id,label,product_id,quantity,price_unit,discount,debit,credit,tax_ids,amount_currency,analytic_id)
   values(p_move,k,'product',v_acc,m.partner_id,coalesce(nullif(l->>'caseId',''),m.case_id),left(coalesce(nullif(btrim(l->>'label'),''),v_prod.name,''),300),v_prod.id,v_qty,v_price,v_disc,
    case when product_debit then v_kwd else 0 end,case when product_debit then 0 else v_kwd end,v_taxes,case when m.currency<>'KWD' then v_base end,nullif(l->>'analyticId','')::uuid);
  v_total_cur:=v_total_cur+v_base; v_kwd_total:=v_kwd_total+v_kwd;
 end loop;
 if v_total_cur<=0 then raise exception 'أضف بنداً واحداً على الأقل بمبلغ.'; end if;
 for x in select key,value::numeric amt from jsonb_each_text(tax_tot) loop
  continue when x.amt=0;
  select * into v_tax from mawatheeq_private.acc_taxes where id=x.key::uuid;
  k:=k+1; v_kwd:=round(x.amt*v_rate,3);
  insert into mawatheeq_private.acc_move_lines(move_id,seq,kind,account_id,partner_id,case_id,label,debit,credit,tax_id,tax_base,amount_currency)
   values(p_move,k,'tax',v_tax.account_id,m.partner_id,m.case_id,v_tax.name,case when product_debit then v_kwd else 0 end,case when product_debit then 0 else v_kwd end,v_tax.id,
    round((tax_base->>x.key)::numeric*v_rate,3),case when m.currency<>'KWD' then x.amt end);
  v_total_cur:=v_total_cur+x.amt; v_kwd_total:=v_kwd_total+v_kwd;
 end loop;
 v_total:=v_total_cur;
 select lines into terms from mawatheeq_private.acc_payment_terms where id=m.payment_term_id;
 terms:=coalesce(terms,jsonb_build_array(jsonb_build_object('kind','balance','days',greatest(coalesce(m.invoice_date_due,m.date)-m.date,0))));
 n:=jsonb_array_length(terms); v_rest:=v_total; i:=0;
 for t in select value from jsonb_array_elements(terms) loop
  i:=i+1;
  v_amt:=case when t->>'kind'='percent' and i<n then least(round(v_total*(t->>'percent')::numeric/100,3),v_rest) else v_rest end;
  v_rest:=v_rest-v_amt; v_due:=m.date+coalesce((t->>'days')::integer,0); v_last:=greatest(v_last,v_due);
  if v_amt>0 then k:=k+1; v_kwd:=round(v_amt*v_rate,3);
   insert into mawatheeq_private.acc_move_lines(move_id,seq,kind,account_id,partner_id,case_id,label,debit,credit,date_maturity,amount_currency)
    values(p_move,k,'term',term_acc,m.partner_id,m.case_id,case when n>1 then 'الدفعة '||i||' من '||n else 'المستحق' end,case when product_debit then 0 else v_kwd end,case when product_debit then v_kwd else 0 end,v_due,
     case when m.currency<>'KWD' then v_amt end);
   v_last_term:=k;
  end if;
 end loop;
 -- Rounding to the fils in dinars can leave the entry a fils or two out of balance; the last instalment takes it.
 select sum(debit-credit) into v_kwd from mawatheeq_private.acc_move_lines where move_id=p_move;
 if v_kwd<>0 then
  update mawatheeq_private.acc_move_lines set debit=case when debit>0 then debit-v_kwd else 0 end,credit=case when credit>0 then credit+v_kwd else 0 end where move_id=p_move and seq=v_last_term;
 end if;
 update mawatheeq_private.acc_moves set invoice_date_due=v_last,amount_total_currency=v_total where id=p_move;
 perform mawatheeq_private.acc_refresh_move(p_move);
end $$;

-- A posted entry from plain lines (depreciation, deferrals, exchange differences, recurring entries); returns its id.
create function mawatheeq_private.acc_post_lines(p_token text,p_journal uuid,p_date date,p_ref text,p_partner uuid,p_source text,p_lines jsonb) returns uuid language plpgsql set search_path='' as $$
declare v_move uuid; x jsonb; i integer:=0; v_rev integer;
begin
 insert into mawatheeq_private.acc_moves(journal_id,date,ref,partner_id,source,created_by,updated_by) values(p_journal,p_date,left(coalesce(p_ref,''),200),p_partner,p_source,auth.uid(),auth.uid()) returning id into v_move;
 for x in select value from jsonb_array_elements(p_lines) loop
  i:=i+1;
  insert into mawatheeq_private.acc_move_lines(move_id,seq,account_id,partner_id,case_id,analytic_id,label,debit,credit,kind)
   values(v_move,i,(x->>'accountId')::uuid,coalesce(nullif(x->>'partnerId','')::uuid,p_partner),nullif(x->>'caseId',''),nullif(x->>'analyticId','')::uuid,left(coalesce(nullif(x->>'label',''),p_ref,''),300),
    coalesce((x->>'debit')::numeric,0),coalesce((x->>'credit')::numeric,0),coalesce(nullif(x->>'kind',''),'line'));
 end loop;
 select revision into v_rev from mawatheeq_private.acc_moves where id=v_move;
 perform mawatheeq_private.books_request(p_token,'post',jsonb_build_object('id',v_move,'revision',v_rev));
 return v_move;
end $$;

-- A schedule's monthly amounts: (value − salvage) spread evenly, the last month taking the rounding.
create function mawatheeq_private.acc_schedule_build(p_id uuid) returns void language plpgsql set search_path='' as $$
declare sc mawatheeq_private.acc_schedules%rowtype; v_each numeric; v_rest numeric; i integer;
begin
 select * into sc from mawatheeq_private.acc_schedules where id=p_id;
 delete from mawatheeq_private.acc_schedule_lines where schedule_id=p_id and move_id is null;
 v_rest:=sc.value-sc.salvage-coalesce((select sum(amount) from mawatheeq_private.acc_schedule_lines where schedule_id=p_id),0);
 v_each:=round((sc.value-sc.salvage)/sc.months,3);
 for i in (select coalesce(max(seq),0)+1 from mawatheeq_private.acc_schedule_lines where schedule_id=p_id)..sc.months loop
  insert into mawatheeq_private.acc_schedule_lines(schedule_id,seq,date,amount) values(p_id,i,(sc.first_date+((i-1)||' month')::interval)::date,case when i=sc.months then v_rest else least(v_each,v_rest) end);
  v_rest:=v_rest-least(v_each,v_rest);
 end loop;
end $$;
create function mawatheeq_private.acc_schedule_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',sc.id,'kind',sc.kind,'name',sc.name,'journalId',sc.journal_id,'debitAccount',sc.debit_account,'creditAccount',sc.credit_account,'assetAccount',coalesce(sc.asset_account::text,''),
  'value',sc.value::text,'salvage',sc.salvage::text,'months',sc.months,'firstDate',sc.first_date,'state',sc.state,'partnerId',coalesce(sc.partner_id::text,''),'caseId',coalesce(sc.case_id,''),
  'analyticId',coalesce(sc.analytic_id::text,''),'ref',sc.ref,'revision',sc.revision,
  'posted',coalesce((select sum(amount) from mawatheeq_private.acc_schedule_lines where schedule_id=sc.id and move_id is not null),0)::text,
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',sl.id,'seq',sl.seq,'date',sl.date,'amount',sl.amount::text,'moveId',coalesce(sl.move_id::text,''),
    'moveName',coalesce((select name from mawatheeq_private.acc_moves where id=sl.move_id),'')) order by sl.seq) from mawatheeq_private.acc_schedule_lines sl where sl.schedule_id=sc.id),'[]'))
 from mawatheeq_private.acc_schedules sc where sc.id=p_id;
$$;

alter function mawatheeq_private.books_request(text,text,jsonb) rename to books_request_reports;
create function mawatheeq_private.books_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; can_edit boolean; can_config boolean; v_lock date; s mawatheeq_private.acc_settings%rowtype; l jsonb; x jsonb; v_id uuid; result jsonb; m mawatheeq_private.acc_moves%rowtype;
 v_from date; v_to date; v_date date; v_rate numeric; sc mawatheeq_private.acc_schedules%rowtype; r record; v_move uuid; v_count integer:=0; v_res numeric; v_line uuid; v_new uuid; v_rev integer; i integer;
 v_created jsonb:='[]'; rc mawatheeq_private.acc_recurring%rowtype; v_posted numeric;
begin
 if p_action not in ('setup','save_invoice','save_move','save_tax','set_taxes','save_currency','save_rate','save_analytic','exchange_difference','tax_report','analytic_report','save_budget','delete_budget','budget_report',
  'save_schedule','confirm_schedule','delete_schedule','post_schedules','dispose_schedule','list_schedules','save_recurring','delete_recurring','run_recurring','list_recurring',
  'followups','followup_done','save_followup_level','year_end','close_year') then return mawatheeq_private.books_request_reports(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
 perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'accounting') and a->>'caseScope'='all');
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>1000000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 can_edit:=coalesce((a->>'canEdit')::boolean,false); can_config:=mawatheeq_private.is_owner();
 v_lock:=coalesce(mawatheeq_private.acc_locked_until(can_config),'0001-01-01');
 if p_action in ('save_rate','save_analytic','exchange_difference','save_budget','delete_budget','save_schedule','confirm_schedule','delete_schedule','post_schedules','dispose_schedule',
  'save_recurring','delete_recurring','run_recurring','followup_done') then perform mawatheeq_private.require_access(can_edit); end if;
 if p_action in ('save_tax','set_taxes','save_currency','save_followup_level','close_year') then perform mawatheeq_private.require_access(can_edit and can_config); end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select * into s from mawatheeq_private.acc_settings;
 case p_action
 when 'setup' then
  v_date:=(now() at time zone 'Asia/Kuwait')::date;
  return mawatheeq_private.books_request_reports(p_token,'setup',p_data)||jsonb_build_object('advanced',true,'taxesEnabled',s.taxes_enabled,
   'taxes',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'typeUse',t.type_use,'amountType',t.amount_type,'amount',t.amount::text,'priceInclude',t.price_include,'accountId',t.account_id,'active',t.active,'revision',t.revision) order by t.type_use,t.name),'[]') from mawatheeq_private.acc_taxes t),
   'currencies',(select coalesce(jsonb_agg(jsonb_build_object('code',c.code,'name',c.name,'active',c.active,'rate',coalesce((select rate::text from mawatheeq_private.acc_rates where currency=c.code order by date desc limit 1),case when c.code='KWD' then '1' else '' end),
     'rateDate',(select max(date) from mawatheeq_private.acc_rates where currency=c.code)) order by c.code<>'KWD',c.code),'[]') from mawatheeq_private.acc_currencies c),
   'analytic',(select coalesce(jsonb_agg(jsonb_build_object('id',an.id,'code',an.code,'name',an.name,'plan',an.plan,'active',an.active,'revision',an.revision) order by an.plan,an.code,an.name),'[]') from mawatheeq_private.acc_analytic_accounts an),
   'productTaxes',(select coalesce(jsonb_object_agg(p.id,jsonb_build_object('sale',to_jsonb(p.sale_taxes),'purchase',to_jsonb(p.purchase_taxes))),'{}') from mawatheeq_private.acc_products p),
   'due',jsonb_build_object('recurring',(select count(*) from mawatheeq_private.acc_recurring where active and next_date<=v_date and (end_date is null or next_date<=end_date)),
    'schedules',(select count(*) from mawatheeq_private.acc_schedule_lines sl join mawatheeq_private.acc_schedules sc2 on sc2.id=sl.schedule_id where sc2.state='running' and sl.move_id is null and sl.date<=v_date),
    'followups',(select count(distinct fl.partner_id) from mawatheeq_private.acc_move_lines fl where fl.account_id=s.receivable_account and fl.debit>0 and fl.amount_residual>0 and fl.date_maturity<v_date-6)));
 when 'save_invoice' then
  l:=p_data->'invoice';
  if coalesce(l->>'currency','KWD')<>'KWD' and not exists(select 1 from mawatheeq_private.acc_currencies where code=l->>'currency' and active) then raise exception 'اختر عملة فعالة.'; end if;
  result:=mawatheeq_private.books_request_reports(p_token,p_action,p_data);
  v_rate:=case when coalesce(nullif(l->>'rate',''),'')<>'' and coalesce(l->>'currency','KWD')<>'KWD' then (l->>'rate')::numeric else mawatheeq_private.acc_rate(coalesce(l->>'currency','KWD'),(l->>'date')::date) end;
  if v_rate<=0 then raise exception 'سعر الصرف غير صالح.'; end if;
  update mawatheeq_private.acc_moves set currency=coalesce(nullif(l->>'currency',''),'KWD'),currency_rate=v_rate where id=(result->>'id')::uuid;
  perform mawatheeq_private.acc_write_invoice_lines((result->>'id')::uuid,l->'lines');
  return mawatheeq_private.acc_document_json((result->>'id')::uuid)||(select jsonb_build_object('currency',currency,'currencyRate',currency_rate::text,'amountTotalCurrency',amount_total_currency::text) from mawatheeq_private.acc_moves where id=(result->>'id')::uuid);
 when 'save_move' then
  result:=mawatheeq_private.books_request_reports(p_token,p_action,p_data);
  -- Cost centres and amounts in another currency, line by line in the order sent.
  i:=0;
  for x in select value from jsonb_array_elements(p_data->'move'->'lines') loop
   i:=i+1;
   if coalesce(x->>'analyticId','')<>'' and not exists(select 1 from mawatheeq_private.acc_analytic_accounts where id=(x->>'analyticId')::uuid) then raise exception 'السطر %: اختر مركز تكلفة محفوظاً.',i; end if;
   update mawatheeq_private.acc_move_lines set analytic_id=nullif(x->>'analyticId','')::uuid,amount_currency=nullif(x->>'amountCurrency','')::numeric where move_id=(result->>'id')::uuid and seq=i;
  end loop;
  if coalesce(p_data->'move'->>'currency','KWD')<>'KWD' then
   update mawatheeq_private.acc_moves set currency=p_data->'move'->>'currency',currency_rate=coalesce(nullif(p_data->'move'->>'rate','')::numeric,mawatheeq_private.acc_rate(p_data->'move'->>'currency',(p_data->'move'->>'date')::date)) where id=(result->>'id')::uuid;
  end if;
  return result;
 when 'save_tax' then
  l:=p_data->'tax'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or length(btrim(coalesce(l->>'name',''))) not between 1 and 120 then raise exception 'اكتب اسم الضريبة.'; end if;
  if coalesce(l->>'typeUse','') not in ('sale','purchase') or coalesce(l->>'amountType','percent') not in ('percent','fixed') then raise exception 'حدد نوع الضريبة.'; end if;
  if coalesce(l->>'amount','') !~ '^\d{1,6}(\.\d{1,4})?$' or (coalesce(l->>'amountType','percent')='percent' and (l->>'amount')::numeric>100) then raise exception 'اكتب نسبة بين 0 و100 أو مبلغاً ثابتاً.'; end if;
  if not exists(select 1 from mawatheeq_private.acc_accounts where id=nullif(l->>'accountId','')::uuid and not deprecated) then raise exception 'اختر حساب الضريبة.'; end if;
  if exists(select 1 from mawatheeq_private.acc_taxes where name=btrim(l->>'name') and id is distinct from v_id) then raise exception 'توجد ضريبة بهذا الاسم.'; end if;
  if v_id is null then insert into mawatheeq_private.acc_taxes(name,type_use,amount_type,amount,price_include,account_id) values(btrim(l->>'name'),l->>'typeUse',coalesce(nullif(l->>'amountType',''),'percent'),(l->>'amount')::numeric,
    coalesce((l->>'priceInclude')::boolean,false),(l->>'accountId')::uuid) returning id into v_id;
  else
   if (select revision from mawatheeq_private.acc_taxes where id=v_id) is distinct from coalesce((l->>'revision')::integer,0) then raise exception 'عُدّلت الضريبة من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
   if exists(select 1 from mawatheeq_private.acc_move_lines where tax_id=v_id or v_id=any(tax_ids)) and exists(select 1 from mawatheeq_private.acc_taxes where id=v_id and (amount<>(l->>'amount')::numeric or type_use<>l->>'typeUse' or price_include<>coalesce((l->>'priceInclude')::boolean,false))) then
    raise exception 'استُخدمت هذه الضريبة في فواتير؛ أنشئ ضريبة جديدة وأوقف هذه بدلاً من تغيير نسبتها.'; end if;
   update mawatheeq_private.acc_taxes set name=btrim(l->>'name'),type_use=l->>'typeUse',amount_type=coalesce(nullif(l->>'amountType',''),'percent'),amount=(l->>'amount')::numeric,price_include=coalesce((l->>'priceInclude')::boolean,false),
    account_id=(l->>'accountId')::uuid,active=coalesce((l->>'active')::boolean,true),revision=revision+1 where id=v_id;
  end if;
  if jsonb_typeof(p_data->'products')='object' then
   update mawatheeq_private.acc_products p set sale_taxes=case when p.id::text in (select jsonb_object_keys(p_data->'products')) and (select type_use from mawatheeq_private.acc_taxes where id=v_id)='sale' then
     (case when (p_data->'products'->>p.id::text)::boolean then array(select distinct unnest(p.sale_taxes||v_id)) else array_remove(p.sale_taxes,v_id) end) else p.sale_taxes end,
    purchase_taxes=case when p.id::text in (select jsonb_object_keys(p_data->'products')) and (select type_use from mawatheeq_private.acc_taxes where id=v_id)='purchase' then
     (case when (p_data->'products'->>p.id::text)::boolean then array(select distinct unnest(p.purchase_taxes||v_id)) else array_remove(p.purchase_taxes,v_id) end) else p.purchase_taxes end;
  end if;
  return jsonb_build_object('id',v_id);
 when 'set_taxes' then
  update mawatheeq_private.acc_settings set taxes_enabled=coalesce((p_data->>'enabled')::boolean,false),revision=revision+1;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('settings','00000000-0000-0000-0000-000000000000','taxes',null,p_data,actor);
  return jsonb_build_object('taxesEnabled',coalesce((p_data->>'enabled')::boolean,false));
 when 'save_currency' then
  if coalesce(p_data->>'code','') !~ '^[A-Z]{3}$' then raise exception 'رمز العملة ثلاثة أحرف لاتينية كبيرة.'; end if;
  if p_data->>'code'='KWD' and not coalesce((p_data->>'active')::boolean,true) then raise exception 'الدينار الكويتي عملة الدفاتر ولا يوقف.'; end if;
  insert into mawatheeq_private.acc_currencies(code,name,active) values(p_data->>'code',coalesce(nullif(btrim(p_data->>'name'),''),p_data->>'code'),coalesce((p_data->>'active')::boolean,true))
   on conflict(code) do update set name=excluded.name,active=excluded.active;
  return jsonb_build_object('code',p_data->>'code');
 when 'save_rate' then
  if not exists(select 1 from mawatheeq_private.acc_currencies where code=p_data->>'currency' and code<>'KWD') then raise exception 'اختر عملة غير الدينار.'; end if;
  if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_data->>'rate','') !~ '^\d{1,6}(\.\d{1,8})?$' or (p_data->>'rate')::numeric<=0 then raise exception 'اكتب التاريخ وسعر الصرف (دينار لكل وحدة).'; end if;
  insert into mawatheeq_private.acc_rates(currency,date,rate,created_by) values(p_data->>'currency',(p_data->>'date')::date,(p_data->>'rate')::numeric,actor) on conflict(currency,date) do update set rate=excluded.rate,created_by=excluded.created_by;
  return (select coalesce(jsonb_agg(jsonb_build_object('date',date,'rate',rate::text) order by date desc),'[]') from mawatheeq_private.acc_rates where currency=p_data->>'currency');
 when 'save_analytic' then
  l:=p_data->'analytic'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or length(btrim(coalesce(l->>'name',''))) not between 1 and 120 then raise exception 'اكتب اسم مركز التكلفة.'; end if;
  if exists(select 1 from mawatheeq_private.acc_analytic_accounts where name=btrim(l->>'name') and id is distinct from v_id) then raise exception 'يوجد مركز تكلفة بهذا الاسم.'; end if;
  if v_id is null then insert into mawatheeq_private.acc_analytic_accounts(code,name,plan) values(left(coalesce(l->>'code',''),20),btrim(l->>'name'),coalesce(nullif(btrim(l->>'plan'),''),'مراكز التكلفة')) returning id into v_id;
  else update mawatheeq_private.acc_analytic_accounts set code=left(coalesce(l->>'code',''),20),name=btrim(l->>'name'),plan=coalesce(nullif(btrim(l->>'plan'),''),'مراكز التكلفة'),active=coalesce((l->>'active')::boolean,true),revision=revision+1 where id=v_id;
  end if;
  return jsonb_build_object('id',v_id);
 when 'exchange_difference' then
  select * into m from mawatheeq_private.acc_moves where id=(p_data->>'id')::uuid;
  if m.id is null or m.state<>'posted' or m.currency='KWD' or m.amount_residual<=0 then raise exception 'تُسوّى فروق العملة لمستند مؤكد بعملة أجنبية فيه مبلغ مفتوح.'; end if;
  if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (p_data->>'date')::date<=v_lock then raise exception 'اختر تاريخاً بعد تاريخ الإقفال.'; end if;
  v_new:=null;
  for r in select ml.id,ml.account_id,ml.amount_residual res,ml.debit>0 is_debit from mawatheeq_private.acc_move_lines ml where ml.move_id=m.id and ml.kind='term' and ml.amount_residual>0 loop
   -- What is left in dinars only because the rate moved: a debit left open is a loss, a credit left open a gain.
   v_move:=mawatheeq_private.acc_post_lines(p_token,(select id from mawatheeq_private.acc_journals where type='general' and active order by code limit 1),(p_data->>'date')::date,'فرق عملة: '||m.name,m.partner_id,'exchange:'||m.id,
    jsonb_build_array(jsonb_build_object('accountId',case when r.is_debit then s.exchange_loss_account else r.account_id end,'debit',r.res,'credit',0,'kind',case when r.is_debit then 'line' else 'payment' end),
     jsonb_build_object('accountId',case when r.is_debit then r.account_id else s.exchange_gain_account end,'debit',0,'credit',r.res,'kind',case when r.is_debit then 'payment' else 'line' end)));
   perform mawatheeq_private.acc_reconcile(array[r.id,(select id from mawatheeq_private.acc_move_lines where move_id=v_move and kind='payment')],actor);
   v_new:=v_move;
  end loop;
  return mawatheeq_private.acc_document_json(m.id)||jsonb_build_object('exchangeMoveId',v_new);
 when 'tax_report' then
  v_from:=coalesce(nullif(p_data->>'from','')::date,'0001-01-01'); v_to:=coalesce(nullif(p_data->>'to','')::date,'9999-12-31');
  return (select coalesce(jsonb_agg(jsonb_build_object('taxId',t.id,'name',t.name,'typeUse',t.type_use,'base',coalesce(z.base,0)::text,'tax',coalesce(z.tax,0)::text) order by t.type_use,t.name),'[]')
   from mawatheeq_private.acc_taxes t left join (select tl.tax_id,sum(case when tm.move_type in ('out_refund','in_refund') then -1 else 1 end*coalesce(tl.tax_base,0)) base,
     sum(case when t2.type_use='sale' then tl.credit-tl.debit else tl.debit-tl.credit end) tax
    from mawatheeq_private.acc_move_lines tl join mawatheeq_private.acc_moves tm on tm.id=tl.move_id and tm.state='posted' and tm.date between v_from and v_to join mawatheeq_private.acc_taxes t2 on t2.id=tl.tax_id
    group by tl.tax_id) z on z.tax_id=t.id);
 when 'analytic_report' then
  v_from:=coalesce(nullif(p_data->>'from','')::date,'0001-01-01'); v_to:=coalesce(nullif(p_data->>'to','')::date,'9999-12-31');
  return (select coalesce(jsonb_agg(jsonb_build_object('analyticId',an.id,'name',an.name,'plan',an.plan,'income',coalesce(z.inc,0)::text,'expenses',coalesce(z.exp,0)::text,'net',(coalesce(z.inc,0)-coalesce(z.exp,0))::text) order by an.plan,an.name),'[]')
   from mawatheeq_private.acc_analytic_accounts an left join (select al.analytic_id,sum(al.credit-al.debit) filter (where aa.type in ('income','income_other')) inc,sum(al.debit-al.credit) filter (where aa.type in ('expense','expense_depreciation','expense_direct_cost')) exp
    from mawatheeq_private.acc_move_lines al join mawatheeq_private.acc_moves am on am.id=al.move_id and am.state='posted' and am.date between v_from and v_to join mawatheeq_private.acc_accounts aa on aa.id=al.account_id
    where al.analytic_id is not null group by al.analytic_id) z on z.analytic_id=an.id);
 when 'save_budget' then
  l:=p_data->'budget'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or length(btrim(coalesce(l->>'name',''))) not between 1 and 120 then raise exception 'اكتب اسم الموازنة.'; end if;
  if coalesce(l->>'from','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(l->>'to','') !~ '^\d{4}-\d{2}-\d{2}$' or (l->>'to')::date<(l->>'from')::date then raise exception 'اختر فترة الموازنة.'; end if;
  if v_id is null then insert into mawatheeq_private.acc_budgets(name,date_from,date_to,note) values(btrim(l->>'name'),(l->>'from')::date,(l->>'to')::date,left(coalesce(l->>'note',''),1000)) returning id into v_id;
  else
   if (select revision from mawatheeq_private.acc_budgets where id=v_id) is distinct from coalesce((l->>'revision')::integer,0) then raise exception 'عُدّلت الموازنة من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
   update mawatheeq_private.acc_budgets set name=btrim(l->>'name'),date_from=(l->>'from')::date,date_to=(l->>'to')::date,note=left(coalesce(l->>'note',''),1000),revision=revision+1 where id=v_id;
   delete from mawatheeq_private.acc_budget_lines where budget_id=v_id;
  end if;
  for x in select value from jsonb_array_elements(coalesce(l->'lines','[]')) loop
   if not exists(select 1 from mawatheeq_private.acc_accounts where id=nullif(x->>'accountId','')::uuid) then raise exception 'اختر حساب كل سطر في الموازنة.'; end if;
   insert into mawatheeq_private.acc_budget_lines(budget_id,account_id,analytic_id,amount) values(v_id,(x->>'accountId')::uuid,nullif(x->>'analyticId','')::uuid,mawatheeq_private.acc_amount_signed(x->>'amount'));
  end loop;
  return jsonb_build_object('id',v_id);
 when 'delete_budget' then
  delete from mawatheeq_private.acc_budgets where id=(p_data->>'id')::uuid;
  return '{}'::jsonb;
 when 'budget_report' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'from',b.date_from,'to',b.date_to,'note',b.note,'revision',b.revision,
    'lines',(select coalesce(jsonb_agg(jsonb_build_object('accountId',bl.account_id,'code',ba.code,'account',ba.name,'analyticId',coalesce(bl.analytic_id::text,''),'analytic',coalesce((select name from mawatheeq_private.acc_analytic_accounts where id=bl.analytic_id),''),
      'planned',bl.amount::text,
      'actual',coalesce((select sum(case when ba.type in ('income','income_other') or ba.type like 'liability%' or ba.type like 'equity%' then ml.credit-ml.debit else ml.debit-ml.credit end) from mawatheeq_private.acc_move_lines ml join mawatheeq_private.acc_moves mm on mm.id=ml.move_id
       where mm.state='posted' and mm.date between b.date_from and b.date_to and ml.account_id=bl.account_id and (bl.analytic_id is null or ml.analytic_id=bl.analytic_id)),0)::text) order by ba.code),'[]')
     from mawatheeq_private.acc_budget_lines bl join mawatheeq_private.acc_accounts ba on ba.id=bl.account_id where bl.budget_id=b.id)) order by b.date_from desc),'[]')
   from mawatheeq_private.acc_budgets b where coalesce(p_data->>'id','')='' or b.id=(p_data->>'id')::uuid);
 when 'save_schedule' then
  l:=p_data->'schedule'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or coalesce(l->>'kind','') not in ('asset','deferred_revenue','deferred_expense') or length(btrim(coalesce(l->>'name',''))) not between 1 and 160 then raise exception 'اكتب الاسم ونوع الجدول.'; end if;
  if coalesce(l->>'firstDate','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(l->>'months','') !~ '^\d{1,3}$' or (l->>'months')::integer not between 1 and 600 then raise exception 'اختر تاريخ أول قسط وعدد الأشهر.'; end if;
  if not exists(select 1 from mawatheeq_private.acc_accounts where id=nullif(l->>'debitAccount','')::uuid) or not exists(select 1 from mawatheeq_private.acc_accounts where id=nullif(l->>'creditAccount','')::uuid) then raise exception 'اختر الحسابين المدين والدائن.'; end if;
  if l->>'kind'='asset' and coalesce(l->>'assetAccount','')='' then raise exception 'اختر حساب الأصل.'; end if;
  if mawatheeq_private.acc_amount(l->>'value')<=0 or mawatheeq_private.acc_amount(l->>'salvage')>=mawatheeq_private.acc_amount(l->>'value') then raise exception 'القيمة يجب أن تزيد على القيمة المتبقية.'; end if;
  if not exists(select 1 from mawatheeq_private.acc_journals where id=nullif(l->>'journalId','')::uuid and active) then raise exception 'اختر الدفتر.'; end if;
  if v_id is null then
   insert into mawatheeq_private.acc_schedules(kind,name,journal_id,debit_account,credit_account,asset_account,value,salvage,months,first_date,partner_id,case_id,analytic_id,ref,created_by)
    values(l->>'kind',btrim(l->>'name'),(l->>'journalId')::uuid,(l->>'debitAccount')::uuid,(l->>'creditAccount')::uuid,nullif(l->>'assetAccount','')::uuid,mawatheeq_private.acc_amount(l->>'value'),mawatheeq_private.acc_amount(l->>'salvage'),
     (l->>'months')::integer,(l->>'firstDate')::date,nullif(l->>'partnerId','')::uuid,nullif(l->>'caseId',''),nullif(l->>'analyticId','')::uuid,left(coalesce(l->>'ref',''),200),actor) returning id into v_id;
  else
   select * into sc from mawatheeq_private.acc_schedules where id=v_id for update;
   if sc.id is null then raise exception 'لم يعد هذا الجدول موجوداً.'; end if;
   if sc.revision<>coalesce((l->>'revision')::integer,0) then raise exception 'عُدّل الجدول من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
   if sc.state<>'draft' then raise exception 'لا يُعدّل جدول بدأ ترحيله.'; end if;
   update mawatheeq_private.acc_schedules set name=btrim(l->>'name'),journal_id=(l->>'journalId')::uuid,debit_account=(l->>'debitAccount')::uuid,credit_account=(l->>'creditAccount')::uuid,asset_account=nullif(l->>'assetAccount','')::uuid,
    value=mawatheeq_private.acc_amount(l->>'value'),salvage=mawatheeq_private.acc_amount(l->>'salvage'),months=(l->>'months')::integer,first_date=(l->>'firstDate')::date,partner_id=nullif(l->>'partnerId','')::uuid,
    case_id=nullif(l->>'caseId',''),analytic_id=nullif(l->>'analyticId','')::uuid,ref=left(coalesce(l->>'ref',''),200),revision=revision+1 where id=v_id;
  end if;
  perform mawatheeq_private.acc_schedule_build(v_id);
  return mawatheeq_private.acc_schedule_json(v_id);
 when 'confirm_schedule' then
  update mawatheeq_private.acc_schedules set state='running',revision=revision+1 where id=(p_data->>'id')::uuid and state='draft';
  if not found then raise exception 'الجدول ليس مسودة.'; end if;
  return mawatheeq_private.acc_schedule_json((p_data->>'id')::uuid);
 when 'delete_schedule' then
  if exists(select 1 from mawatheeq_private.acc_schedule_lines where schedule_id=(p_data->>'id')::uuid and move_id is not null) then raise exception 'رُحّلت أقساط من هذا الجدول؛ استبعده بدلاً من حذفه.'; end if;
  delete from mawatheeq_private.acc_schedules where id=(p_data->>'id')::uuid;
  return '{}'::jsonb;
 when 'post_schedules' then
  v_date:=coalesce(nullif(p_data->>'date','')::date,(now() at time zone 'Asia/Kuwait')::date);
  for r in select sl.id line_id,sl.date,sl.amount,sl.seq,sc2.id schedule_id,sc2.journal_id,sc2.name,sc2.months,sc2.partner_id,sc2.debit_account,sc2.credit_account,sc2.case_id,sc2.analytic_id from mawatheeq_private.acc_schedule_lines sl join mawatheeq_private.acc_schedules sc2 on sc2.id=sl.schedule_id
    where sc2.state='running' and sl.move_id is null and sl.date<=v_date and sl.date>v_lock and (coalesce(p_data->>'id','')='' or sc2.id=(p_data->>'id')::uuid) order by sl.date,sc2.name,sl.seq loop
   v_move:=mawatheeq_private.acc_post_lines(p_token,r.journal_id,r.date,r.name||' — '||r.seq||'/'||r.months,r.partner_id,'schedule:'||r.schedule_id,
    jsonb_build_array(jsonb_build_object('accountId',r.debit_account,'debit',r.amount,'credit',0,'caseId',coalesce(r.case_id,''),'analyticId',coalesce(r.analytic_id::text,'')),
     jsonb_build_object('accountId',r.credit_account,'debit',0,'credit',r.amount,'caseId',coalesce(r.case_id,''),'analyticId',coalesce(r.analytic_id::text,''))));
   update mawatheeq_private.acc_schedule_lines set move_id=v_move where id=r.line_id;
   v_count:=v_count+1;
  end loop;
  update mawatheeq_private.acc_schedules sc3 set state='closed' where state='running' and not exists(select 1 from mawatheeq_private.acc_schedule_lines where schedule_id=sc3.id and move_id is null);
  return jsonb_build_object('posted',v_count);
 when 'dispose_schedule' then
  select * into sc from mawatheeq_private.acc_schedules where id=(p_data->>'id')::uuid for update;
  if sc.id is null or sc.state<>'running' then raise exception 'يُستبعد جدول جارٍ فقط.'; end if;
  v_date:=nullif(p_data->>'date','')::date;
  if v_date is null or v_date<=v_lock then raise exception 'اختر تاريخاً بعد تاريخ الإقفال.'; end if;
  v_posted:=coalesce((select sum(amount) from mawatheeq_private.acc_schedule_lines where schedule_id=sc.id and move_id is not null),0);
  if sc.kind='asset' then
   -- Sold or scrapped: the asset leaves the books; its depreciation so far and any sale price against the rest, the difference a gain or loss.
   v_res:=coalesce(mawatheeq_private.acc_amount(p_data->>'saleAmount'),0);
   if v_res>0 and not exists(select 1 from mawatheeq_private.acc_accounts where id=nullif(p_data->>'saleAccount','')::uuid) then raise exception 'اختر الحساب الذي استُلم فيه ثمن البيع.'; end if;
   l:=jsonb_build_array(jsonb_build_object('accountId',sc.credit_account,'debit',v_posted,'credit',0),jsonb_build_object('accountId',sc.asset_account,'debit',0,'credit',sc.value));
   if v_res>0 then l:=l||jsonb_build_object('accountId',p_data->>'saleAccount','debit',v_res,'credit',0); end if;
   if sc.value-v_posted-v_res>0 then l:=l||jsonb_build_object('accountId',(select id from mawatheeq_private.acc_accounts where code='599200'),'debit',sc.value-v_posted-v_res,'credit',0);
   elsif sc.value-v_posted-v_res<0 then l:=l||jsonb_build_object('accountId',(select id from mawatheeq_private.acc_accounts where code='409200'),'debit',0,'credit',v_res+v_posted-sc.value); end if;
   l:=(select jsonb_agg(e) from jsonb_array_elements(l) e where (e->>'debit')::numeric<>0 or (e->>'credit')::numeric<>0);
   v_move:=mawatheeq_private.acc_post_lines(p_token,sc.journal_id,v_date,'استبعاد أصل: '||sc.name,sc.partner_id,'schedule:'||sc.id,l);
  else
   -- A deferral recognised at once: what is left goes in one entry.
   v_res:=sc.value-sc.salvage-v_posted;
   if v_res>0 then v_move:=mawatheeq_private.acc_post_lines(p_token,sc.journal_id,v_date,'إثبات الباقي: '||sc.name,sc.partner_id,'schedule:'||sc.id,
    jsonb_build_array(jsonb_build_object('accountId',sc.debit_account,'debit',v_res,'credit',0),jsonb_build_object('accountId',sc.credit_account,'debit',0,'credit',v_res))); end if;
  end if;
  delete from mawatheeq_private.acc_schedule_lines where schedule_id=sc.id and move_id is null;
  if v_move is not null then insert into mawatheeq_private.acc_schedule_lines(schedule_id,seq,date,amount,move_id) values(sc.id,(select coalesce(max(seq),0)+1 from mawatheeq_private.acc_schedule_lines where schedule_id=sc.id),v_date,
   case when sc.kind='asset' then 0 else coalesce(v_res,0) end,v_move); end if;
  update mawatheeq_private.acc_schedules set state='closed',revision=revision+1 where id=sc.id;
  return mawatheeq_private.acc_schedule_json(sc.id);
 when 'list_schedules' then
  return (select coalesce(jsonb_agg(mawatheeq_private.acc_schedule_json(sc4.id) order by sc4.first_date desc),'[]') from mawatheeq_private.acc_schedules sc4 where coalesce(p_data->>'kind','')='' or sc4.kind=p_data->>'kind');
 when 'save_recurring' then
  l:=p_data->'recurring'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or length(btrim(coalesce(l->>'name',''))) not between 1 and 160 then raise exception 'اكتب اسم القيد المتكرر.'; end if;
  if coalesce(l->>'kind','') not in ('entry','out_invoice','in_invoice') or jsonb_typeof(l->'template')<>'object' then raise exception 'حدد نوع المستند ومحتواه.'; end if;
  if coalesce(l->>'nextDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'اختر تاريخ أول مرة.'; end if;
  if v_id is null then insert into mawatheeq_private.acc_recurring(name,kind,template,interval_months,next_date,end_date,auto_post) values(btrim(l->>'name'),l->>'kind',l->'template',coalesce((l->>'interval')::integer,1),
    (l->>'nextDate')::date,nullif(l->>'endDate','')::date,coalesce((l->>'autoPost')::boolean,false)) returning id into v_id;
  else update mawatheeq_private.acc_recurring set name=btrim(l->>'name'),kind=l->>'kind',template=l->'template',interval_months=coalesce((l->>'interval')::integer,1),next_date=(l->>'nextDate')::date,end_date=nullif(l->>'endDate','')::date,
    auto_post=coalesce((l->>'autoPost')::boolean,false),active=coalesce((l->>'active')::boolean,true),revision=revision+1 where id=v_id;
  end if;
  return jsonb_build_object('id',v_id);
 when 'delete_recurring' then
  delete from mawatheeq_private.acc_recurring where id=(p_data->>'id')::uuid;
  return '{}'::jsonb;
 when 'list_recurring' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',rr.id,'name',rr.name,'kind',rr.kind,'template',rr.template,'interval',rr.interval_months,'nextDate',rr.next_date,'endDate',rr.end_date,'autoPost',rr.auto_post,
    'active',rr.active,'lastRun',rr.last_run,'revision',rr.revision) order by rr.next_date),'[]') from mawatheeq_private.acc_recurring rr);
 when 'run_recurring' then
  v_date:=coalesce(nullif(p_data->>'date','')::date,(now() at time zone 'Asia/Kuwait')::date);
  for rc in select * from mawatheeq_private.acc_recurring where active and next_date<=v_date order by next_date for update loop
   i:=0;
   while rc.next_date<=v_date and (rc.end_date is null or rc.next_date<=rc.end_date) and i<36 loop
    i:=i+1;
    if rc.next_date>v_lock then
     result:=case when rc.kind='entry' then mawatheeq_private.books_request(p_token,'save_move',jsonb_build_object('move',rc.template||jsonb_build_object('date',rc.next_date,'id',null)))
      else mawatheeq_private.books_request(p_token,'save_invoice',jsonb_build_object('invoice',rc.template||jsonb_build_object('date',rc.next_date,'moveType',rc.kind,'id',null,'dueDate',''))) end;
     update mawatheeq_private.acc_moves set source='recurring:'||rc.id where id=(result->>'id')::uuid;
     if rc.auto_post then select revision into v_rev from mawatheeq_private.acc_moves where id=(result->>'id')::uuid;
      result:=mawatheeq_private.books_request(p_token,'post',jsonb_build_object('id',result->>'id','revision',v_rev)); end if;
     v_created:=v_created||jsonb_build_object('id',result->>'id','name',result->>'name','date',rc.next_date,'recurring',rc.name);
    end if;
    rc.next_date:=(rc.next_date+(rc.interval_months||' month')::interval)::date;
   end loop;
   update mawatheeq_private.acc_recurring set next_date=rc.next_date,last_run=v_date,active=(end_date is null or rc.next_date<=end_date),revision=revision+1 where id=rc.id;
  end loop;
  return jsonb_build_object('created',v_created);
 when 'followups' then
  v_date:=(now() at time zone 'Asia/Kuwait')::date;
  return jsonb_build_object('levels',(select coalesce(jsonb_agg(jsonb_build_object('id',fl.id,'days',fl.days,'name',fl.name,'message',fl.message,'revision',fl.revision) order by fl.days),'[]') from mawatheeq_private.acc_followup_levels fl),
   'partners',(select coalesce(jsonb_agg(z.j order by z.late desc),'[]') from (
    select max(v_date-ol.date_maturity) late,jsonb_build_object('partnerId',pa.id,'name',pa.name,'phone',pa.phone,'email',pa.email,'overdue',sum(ol.amount_residual)::text,'maxDays',max(v_date-ol.date_maturity),
     'level',(select jsonb_build_object('id',fl.id,'name',fl.name,'days',fl.days,'message',fl.message) from mawatheeq_private.acc_followup_levels fl where fl.days<=max(v_date-ol.date_maturity) order by fl.days desc limit 1),
     'last',(select jsonb_build_object('date',f.date,'level',coalesce((select name from mawatheeq_private.acc_followup_levels where id=f.level_id),''),'levelDays',coalesce((select days from mawatheeq_private.acc_followup_levels where id=f.level_id),-1),'note',f.note)
       from mawatheeq_private.acc_followups f where f.partner_id=pa.id order by f.date desc,f.created_at desc limit 1),
     'invoices',jsonb_agg(jsonb_build_object('moveId',om.id,'name',om.name,'date',om.date,'due',ol.date_maturity,'days',v_date-ol.date_maturity,'amount',ol.amount_residual::text) order by ol.date_maturity)) j
    from mawatheeq_private.acc_move_lines ol join mawatheeq_private.acc_moves om on om.id=ol.move_id and om.state='posted' join mawatheeq_private.acc_partners pa on pa.id=ol.partner_id
    where ol.account_id=s.receivable_account and ol.debit>0 and ol.amount_residual>0 and ol.date_maturity<v_date group by pa.id,pa.name,pa.phone,pa.email) z));
 when 'followup_done' then
  if not exists(select 1 from mawatheeq_private.acc_partners where id=(p_data->>'partnerId')::uuid) then raise exception 'اختر العميل.'; end if;
  insert into mawatheeq_private.acc_followups(partner_id,level_id,date,note,actor_id) values((p_data->>'partnerId')::uuid,nullif(p_data->>'levelId','')::uuid,coalesce(nullif(p_data->>'date','')::date,(now() at time zone 'Asia/Kuwait')::date),
   left(coalesce(p_data->>'note',''),1000),actor);
  return '{}'::jsonb;
 when 'save_followup_level' then
  l:=p_data->'level'; v_id:=nullif(l->>'id','')::uuid;
  if l is null or coalesce(l->>'days','') !~ '^\d{1,4}$' or length(btrim(coalesce(l->>'name','')))=0 then raise exception 'اكتب اسم المستوى وعدد أيام التأخير.'; end if;
  if exists(select 1 from mawatheeq_private.acc_followup_levels where days=(l->>'days')::integer and id is distinct from v_id) then raise exception 'يوجد مستوى بعدد الأيام نفسه.'; end if;
  if v_id is null then insert into mawatheeq_private.acc_followup_levels(days,name,message) values((l->>'days')::integer,btrim(l->>'name'),left(coalesce(l->>'message',''),2000)) returning id into v_id;
  elsif coalesce((l->>'delete')::boolean,false) then delete from mawatheeq_private.acc_followup_levels where id=v_id;
  else update mawatheeq_private.acc_followup_levels set days=(l->>'days')::integer,name=btrim(l->>'name'),message=left(coalesce(l->>'message',''),2000),revision=revision+1 where id=v_id;
  end if;
  return jsonb_build_object('id',v_id);
 when 'year_end','close_year' then
  v_to:=nullif(p_data->>'yearEnd','')::date;
  if v_to is null then raise exception 'اختر تاريخ نهاية السنة.'; end if;
  v_from:=(v_to-interval '1 year'+interval '1 day')::date;
  result:=jsonb_build_object('yearEnd',v_to,'from',v_from,
   'drafts',(select count(*) from mawatheeq_private.acc_moves where state='draft' and date<=v_to),
   'statementLines',(select count(*) from mawatheeq_private.acc_statement_lines where not reconciled and date<=v_to),
   'schedules',(select count(*) from mawatheeq_private.acc_schedule_lines sl join mawatheeq_private.acc_schedules sc5 on sc5.id=sl.schedule_id where sc5.state='running' and sl.move_id is null and sl.date<=v_to),
   'recurring',(select count(*) from mawatheeq_private.acc_recurring where active and next_date<=v_to),
   'openReceivable',coalesce((select sum(amount_residual) from mawatheeq_private.acc_move_lines where account_id=s.receivable_account and debit>0 and amount_residual>0),0)::text,
   'profit',coalesce((select sum(cl.credit-cl.debit) from mawatheeq_private.acc_move_lines cl join mawatheeq_private.acc_moves cm on cm.id=cl.move_id join mawatheeq_private.acc_accounts ca on ca.id=cl.account_id
     where cm.state='posted' and cm.date between v_from and v_to and ca.type in ('income','income_other','expense','expense_depreciation','expense_direct_cost')),0)::text,
   'lockDate',s.lock_date,'fiscalLockDate',s.fiscal_lock_date);
  if p_action='year_end' then return result; end if;
  if (result->>'drafts')::integer>0 then raise exception 'توجد % مسودة حتى نهاية السنة؛ رحّلها أو ألغها قبل الإقفال.',result->>'drafts'; end if;
  if s.fiscal_lock_date>=v_to then raise exception 'هذه السنة مقفلة بالفعل.'; end if;
  -- The year's result is not moved by an entry: the balance sheet already reports it as earlier years' result.
  update mawatheeq_private.acc_settings set fiscal_lock_date=v_to,lock_date=greatest(lock_date,v_to),revision=revision+1;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('settings','00000000-0000-0000-0000-000000000000','close_year',to_jsonb(s),result,actor);
  return result||jsonb_build_object('closed',true);
 end case;
end $$;

-- The document view also shows the currency.
alter function mawatheeq_private.acc_document_json(uuid) rename to acc_document_bank_json;
create function mawatheeq_private.acc_document_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select mawatheeq_private.acc_document_bank_json(p_id)||coalesce((select jsonb_build_object('currency',m.currency,'currencyRate',m.currency_rate::text,'amountTotalCurrency',m.amount_total_currency::text,
  'lines',coalesce((select jsonb_agg(e||coalesce((select jsonb_build_object('taxIds',to_jsonb(ml.tax_ids),'taxId',coalesce(ml.tax_id::text,''),'amountCurrency',coalesce(ml.amount_currency::text,''),'analyticId',coalesce(ml.analytic_id::text,''))
    from mawatheeq_private.acc_move_lines ml where ml.id=(e->>'id')::uuid),'{}') order by n) from jsonb_array_elements(mawatheeq_private.acc_document_bank_json(p_id)->'lines') with ordinality as t(e,n)),'[]'))
  from mawatheeq_private.acc_moves m where m.id=p_id),'{}');
$$;

revoke all on function mawatheeq_private.acc_rate(text,date),mawatheeq_private.acc_post_lines(text,uuid,date,text,uuid,text,jsonb),mawatheeq_private.acc_schedule_build(uuid),mawatheeq_private.acc_schedule_json(uuid),
 mawatheeq_private.acc_document_json(uuid),mawatheeq_private.acc_document_bank_json(uuid),
 mawatheeq_private.books_request(text,text,jsonb),mawatheeq_private.books_request_reports(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.books_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
