-- «التقويم» for every employee (owner, 12 November 2026: «add this for all employees but each employee only sees his
-- schedules»): the work items assigned to the person asking (tasks and sittings), for at most two months at a time,
-- whatever pages the account opens. A case's code and client are given only when that person may open the case.
create or replace function mawatheeq_private.my_schedule(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; v_from date; v_to date; result jsonb;
begin
 actor:=mawatheeq_private.authorize(p_token);
 begin v_from:=(p_data->>'from')::date; v_to:=(p_data->>'to')::date;
 exception when others then raise exception 'نطاق التاريخ غير صالح.' using errcode='22023'; end;
 if v_from is null or v_to is null or v_to<v_from or v_to-v_from>62 then raise exception 'نطاق التاريخ غير صالح.' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',w.id,'kind',coalesce(w.payload->>'kind','task'),'title',coalesce(w.payload->>'title',''),'dueDate',w.payload->>'dueDate',
   'dueTime',coalesce(w.payload->>'dueTime',''),'status',coalesce(w.payload->>'status','open'),'location',coalesce(w.payload->>'location',''),
   'caseRef',case when c.id is not null then btrim(coalesce(nullif(c.payload->>'code',''),c.payload->>'autoNumber','')||' · '||coalesce(nullif(c.payload->>'clientEntityName',''),c.payload->>'client',''),' ·') else '' end)
   order by w.payload->>'dueDate',w.payload->>'dueTime',w.created_at),'[]'::jsonb) into result
 from mawatheeq_private.work_items w
 left join public.mawatheeq_cases c on c.id=w.payload->>'caseId' and mawatheeq_private.can_case(actor,c.id)
 where w.payload->>'assigneeId'=actor::text and coalesce(w.payload->>'status','') <> 'cancelled'
  and w.payload->>'dueDate' ~ '^\d{4}-\d{2}-\d{2}$' and (w.payload->>'dueDate')::date between v_from and v_to;
 return result;
end $$;
revoke all on function mawatheeq_private.my_schedule(text,jsonb) from public,anon,authenticated;

-- The office request answers «my_schedule» first, for any signed-in account.
do $$
declare d text; n text;
begin
 d:=pg_get_functiondef('mawatheeq_private.office_request(text,text,jsonb)'::regprocedure);
 if position('my_schedule' in d)>0 then return; end if;
 n:=regexp_replace(d,'(\n)begin(\r?\n)',E'\\1begin\\2 if p_action=''my_schedule'' then return mawatheeq_private.my_schedule(p_token,p_data); end if;\\2');
 if n=d then raise exception 'office_request is not as expected'; end if;
 execute n;
end $$;

-- Anyone in the office can be given a general task (one with no case), not only accounts that open the tasks page; a
-- task tied to a case still follows the same rule as before (the tasks page and that case). Before, an account without the tasks page
-- could be given nothing, so its calendar stayed empty.
do $$
declare d text; n text;
begin
 d:=pg_get_functiondef('mawatheeq_private.office_request_core(text,text,jsonb)'::regprocedure);
 if position('mawatheeq_private.can_work_payload(u.id,item)' in d)=0 then raise exception 'office_request_core is not as expected'; end if;
 n:=replace(d,'mawatheeq_private.can_work_payload(u.id,item)','(coalesce(item->>''caseId'','''')='''' or mawatheeq_private.can_work_payload(u.id,item))');
 execute n;
end $$;
