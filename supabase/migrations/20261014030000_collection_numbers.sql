begin;
-- Collection file numbers (14 October 2026). A collection file is known by the office's own file number and by the
-- automatic number printed on its payment-order request (the same number appears on the court-fee receipt). A case
-- has its own office code and its own automatic number, issued on بوابة العدل when the lawsuit is filed. They are
-- different numbers. Searching files to attach to a case now also finds them by the order's automatic number, the
-- order number, the lawsuit number, the phone and any extra plaintiff or defendant.
alter function mawatheeq_private.department_request(text,text,jsonb) rename to department_request_numbers;
create function mawatheeq_private.department_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; q text; result jsonb;
begin
 if p_action<>'find_files' then return mawatheeq_private.department_request_numbers(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 perform mawatheeq_private.require_access(mawatheeq_private.has_section(actor,'collections'));
 q:=mawatheeq_private.import_text(left(coalesce(p_data->>'q',''),80));
 if length(q)<2 then return '[]'; end if;
 select coalesce(jsonb_agg(mawatheeq_private.department_json(t)),'[]') into result from (
  select * from mawatheeq_private.department_records t where t.workspace='collections' and t.kind='file' and not t.archived
   and mawatheeq_private.department_visible(actor,'collections',t.case_id)
   and mawatheeq_private.import_text(concat_ws(' ',t.payload->>'code',t.payload->>'defendant',t.payload->>'civilId',t.payload->>'account',t.payload->>'customerId',t.payload->>'company',
     t.payload->>'fileAutoNumber',t.payload->>'orderAuto',t.payload->>'orderNumber',t.payload->>'lawsuitNumber',t.payload->>'phone',
     (select string_agg(concat_ws(' ',p->>'name',p->>'civilId',p->>'phone'),' ') from jsonb_array_elements(coalesce(t.payload->'plaintiffs','[]')||coalesce(t.payload->'defendants','[]')) p))) like '%'||q||'%'
   order by t.payload->>'code' limit 20) t;
 return result;
end $$;
revoke all on function mawatheeq_private.department_request(text,text,jsonb),mawatheeq_private.department_request_numbers(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.department_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
