begin;
-- The lawyer named on a case is kept plain, like the account names (owner, 11 November 2026): «ا/ احمد ابواليزيد»,
-- «ا.», «أ/», «المحامى» and the like become «احمد ابواليزيد». The names in the accounts' «قضايا المحامي» lists lose
-- their title too, in the same step, so every lawyer keeps exactly the cases he had. From now on a case and an access
-- list are saved without the title. Every case and access list touched is copied first into
-- mawatheeq_private.backup_2026_11_11 (with its revision); each case change is also kept in the case's history. Safe to
-- run again.

create table if not exists mawatheeq_private.backup_2026_11_11 (kind text not null, id text not null, revision integer, data jsonb not null, taken_at timestamptz not null default now(), reason text not null);
alter table mawatheeq_private.backup_2026_11_11 enable row level security;
revoke all on mawatheeq_private.backup_2026_11_11 from public,anon,authenticated;

insert into mawatheeq_private.backup_2026_11_11(kind,id,revision,data,reason)
 select 'case',c.id::text,c.revision,c.payload,'lawyer title' from public.mawatheeq_cases c
 where coalesce(c.payload->>'lawyer','')<>mawatheeq_private.strip_title(c.payload->>'lawyer')
  and not exists(select 1 from mawatheeq_private.backup_2026_11_11 b where b.kind='case' and b.id=c.id::text and b.reason='lawyer title');
insert into mawatheeq_private.backup_2026_11_11(kind,id,revision,data,reason)
 select 'access',a.user_id::text,null,a.permissions,'lawyer title' from mawatheeq_private.member_access a
 where jsonb_typeof(a.permissions->'lawyerNames')='array'
  and exists(select 1 from jsonb_array_elements_text(a.permissions->'lawyerNames') n where mawatheeq_private.strip_title(n)<>n)
  and not exists(select 1 from mawatheeq_private.backup_2026_11_11 b where b.kind='access' and b.id=a.user_id::text and b.reason='lawyer title');

-- Cases are saved with the lawyer's name plain (before the light copy and the lawyer key are worked out).
create or replace function mawatheeq_private.case_lawyer_plain() returns trigger
language plpgsql set search_path='' as $$
begin
 if coalesce(new.payload->>'lawyer','')<>mawatheeq_private.strip_title(new.payload->>'lawyer') then
  new.payload:=jsonb_set(new.payload,'{lawyer}',to_jsonb(mawatheeq_private.strip_title(new.payload->>'lawyer')));
 end if;
 return new;
end $$;
revoke all on function mawatheeq_private.case_lawyer_plain() from public,anon,authenticated;
drop trigger if exists mawatheeq_cases_0_lawyer_plain on public.mawatheeq_cases;
create trigger mawatheeq_cases_0_lawyer_plain before insert or update on public.mawatheeq_cases
 for each row execute function mawatheeq_private.case_lawyer_plain();

-- The cases already saved: a new revision each, so an open copy elsewhere asks to reload before saving over it.
update public.mawatheeq_cases set payload=jsonb_set(payload,'{revision}',to_jsonb(revision+1)),revision=revision+1
 where coalesce(payload->>'lawyer','')<>mawatheeq_private.strip_title(payload->>'lawyer');

-- The accounts' lists of lawyer names, now and when saved.
update mawatheeq_private.member_access a set permissions=a.permissions||jsonb_build_object('lawyerNames',
  (select coalesce(jsonb_agg(distinct mawatheeq_private.strip_title(n)),'[]') from jsonb_array_elements_text(a.permissions->'lawyerNames') n))
 where jsonb_typeof(a.permissions->'lawyerNames')='array'
  and exists(select 1 from jsonb_array_elements_text(a.permissions->'lawyerNames') n where mawatheeq_private.strip_title(n)<>n);

do $$ declare d text;
 old_names text:=$q$select coalesce(jsonb_agg(distinct btrim(n)),'[]') into names from jsonb_array_elements_text(p_permissions->'lawyerNames') n;$q$;
 new_names text:=$q$select coalesce(jsonb_agg(distinct mawatheeq_private.strip_title(n)),'[]') into names from jsonb_array_elements_text(p_permissions->'lawyerNames') n;$q$;
begin
 d:=pg_get_functiondef('mawatheeq_private.save_access_named(uuid,jsonb,integer)'::regprocedure);
 if position(new_names in d)=0 then
  if position(old_names in d)=0 then raise exception 'save_access_named is not the expected version'; end if;
  execute replace(d,old_names,new_names);
 end if;
end $$;

notify pgrst,'reload schema';
commit;
