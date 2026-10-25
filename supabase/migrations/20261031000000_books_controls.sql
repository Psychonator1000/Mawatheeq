-- Books, phase 7 (25 October 2026): controls over who posts what, and when.
-- * Approvals (off until switched on): an accountant may post up to their own limit; anything above it — an entry,
--   invoice, bill, payment, payment run or reversal — is not posted but waits as a request. A manager (the owner or
--   an approver within their own approval limit) approves it, which posts it in the approver's name, or rejects it.
--   Nobody approves their own request, and a document waiting for approval cannot be changed.
-- * Payment run: the supplier bills and client refunds due by a date are proposed, and the chosen ones are paid in one
--   batch, one payment per partner.
-- * Monthly periods: each month can be closed and reopened on its own. Nothing dated in a closed month can be added,
--   posted, changed or removed, whichever screen or automatic step tries it.
-- * Change log: every recorded change across the books, filtered by date, person, kind and action, with the record as
--   it was before and after.
-- * Credit limits: the most a client may owe. Posting an invoice that takes a client over it warns, or is refused for a
--   client set to block (the owner may still post it).
-- The phase 6 request function is kept and wrapped.
begin;

alter table mawatheeq_private.acc_settings add column approvals_enabled boolean not null default false,
 add column approval_default_limit numeric(18,3) not null default 0 check (approval_default_limit>=0);

-- Per person: what they may post without approval, and whether (and up to what amount) they approve others' requests.
create table mawatheeq_private.acc_approvers (
 user_id uuid primary key references mawatheeq_private.accounts(id) on delete cascade,
 post_limit numeric(18,3) check (post_limit>=0),
 can_approve boolean not null default false,
 approve_limit numeric(18,3) check (approve_limit>=0),
 updated_at timestamptz not null default clock_timestamp()
);

create table mawatheeq_private.acc_approvals (
 id uuid primary key default gen_random_uuid(),
 action text not null,
 payload jsonb not null default '{}',
 move_id uuid references mawatheeq_private.acc_moves(id) on delete cascade,
 label text not null default '',
 partner_id uuid references mawatheeq_private.acc_partners(id) on delete set null,
 amount numeric(18,3) not null default 0,
 status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
 requested_by uuid not null references mawatheeq_private.accounts(id),
 requested_at timestamptz not null default clock_timestamp(),
 decided_by uuid references mawatheeq_private.accounts(id),
 decided_at timestamptz,
 note text not null default '',
 result jsonb
);
create unique index acc_approvals_one_per_move on mawatheeq_private.acc_approvals(move_id) where status='pending' and move_id is not null;
create index acc_approvals_status on mawatheeq_private.acc_approvals(status,requested_at desc);

-- A closed month: the first day of the month.
create table mawatheeq_private.acc_periods (
 month date primary key check (month=date_trunc('month',month)::date),
 closed_by uuid not null references mawatheeq_private.accounts(id),
 closed_at timestamptz not null default clock_timestamp()
);

alter table mawatheeq_private.acc_partners add column credit_limit numeric(18,3) check (credit_limit>=0),
 add column credit_block boolean not null default false;

revoke all on mawatheeq_private.acc_approvers,mawatheeq_private.acc_approvals,mawatheeq_private.acc_periods from public,anon,authenticated;

create function mawatheeq_private.acc_period_closed(p_date date) returns boolean language sql stable set search_path='' as $$
 select p_date is not null and exists(select 1 from mawatheeq_private.acc_periods where month=date_trunc('month',p_date)::date); $$;

-- Closed months are enforced on the tables themselves, so no path around them exists. Payment status and matching may
-- still change on an old invoice paid in an open month: only the date, state, number and amounts are frozen.
create function mawatheeq_private.acc_period_guard() returns trigger language plpgsql set search_path='' as $$
declare d date;
begin
 if tg_table_name='acc_moves' then
  if tg_op='INSERT' then d:=new.date;
  elsif tg_op='DELETE' then d:=old.date;
  elsif (old.date,old.state,old.name) is distinct from (new.date,new.state,new.name) then
   d:=case when mawatheeq_private.acc_period_closed(old.date) then old.date else new.date end;
  else return new; end if;
 else
  if tg_op='UPDATE' and (old.debit,old.credit,old.account_id,old.move_id) is not distinct from (new.debit,new.credit,new.account_id,new.move_id) then return new; end if;
  select date into d from mawatheeq_private.acc_moves where id=case when tg_op='DELETE' then old.move_id else new.move_id end;
 end if;
 if mawatheeq_private.acc_period_closed(d) then
  raise exception 'شهر % مقفل؛ لا يُضاف إليه ولا يُعدّل فيه شيء حتى يُعاد فتحه من «الحسابات والإعدادات».',to_char(d,'MM/YYYY');
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger acc_moves_period before insert or update or delete on mawatheeq_private.acc_moves for each row execute function mawatheeq_private.acc_period_guard();
create trigger acc_move_lines_period before insert or update or delete on mawatheeq_private.acc_move_lines for each row execute function mawatheeq_private.acc_period_guard();

-- What a client owes now: the open amount of their receivable lines (refunds and advances reduce it).
create function mawatheeq_private.acc_partner_open(p_partner uuid) returns numeric language sql stable set search_path='' as $$
 select coalesce(sum(case when l.debit>0 then l.amount_residual else -l.amount_residual end),0)
 from mawatheeq_private.acc_move_lines l join mawatheeq_private.acc_moves m on m.id=l.move_id and m.state='posted'
 where l.partner_id=p_partner and l.account_id=(select receivable_account from mawatheeq_private.acc_settings); $$;

-- After a call posted client invoices: refused for a client over a blocking limit (unless p_override), otherwise a
-- warning naming each client over their limit, or '' when none is.
create function mawatheeq_private.acc_credit_check(p_actor uuid,p_since timestamptz,p_override boolean) returns text language plpgsql set search_path='' as $$
declare r record; warn text:='';
begin
 for r in select distinct p.id,p.name,p.credit_limit,p.credit_block from mawatheeq_private.acc_moves m join mawatheeq_private.acc_partners p on p.id=m.partner_id
  where m.move_type='out_invoice' and m.state='posted' and m.posted_by=p_actor and m.posted_at>=p_since and p.credit_limit is not null loop
  if mawatheeq_private.acc_partner_open(r.id)>r.credit_limit then
   if r.credit_block and not p_override then
    raise exception 'تتجاوز الفاتورة حد الائتمان للموكل «%» (الحد % والمستحق بعدها %). اطلب من مسؤول المكتب ترحيلها أو عدّل الحد.',r.name,r.credit_limit,mawatheeq_private.acc_partner_open(r.id);
   end if;
   warn:=warn||case when warn='' then '' else '، ' end||r.name||' (المستحق '||mawatheeq_private.acc_partner_open(r.id)||' والحد '||r.credit_limit||')';
  end if;
 end loop;
 return case when warn='' then '' else 'تجاوز حد الائتمان: '||warn end;
end $$;

create function mawatheeq_private.acc_person(p_id uuid) returns text language sql stable set search_path='' as $$
 select coalesce(nullif(display_name,''),username) from mawatheeq_private.accounts where id=p_id; $$;

create function mawatheeq_private.acc_approval_json(x mawatheeq_private.acc_approvals) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',x.id,'action',x.action,'moveId',coalesce(x.move_id::text,''),'label',x.label,'partnerId',coalesce(x.partner_id::text,''),
  'partner',coalesce((select name from mawatheeq_private.acc_partners where id=x.partner_id),''),'amount',x.amount::text,'status',x.status,
  'requestedBy',x.requested_by,'requester',mawatheeq_private.acc_person(x.requested_by),'requestedAt',x.requested_at,
  'decider',coalesce(mawatheeq_private.acc_person(x.decided_by),''),'decidedAt',x.decided_at,'note',x.note); $$;

-- Actions that only read, or that are part of the controls themselves, never wait for approval.
create function mawatheeq_private.acc_controls_action(p_action text) returns boolean language sql immutable set search_path='' as $$
 select p_action in ('approval_settings','save_approval_settings','list_approvals','approve','reject','cancel_approval','payment_proposal','payment_run',
  'list_periods','close_period','reopen_period','list_changes','get_change','save_credit','credit_report'); $$;

alter function mawatheeq_private.books_request(text,text,jsonb) rename to books_request_links;
create function mawatheeq_private.books_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; can_edit boolean; can_config boolean; v_outer boolean; s mawatheeq_private.acc_settings%rowtype; ap mawatheeq_private.acc_approvals%rowtype;
 v_limit numeric; v_amount numeric; v_start timestamptz; v_label text; v_partner uuid; v_move uuid; v_id uuid; result jsonb; v_warn text; v_month date; v_year integer; r record; x jsonb;
begin
 v_outer:=coalesce(current_setting('mawatheeq.books_nested',true),'')='';
 -- Steps a request takes on its own (posting a payment it created, a reversal it posts) are not separate requests.
 if not v_outer and not mawatheeq_private.acc_controls_action(p_action) then return mawatheeq_private.books_request_links(p_token,p_action,p_data); end if;
 perform set_config('mawatheeq.books_nested','1',true);
 actor:=mawatheeq_private.authorize(p_token); a:=mawatheeq_private.access_for(actor);
 perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'accounting') and a->>'caseScope'='all');
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>500000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 can_edit:=coalesce((a->>'canEdit')::boolean,false); can_config:=mawatheeq_private.is_owner();
 select * into s from mawatheeq_private.acc_settings;

 if not mawatheeq_private.acc_controls_action(p_action) then
  -- A document waiting for approval stays as it was sent.
  v_label:=coalesce(nullif(p_data->>'id',''),nullif(p_data#>>'{move,id}',''),nullif(p_data#>>'{invoice,id}',''),nullif(p_data#>>'{payment,id}',''));
  v_id:=case when v_label ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_label::uuid end; v_label:=null;
  if v_id is not null and p_action<>'get_move' and p_action not like 'get%' and p_action not like 'list%' and p_action<>'history'
   and exists(select 1 from mawatheeq_private.acc_approvals where move_id=v_id and status='pending') then
   raise exception 'هذا المستند بانتظار الاعتماد؛ لا يُعدّل حتى يُعتمد أو يُرفض أو يُسحب الطلب.';
  end if;
  v_start:=clock_timestamp();
  if p_action='setup' then
   result:=mawatheeq_private.books_request_links(p_token,p_action,p_data);
   return result||jsonb_build_object('controls',jsonb_build_object(
    'approvalsEnabled',s.approvals_enabled,
    'myLimit',case when can_config or not s.approvals_enabled then null else coalesce((select post_limit from mawatheeq_private.acc_approvers where user_id=actor),s.approval_default_limit)::text end,
    'canApprove',can_config or exists(select 1 from mawatheeq_private.acc_approvers where user_id=actor and can_approve),
    'pending',(select count(*) from mawatheeq_private.acc_approvals where status='pending'),
    'myPending',(select count(*) from mawatheeq_private.acc_approvals where status='pending' and requested_by=actor),
    'closedMonths',(select coalesce(jsonb_agg(to_char(month,'YYYY-MM') order by month),'[]') from mawatheeq_private.acc_periods),
    'credit',(select coalesce(jsonb_object_agg(p.id,jsonb_build_object('limit',p.credit_limit::text,'block',p.credit_block,'open',mawatheeq_private.acc_partner_open(p.id)::text)),'{}')
      from mawatheeq_private.acc_partners p where p.credit_limit is not null)));
  end if;
  if s.approvals_enabled and not can_config and can_edit then
   v_limit:=coalesce((select post_limit from mawatheeq_private.acc_approvers where user_id=actor),s.approval_default_limit);
   begin
    result:=mawatheeq_private.books_request_links(p_token,p_action,p_data);
    select coalesce(sum(t.amount),0),string_agg(t.label,'، '),min(t.partner_id::text)::uuid,case when count(*)=1 then min(t.id::text)::uuid end into v_amount,v_label,v_partner,v_move from (
     select mv.id,mv.partner_id,(select coalesce(sum(debit),0) from mawatheeq_private.acc_move_lines where move_id=mv.id) amount,
      case mv.move_type when 'out_invoice' then 'فاتورة موكل' when 'out_refund' then 'إشعار دائن لموكل' when 'in_invoice' then 'فاتورة مورد' when 'in_refund' then 'إشعار دائن من مورد'
       else case when mv.payment_type='inbound' then 'دفعة مقبوضة' when mv.payment_type='outbound' then 'دفعة مدفوعة' when mv.reversed_from is not null then 'قيد عكسي' else 'قيد يومية' end end
       ||coalesce(' · '||nullif(mv.ref,''),'') label
     from mawatheeq_private.acc_moves mv where mv.posted_by=actor and mv.posted_at>=v_start and mv.state='posted') t;
    if v_amount>v_limit then raise exception using errcode='MWA01',message='approval'; end if;
   exception when sqlstate 'MWA01' then
    -- Everything the call did is undone; it waits as a request instead.
    v_id:=case when p_data->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (p_data->>'id')::uuid end;
    if p_action='post' and v_id is not null then v_move:=v_id; elsif p_action<>'post' then v_move:=null; end if;
    insert into mawatheeq_private.acc_approvals(action,payload,move_id,label,partner_id,amount,requested_by)
     values(p_action,p_data,v_move,left(coalesce(v_label,''),300),v_partner,v_amount,actor) returning * into ap;
    insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('approval',ap.id,'request',null,mawatheeq_private.acc_approval_json(ap),actor);
    return jsonb_build_object('pendingApproval',true,'approval',mawatheeq_private.acc_approval_json(ap),
     'message','المبلغ '||v_amount||' يتجاوز حدّك ('||v_limit||')؛ أُرسل للاعتماد ولم يُرحّل بعد.');
   end;
  else
   result:=mawatheeq_private.books_request_links(p_token,p_action,p_data);
  end if;
  v_warn:=mawatheeq_private.acc_credit_check(actor,v_start,can_config);
  if v_warn<>'' and jsonb_typeof(result)='object' then result:=result||jsonb_build_object('creditWarning',v_warn); end if;
  return result;
 end if;

 if p_action in ('save_approval_settings','close_period','reopen_period') then perform mawatheeq_private.require_access(can_edit and can_config); end if;
 if p_action in ('payment_run','save_credit','cancel_approval') then perform mawatheeq_private.require_access(can_edit); end if;
 case p_action
 when 'approval_settings' then
  perform mawatheeq_private.require_access(can_config);
  return jsonb_build_object('enabled',s.approvals_enabled,'defaultLimit',s.approval_default_limit::text,'revision',s.revision,
   'people',(select coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'name',coalesce(nullif(u.display_name,''),u.username),
     'postLimit',coalesce(ar.post_limit::text,''),'canApprove',coalesce(ar.can_approve,false),'approveLimit',coalesce(ar.approve_limit::text,'')) order by coalesce(nullif(u.display_name,''),u.username)),'[]')
    from mawatheeq_private.accounts u join public.mawatheeq_members mm on mm.user_id=u.id and mm.role<>'owner' left join mawatheeq_private.acc_approvers ar on ar.user_id=u.id
    where u.enabled and mawatheeq_private.has_section(u.id,'accounting')));
 when 'save_approval_settings' then
  if s.revision<>coalesce((p_data->>'revision')::integer,0) then raise exception 'عُدّلت الإعدادات من مكان آخر. أعد التحميل.' using errcode='40001'; end if;
  if jsonb_typeof(coalesce(p_data->'people','[]'))<>'array' then raise exception 'بيانات الصلاحيات غير صالحة.'; end if;
  update mawatheeq_private.acc_settings set approvals_enabled=coalesce((p_data->>'enabled')::boolean,false),
   approval_default_limit=mawatheeq_private.acc_amount(coalesce(p_data->>'defaultLimit','0')),revision=revision+1;
  for x in select value from jsonb_array_elements(coalesce(p_data->'people','[]')) loop
   if not exists(select 1 from mawatheeq_private.accounts where id=nullif(x->>'userId','')::uuid) then raise exception 'أحد الموظفين لم يعد موجوداً. أعد التحميل.'; end if;
   insert into mawatheeq_private.acc_approvers(user_id,post_limit,can_approve,approve_limit)
    values((x->>'userId')::uuid,case when coalesce(x->>'postLimit','')='' then null else mawatheeq_private.acc_amount(x->>'postLimit') end,coalesce((x->>'canApprove')::boolean,false),
     case when coalesce(x->>'approveLimit','')='' then null else mawatheeq_private.acc_amount(x->>'approveLimit') end)
    on conflict(user_id) do update set post_limit=excluded.post_limit,can_approve=excluded.can_approve,approve_limit=excluded.approve_limit,updated_at=clock_timestamp();
  end loop;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id)
   values('settings','00000000-0000-0000-0000-000000000000','approvals',jsonb_build_object('enabled',s.approvals_enabled,'defaultLimit',s.approval_default_limit),p_data-'revision',actor);
  return '{}'::jsonb;
 when 'list_approvals' then
  return (select coalesce(jsonb_agg(mawatheeq_private.acc_approval_json(q)||jsonb_build_object('mine',q.requested_by=actor) order by q.requested_at desc),'[]') from (
   select * from mawatheeq_private.acc_approvals where (coalesce(p_data->>'status','')='' or status=p_data->>'status') order by requested_at desc limit 300) q);
 when 'approve','reject' then
  select * into ap from mawatheeq_private.acc_approvals where id=(p_data->>'id')::uuid for update;
  if ap.id is null then raise exception 'لم يعد هذا الطلب موجوداً.'; end if;
  if ap.status<>'pending' then raise exception 'بُتّ في هذا الطلب من قبل.'; end if;
  perform mawatheeq_private.require_access(can_edit and (can_config or exists(select 1 from mawatheeq_private.acc_approvers where user_id=actor and can_approve)));
  if ap.requested_by=actor then raise exception 'لا يعتمد أحد طلبه بنفسه؛ يعتمده مسؤول آخر.'; end if;
  if p_action='approve' and not can_config and coalesce((select approve_limit from mawatheeq_private.acc_approvers where user_id=actor),ap.amount)<ap.amount then
   raise exception 'المبلغ % يتجاوز حد اعتمادك؛ يعتمده مسؤول المكتب.',ap.amount; end if;
  if p_action='reject' then
   if length(btrim(coalesce(p_data->>'note','')))<2 then raise exception 'اكتب سبب الرفض ليعرفه مقدّم الطلب.'; end if;
   update mawatheeq_private.acc_approvals set status='rejected',decided_by=actor,decided_at=clock_timestamp(),note=left(btrim(p_data->>'note'),500) where id=ap.id returning * into ap;
  else
   x:=ap.payload;
   -- The document may have been saved again since; post the version that was sent, which is the current one.
   if ap.action='post' and ap.move_id is not null then x:=x||jsonb_build_object('revision',(select revision from mawatheeq_private.acc_moves where id=ap.move_id)); end if;
   v_start:=clock_timestamp();
   update mawatheeq_private.acc_approvals set status='approved' where id=ap.id;
   x:=mawatheeq_private.books_request_links(p_token,ap.action,x);
   v_warn:=mawatheeq_private.acc_credit_check(actor,v_start,can_config);
   update mawatheeq_private.acc_approvals set decided_by=actor,decided_at=clock_timestamp(),note=left(coalesce(btrim(p_data->>'note'),''),500),result=x where id=ap.id returning * into ap;
  end if;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('approval',ap.id,p_action,null,mawatheeq_private.acc_approval_json(ap),actor);
  return mawatheeq_private.acc_approval_json(ap)||case when coalesce(v_warn,'')<>'' then jsonb_build_object('creditWarning',v_warn) else '{}'::jsonb end;
 when 'cancel_approval' then
  select * into ap from mawatheeq_private.acc_approvals where id=(p_data->>'id')::uuid for update;
  if ap.id is null or ap.status<>'pending' then raise exception 'لم يعد هذا الطلب بانتظار الاعتماد.'; end if;
  if ap.requested_by<>actor and not can_config then raise exception 'يسحب الطلب مقدّمه أو مسؤول المكتب.'; end if;
  update mawatheeq_private.acc_approvals set status='cancelled',decided_by=actor,decided_at=clock_timestamp() where id=ap.id returning * into ap;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('approval',ap.id,'cancel',null,mawatheeq_private.acc_approval_json(ap),actor);
  return mawatheeq_private.acc_approval_json(ap);
 when 'payment_proposal' then
  if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'اختر تاريخ الاستحقاق.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'moveType',m.move_type,'partnerId',coalesce(m.partner_id::text,''),
    'partner',coalesce((select name from mawatheeq_private.acc_partners where id=m.partner_id),'بلا شريك'),'date',m.date,'due',coalesce(m.invoice_date_due,m.date),
    'daysLate',greatest(0,(p_data->>'date')::date-coalesce(m.invoice_date_due,m.date)),'residual',m.amount_residual::text,'ref',m.ref,
    'pending',exists(select 1 from mawatheeq_private.acc_approvals ap2 where ap2.status='pending' and ap2.payload->'moveIds' ? m.id::text)) order by coalesce(m.invoice_date_due,m.date),m.name),'[]')
   from mawatheeq_private.acc_moves m where m.state='posted' and m.move_type in ('in_invoice','out_refund') and m.amount_residual>0
    and coalesce(m.invoice_date_due,m.date)<=(p_data->>'date')::date);
 when 'payment_run' then
  if jsonb_typeof(p_data->'moveIds')<>'array' or jsonb_array_length(p_data->'moveIds')=0 then raise exception 'اختر ما يُدفع في هذه الدفعة.'; end if;
  if exists(select 1 from mawatheeq_private.acc_moves where id in (select (y#>>'{}')::uuid from jsonb_array_elements(p_data->'moveIds') y) and move_type not in ('in_invoice','out_refund')) then
   raise exception 'تشمل دفعة الموردين فواتير الموردين والإشعارات الدائنة للموكلين فقط.'; end if;
  -- The run is one request: paid together, or sent for approval together.
  perform set_config('mawatheeq.books_nested','',true);
  return mawatheeq_private.books_request(p_token,'batch_pay',p_data);
 when 'list_periods' then
  v_year:=coalesce((p_data->>'year')::integer,extract(year from now() at time zone 'Asia/Kuwait')::integer);
  return (select jsonb_agg(jsonb_build_object('month',to_char(mm,'YYYY-MM'),'closed',pr.month is not null,'closedBy',coalesce(mawatheeq_private.acc_person(pr.closed_by),''),'closedAt',pr.closed_at,
    'posted',(select count(*) from mawatheeq_private.acc_moves where state='posted' and date_trunc('month',date)=mm),
    'drafts',(select count(*) from mawatheeq_private.acc_moves where state='draft' and date_trunc('month',date)=mm),
    'pending',(select count(*) from mawatheeq_private.acc_approvals ap2 join mawatheeq_private.acc_moves mv on mv.id=ap2.move_id where ap2.status='pending' and date_trunc('month',mv.date)=mm)) order by mm)
   from generate_series(make_date(v_year,1,1)::timestamp,make_date(v_year,12,1)::timestamp,interval '1 month') mm left join mawatheeq_private.acc_periods pr on pr.month=mm::date);
 when 'close_period','reopen_period' then
  if coalesce(p_data->>'month','') !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'اختر الشهر.'; end if;
  v_month:=to_date(p_data->>'month'||'-01','YYYY-MM-DD');
  if p_action='close_period' then
   if exists(select 1 from mawatheeq_private.acc_periods where month=v_month) then raise exception 'هذا الشهر مقفل بالفعل.'; end if;
   if exists(select 1 from mawatheeq_private.acc_moves where state='draft' and date_trunc('month',date)=v_month) then
    raise exception 'في هذا الشهر % مستند مسودة؛ رحّلها أو ألغها قبل الإقفال.',(select count(*) from mawatheeq_private.acc_moves where state='draft' and date_trunc('month',date)=v_month); end if;
   insert into mawatheeq_private.acc_periods(month,closed_by) values(v_month,actor);
  else
   if v_month<=coalesce(s.fiscal_lock_date,'0001-01-01') then raise exception 'هذا الشهر ضمن سنة مالية مقفلة؛ لا يُعاد فتحه.'; end if;
   delete from mawatheeq_private.acc_periods where month=v_month;
   if not found then raise exception 'هذا الشهر مفتوح بالفعل.'; end if;
  end if;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id) values('period','00000000-0000-0000-0000-000000000000',p_action,null,jsonb_build_object('month',p_data->>'month'),actor);
  return '{}'::jsonb;
 when 'list_changes' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'at',c.created_at,'by',mawatheeq_private.acc_person(c.actor_id),'byId',c.actor_id,'recordType',c.record_type,'recordId',c.record_id,'action',c.action,
    'label',coalesce(c.after_payload->>'name',c.before_payload->>'name',c.after_payload->>'label',c.after_payload->>'month',''),
    'amount',coalesce(c.after_payload->>'amountTotal',c.before_payload->>'amountTotal',c.after_payload->>'amount',''),
    'hasDetail',c.before_payload is not null or c.after_payload is not null) order by c.id desc),'[]')
   from (select * from mawatheeq_private.acc_changes c where (nullif(p_data->>'from','') is null or c.created_at>=(p_data->>'from')::date)
     and (nullif(p_data->>'to','') is null or c.created_at<(p_data->>'to')::date+1) and (coalesce(p_data->>'actorId','')='' or c.actor_id=(p_data->>'actorId')::uuid)
     and (coalesce(p_data->>'recordType','')='' or c.record_type=p_data->>'recordType') and (coalesce(p_data->>'action','')='' or c.action=p_data->>'action')
     and (coalesce(p_data->>'recordId','')='' or c.record_id=(p_data->>'recordId')::uuid)
    order by c.id desc limit 500) c);
 when 'get_change' then
  return (select jsonb_build_object('id',c.id,'before',c.before_payload,'after',c.after_payload) from mawatheeq_private.acc_changes c where c.id=(p_data->>'id')::bigint);
 when 'save_credit' then
  v_id:=nullif(p_data->>'partnerId','')::uuid;
  select to_jsonb(p) into x from mawatheeq_private.acc_partners p where id=v_id for update;
  if x is null then raise exception 'اختر شريكاً محفوظاً.'; end if;
  update mawatheeq_private.acc_partners set credit_limit=case when coalesce(p_data->>'limit','')='' then null else mawatheeq_private.acc_amount(p_data->>'limit') end,
   credit_block=coalesce((p_data->>'block')::boolean,false) and coalesce(p_data->>'limit','')<>'',updated_at=clock_timestamp() where id=v_id;
  insert into mawatheeq_private.acc_changes(record_type,record_id,action,before_payload,after_payload,actor_id)
   values('partner',v_id,'credit',jsonb_build_object('name',x->>'name','limit',x->>'credit_limit','block',x->>'credit_block'),jsonb_build_object('name',x->>'name','limit',p_data->>'limit','block',p_data->>'block'),actor);
  return jsonb_build_object('partnerId',v_id,'limit',(select credit_limit::text from mawatheeq_private.acc_partners where id=v_id),'block',(select credit_block from mawatheeq_private.acc_partners where id=v_id),
   'open',mawatheeq_private.acc_partner_open(v_id)::text);
 when 'credit_report' then
  return (select coalesce(jsonb_agg(t.row order by t.pct desc nulls last,t.name),'[]') from (
   select p.name,case when p.credit_limit>0 then round(mawatheeq_private.acc_partner_open(p.id)/p.credit_limit*100) end pct,
    jsonb_build_object('partnerId',p.id,'name',p.name,'limit',p.credit_limit::text,'block',p.credit_block,'open',mawatheeq_private.acc_partner_open(p.id)::text,
     'available',(p.credit_limit-mawatheeq_private.acc_partner_open(p.id))::text,
     'overdue',(select coalesce(sum(m.amount_residual),0) from mawatheeq_private.acc_moves m where m.partner_id=p.id and m.state='posted' and m.move_type='out_invoice' and coalesce(m.invoice_date_due,m.date)<(now() at time zone 'Asia/Kuwait')::date)::text) row
   from mawatheeq_private.acc_partners p where p.credit_limit is not null) t);
 end case;
end $$;

revoke all on function mawatheeq_private.acc_period_closed(date),mawatheeq_private.acc_period_guard(),mawatheeq_private.acc_partner_open(uuid),mawatheeq_private.acc_credit_check(uuid,timestamptz,boolean),
 mawatheeq_private.acc_person(uuid),mawatheeq_private.acc_approval_json(mawatheeq_private.acc_approvals),mawatheeq_private.acc_controls_action(text),
 mawatheeq_private.books_request(text,text,jsonb),mawatheeq_private.books_request_links(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.books_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
