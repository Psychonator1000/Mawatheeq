begin;
-- «صحيفة الدعوى» and «حافظة المستندات» are prepared before the lawsuit is filed («تحت الرفع»): the lawsuit number,
-- court, circuit and hearing date do not exist yet and are written in after filing, so they are no longer required
-- to create the papers (their places print as dotted lines). Everything taken from the payment order is still required.
-- Only the two lists inside department_request_base change; the rest of the function is kept exactly as it is.
-- Safe to run again.
do $$
declare d text;
 old_claim text:='''companyCivil'',''companyRegister'',''hearingCourt'',''hearingDate'',''hearingDay'',''hearingCircuit'']';
 new_claim text:='''companyCivil'',''companyRegister'']';
 old_bundle text:='else array[''company'',''defendant'',''hearingCourt'',''hearingDate'',''hearingCircuit'',''lawsuitNumber'',''lawsuitYear''] end loop';
 new_bundle text:='else array[''company'',''defendant''] end loop';
begin
 d:=pg_get_functiondef('mawatheeq_private.department_request_base(text,text,jsonb)'::regprocedure);
 if position(new_bundle in d)>0 and position(old_claim in d)=0 then return; end if;
 if position(old_claim in d)=0 or position(old_bundle in d)=0 then raise exception 'department_request_base no longer has the expected required-field lists'; end if;
 execute replace(replace(d,old_claim,new_claim),old_bundle,new_bundle);
end $$;
commit;
