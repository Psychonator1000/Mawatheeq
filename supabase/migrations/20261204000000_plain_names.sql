begin;
-- Names are kept plain and the courtesy title is added when they are shown (owner, 11 November 2026): some staff names
-- were written with «ا/», «أ/», «ا.» or «المحامي» before them and some without. strip_title() removes such a title;
-- account names are stored through it from now on, the names already stored lose theirs, and the roll import matches a
-- roll's lawyer to an account with the titles left out on both sides. Kept in step with plainName() in
-- lib/staff-accounts.ts. Safe to run again.

-- A name that is nothing but a title (an account called «المحامي») is left as it is.
create or replace function mawatheeq_private.strip_title(v text) returns text
language sql immutable set search_path='' as $$
 select coalesce(nullif(btrim(regexp_replace(regexp_replace(x,
  '^\s*((ال)?محام(ي|ى)(ة|ه)?|(ال)?(أ|ا|إ)ستاذ(ة|ه)?|(أ|ا|إ)\s*[/.])\s*',''),
  '^\s*((ال)?محام(ي|ى)(ة|ه)?|(ال)?(أ|ا|إ)ستاذ(ة|ه)?|(أ|ا|إ)\s*[/.])\s*','')),''),btrim(x))
 from (select regexp_replace(coalesce(v,''),'\s+',' ','g') x) s;
$$;
revoke all on function mawatheeq_private.strip_title(text) from public,anon,authenticated;

create or replace function mawatheeq_private.plain_display_name() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.display_name is not null then new.display_name:=mawatheeq_private.strip_title(new.display_name); end if;
 return new;
end $$;
revoke all on function mawatheeq_private.plain_display_name() from public,anon,authenticated;
drop trigger if exists plain_display_name on mawatheeq_private.accounts;
create trigger plain_display_name before insert or update of display_name on mawatheeq_private.accounts
 for each row execute function mawatheeq_private.plain_display_name();

update mawatheeq_private.accounts set display_name=mawatheeq_private.strip_title(display_name)
 where display_name is not null and display_name<>mawatheeq_private.strip_title(display_name);

do $$ declare d text;
 old_match text:=$q$(mawatheeq_private.normalized(coalesce(nullif(a.display_name,''),a.username))=mawatheeq_private.normalized(c->>'lawyer') or$q$;
 new_match text:=$q$(mawatheeq_private.normalized(mawatheeq_private.strip_title(coalesce(nullif(a.display_name,''),a.username)))=mawatheeq_private.normalized(mawatheeq_private.strip_title(c->>'lawyer')) or$q$;
begin
 d:=pg_get_functiondef('mawatheeq_private.import_roll(jsonb,text,boolean,uuid)'::regprocedure);
 if position(new_match in d)=0 then
  if position(old_match in d)=0 then raise exception 'import_roll is not the expected version'; end if;
  execute replace(d,old_match,new_match);
 end if;
end $$;

notify pgrst,'reload schema';
commit;
