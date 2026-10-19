-- Security tightening: sign-in limits per username, a session check the mail function makes before it contacts any
-- server, and row security switched on for every private table as a second lock behind the missing grants.
begin;

-- Sign-in attempts are limited per username, so one person guessing cannot lock the whole office out.
create table if not exists mawatheeq_private.login_attempts (
  username text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
revoke all on mawatheeq_private.login_attempts from public,anon,authenticated;

create or replace function mawatheeq_private.local_login(p_username text,p_password text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a mawatheeq_private.accounts%rowtype; v_role text; v_token text; attempts integer; v_hash text; v_name text;
begin
  if octet_length(coalesce(p_password,'')) not between 1 and 72 or length(coalesce(p_username,''))>100 then
    return jsonb_build_object('error','اسم المستخدم أو كلمة المرور غير صحيحة.');
  end if;
  v_name:=lower(btrim(p_username));
  -- Return errors instead of raising so failed-attempt counters are committed.
  -- A high ceiling for the whole office, and a low one for each username.
  insert into mawatheeq_private.login_rate(id,window_start,attempts) values(true,clock_timestamp(),1)
  on conflict(id) do update set
    attempts=case when mawatheeq_private.login_rate.window_start < clock_timestamp()-interval '5 minutes' then 1 else mawatheeq_private.login_rate.attempts+1 end,
    window_start=case when mawatheeq_private.login_rate.window_start < clock_timestamp()-interval '5 minutes' then clock_timestamp() else mawatheeq_private.login_rate.window_start end
  returning mawatheeq_private.login_rate.attempts into attempts;
  if attempts>600 then return jsonb_build_object('error','محاولات كثيرة. انتظر خمس دقائق ثم أعد المحاولة.'); end if;
  insert into mawatheeq_private.login_attempts(username,window_start,attempts) values(v_name,clock_timestamp(),1)
  on conflict(username) do update set
    attempts=case when mawatheeq_private.login_attempts.window_start < clock_timestamp()-interval '5 minutes' then 1 else mawatheeq_private.login_attempts.attempts+1 end,
    window_start=case when mawatheeq_private.login_attempts.window_start < clock_timestamp()-interval '5 minutes' then clock_timestamp() else mawatheeq_private.login_attempts.window_start end
  returning mawatheeq_private.login_attempts.attempts into attempts;
  if attempts>20 then return jsonb_build_object('error','محاولات كثيرة. انتظر خمس دقائق ثم أعد المحاولة.'); end if;
  delete from mawatheeq_private.login_attempts where window_start<clock_timestamp()-interval '1 hour';
  select * into a from mawatheeq_private.accounts where username=v_name for update;
  if a.locked_until>clock_timestamp() then return jsonb_build_object('error','تعذر تسجيل الدخول. انتظر عشر دقائق ثم أعد المحاولة.'); end if;
  v_hash:=coalesce(a.password_hash,extensions.crypt('unused-comparison',extensions.gen_salt('bf',10)));
  if extensions.crypt(p_password,v_hash)<>v_hash or a.id is null or not a.enabled then
    if a.id is not null then
      update mawatheeq_private.accounts set failures=case when failures>=7 then 0 else failures+1 end,
        locked_until=case when failures>=7 then clock_timestamp()+interval '10 minutes' else null end where id=a.id;
    end if;
    return jsonb_build_object('error','اسم المستخدم أو كلمة المرور غير صحيحة.');
  end if;
  select role into v_role from public.mawatheeq_members where user_id=a.id;
  if v_role is null then return jsonb_build_object('error','هذا الحساب غير مفعّل في مساحة المكتب.'); end if;
  update mawatheeq_private.accounts set failures=0,locked_until=null where id=a.id;
  delete from mawatheeq_private.login_attempts where username=v_name;
  delete from mawatheeq_private.sessions where expires_at<clock_timestamp();
  delete from mawatheeq_private.sessions where token_hash in
    (select token_hash from mawatheeq_private.sessions where user_id=a.id order by created_at desc offset 19);
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into mawatheeq_private.sessions(token_hash,user_id,expires_at)
    values(extensions.digest(v_token,'sha256'),a.id,clock_timestamp()+interval '24 hours');
  return jsonb_build_object('token',v_token,'user',jsonb_build_object('id',a.id,'username',a.username,'role',v_role,'mustChangePassword',a.must_change_password));
end $$;
revoke all on function mawatheeq_private.local_login(text,text) from public;
grant execute on function mawatheeq_private.local_login(text,text) to anon,authenticated,service_role;

-- The mail function asks who is signed in before it connects anywhere for a test.
create or replace function mawatheeq_private.mail_service(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a mawatheeq_private.mail_accounts%rowtype; r jsonb;
begin
 case p_action
 when 'whoami' then
  actor:=mawatheeq_private.authorize(p_token);
  return jsonb_build_object('id',actor);
 when 'pending_seen' then
  actor:=mawatheeq_private.authorize(p_token);
  select * into a from mawatheeq_private.mail_accounts where id=(p_data->>'accountId')::uuid;
  perform mawatheeq_private.require_access(a.id is not null and 'inbox'=any(mawatheeq_private.mail_rights(actor,a.id)));
  return jsonb_build_object('validity',a.inbox_validity,'items',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'uid',x.uid,'seen',x.seen_sync=1)),'[]') from (
   select id,uid,seen_sync from mawatheeq_private.mail_messages where account_id=a.id and a.mark_seen and folder='inbox' and uid is not null and seen_sync in (-1,1) order by uid limit 500) x));
 when 'seen_done' then
  actor:=mawatheeq_private.authorize(p_token);
  select * into a from mawatheeq_private.mail_accounts where id=(p_data->>'accountId')::uuid;
  perform mawatheeq_private.require_access(a.id is not null and 'inbox'=any(mawatheeq_private.mail_rights(actor,a.id)));
  update mawatheeq_private.mail_messages set seen_sync=case seen_sync when 1 then 2 when -1 then 0 else seen_sync end
   where account_id=a.id and id in (select (y#>>'{}')::uuid from jsonb_array_elements(coalesce(p_data->'ids','[]')) y);
  return jsonb_build_object('ok',true);
 else
  r:=mawatheeq_private.mail_service_core(p_token,p_action,p_data);
  -- The core checked who may save this mailbox; the switch rides along with the rest of its settings.
  if p_action='save_account' and (p_data->'account') ? 'markSeen' then
   update mawatheeq_private.mail_accounts set mark_seen=coalesce((p_data->'account'->>'markSeen')::boolean,true) where id=(r->>'id')::uuid
    returning * into a;
   r:=mawatheeq_private.mail_account_json(a,mawatheeq_private.authorize(p_token),true);
  end if;
  return r;
 end case;
end $$;
revoke all on function mawatheeq_private.mail_service(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.mail_service(text,text,jsonb) to service_role;

-- Row security on every private table: nothing outside the app's own functions can read a row even if a grant slipped in.
do $$ declare t record; begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='mawatheeq_private' and c.relkind='r' and not c.relrowsecurity loop
  execute format('alter table mawatheeq_private.%I enable row level security',t.relname);
 end loop;
end $$;

notify pgrst,'reload schema';
commit;
