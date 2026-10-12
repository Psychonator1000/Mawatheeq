begin;
-- Delegated administration. The original owner account keeps every power and can never be restricted.
-- Any staff account may also hold specific admin powers, stored with its permissions as adminPowers:
--   staff    manage accounts, permissions, passwords and switching, and grant admin powers
--   reviews  approve source reviews and correct or undo closed court levels
--   settings office rules, workbook imports and client merges
--   backup   full data backups
--   chat     review every staff conversation and remove comments
-- Each public request declares which power its action needs; is_owner() is true for the owner, or for
-- an admin holding that power in a session of their own (not one opened by switching into the account).
-- An admin manages only other staff accounts whose powers they also hold, never their own or the owner's,
-- and grants only powers they hold. Data access still follows the account's sections and case scope.

create function mawatheeq_private.admin_powers(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.mawatheeq_members where user_id=p_user and role='owner') then '["staff","reviews","settings","backup","chat"]'::jsonb
  else coalesce((select x.permissions->'adminPowers' from mawatheeq_private.member_access x join public.mawatheeq_members m on m.user_id=x.user_id
   where x.user_id=p_user and m.role='editor'),'[]'::jsonb) end;
$$;

create or replace function mawatheeq_private.is_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mawatheeq_members where user_id=(select auth.uid()) and role='owner')
  or (coalesce(current_setting('mawatheeq.power',true),'')<>''
   and mawatheeq_private.admin_powers((select auth.uid())) ? current_setting('mawatheeq.power',true));
$$;

-- The power an action needs, set for this request only. Switched sessions never carry admin powers.
create function mawatheeq_private.set_power(p_token text,p_fn text,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare v_power text;
begin
 v_power:=case p_fn
  when 'office' then case when p_action in ('context','create_member','reset_member_password','set_member_password','set_member_enabled','set_member_access',
    'access_history','rename_member','set_display_name','switch_user','account_history') then 'staff' when p_action='export_page' then 'backup' when p_action='review' then 'reviews' end
  when 'local' then case when p_action in ('import_cases','save_rules') then 'settings' when p_action='save_case' then 'reviews' end
  when 'client' then case when p_action in ('list','merge') then 'settings' end
  when 'department' then case when p_action='backup_page' then 'backup' end
  when 'comment' then case when p_action='delete' then 'chat' end
  when 'chat' then case when p_action in ('summary','messages','file_download') then 'chat' end
 end;
 if v_power is not null and exists(select 1 from mawatheeq_private.sessions where token_hash=extensions.digest(coalesce(p_token,''),'sha256') and impersonated_by is not null) then
  v_power:=null; end if;
 perform set_config('mawatheeq.power',coalesce(v_power,''),true);
end $$;

create or replace function public.mawatheeq_local_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
begin perform mawatheeq_private.set_power(p_token,'local',p_action); return mawatheeq_private.local_request(p_token,p_action,p_data); end $$;
create or replace function public.mawatheeq_client_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
begin perform mawatheeq_private.set_power(p_token,'client',p_action); return mawatheeq_private.client_request(p_token,p_action,p_data); end $$;
create or replace function public.mawatheeq_office_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
begin perform mawatheeq_private.set_power(p_token,'office',p_action); return mawatheeq_private.office_request(p_token,p_action,p_data); end $$;
create or replace function public.mawatheeq_department_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
begin perform mawatheeq_private.set_power(p_token,'department',p_action); return mawatheeq_private.department_request(p_token,p_action,p_data); end $$;
create or replace function public.mawatheeq_comment_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
begin perform mawatheeq_private.set_power(p_token,'comment',p_action); return mawatheeq_private.comment_request(p_token,p_action,p_data); end $$;
create or replace function public.mawatheeq_chat_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
begin perform mawatheeq_private.set_power(p_token,'chat',p_action); return mawatheeq_private.chat_request(p_token,p_action,p_data); end $$;

-- Account actions on another person: an admin manages only staff accounts other than their own whose powers they hold too.
alter function mawatheeq_private.office_request(text,text,jsonb) rename to office_request_admins;
create function mawatheeq_private.office_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; v_id uuid;
begin
 if p_action in ('reset_member_password','set_member_password','set_member_enabled','set_member_access','rename_member','set_display_name','switch_user') then
  actor:=mawatheeq_private.authorize(p_token);
  if not exists(select 1 from public.mawatheeq_members where user_id=actor and role='owner') then
   v_id:=nullif(p_data->>'id','')::uuid;
   if v_id=actor then raise exception 'لا يمكنك إدارة حسابك من قائمة الموظفين. اطلب ذلك من مسؤول آخر.' using errcode='42501'; end if;
   if not exists(select 1 from public.mawatheeq_members where user_id=v_id and role='editor') then
    raise exception 'حساب مالك التطبيق محفوظ ولا يُدار إلا من حسابه.' using errcode='42501'; end if;
   if exists(select 1 from jsonb_array_elements_text(mawatheeq_private.admin_powers(v_id)) p where not mawatheeq_private.admin_powers(actor) ? p) then
    raise exception 'هذا الحساب يملك صلاحيات إدارة لا تملكها.' using errcode='42501'; end if;
  end if;
 end if;
 return mawatheeq_private.office_request_admins(p_token,p_action,p_data);
end $$;

-- Saving permissions: adminPowers are validated, limited to the granter's own powers, kept when omitted, and audited.
alter function mawatheeq_private.save_access(uuid,jsonb,integer) rename to save_access_roles;
create function mawatheeq_private.save_access(p_user uuid,p_permissions jsonb,p_revision integer) returns jsonb
language plpgsql set search_path='' as $$
declare actor uuid:=auth.uid(); v_powers jsonb; result jsonb;
begin
 if p_permissions ? 'adminPowers' then
  v_powers:=p_permissions->'adminPowers';
  if jsonb_typeof(v_powers)<>'array' or jsonb_array_length(v_powers)>5
   or exists(select 1 from jsonb_array_elements(v_powers) p where jsonb_typeof(p)<>'string' or p#>>'{}' not in ('staff','reviews','settings','backup','chat')) then
   raise exception 'صلاحيات الإدارة غير صالحة.'; end if;
  select coalesce(jsonb_agg(distinct p order by p),'[]') into v_powers from jsonb_array_elements_text(v_powers) p;
 else
  v_powers:=coalesce((select permissions->'adminPowers' from mawatheeq_private.member_access where user_id=p_user),'[]');
 end if;
 if p_user=actor and not exists(select 1 from public.mawatheeq_members where user_id=actor and role='owner') then
  raise exception 'لا يمكنك تعديل صلاحيات حسابك.' using errcode='42501'; end if;
 if exists(select 1 from jsonb_array_elements_text(v_powers) p where not mawatheeq_private.admin_powers(actor) ? p) then
  raise exception 'لا يمكنك منح صلاحيات إدارة لا تملكها.' using errcode='42501'; end if;
 result:=mawatheeq_private.save_access_roles(p_user,p_permissions-'adminPowers',p_revision);
 if jsonb_array_length(v_powers)>0 then
  update mawatheeq_private.member_access set permissions=permissions||jsonb_build_object('adminPowers',v_powers) where user_id=p_user;
  update mawatheeq_private.access_changes set after_permissions=after_permissions||jsonb_build_object('adminPowers',v_powers)
   where id=(select max(id) from mawatheeq_private.access_changes where user_id=p_user);
  result:=result||jsonb_build_object('adminPowers',v_powers);
 end if;
 return result;
end $$;

revoke all on function mawatheeq_private.admin_powers(uuid),mawatheeq_private.set_power(text,text,text),
 mawatheeq_private.office_request(text,text,jsonb),mawatheeq_private.office_request_admins(text,text,jsonb),
 mawatheeq_private.save_access(uuid,jsonb,integer),mawatheeq_private.save_access_roles(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function mawatheeq_private.set_power(text,text,text),mawatheeq_private.office_request(text,text,jsonb) to anon,authenticated,service_role;
grant execute on function public.mawatheeq_local_request(text,text,jsonb),public.mawatheeq_client_request(text,text,jsonb),public.mawatheeq_office_request(text,text,jsonb),
 public.mawatheeq_department_request(text,text,jsonb),public.mawatheeq_comment_request(text,text,jsonb),public.mawatheeq_chat_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
