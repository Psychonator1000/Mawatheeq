begin;
-- Collection papers no longer wait for a source review (owner, 11 November 2026): the team checks the data when it is
-- read from the payment order's PDF, so «generate» only asks that the file is the current one (its revision) and that
-- the template's required fields are filled. Reviews already recorded are kept. Safe to run again.

do $$ declare d text;
 old_check text:=$q$  if r.revision is distinct from (p_data->>'revision')::integer or r.review is null or (r.review->>'recordRevision')::integer<>r.revision
   or (r.review->>'caseRevision')::integer<>c.revision then raise exception 'راجع الملف الحالي والقضية الحالية قبل إنشاء المستند.' using errcode='40001'; end if;$q$;
 new_check text:=$q$  if r.revision is distinct from (p_data->>'revision')::integer then raise exception 'تغير الملف. أعد تحميله قبل إنشاء المستند.' using errcode='40001'; end if;$q$;
begin
 d:=pg_get_functiondef('mawatheeq_private.department_request_base(text,text,jsonb)'::regprocedure);
 if position(new_check in d)=0 then
  if position(old_check in d)=0 then raise exception 'department_request_base is not the expected version'; end if;
  execute replace(d,old_check,new_check);
 end if;
end $$;

notify pgrst,'reload schema';
commit;
