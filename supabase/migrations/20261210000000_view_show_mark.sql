begin;
-- New pages start hidden for restricted accounts (owner, 13 November 2026: «yes do the new pages hidden too»).
-- An account whose view hides any page or workspace does not see a page added after 13 November 2026 until the owner
-- shows it in its permissions (lib/view-map.ts). That «shown» is kept as {"page:x":"show"}, so the view settings now
-- accept «show» besides «read» and «hide». The check lives in the function that validates the view (renamed along
-- the access chain since); it is found by its text and patched in place. Safe to run again.
do $$
declare f regprocedure; def text; n int:=0;
begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='mawatheeq_private' and p.prokind='f' and pg_get_functiondef(p.oid) like '%m not in (''read'',''hide'')%' loop
  def:=pg_get_functiondef(f);
  execute replace(def,'m not in (''read'',''hide'')','m not in (''show'',''read'',''hide'')');
  n:=n+1;
 end loop;
 if n=0 and not exists(select 1 from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='mawatheeq_private' and p.prokind='f' and pg_get_functiondef(p.oid) like '%m not in (''show'',''read'',''hide'')%') then
  raise exception 'view settings check not found';
 end if;
 if n>1 then raise exception 'view settings check found % times', n; end if;
end $$;
commit;
