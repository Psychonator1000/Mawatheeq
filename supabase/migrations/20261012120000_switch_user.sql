begin;
-- Staff display names (e.g. the lawyer name used on cases) and an owner-only "switch to this user".
-- Switching opens a separate, shorter session for the employee without their password; the owner's own
-- session stays valid so they can return. Every switch is recorded. Passwords are still stored only as hashes.
alter table mawatheeq_private.accounts add column display_name text not null default '' check (length(display_name) <= 80);
alter table mawatheeq_private.sessions add column impersonated_by uuid references mawatheeq_private.accounts(id) on delete cascade;
alter table mawatheeq_private.account_changes drop constraint account_changes_change_check;
alter table mawatheeq_private.account_changes add constraint account_changes_change_check check (change in ('rename','password','display_name','switch'));

alter function mawatheeq_private.office_request(text,text,jsonb) rename to office_request_accounts;
create function mawatheeq_private.office_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; acc mawatheeq_private.accounts%rowtype; result jsonb; v_id uuid; v_name text; v_token text; v_role text;
begin
 if p_action='context' then
  result:=mawatheeq_private.office_request_accounts(p_token,p_action,p_data);
  -- Display names are not secret: everyone who may see an account in the list may see its name.
  return jsonb_set(result,'{members}',(select coalesce(jsonb_agg(m||jsonb_build_object('displayName',coalesce(a.display_name,'')) order by o),'[]')
   from jsonb_array_elements(result->'members') with ordinality e(m,o) left join mawatheeq_private.accounts a on a.id=(m->>'id')::uuid))
   ||jsonb_build_object('switchedBy',(select u.username from mawatheeq_private.sessions s join mawatheeq_private.accounts u on u.id=s.impersonated_by
     where s.token_hash=extensions.digest(p_token,'sha256')));
 end if;
 if p_action not in ('set_display_name','switch_user') then return mawatheeq_private.office_request_accounts(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 if not mawatheeq_private.is_owner() then raise exception 'هذه العملية متاحة لمسؤول المكتب فقط.' using errcode='42501'; end if;
 -- A switched session belongs to the employee, so it can never switch again or rename others.
 if exists(select 1 from mawatheeq_private.sessions where token_hash=extensions.digest(p_token,'sha256') and impersonated_by is not null) then
  raise exception 'عد إلى حسابك أولاً.' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>10000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 v_id:=nullif(p_data->>'id','')::uuid;
 select * into acc from mawatheeq_private.accounts where id=v_id for update;
 if acc.id is null then raise exception 'الحساب غير موجود.'; end if;
 select role into v_role from public.mawatheeq_members where user_id=v_id;
 if p_action='set_display_name' then
  v_name:=btrim(regexp_replace(coalesce(p_data->>'displayName',''),'\s+',' ','g'));
  if length(v_name)>80 then raise exception 'الاسم الظاهر لا يتجاوز 80 حرفاً.'; end if;
  if v_name<>acc.display_name then
   update mawatheeq_private.accounts set display_name=v_name where id=v_id;
   insert into mawatheeq_private.account_changes(user_id,actor_id,change,before_username,after_username) values(v_id,actor,'display_name',acc.display_name,v_name);
  end if;
  return jsonb_build_object('id',v_id,'displayName',v_name);
 end if;
 -- switch_user
 if v_role is distinct from 'editor' then raise exception 'يمكن الدخول بحسابات الموظفين فقط.'; end if;
 if not acc.enabled then raise exception 'هذا الحساب موقوف. أعد تفعيله أولاً.'; end if;
 if acc.must_change_password then raise exception 'لهذا الحساب كلمة مرور مؤقتة لم تُغيّر بعد. اختر له كلمة مرور دائمة أولاً.'; end if;
 delete from mawatheeq_private.sessions where expires_at<clock_timestamp();
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into mawatheeq_private.sessions(token_hash,user_id,expires_at,impersonated_by)
  values(extensions.digest(v_token,'sha256'),v_id,clock_timestamp()+interval '8 hours',actor);
 insert into mawatheeq_private.account_changes(user_id,actor_id,change) values(v_id,actor,'switch');
 insert into public.mawatheeq_audit(actor,record_id,action) values(actor,v_id::text,'switch_user');
 return jsonb_build_object('token',v_token,'user',jsonb_build_object('id',acc.id,'username',acc.username,'role',v_role,'mustChangePassword',false));
end $$;
revoke all on function mawatheeq_private.office_request(text,text,jsonb),mawatheeq_private.office_request_accounts(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.office_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
