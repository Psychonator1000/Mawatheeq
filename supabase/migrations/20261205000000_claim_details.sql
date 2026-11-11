begin;
-- A client company's own details as its claims always state them («بيانات الصحيفة» on the client's profile, owner,
-- 11 November 2026): its address, e-mail, civil number and commercial register. They live on the client's profile
-- (payload.claimDetails) instead of in the program, and every claim made for that client carries them in place of
-- whatever the collection file holds for these fields. The client is the file's linked client, or else the one client
-- profile whose name (or a former name) is the file's creditor. Safe to run again.

create or replace function mawatheeq_private.claim_details(p jsonb) returns jsonb
language sql stable set search_path='' as $$
 select coalesce((select jsonb_object_agg(k.key,k.value) from jsonb_each(d.details) k
   where k.key in ('companyAddress','email','companyCivil','companyRegister') and jsonb_typeof(k.value)='string' and btrim(k.value#>>'{}')<>''),'{}'::jsonb)
 from (select coalesce((
   select e.payload->'claimDetails' from mawatheeq_private.client_entities e
   where e.merged_into is null and jsonb_typeof(e.payload->'claimDetails')='object'
    and (e.id::text=coalesce(p->>'clientEntityId','')
     or (coalesce(p->>'clientEntityId','')='' and btrim(coalesce(p->>'company',''))<>''
      and (mawatheeq_private.normalized(e.payload->>'name')=mawatheeq_private.normalized(p->>'company')
       or exists(select 1 from jsonb_array_elements_text(coalesce(e.payload->'aliases','[]')) a where mawatheeq_private.normalized(a)=mawatheeq_private.normalized(p->>'company')))))
   order by (e.id::text=coalesce(p->>'clientEntityId','')) desc, e.updated_at desc limit 1),'{}'::jsonb) details) d;
$$;
revoke all on function mawatheeq_private.claim_details(jsonb) from public,anon,authenticated;

-- The profile's claim details: an object of short texts.
do $$ declare d text; anchor text:=$q$  perform (c->>'id')::uuid;$q$; begin
 d:=pg_get_functiondef('mawatheeq_private.validate_client(jsonb)'::regprocedure);
 if position('claimDetails' in d)=0 then
  if position(anchor in d)=0 then raise exception 'validate_client is not the expected version'; end if;
  execute replace(d,anchor,$q$  if c ? 'claimDetails' and (jsonb_typeof(c->'claimDetails')<>'object'
     or exists(select 1 from jsonb_each(c->'claimDetails') x where x.key not in ('companyAddress','email','companyCivil','companyRegister') or jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>500)) then
    raise exception 'راجع «بيانات الصحيفة» في ملف الموكل.';
  end if;
$q$||anchor);
 end if;
end $$;

-- Claims carry the client's details (the output snapshot keeps them as printed).
do $$ declare d text;
 old_ins text:=$q$values(output_id,r.id,r.revision,c.revision,p_data->>'kind','office-word-v1',r.payload,actor) returning * into outrow;$q$;
 new_ins text:=$q$values(output_id,r.id,r.revision,c.revision,p_data->>'kind','office-word-v1',r.payload||case when p_data->>'kind'='claim' then mawatheeq_private.claim_details(r.payload) else '{}'::jsonb end,actor) returning * into outrow;$q$;
begin
 d:=pg_get_functiondef('mawatheeq_private.department_request_base(text,text,jsonb)'::regprocedure);
 if position(new_ins in d)=0 then
  if position(old_ins in d)=0 then raise exception 'department_request_base is not the expected version'; end if;
  execute replace(d,old_ins,new_ins);
 end if;
end $$;

notify pgrst,'reload schema';
commit;
