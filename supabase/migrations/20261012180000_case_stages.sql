begin;
-- Court levels (درجات التقاضي). A case keeps the levels it has left in payload->'stages', each exactly as it stood
-- when the case moved on. The server stamps who closed a level and when; staff can add a level but never change
-- or remove a closed one. Only the office owner may correct or undo a closed level. Saves that omit the list keep it.
alter function mawatheeq_private.mawatheeq_save_case(jsonb) rename to mawatheeq_save_case_staged;
create function mawatheeq_private.mawatheeq_save_case(p_case jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old jsonb; v_owner boolean:=mawatheeq_private.is_owner(); v_actor text; s jsonb; prev jsonb; v_stages jsonb:='[]'; v_ids text[]:='{}';
begin
 if p_case is null or jsonb_typeof(p_case)<>'object' then raise exception 'السجل غير صالح.'; end if;
 perform pg_advisory_xact_lock(hashtext('mawatheeq-case-writes'));
 select payload into old from public.mawatheeq_cases where id=p_case->>'id';
 if not p_case ? 'stages' then
  if old ? 'stages' then p_case:=p_case||jsonb_build_object('stages',old->'stages'); end if;
  return mawatheeq_private.mawatheeq_save_case_staged(p_case);
 end if;
 if jsonb_typeof(p_case->'stages')<>'array' or jsonb_array_length(p_case->'stages')>12 then raise exception 'سجل درجات التقاضي غير صالح.'; end if;
 if coalesce(p_case->>'stage','') not in ('','ابتدائي','استئناف','تمييز') then raise exception 'درجة التقاضي غير صالحة.'; end if;
 if not v_owner then
  for prev in select value from jsonb_array_elements(case when jsonb_typeof(old->'stages')='array' then old->'stages' else '[]'::jsonb end) loop
   if not exists(select 1 from jsonb_array_elements(p_case->'stages') n where n.value=prev) then
    raise exception 'لا يمكن تعديل درجة تقاضٍ مغلقة أو حذفها. يمكن لمسؤول المكتب وحده تصحيحها.' using errcode='42501';
   end if;
  end loop;
 end if;
 select username into v_actor from mawatheeq_private.accounts where id=auth.uid();
 for s in select value from jsonb_array_elements(p_case->'stages') loop
  if jsonb_typeof(s)<>'object' or coalesce(length(s->>'id'),0) not between 1 and 100 or coalesce(s->>'level','') not in ('ابتدائي','استئناف','تمييز')
   or (s->>'id')=any(v_ids) or jsonb_typeof(coalesce(s->'procedures','[]'::jsonb))<>'array' then
   raise exception 'بيانات درجة التقاضي غير صالحة.';
  end if;
  if coalesce(s->>'date','')<>'' and (s->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (s->>'date')::date is null) then raise exception 'راجع تاريخ حكم الدرجة السابقة.'; end if;
  v_ids:=v_ids||(s->>'id');
  select value into prev from jsonb_array_elements(case when jsonb_typeof(old->'stages')='array' then old->'stages' else '[]'::jsonb end) where value->>'id'=s->>'id';
  s:=s||case when prev is null then jsonb_build_object('closedAt',to_char(clock_timestamp() at time zone 'Asia/Kuwait','YYYY-MM-DD"T"HH24:MI:SS'),'closedBy',coalesce(v_actor,''))
   else jsonb_build_object('closedAt',prev->'closedAt','closedBy',prev->'closedBy') end;
  v_stages:=v_stages||jsonb_build_array(s);
 end loop;
 return mawatheeq_private.mawatheeq_save_case_staged(jsonb_set(p_case,'{stages}',v_stages));
end $$;
revoke all on function mawatheeq_private.mawatheeq_save_case(jsonb),mawatheeq_private.mawatheeq_save_case_staged(jsonb) from public,anon,authenticated;

-- A workbook row for a judgment the case has since moved on from still matches that case instead of adding a duplicate.
create or replace function mawatheeq_private.mawatheeq_import_cases(p_cases jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare input jsonb; c jsonb; added integer := 0;
begin
  if not mawatheeq_private.is_member() then raise exception 'لا تملك صلاحية الوصول إلى المكتب.' using errcode = '42501'; end if;
  if p_cases is null or jsonb_typeof(p_cases) <> 'array' or jsonb_array_length(p_cases) > 400 then raise exception 'ملف الاستيراد غير صالح أو يتجاوز 400 سجل في الدفعة.'; end if;
  perform pg_advisory_xact_lock(hashtext('mawatheeq-case-writes'));
  for input in select value from jsonb_array_elements(p_cases) loop
    c := input || jsonb_build_object('id',gen_random_uuid()::text,'revision',1,'archived',false);
    perform mawatheeq_private.validate_case(c);
    if not exists(select 1 from public.mawatheeq_cases where mawatheeq_private.import_key(payload) = mawatheeq_private.import_key(c))
     and not exists(select 1 from public.mawatheeq_cases x, jsonb_array_elements(case when jsonb_typeof(x.payload->'stages')='array' then x.payload->'stages' else '[]'::jsonb end) st
      where mawatheeq_private.import_key(x.payload||jsonb_build_object('autoNumber',coalesce(st.value->>'autoNumber',''),'date',coalesce(st.value->>'date',''))) = mawatheeq_private.import_key(c)) then
      insert into public.mawatheeq_cases(id,payload,revision,archived) values(c->>'id',c,1,false);
      insert into public.mawatheeq_audit(actor,record_id,action) values(auth.uid(),c->>'id','import_case');
      added := added+1;
    end if;
  end loop;
  return jsonb_build_object('added',added,'skipped',jsonb_array_length(p_cases)-added);
end;
$$;
notify pgrst,'reload schema';
commit;
