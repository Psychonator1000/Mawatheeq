begin;
-- Collection file statuses in plain Arabic (13 October 2026). Two short-hand statuses copied from the collections
-- spreadsheet are saved as the plain status they mean: سوفت → تحصيل ودي، سكت → موقوف. «تحت الرفع» and «حفظ» stay.
alter function mawatheeq_private.department_payload(text,text,jsonb) rename to department_payload_clients;
create function mawatheeq_private.department_payload(w text,k text,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare words jsonb:='{"سوفت":"تحصيل ودي","سكت":"موقوف"}';
begin
 if w='collections' and k='file' and jsonb_typeof(p)='object' and words ? btrim(coalesce(p->>'fileStatus','')) then
  p:=p||jsonb_build_object('fileStatus',words->>btrim(p->>'fileStatus')); end if;
 return mawatheeq_private.department_payload_clients(w,k,p);
end $$;
revoke all on function mawatheeq_private.department_payload(text,text,jsonb),mawatheeq_private.department_payload_clients(text,text,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
