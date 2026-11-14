begin;
-- The statement of claim needs the subscription line it is about («الخاص بخط الاشتراك رقم (…)»; owner, 14 November
-- 2026: «subscription number is a must to have»): a claim is no longer generated with that number left as dots.
-- Safe to run again.
do $$ declare d text;
 old_list text:=$q$array['company','defendant','nationality','address','amount','amountWords','account','orderNumber','demandDate']$q$;
 new_list text:=$q$array['company','defendant','nationality','address','amount','amountWords','account','phone','orderNumber','demandDate']$q$;
begin
 d:=pg_get_functiondef('mawatheeq_private.department_request_base(text,text,jsonb)'::regprocedure);
 if position(new_list in d)=0 then
  if position(old_list in d)=0 then raise exception 'department_request_base is not the expected version'; end if;
  execute replace(d,old_list,new_list);
 end if;
end $$;
notify pgrst,'reload schema';
commit;
