begin;
-- Fast case reads (9 November 2026). Every read of the case list trimmed each case's sessions (trim_case) and every
-- lawyer account's read normalized the lawyer name of all 7,000 cases, on each page of every request: about 0.75 s of
-- database time per page of 500, so one cold start was some 15 s of work and a few at once timed out on the small
-- server. Each case now keeps its light form and its normalized lawyer name, worked out once when it is saved, and the
-- reads take them as they are. What a read returns is unchanged.
-- The light form drops sittings older than 180 days (all but the last three); one kept from an earlier save may hold a
-- sitting that has since passed that mark, which only means a little more than needed, never less. Safe to run again.

alter table public.mawatheeq_cases add column if not exists light jsonb, add column if not exists lawyer_norm text not null default '';

create or replace function mawatheeq_private.case_light() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' or new.payload is distinct from old.payload or new.light is null then
  new.light:=mawatheeq_private.trim_case(new.payload);
  new.lawyer_norm:=coalesce(mawatheeq_private.normalized(new.payload->>'lawyer'),'');
 end if;
 return new;
end $$;
revoke all on function mawatheeq_private.case_light() from public,anon,authenticated;
-- Named to run after case_client_link (which may change the payload) and before mawatheeq_cases_touch.
drop trigger if exists mawatheeq_cases_a_light on public.mawatheeq_cases;
create trigger mawatheeq_cases_a_light before insert or update on public.mawatheeq_cases
 for each row execute function mawatheeq_private.case_light();
create index if not exists mawatheeq_cases_lawyer_norm_idx on public.mawatheeq_cases(lawyer_norm) where lawyer_norm<>'';

-- Fill the existing cases without touching anything else: no history entry, no new «changed at», no client relink,
-- so no open copy reloads because of it.
alter table public.mawatheeq_cases disable trigger user;
update public.mawatheeq_cases set light=mawatheeq_private.trim_case(payload),lawyer_norm=coalesce(mawatheeq_private.normalized(payload->>'lawyer'),'')
 where light is null or lawyer_norm is distinct from coalesce(mawatheeq_private.normalized(payload->>'lawyer'),'');
alter table public.mawatheeq_cases enable trigger user;

-- The reads: the stored light form (for the very revision read) and the stored lawyer name.
do $$
declare d text; n int;
 old_trim text:='mawatheeq_private.trim_case(r->''payload'')';
 new_trim text:='coalesce((select c.light from public.mawatheeq_cases c where c.id=r->>''id'' and c.revision=(r->>''revision'')::integer),mawatheeq_private.trim_case(r->''payload''))';
 old_name text:='mawatheeq_private.normalized(c.payload->>''lawyer'')<>'''' and mawatheeq_private.normalized(c.payload->>''lawyer'')=any(v_names)';
 new_name text:='c.lawyer_norm<>'''' and c.lawyer_norm=any(v_names)';
begin
 d:=pg_get_functiondef('mawatheeq_private.local_request_view(text,text,jsonb)'::regprocedure);
 if position(new_trim in d)=0 then
  n:=(length(d)-length(replace(d,old_trim,'')))/length(old_trim);
  if n<>2 then raise exception 'local_request_view no longer trims the case list where expected (% places)',n; end if;
  d:=replace(replace(d,new_trim,'§'),old_trim,new_trim);d:=replace(d,'§',new_trim);
 end if;
 d:=replace(d,old_name,new_name);
 execute d;
 d:=pg_get_functiondef('mawatheeq_private.local_request_register(text,text,jsonb)'::regprocedure);
 if position(old_name in d)=0 and position(new_name in d)=0 then raise exception 'local_request_register no longer filters by lawyer name where expected'; end if;
 execute replace(d,old_name,new_name);
end $$;
notify pgrst,'reload schema';
commit;
