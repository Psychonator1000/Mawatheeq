begin;
-- The judgments register a page at a time (9 November 2026). Every browser used to read all 7,000 cases and filter and
-- sort them itself. The database now keeps, for each case, what the register filters and sorts by — its search text
-- normalized as normalizeSearch() does, its client and sector, its sort keys and where it stands (case_state, worked
-- out again each day and whenever the office's deadlines change) — and «mawatheeq_case_list» answers a view of the
-- register (filters, column sort, a code typed first) with one page and the number of matching cases, under the same
-- access as the register. lib/case-list.ts is the page's side; scripts/verify-case-list.mjs requires both to agree.
-- The index lives in its own table, so keeping it never touches a case (no history entry, no «changed at»). Safe to run again.

-- normalizeSearch(): NFKC, Arabic-Indic and Persian digits as 0-9, alef forms, final yaa and taa marbuta folded,
-- harakat and tatweel removed, every kind of space squeezed to one, trimmed, lower case.
create or replace function mawatheeq_private.spaces() returns text language sql immutable set search_path='' as $$
 select '[\s' || chr(160) || chr(5760) || chr(8192) || '-' || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279) || ']+'
$$;
create or replace function mawatheeq_private.norm_search(s text) returns text
language sql immutable set search_path='' as $$
 select lower(btrim(regexp_replace(regexp_replace(translate(translate(translate(normalize(coalesce(s,''),nfkc),
  '٠١٢٣٤٥٦٧٨٩','0123456789'),'۰۱۲۳۴۵۶۷۸۹','0123456789'),'أإآىة','اااي' || 'ه'),'[ً-ٟـ]','','g'),mawatheeq_private.spaces(),' ','g')))
$$;
-- String(x).trim(): every kind of space at either end removed.
create or replace function mawatheeq_private.js_trim(s text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(regexp_replace(coalesce(s,''),'^' || mawatheeq_private.spaces(),''),mawatheeq_private.spaces() || '$','')
$$;
-- JavaScript truthiness of a stored value (Boolean(c.insurance) and the like).
create or replace function mawatheeq_private.js_truthy(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select case jsonb_typeof(v) when 'boolean' then v::text='true' when 'string' then (v#>>'{}')<>'' when 'number' then (v::text)::numeric<>0
  when 'object' then true when 'array' then true else false end
$$;
-- The office's deadlines (the defaults when none are saved) and today's date in Kuwait.
create or replace function mawatheeq_private.office_rules() returns jsonb language sql stable set search_path='' as $$
 select coalesce((select value from public.mawatheeq_settings where key='rules' and jsonb_typeof(value)='object'),'{"first":30,"appeal":60,"objection":15,"execution":30,"warning":5}'::jsonb)
$$;
create or replace function mawatheeq_private.kuwait_today() returns date language sql stable set search_path='' as $$
 select (clock_timestamp() at time zone 'Asia/Kuwait')::date
$$;

create table if not exists mawatheeq_private.case_list (
  id text primary key references public.mawatheeq_cases(id) on delete cascade,
  workflow text not null, archived boolean not null, entity_id text not null, sector text not null, insurance boolean not null,
  execution_file boolean not null, telecom boolean not null,
  search text not null, client_text text not null, code_text text not null, opponent_text text not null,
  month text not null, auto_missing boolean not null, type_label text not null, recorded_label text not null, lawyer text,
  date text not null, followups text[] not null,
  number_kind smallint, number_n numeric, number_t text, code_kind smallint, code_n numeric, code_t text, client_key text, lawyer_key text,
  state jsonb not null, state_day date not null, state_rules jsonb not null
);
alter table mawatheeq_private.case_list enable row level security;
revoke all on mawatheeq_private.case_list from public,anon,authenticated;

-- One case's row, from the case and its client file.
create or replace function mawatheeq_private.case_list_build(p_id text) returns void
language plpgsql security definer set search_path='' as $$
declare c record; e jsonb; p jsonb; num text; code text; r jsonb:=mawatheeq_private.office_rules(); today date:=mawatheeq_private.kuwait_today();
 entity_name text; contact_name text; month text;
begin
 select * into c from public.mawatheeq_cases where id=p_id;
 if not found then delete from mawatheeq_private.case_list where id=p_id; return; end if;
 p:=c.payload;
 select x.payload into e from mawatheeq_private.client_entities x where x.id::text=coalesce(p->>'clientEntityId','');
 entity_name:=coalesce(e->>'name','');
 contact_name:=coalesce((select q->>'name' from jsonb_array_elements(case when jsonb_typeof(e->'contacts')='array' then e->'contacts' else '[]' end) q
  where q->>'id'=p->>'clientContactId' limit 1),'');
 month:=left(coalesce(p->>'date',''),7); if month !~ '^\d{4}-(0[1-9]|1[0-2])$' then month:=''; end if;
 num:=mawatheeq_private.js_trim(p->>'autoNumber'); code:=mawatheeq_private.js_trim(p->>'code');
 insert into mawatheeq_private.case_list values (
  c.id,
  case when p->>'workflow' in ('consultation','study') then p->>'workflow' else '' end,
  coalesce(c.archived,false), coalesce(p->>'clientEntityId',''), coalesce(nullif(e->>'sector',''),'other'), mawatheeq_private.js_truthy(p->'insurance'),
  mawatheeq_private.js_truthy(p->'executionFile'), mawatheeq_private.js_truthy(p->'telecom'),
  -- The same words searchText() joins, in the same order.
  mawatheeq_private.norm_search(concat_ws(' ',coalesce(p->>'code',''),
    case when code<>'' and mawatheeq_private.js_truthy(p->'insurance') then 'ت-' || code else code end,
    coalesce(p->>'autoNumber',''),coalesce(p->>'client',''),coalesce(p->>'clientGroup',''),coalesce(p->>'opponent',''),coalesce(p->>'caseNumber',''),
    coalesce(p->>'lawyer',''),coalesce(p->>'ruling',''),entity_name,contact_name,coalesce(p->>'casePerson',''),
    (select string_agg(coalesce(st->>'caseNumber','') || ' ' || coalesce(st->>'autoNumber',''),' ' order by i)
      from jsonb_array_elements(case when jsonb_typeof(p->'stages')='array' then p->'stages' else '[]' end) with ordinality s(st,i)))),
  mawatheeq_private.norm_search(entity_name || ' ' || coalesce(p->>'client','') || ' ' || coalesce(p->>'clientGroup','')),
  mawatheeq_private.norm_search(p->>'code'), mawatheeq_private.norm_search(p->>'opponent'),
  month, mawatheeq_private.js_trim(p->>'autoNumber')='', coalesce(nullif(p->>'type',''),'يحتاج مراجعة'), coalesce(nullif(p->>'appealRecorded',''),'غير مسجل'),
  p->>'lawyer', coalesce(p->>'date',''),
  coalesce((select array_agg(x->>'followup') from jsonb_array_elements(case when jsonb_typeof(p->'procedures')='array' then p->'procedures' else '[]' end) x
   where coalesce(x->>'followup','')<>''),'{}'),
  case when num='' then null when num ~ '^\d+$' then 0 else 1 end, case when num ~ '^\d+$' then num::numeric end, case when num<>'' and num !~ '^\d+$' then mawatheeq_private.norm_search(num) end,
  case when code='' then null when code ~ '^\d+$' then 0 else 1 end,
  case when code ~ '^\d+$' then code::numeric + case when mawatheeq_private.js_truthy(p->'insurance') then 1000000000 else 0 end end,
  case when code<>'' and code !~ '^\d+$' then mawatheeq_private.norm_search(code) end,
  nullif(mawatheeq_private.norm_search(coalesce(nullif(p->>'client',''),p->>'clientGroup')),''), nullif(mawatheeq_private.norm_search(p->>'lawyer'),''),
  mawatheeq_private.case_state(p,r,today), today, r)
 on conflict (id) do update set workflow=excluded.workflow, archived=excluded.archived, entity_id=excluded.entity_id, sector=excluded.sector,
  insurance=excluded.insurance, execution_file=excluded.execution_file, telecom=excluded.telecom, search=excluded.search, client_text=excluded.client_text,
  code_text=excluded.code_text, opponent_text=excluded.opponent_text, month=excluded.month, auto_missing=excluded.auto_missing, type_label=excluded.type_label,
  recorded_label=excluded.recorded_label, lawyer=excluded.lawyer, date=excluded.date, followups=excluded.followups,
  number_kind=excluded.number_kind, number_n=excluded.number_n, number_t=excluded.number_t, code_kind=excluded.code_kind, code_n=excluded.code_n,
  code_t=excluded.code_t, client_key=excluded.client_key, lawyer_key=excluded.lawyer_key, state=excluded.state, state_day=excluded.state_day,
  state_rules=excluded.state_rules;
end $$;

create or replace function mawatheeq_private.case_list_follow_case() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform mawatheeq_private.case_list_build(new.id); return null; end $$;
drop trigger if exists case_list_follows on public.mawatheeq_cases;
create trigger case_list_follows after insert or update on public.mawatheeq_cases for each row execute function mawatheeq_private.case_list_follow_case();

-- A client renamed, given another sector or its contacts changed: its cases' rows follow.
create or replace function mawatheeq_private.case_list_follow_client() returns trigger
language plpgsql security definer set search_path='' as $$
declare x text;
begin
 if tg_op='UPDATE' and new.payload is not distinct from old.payload then return null; end if;
 for x in select l.id from mawatheeq_private.case_list l where l.entity_id=coalesce(new.id,old.id)::text loop perform mawatheeq_private.case_list_build(x); end loop;
 return null;
end $$;
drop trigger if exists case_list_follows_client on mawatheeq_private.client_entities;
create trigger case_list_follows_client after insert or update or delete on mawatheeq_private.client_entities for each row execute function mawatheeq_private.case_list_follow_client();

-- Where each case stands is worked out again once a day, and at once when the office's deadlines change.
create or replace function mawatheeq_private.case_list_fresh() returns void
language plpgsql security definer set search_path='' as $$
declare r jsonb:=mawatheeq_private.office_rules(); today date:=mawatheeq_private.kuwait_today();
begin
 if not exists(select 1 from mawatheeq_private.case_list where state_day<>today or state_rules<>r) then return; end if;
 perform pg_advisory_xact_lock(hashtext('mawatheeq-case-list-fresh'));
 update mawatheeq_private.case_list l set state=mawatheeq_private.case_state(c.payload,r,today), state_day=today, state_rules=r
  from public.mawatheeq_cases c where c.id=l.id and (l.state_day<>today or l.state_rules<>r);
end $$;

-- The register a page at a time. q: view ('cases'|'deadlines'), archive, filters {search,year,month,code,client,opponent,
-- numberStatus,category,clientEntityId,analysisField,analysisValue}, outcome, type, lawyer, deadlineFilter, reportDate,
-- sort {key,dir}; offset, limit (at most 200).
create or replace function mawatheeq_private.case_list_request(p_token text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; v jsonb; kind text; v_all boolean; v_names text[]; f jsonb; q jsonb:=coalesce(p_data,'{}');
 view text; arch boolean; cat text; dl text; rd date; today date; r jsonb; skey text; sdir integer; lim integer; off integer;
 s text; s_compact text; ins_num text; code_num text; can_work boolean; total integer; rows jsonb;
begin
 actor:=mawatheeq_private.authorize(p_token);
 if jsonb_typeof(q)<>'object' or length(q::text)>20000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 perform mawatheeq_private.require_access(mawatheeq_private.can_read_cases(actor));
 perform mawatheeq_private.case_list_fresh();
 a:=mawatheeq_private.access_for(actor); v:=a->'view'; kind:=coalesce(a->>'accountKind','');
 v_all:=a->>'caseScope'='all';
 if not v_all and jsonb_typeof(a->'lawyerNames')='array' then
  select array_agg(mawatheeq_private.normalized(x)) into v_names from jsonb_array_elements_text(a->'lawyerNames') x;
 end if;
 f:=case when jsonb_typeof(q->'filters')='object' then q->'filters' else '{}' end;
 view:=case when q->>'view'='deadlines' then 'deadlines' else 'cases' end; arch:=coalesce((q->>'archive')::boolean,false);
 cat:=coalesce(f->>'category',''); dl:=coalesce(q->>'deadlineFilter',''); today:=mawatheeq_private.kuwait_today(); r:=mawatheeq_private.office_rules();
 rd:=coalesce(mawatheeq_private.iso_day(q->>'reportDate'),today);
 skey:=coalesce(q#>>'{sort,key}','date'); sdir:=case when q#>>'{sort,dir}'='1' then 1 else -1 end;
 lim:=least(greatest(coalesce((q->>'limit')::integer,50),1),200); off:=greatest(coalesce((q->>'offset')::integer,0),0);
 -- As the page: the work list (and so work due on the report day) is loaded only for accounts holding «المهام».
 can_work:=mawatheeq_private.has_section(actor,'work');
 -- A code typed in the search: that code first, then codes beginning with it (codeFirst()).
 s:=mawatheeq_private.norm_search(f->>'search'); s_compact:=regexp_replace(s,mawatheeq_private.spaces(),'','g');
 ins_num:=substring(s_compact from '^ت-?(\d+)$'); code_num:=coalesce(ins_num,s_compact);
 if code_num !~* '^[a-z]?\d+$' then code_num:=null; end if;
 with base as (
  -- Only what is filtered and sorted on travels through the sort; the cases themselves are read for the page alone.
  select l.*, case when view='deadlines' and rd<>today then mawatheeq_private.case_state(c.payload,r,rd) else l.state end as dstate
  from mawatheeq_private.case_list l join public.mawatheeq_cases c on c.id=l.id
  where l.workflow='' and l.archived=arch
   and (v_all or (a->'caseIds') ? l.id or (v_names is not null and c.lawyer_norm<>'' and c.lawyer_norm=any(v_names)))
 ), hits as (
  select b.* from base b where
   (view<>'cases' or cat='' or cat not in ('execution','insurance','telecom')
    or (cat='execution' and (b.execution_file or (b.state->>'eligible')::boolean))
    or (cat='insurance' and (b.insurance or b.sector='insurance')) or (cat='telecom' and (b.telecom or b.sector='telecom')))
   and (view<>'deadlines' or (dl='overdue' and b.dstate->>'alert'='انتهت المهلة') or (dl='soon' and b.dstate->>'alert'='خلال خمسة أيام')
    or (dl not in ('overdue','soon') and (rd::text=any(b.followups) or (can_work and exists(select 1 from mawatheeq_private.work_items w
      where w.payload->>'caseId'=b.id and w.payload->>'dueDate'=rd::text and coalesce(w.payload->>'status','') not in ('done','cancelled'))))))
   and (coalesce(f->>'year','')='' or left(b.month,4)=f->>'year')
   and (coalesce(f->>'month','')='' or substr(b.month,6)=f->>'month')
   and (coalesce(f->>'numberStatus','')<>'missing' or b.auto_missing)
   and (coalesce(f->>'clientEntityId','')='' or b.entity_id=f->>'clientEntityId')
   and (coalesce(f->>'code','')='' or position(mawatheeq_private.norm_search(f->>'code') in b.code_text)>0)
   and (coalesce(f->>'client','')='' or position(mawatheeq_private.norm_search(f->>'client') in b.client_text)>0)
   and (coalesce(f->>'opponent','')='' or position(mawatheeq_private.norm_search(f->>'opponent') in b.opponent_text)>0)
   and (coalesce(f->>'search','')='' or position(s in b.search)>0)
   and (coalesce(f->>'analysisField','')='' or (case f->>'analysisField' when 'type' then b.type_label when 'appealRecorded' then b.recorded_label
     when 'outcome' then b.state->>'outcome' when 'status' then b.state->>'status' when 'appeal' then b.state->>'appeal' else '' end)=coalesce(f->>'analysisValue',''))
   and (coalesce(q->>'outcome','')='' or b.state->>'outcome'=q->>'outcome')
   and (coalesce(q->>'type','')='' or b.type_label=q->>'type')
   and (coalesce(q->>'lawyer','')='' or b.lawyer=q->>'lawyer')
 ), keyed as (
  select h.*,
   case when code_num is null then 0 when ins_num is not null and not h.insurance then 2 when h.code_text=code_num then 0
    when left(h.code_text,length(code_num))=code_num then 1 else 2 end as rank,
   case skey when 'number' then h.number_kind when 'code' then h.code_kind when 'client' then case when h.client_key is null then null else 1 end
    when 'lawyer' then case when h.lawyer_key is null then null else 1 end
    when 'remaining' then case when (case when view='cases' and cat='execution' then h.dstate->'executionRemaining' when (h.dstate->>'days')='0' then null else h.dstate->'remaining' end) is null
      or jsonb_typeof(case when view='cases' and cat='execution' then h.dstate->'executionRemaining' when (h.dstate->>'days')='0' then null else h.dstate->'remaining' end)='null' then null else 0 end
    else case when h.date='' then null else 1 end end as k_kind,
   case skey when 'number' then h.number_n when 'code' then h.code_n
    when 'remaining' then (case when view='cases' and cat='execution' then h.dstate->>'executionRemaining' when (h.dstate->>'days')='0' then null else h.dstate->>'remaining' end)::numeric end as k_n,
   case skey when 'number' then h.number_t when 'code' then h.code_t when 'client' then h.client_key when 'lawyer' then h.lawyer_key
    when 'remaining' then null else nullif(h.date,'') end as k_t
  from hits h
 ), ordered as (
  select k.id, row_number() over (order by k.rank, (k.k_kind is null),
    case when sdir=1 then k.k_kind end asc, case when sdir=1 then k.k_n end asc, case when sdir=1 then k.k_t end collate "C" asc,
    case when sdir=-1 then k.k_kind end desc, case when sdir=-1 then k.k_n end desc, case when sdir=-1 then k.k_t end collate "C" desc,
    k.date collate "C" desc, k.id collate "C" asc) as pos, count(*) over () as n
  from keyed k
 )
 select (select coalesce(max(n),0)::integer from ordered),
  (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,
    'payload',case when jsonb_typeof(v)='object' and v<>'{}'::jsonb then mawatheeq_private.case_for_view(coalesce(c.light,c.payload),v,kind) else coalesce(c.light,c.payload) end,
    'revision',c.revision,'archived',c.archived,'state',l.state) order by o.pos),'[]')
   from ordered o join public.mawatheeq_cases c on c.id=o.id join mawatheeq_private.case_list l on l.id=o.id where o.pos>off and o.pos<=off+lim)
  into total, rows;
 return jsonb_build_object('total',total,'rows',rows,'today',today);
end $$;

create or replace function public.mawatheeq_case_list(p_token text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.case_list_request(p_token,p_data); $$;
revoke all on function mawatheeq_private.case_list_request(text,jsonb),mawatheeq_private.case_list_build(text),mawatheeq_private.case_list_fresh(),
 mawatheeq_private.case_list_follow_case(),mawatheeq_private.case_list_follow_client(),mawatheeq_private.norm_search(text),mawatheeq_private.js_trim(text),
 mawatheeq_private.js_truthy(jsonb),mawatheeq_private.spaces(),mawatheeq_private.office_rules(),mawatheeq_private.kuwait_today() from public,anon,authenticated;
revoke all on function public.mawatheeq_case_list(text,jsonb) from public;
grant execute on function mawatheeq_private.case_list_request(text,jsonb) to anon,authenticated,service_role;
grant execute on function public.mawatheeq_case_list(text,jsonb) to anon,authenticated,service_role;

-- Fill the index for the cases already there.
do $$ declare x text; begin for x in select id from public.mawatheeq_cases loop perform mawatheeq_private.case_list_build(x); end loop; end $$;
notify pgrst,'reload schema';
commit;
