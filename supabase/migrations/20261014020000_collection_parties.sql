begin;
-- Several parties on one collection file (14 October 2026). The first plaintiff and the first defendant stay in their
-- usual fields; any others are kept in two lists, «plaintiffs» and «defendants», each holding up to 20 people or
-- companies with their name, civil ID, job or residence, nationality, address and phone. An extra plaintiff can be
-- linked to a saved client file.
alter function mawatheeq_private.department_payload(text,text,jsonb) rename to department_payload_words;
create function mawatheeq_private.department_payload(w text,k text,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb; list text; e jsonb; parties jsonb; v text;
begin
 result:=mawatheeq_private.department_payload_words(w,k,p);
 if not (w='collections' and k='file') then return result; end if;
 foreach list in array array['plaintiffs','defendants'] loop
  parties:='[]';
  if p ? list and jsonb_typeof(p->list)<>'array' then raise exception 'راجع قائمة الأطراف.'; end if;
  if jsonb_array_length(coalesce(p->list,'[]'))>20 then raise exception 'الحد الأقصى 20 طرفاً إضافياً في كل جهة.'; end if;
  for e in select value from jsonb_array_elements(coalesce(p->list,'[]')) loop
   if jsonb_typeof(e)<>'object' then raise exception 'راجع قائمة الأطراف.'; end if;
   e:=mawatheeq_private.department_fields(e,array['id','name','civilId','job','nationality','address','phone','clientEntityId']);
   if length(e->>'name') not between 1 and 300 then raise exception 'أدخل اسم كل طرف إضافي أو احذفه.'; end if;
   v:=e->>'clientEntityId';
   if list='defendants' then v:=''; end if;
   if v<>'' and (v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or not exists(select 1 from mawatheeq_private.client_entities where id=v::uuid and merged_into is null)) then
    raise exception 'اختر موكلاً محفوظاً للمدعي الإضافي.'; end if;
   parties:=parties||jsonb_build_array(e||jsonb_build_object('clientEntityId',v));
  end loop;
  result:=result||jsonb_build_object(list,parties);
 end loop;
 return result;
end $$;
revoke all on function mawatheeq_private.department_payload(text,text,jsonb),mawatheeq_private.department_payload_words(text,text,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
