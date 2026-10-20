-- Working hours per weekday: a schedule (the office's or an employee's) may give some days their own start and end,
-- such as a short Thursday or Saturday. Days without their own hours keep the usual ones.
begin;

create or replace function mawatheeq_private.att_valid_schedule(s jsonb) returns boolean language sql stable set search_path='' as $$
 select jsonb_typeof(s)='object' and mawatheeq_private.att_hhmm(s->>'start') and mawatheeq_private.att_hhmm(s->>'end') and s->>'start'<s->>'end'
  and jsonb_typeof(s->'workDays')='array' and jsonb_array_length(s->'workDays')<=7
  and not exists(select 1 from jsonb_array_elements(s->'workDays') d where jsonb_typeof(d)<>'number' or (d#>>'{}')::numeric not in (0,1,2,3,4,5,6))
  and (coalesce(jsonb_typeof(s->'days'),'null')='null' or (jsonb_typeof(s->'days')='object'
   and not exists(select 1 from jsonb_each(s->'days') d where d.key not in ('0','1','2','3','4','5','6') or jsonb_typeof(d.value)<>'object'
    or not mawatheeq_private.att_hhmm(d.value->>'start') or not mawatheeq_private.att_hhmm(d.value->>'end') or d.value->>'start'>=d.value->>'end'))); $$;

notify pgrst,'reload schema';
commit;
