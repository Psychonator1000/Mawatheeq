begin;
-- Where a judgment stands, worked out by the database (9 November 2026): the same answer as caseState() in
-- lib/domain.ts, field for field — outcome, appeal, criminal, the appeal deadline and days left, days since the
-- judgment, the execution deadline and days left, eligible for execution, status and alert. The case list, its counts
-- and filters can then be answered by the server a page at a time instead of every browser working through all the
-- cases. scripts/verify-case-state.mjs runs both on thousands of cases and requires identical answers.
-- Nothing reads it yet. Safe to run again.

-- A calendar date written YYYY-MM-DD, or null (as validDate(): a date that does not exist, like 30 February, is null).
create or replace function mawatheeq_private.iso_day(s text) returns date
language plpgsql immutable set search_path='' as $$
begin
 if s is null or s !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
 return s::date;
exception when others then return null;
end $$;

-- As normalize(): alef forms, final yaa and taa marbuta folded, harakat and tatweel removed, spaces squeezed.
create or replace function mawatheeq_private.norm_ar(s text) returns text
language sql immutable set search_path='' as $$
 -- Every kind of space JavaScript's \s and trim() know (no-break, thin, ideographic, byte-order mark…) counts as one.
 select btrim(regexp_replace(regexp_replace(translate(coalesce(s,''),'أإآىة','اااي' || 'ه'),'[ً-ٟـ]','','g'),
  '[\s' || chr(160) || chr(5760) || chr(8192) || '-' || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279) || ']+',' ','g'));
$$;

-- caseState(c, rules, today). Text fields that are missing count as empty, as they do on the page.
create or replace function mawatheeq_private.case_state(p jsonb,r jsonb,today date) returns jsonb
language plpgsql immutable set search_path='' as $$
declare
 t text:=coalesce(p->>'type',''); days integer; outcome text; appeal text; criminal boolean; d date:=mawatheeq_private.iso_day(p->>'date');
 has_date boolean:=coalesce(p->>'date','')<>''; due date; exec_due date; remaining integer; elapsed integer; exec_remaining integer;
 eligible boolean; expired boolean; awaiting boolean; status text; alert text;
 rec text:=coalesce(p->>'appealRecorded',''); note text:=coalesce(p->>'executionNote',''); conf text:=coalesce(p->>'appealConfirmation','');
 o text:=coalesce(p->>'outcome','');
begin
 if t='حكم ابتدائي' then t:='حكم أول درجة'; end if;
 days:=case t when 'حكم أول درجة' then (r->>'first')::integer when 'حكم استئناف' then (r->>'appeal')::integer when 'حكم تمييز' then 0
  when 'إشكال' then (r->>'objection')::integer end;
 outcome:=case when o like 'غير صالح%' then 'غير صالحنا' when o like 'لصالحنا%' then 'لصالحنا' else 'غير محدد' end;
 appeal:=case when conf<>'' then conf
  when rec like 'تم%' or position('تم الاستئناف' in coalesce(p->>'legacyNotes',''))>0 or position('يوجد استئناف' in coalesce(p->>'executionLegacy',''))>0 then 'تم'
  when rec='لا يوجد' then 'لا يوجد' else 'غير مؤكد' end;
 criminal:=mawatheeq_private.norm_ar(p->>'role') in ('متهم','متهمه','جاني','جانيه') and outcome='غير صالحنا';
 -- An empty or impossible date gives no deadline; 0 days (cassation) gives none either.
 due:=case when has_date and coalesce(days,0)<>0 and d is not null then d+days end;
 exec_due:=case when has_date and d is not null then d+(r->>'execution')::integer end;
 remaining:=due-today; elapsed:=today-d; exec_remaining:=exec_due-today;
 eligible:=not criminal and outcome='لصالحنا' and appeal='لا يوجد';
 expired:=case when due is not null then today>due when days=0 and exec_due is not null then today>exec_due else false end;
 awaiting:=not has_date and coalesce(jsonb_typeof(p->'stages')='array' and jsonb_array_length(p->'stages')>0,false);
 status:=case
  when criminal then 'جنح'
  when awaiting then 'متداول'
  when note='غير متداول' or rec='منتهي' then 'منتهي'
  when appeal='تم' then 'متداول'
  when outcome='لصالحنا' and note in ('تم عمل اجراءات التنفيذ','تم فتح ملف التنفيذ') then 'تنفيذ قائم'
  when not has_date or days is null or outcome='غير محدد' then 'بيانات ناقصة'
  when expired and appeal='لا يوجد' then case when outcome='لصالحنا' then 'جاهز للتنفيذ' when p->>'noActionConfirmation'='نعم' then 'منتهي'
   when p->>'noActionConfirmation'='لا' then 'متداول' else 'بانتظار تأكيد الإجراءات' end
  when appeal='غير مؤكد' then 'بانتظار تأكيد الطعن'
  else 'متداول' end;
 alert:=case when status='منتهي' then 'ملف منتهي' when appeal='تم' or awaiting then 'تم اتخاذ الإجراء' when days=0 then 'نهائي'
  when remaining is null then 'بيانات ناقصة' when remaining<0 then 'انتهت المهلة' when remaining<=(r->>'warning')::integer then 'خلال خمسة أيام'
  else 'ضمن المهلة' end;
 return jsonb_build_object('outcome',outcome,'appeal',appeal,'criminal',criminal,'due',coalesce(to_char(due,'YYYY-MM-DD'),''),'days',days,
  'remaining',remaining,'elapsed',elapsed,'executionDue',coalesce(to_char(exec_due,'YYYY-MM-DD'),''),'executionRemaining',exec_remaining,
  'eligible',eligible,'status',status,'alert',alert,'awaiting',awaiting);
end $$;
revoke all on function mawatheeq_private.iso_day(text),mawatheeq_private.norm_ar(text),mawatheeq_private.case_state(jsonb,jsonb,date) from public,anon,authenticated;
commit;
