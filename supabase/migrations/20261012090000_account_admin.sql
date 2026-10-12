begin;
-- Owner account administration: rename any local account (the owner's included) and set a staff password directly,
-- either permanent or temporary. Additive: the existing temporary-password reset and all grants stay as they are.
create table mawatheeq_private.account_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references mawatheeq_private.accounts(id) on delete cascade,
  actor_id uuid not null references mawatheeq_private.accounts(id),
  change text not null check (change in ('rename','password')),
  before_username text, after_username text, must_change_password boolean,
  created_at timestamptz not null default now()
);
create index account_changes_user_idx on mawatheeq_private.account_changes(user_id,id);
alter table mawatheeq_private.account_changes enable row level security;
revoke all on mawatheeq_private.account_changes from public,anon,authenticated;

-- The previous entry point keeps every other action; account names and direct passwords are handled here.
alter function mawatheeq_private.office_request(text,text,jsonb) rename to office_request_core;
create function mawatheeq_private.office_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; acc mawatheeq_private.accounts%rowtype; v_id uuid; v_username text; v_password text; v_must boolean; v_role text;
begin
 if p_action not in ('rename_member','set_member_password','account_history') then return mawatheeq_private.office_request_core(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 if not mawatheeq_private.is_owner() then raise exception 'إدارة المستخدمين متاحة لمسؤول المكتب فقط.' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>10000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 v_id:=nullif(p_data->>'id','')::uuid;
 if p_action='account_history' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'change',h.change,'before',h.before_username,'after',h.after_username,
    'mustChangePassword',h.must_change_password,'actor',u.username,'createdAt',h.created_at) order by h.id desc),'[]')
   from (select * from mawatheeq_private.account_changes where user_id=v_id order by id desc limit 50) h join mawatheeq_private.accounts u on u.id=h.actor_id);
 end if;
 -- Lock the account first, in the same order as authorize() and the password change, so concurrent requests serialize.
 select * into acc from mawatheeq_private.accounts where id=v_id for update;
 if acc.id is null then raise exception 'الحساب غير موجود.'; end if;
 select role into v_role from public.mawatheeq_members where user_id=v_id;
 if p_action='rename_member' then
  v_username:=lower(btrim(coalesce(p_data->>'username','')));
  if v_username !~ '^[a-z0-9][a-z0-9_.-]{2,31}$' then raise exception 'اسم المستخدم 3 إلى 32 حرفاً إنجليزياً أو رقماً أو . _ -'; end if;
  if v_username<>acc.username then
   if exists(select 1 from mawatheeq_private.accounts where username=v_username and id<>v_id) then raise exception 'اسم المستخدم مستخدم بالفعل.'; end if;
   update mawatheeq_private.accounts set username=v_username where id=v_id;
   insert into mawatheeq_private.account_changes(user_id,actor_id,change,before_username,after_username) values(v_id,actor,'rename',acc.username,v_username);
   insert into public.mawatheeq_audit(actor,record_id,action) values(actor,v_id::text,p_action);
  end if;
 else
  -- The owner changes their own password with the current one; staff passwords are set here.
  if v_role is distinct from 'editor' then raise exception 'غيّر كلمة مرور مسؤول المكتب من قائمة الحساب باستخدام كلمة المرور الحالية.'; end if;
  v_password:=p_data->>'password';
  if length(coalesce(v_password,''))<12 or octet_length(v_password)>72 then raise exception 'كلمة المرور: 12 حرفاً على الأقل وبحد أقصى 72 بايت.'; end if;
  if jsonb_typeof(p_data->'mustChange') is distinct from 'boolean' then raise exception 'حدد هل يغيّر الموظف كلمة المرور عند الدخول.'; end if;
  v_must:=(p_data->>'mustChange')::boolean;
  update mawatheeq_private.accounts set password_hash=extensions.crypt(v_password,extensions.gen_salt('bf',10)),must_change_password=v_must,failures=0,locked_until=null where id=v_id;
  delete from mawatheeq_private.sessions where user_id=v_id;
  insert into mawatheeq_private.account_changes(user_id,actor_id,change,must_change_password) values(v_id,actor,'password',v_must);
  insert into public.mawatheeq_audit(actor,record_id,action) values(actor,v_id::text,p_action);
 end if;
 return (select jsonb_build_object('id',a.id,'username',a.username,'role',m.role,'enabled',a.enabled,'mustChangePassword',a.must_change_password)
  from mawatheeq_private.accounts a join public.mawatheeq_members m on m.user_id=a.id where a.id=v_id);
end $$;
revoke all on function mawatheeq_private.office_request(text,text,jsonb),mawatheeq_private.office_request_core(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.office_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
