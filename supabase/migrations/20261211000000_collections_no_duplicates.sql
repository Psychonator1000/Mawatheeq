begin;
-- No duplicate collection files (owner, 14 November 2026: «don't allow dups from now on»). An active collection file
-- may not share its payment order's automatic number (orderAuto, or fileAutoNumber from older imports) with another
-- active file, whichever screen saves it (reading a PDF, the orders statement, Excel, by hand). The automatic number is
-- unique across the courts; an order number («504542/2025») can repeat from one court to another, so it does not count.
-- The person is told to open and complete the file that exists. Archived files do not count. Safe to run again.
create or replace function mawatheeq_private.collections_no_duplicate() returns trigger
language plpgsql set search_path='' as $$
declare autos text[]; k text; clash text;
begin
 if new.workspace<>'collections' or new.kind<>'file' or new.archived then return new; end if;
 autos:=array_remove(array[nullif(regexp_replace(coalesce(new.payload->>'orderAuto',''),'\D','','g'),''),
                           nullif(regexp_replace(coalesce(new.payload->>'fileAutoNumber',''),'\D','','g'),'')],null);
 -- Two people saving the same order at the same moment wait for each other instead of both getting in.
 foreach k in array autos loop perform pg_advisory_xact_lock(hashtext('collections-order:'||k)); end loop;
 if cardinality(autos)>0 then
  select coalesce(nullif(t.payload->>'code',''),nullif(t.payload->>'defendant',''),'بلا كود') into clash from mawatheeq_private.department_records t
   where t.workspace='collections' and t.kind='file' and not t.archived and t.id<>new.id
     and array_remove(array[nullif(regexp_replace(coalesce(t.payload->>'orderAuto',''),'\D','','g'),''),nullif(regexp_replace(coalesce(t.payload->>'fileAutoNumber',''),'\D','','g'),'')],null) && autos
   limit 1;
  if found then raise exception 'يوجد ملف تحصيل بالرقم الآلي نفسه (%): «%». افتحه وأكمله بدلاً من إنشاء ملف ثانٍ.', autos[1], clash; end if;
 end if;
 return new;
end $$;
revoke all on function mawatheeq_private.collections_no_duplicate() from public,anon,authenticated;
drop trigger if exists collections_no_duplicate on mawatheeq_private.department_records;
create trigger collections_no_duplicate before insert or update of payload, archived on mawatheeq_private.department_records
 for each row execute function mawatheeq_private.collections_no_duplicate();
commit;
