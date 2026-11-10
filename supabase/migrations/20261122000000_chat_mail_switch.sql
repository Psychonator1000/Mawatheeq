begin;
-- «البريد» and «المحادثات» can be switched off per account (November 2026). The permission editor saves them in the
-- account's view map as «ws:mail» and «ws:chat» set to «hide»; this makes the server refuse them too, not only hide
-- their icons: mail opens nothing for such an account (mail_can_open, which every mail action and the mail function
-- go through) and every chat action is refused. The owner has no view map and keeps both. Safe to run again.
create or replace function mawatheeq_private.view_hidden(p_user uuid,k text) returns boolean
language sql stable set search_path='' as $$ select coalesce(mawatheeq_private.access_for(p_user)->'view'->>k='hide',false); $$;
revoke all on function mawatheeq_private.view_hidden(uuid,text) from public,anon,authenticated;
do $$
declare f text;
begin
 f:=pg_get_functiondef('mawatheeq_private.mail_can_open(uuid,text)'::regprocedure);
 if strpos(f,'ws:mail')=0 then
  if strpos(f,'select case when p_ws=''legal''')=0 then raise exception 'mail_can_open not as expected'; end if;
  execute replace(f,'select case when p_ws=''legal''','select not mawatheeq_private.view_hidden(p_user,''ws:mail'') and case when p_ws=''legal''');
 end if;
 f:=pg_get_functiondef('mawatheeq_private.chat_request(text,text,jsonb)'::regprocedure);
 if strpos(f,'ws:chat')=0 then
  if f !~ '\mbegin\M' then raise exception 'chat_request not as expected'; end if;
  execute regexp_replace(f,'\mbegin\M','begin
 perform mawatheeq_private.require_access(not mawatheeq_private.view_hidden(mawatheeq_private.authorize(p_token),''ws:chat''));');
 end if;
end $$;
notify pgrst,'reload schema';
commit;
