begin;
-- Books, phase 4 (22 October 2026): the full set of reports, read from posted entries only.
-- * Partner ledger: each customer's and supplier's receivable and payable movements with opening and running balances.
-- * Aged receivables and payables: what is still open by how long past due (not due, 1–30 … over 120 days).
-- * Cash flow: money in and out of the bank and cash accounts, by what it was for (operating, investing, financing).
-- * Executive summary: income, expenses, profit, cash, what is owed both ways and what is overdue.
-- * Profit by case: income, expenses and open fees of every case.
-- * Journal report: every entry of a journal with its lines and totals.
-- (The profit and loss and balance sheet comparisons with an earlier period are built from two trial balances.)

alter function mawatheeq_private.books_request(text,text,jsonb) rename to books_request_bank;
create function mawatheeq_private.books_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; s mawatheeq_private.acc_settings%rowtype; v_from date; v_to date; v_as date; v_acc uuid[];
begin
 if p_action='setup' then return mawatheeq_private.books_request_bank(p_token,p_action,p_data)||jsonb_build_object('reports',true); end if;
 if p_action not in ('partner_ledger','aged','cash_flow','executive_summary','case_report','journal_report') then return mawatheeq_private.books_request_bank(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
 perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'accounting') and a->>'caseScope'='all');
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'الطلب غير صالح.'; end if;
 select * into s from mawatheeq_private.acc_settings;
 v_from:=coalesce(nullif(p_data->>'from','')::date,'0001-01-01'); v_to:=coalesce(nullif(p_data->>'to','')::date,'9999-12-31');
 case p_action
 when 'partner_ledger' then
  v_acc:=case p_data->>'side' when 'receivable' then array[s.receivable_account] when 'payable' then array[s.payable_account] else array[s.receivable_account,s.payable_account] end;
  return (select coalesce(jsonb_agg(p.j order by p.name),'[]') from (
   select pa.name,jsonb_build_object('partnerId',pa.id,'name',pa.name,
     'opening',coalesce(sum(pl.debit-pl.credit) filter (where pm.date<v_from),0)::text,
     'debit',coalesce(sum(pl.debit) filter (where pm.date>=v_from),0)::text,'credit',coalesce(sum(pl.credit) filter (where pm.date>=v_from),0)::text,
     'closing',coalesce(sum(pl.debit-pl.credit),0)::text,
     'lines',case when coalesce(p_data->>'partnerId','')<>'' or coalesce((p_data->>'details')::boolean,false) then coalesce(jsonb_agg(jsonb_build_object('moveId',pm.id,'name',pm.name,'date',pm.date,'ref',pm.ref,'label',pl.label,
       'dateMaturity',pl.date_maturity,'debit',pl.debit::text,'credit',pl.credit::text,'residual',pl.amount_residual::text) order by pm.date,pm.name,pl.seq) filter (where pm.date>=v_from),'[]') else '[]' end) j
   from mawatheeq_private.acc_partners pa join mawatheeq_private.acc_move_lines pl on pl.partner_id=pa.id and pl.account_id=any(v_acc)
    join mawatheeq_private.acc_moves pm on pm.id=pl.move_id and pm.state='posted' and pm.date<=v_to
   where coalesce(p_data->>'partnerId','')='' or pa.id=(p_data->>'partnerId')::uuid
   group by pa.id,pa.name) p);
 when 'aged' then
  v_as:=coalesce(nullif(p_data->>'asOf','')::date,(now() at time zone 'Asia/Kuwait')::date);
  return (select coalesce(jsonb_agg(z.j order by z.total desc),'[]') from (
   select sum(x.amt) total,jsonb_build_object('partnerId',x.pid,'name',coalesce(max(x.pname),'بلا شريك'),'total',sum(x.amt)::text,
     'current',coalesce(sum(x.amt) filter (where x.days<=0),0)::text,'d30',coalesce(sum(x.amt) filter (where x.days between 1 and 30),0)::text,
     'd60',coalesce(sum(x.amt) filter (where x.days between 31 and 60),0)::text,'d90',coalesce(sum(x.amt) filter (where x.days between 61 and 90),0)::text,
     'd120',coalesce(sum(x.amt) filter (where x.days between 91 and 120),0)::text,'older',coalesce(sum(x.amt) filter (where x.days>120),0)::text,
     'lines',jsonb_agg(jsonb_build_object('moveId',x.mid,'name',x.mname,'date',x.mdate,'due',x.due,'days',greatest(x.days,0),'amount',x.amt::text) order by x.due)) j
   from (select al.partner_id pid,(select name from mawatheeq_private.acc_partners where id=al.partner_id) pname,am.id mid,am.name mname,am.date mdate,coalesce(al.date_maturity,am.date) due,
     v_as-coalesce(al.date_maturity,am.date) days,
     al.amount_residual*case when (coalesce(p_data->>'side','receivable')='payable')=(al.credit>0) then 1 else -1 end amt
    from mawatheeq_private.acc_move_lines al join mawatheeq_private.acc_moves am on am.id=al.move_id
    where am.state='posted' and am.date<=v_as and al.amount_residual>0 and al.account_id=case when p_data->>'side'='payable' then s.payable_account else s.receivable_account end) x
   group by x.pid) z);
 when 'cash_flow' then
  return (with cash as (select id from mawatheeq_private.acc_accounts where type='asset_cash'),
   mv as (select cm.id,sum(cl.debit-cl.credit) filter (where cl.account_id in (select id from cash)) delta
    from mawatheeq_private.acc_moves cm join mawatheeq_private.acc_move_lines cl on cl.move_id=cm.id where cm.state='posted' and cm.date between v_from and v_to group by cm.id),
   flows as (select case when ca.type in ('asset_fixed','asset_non_current') then 'investing' when ca.type in ('equity','equity_unaffected','liability_non_current') then 'financing' else 'operating' end section,
     ca.id,ca.code,ca.name,-(nl.debit-nl.credit) amt
    from mv join mawatheeq_private.acc_move_lines nl on nl.move_id=mv.id and nl.account_id not in (select id from cash) join mawatheeq_private.acc_accounts ca on ca.id=nl.account_id where coalesce(mv.delta,0)<>0)
   select jsonb_build_object(
    'opening',coalesce((select sum(ol.debit-ol.credit) from mawatheeq_private.acc_move_lines ol join mawatheeq_private.acc_moves om on om.id=ol.move_id where om.state='posted' and om.date<v_from and ol.account_id in (select id from cash)),0)::text,
    'closing',coalesce((select sum(ol.debit-ol.credit) from mawatheeq_private.acc_move_lines ol join mawatheeq_private.acc_moves om on om.id=ol.move_id where om.state='posted' and om.date<=v_to and ol.account_id in (select id from cash)),0)::text,
    'inflow',coalesce((select sum(delta) from mv where delta>0),0)::text,'outflow',coalesce((select sum(-delta) from mv where delta<0),0)::text,
    'sections',(select coalesce(jsonb_agg(jsonb_build_object('section',f.section,'accountId',f.id,'code',f.code,'name',f.name,'amount',f.amt::text) order by f.section,f.code),'[]')
      from (select section,id,code,name,sum(amt) amt from flows group by section,id,code,name having sum(amt)<>0) f)));
 when 'executive_summary' then
  v_as:=(now() at time zone 'Asia/Kuwait')::date;
  return (with pl as (select ea.type,sum(el.debit-el.credit) bal from mawatheeq_private.acc_move_lines el join mawatheeq_private.acc_moves em on em.id=el.move_id and em.state='posted' and em.date between v_from and v_to
     join mawatheeq_private.acc_accounts ea on ea.id=el.account_id group by ea.type)
   select jsonb_build_object(
    'income',coalesce(-(select sum(bal) from pl where type in ('income','income_other')),0)::text,
    'expenses',coalesce((select sum(bal) from pl where type in ('expense','expense_depreciation','expense_direct_cost')),0)::text,
    'cash',coalesce((select sum(cl.debit-cl.credit) from mawatheeq_private.acc_move_lines cl join mawatheeq_private.acc_moves cm on cm.id=cl.move_id join mawatheeq_private.acc_accounts ca on ca.id=cl.account_id where cm.state='posted' and cm.date<=v_to and ca.type='asset_cash'),0)::text,
    'receivable',coalesce((select sum(case when rl.debit>0 then rl.amount_residual else -rl.amount_residual end) from mawatheeq_private.acc_move_lines rl where rl.account_id=s.receivable_account and rl.amount_residual>0),0)::text,
    'payable',coalesce((select sum(case when rl.credit>0 then rl.amount_residual else -rl.amount_residual end) from mawatheeq_private.acc_move_lines rl where rl.account_id=s.payable_account and rl.amount_residual>0),0)::text,
    'overdueReceivable',coalesce((select sum(rl.amount_residual) from mawatheeq_private.acc_move_lines rl where rl.account_id=s.receivable_account and rl.debit>0 and rl.amount_residual>0 and rl.date_maturity<v_as),0)::text,
    'overduePayable',coalesce((select sum(rl.amount_residual) from mawatheeq_private.acc_move_lines rl where rl.account_id=s.payable_account and rl.credit>0 and rl.amount_residual>0 and rl.date_maturity<v_as),0)::text,
    'invoiced',coalesce((select sum(amount_total) from mawatheeq_private.acc_moves where move_type='out_invoice' and state='posted' and date between v_from and v_to),0)::text,
    'invoices',(select count(*) from mawatheeq_private.acc_moves where move_type='out_invoice' and state='posted' and date between v_from and v_to),
    'collected',coalesce((select sum(amount_total) from mawatheeq_private.acc_moves where payment_type='inbound' and partner_type='customer' and state='posted' and date between v_from and v_to),0)::text,
    'bills',coalesce((select sum(amount_total) from mawatheeq_private.acc_moves where move_type='in_invoice' and state='posted' and date between v_from and v_to),0)::text,
    'drafts',(select count(*) from mawatheeq_private.acc_moves where state='draft')));
 when 'case_report' then
  return (select coalesce(jsonb_agg(c.j order by c.net desc),'[]') from (
   select sum(case when ra.type in ('income','income_other') then rl.credit-rl.debit when ra.type in ('expense','expense_depreciation','expense_direct_cost') then -(rl.debit-rl.credit) else 0 end) net,
    jsonb_build_object('caseId',rl.case_id,'code',coalesce(max(mc.payload->>'code'),''),'autoNumber',coalesce(max(mc.payload->>'autoNumber'),''),'client',coalesce(max(mc.payload->>'client'),''),
     'income',coalesce(sum(rl.credit-rl.debit) filter (where ra.type in ('income','income_other')),0)::text,
     'expenses',coalesce(sum(rl.debit-rl.credit) filter (where ra.type in ('expense','expense_depreciation','expense_direct_cost')),0)::text,
     'recharged',coalesce(sum(rl.credit-rl.debit) filter (where ra.code like '133%'),0)::text,
     'open',coalesce(sum(rl.amount_residual) filter (where rl.account_id=s.receivable_account and rl.debit>0),0)::text,
     'net',sum(case when ra.type in ('income','income_other') then rl.credit-rl.debit when ra.type in ('expense','expense_depreciation','expense_direct_cost') then -(rl.debit-rl.credit) else 0 end)::text) j
   from mawatheeq_private.acc_move_lines rl join mawatheeq_private.acc_moves rm on rm.id=rl.move_id and rm.state='posted' and rm.date between v_from and v_to
    join mawatheeq_private.acc_accounts ra on ra.id=rl.account_id left join public.mawatheeq_cases mc on mc.id=rl.case_id
   where rl.case_id is not null group by rl.case_id) c);
 when 'journal_report' then
  return (select coalesce(jsonb_agg(jsonb_build_object('moveId',jm.id,'name',jm.name,'date',jm.date,'ref',jm.ref,'partner',coalesce((select name from mawatheeq_private.acc_partners where id=jm.partner_id),''),
    'lines',(select jsonb_agg(jsonb_build_object('code',ja.code,'account',ja.name,'label',jl.label,'debit',jl.debit::text,'credit',jl.credit::text) order by jl.seq)
     from mawatheeq_private.acc_move_lines jl join mawatheeq_private.acc_accounts ja on ja.id=jl.account_id where jl.move_id=jm.id)) order by jm.date,jm.name),'[]')
   from mawatheeq_private.acc_moves jm where jm.state='posted' and jm.journal_id=(p_data->>'journalId')::uuid and jm.date between v_from and v_to);
 end case;
end $$;
revoke all on function mawatheeq_private.books_request(text,text,jsonb),mawatheeq_private.books_request_bank(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.books_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
