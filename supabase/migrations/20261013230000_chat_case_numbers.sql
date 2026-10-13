begin;
-- Chat case references by office code or by automatic number (13 October 2026). The search returns each case's
-- office code and automatic number as well as its label, so «#» can reference the code («كود 64») and «!» the
-- automatic number («الرقم الآلي 254092450»). Only cases the person may open are returned, as before.
alter function mawatheeq_private.chat_request(text,text,jsonb) rename to chat_request_numbers;
create function mawatheeq_private.chat_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=mawatheeq_private.chat_request_numbers(p_token,p_action,p_data);
 if p_action<>'search' or jsonb_typeof(result)<>'array' then return result; end if;
 return coalesce((select jsonb_agg(case when x->>'type'='case' then x||coalesce((select jsonb_build_object('code',coalesce(c.payload->>'code',''),'autoNumber',coalesce(c.payload->>'autoNumber',''))
   from public.mawatheeq_cases c where c.id=x->>'id'),'{}') else x end order by n) from jsonb_array_elements(result) with ordinality t(x,n)),'[]');
end $$;
revoke all on function mawatheeq_private.chat_request(text,text,jsonb),mawatheeq_private.chat_request_numbers(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.chat_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
