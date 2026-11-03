begin;
-- What each account sees, down to each field (11 November 2026). Three more parts of an account's permissions:
--  «view»            which pages, workspaces, case tabs, cards and fields are read-only or hidden (only those that
--                     are not simply shown are stored), for example {"tab:finance":"hide","card:contract":"read"};
--  «accountKind»     staff, lawyer, counsel or client (the client's own account);
--  «clientEntityIds» for a client account, the client files whose cases it may see.
-- They are checked here and stored after the earlier save, with the audit entry, the same way as the jobs. The
-- client account's case limits are enforced by the case functions themselves (a later step), not by this storage.
-- Safe to run again.
do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='save_access_kinds') then
  alter function mawatheeq_private.save_access(uuid,jsonb,integer) rename to save_access_kinds;
 end if;
end $$;

create or replace function mawatheeq_private.save_access(p_user uuid,p_permissions jsonb,p_revision integer) returns jsonb
language plpgsql set search_path='' as $$
declare p jsonb:=p_permissions; v_view jsonb:='{}'; v_kind text; v_clients jsonb:='[]'; k text; m text; e jsonb; extra jsonb; result jsonb;
begin
 if jsonb_typeof(p) is distinct from 'object' then return mawatheeq_private.save_access_kinds(p_user,p,p_revision); end if;
 if p ? 'view' and jsonb_typeof(p->'view')<>'null' then
  if jsonb_typeof(p->'view')<>'object' or (select count(*) from jsonb_object_keys(p->'view'))>400 then raise exception 'راجع إعدادات العرض.'; end if;
  for k,m in select key,value#>>'{}' from jsonb_each(p->'view') loop
   if k !~ '^(page|ws|tab|card|field):[A-Za-z]{1,40}$' or m is null or m not in ('read','hide') then raise exception 'راجع إعدادات العرض.'; end if;
   v_view:=v_view||jsonb_build_object(k,m);
  end loop;
 end if;
 if p ? 'accountKind' and jsonb_typeof(p->'accountKind')<>'null' then
  v_kind:=p->>'accountKind';
  if v_kind is null or v_kind not in ('staff','lawyer','counsel','client') then raise exception 'راجع نوع الحساب.'; end if;
 end if;
 if p ? 'clientEntityIds' and jsonb_typeof(p->'clientEntityIds')<>'null' then
  if jsonb_typeof(p->'clientEntityIds')<>'array' or jsonb_array_length(p->'clientEntityIds')>50 then raise exception 'راجع ملفات الموكل المرتبطة.'; end if;
  for e in select value from jsonb_array_elements(p->'clientEntityIds') loop
   if jsonb_typeof(e)<>'string' or e#>>'{}' !~ '^[0-9a-f-]{36}$' then raise exception 'راجع ملفات الموكل المرتبطة.'; end if;
   if not v_clients @> jsonb_build_array(e) then v_clients:=v_clients||jsonb_build_array(e); end if;
  end loop;
 end if;
 perform mawatheeq_private.save_access_kinds(p_user,p-'view'-'accountKind'-'clientEntityIds',p_revision);
 extra:=jsonb_build_object('view',v_view)||case when v_kind is null then '{}' else jsonb_build_object('accountKind',v_kind) end
  ||case when jsonb_array_length(v_clients)=0 then '{}' else jsonb_build_object('clientEntityIds',v_clients) end;
 update mawatheeq_private.member_access set permissions=(permissions-'view'-'accountKind'-'clientEntityIds')||extra
  where user_id=p_user returning permissions||jsonb_build_object('revision',revision) into result;
 update mawatheeq_private.access_changes set after_permissions=(after_permissions-'view'-'accountKind'-'clientEntityIds')||extra
  where id=(select max(id) from mawatheeq_private.access_changes where user_id=p_user);
 return result;
end $$;
revoke all on function mawatheeq_private.save_access(uuid,jsonb,integer),mawatheeq_private.save_access_kinds(uuid,jsonb,integer) from public,anon,authenticated;
commit;
