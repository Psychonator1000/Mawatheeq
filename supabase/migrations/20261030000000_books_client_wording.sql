-- Accounting calls the office's customers «الموكلون», like the rest of the app: the default receivable account, the
-- customer invoices journal and the messages the books functions show. Accounts or journals the office already
-- renamed itself are left as they are.
begin;

update mawatheeq_private.acc_accounts set name='ذمم الموكلين المدينة',updated_at=clock_timestamp(),revision=revision+1
 where code='121000' and name='ذمم العملاء المدينة';
update mawatheeq_private.acc_journals set name='فواتير الموكلين' where code='INV' and name='فواتير العملاء';

do $$
declare f record; def text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','mawatheeq_private') and p.prokind='f' and p.prosrc ~ '(اختر العميل|فواتير العملاء|''العميل'')'
 loop
  def:=pg_get_functiondef(f.oid);
  def:=replace(replace(replace(def,'اختر العميل','اختر الموكل'),'فواتير العملاء','فواتير الموكلين'),'''العميل''','''الموكل''');
  execute def;
 end loop;
end $$;

notify pgrst,'reload schema';
commit;
