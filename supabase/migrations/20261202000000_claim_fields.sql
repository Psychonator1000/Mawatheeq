begin;
-- The statement of claim («صحيفة الدعوى») asks only for what the office's own claims carry (owner's Ooredoo example,
-- 11 November 2026): the parties (claimant, defendant, nationality, address), the amount in figures and words, the
-- contract number, the payment order's number and the demand letter's date. Identity numbers (the defendant's civil ID,
-- the claimant's civil number and commercial register) and the phone, the payment order's court and rejection date and the
-- account statement's date are no longer required: when empty they are left as a dotted blank to fill in by hand.
-- Safe to run again.
do $$ declare d text;
 old_list text:=$q$array['company','defendant','civilId','nationality','address','amount','amountWords','account','phone','orderNumber','court','rejectedDate','demandDate','statementDate','companyCivil','companyRegister']$q$;
 new_list text:=$q$array['company','defendant','nationality','address','amount','amountWords','account','orderNumber','demandDate']$q$;
begin
 d:=pg_get_functiondef('mawatheeq_private.department_request_base(text,text,jsonb)'::regprocedure);
 if position(new_list in d)=0 then
  if position(old_list in d)=0 then raise exception 'department_request_base is not the expected version'; end if;
  execute replace(d,old_list,new_list);
 end if;
end $$;
notify pgrst,'reload schema';
commit;
