begin;
-- The office code is fixed (15 November 2026). A new case takes the next number in the office's sequence; once saved,
-- its code changes only by an admin (the owner, or an account with the settings or backup power), the same accounts
-- that see the code's edit button. Anyone else saving the case keeps the stored code, whatever the request carries.
-- Safe to run again.
do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mawatheeq_private' and p.proname='local_request_codes') then
  alter function mawatheeq_private.local_request(text,text,jsonb) rename to local_request_codes;
 end if;
end $$;

create or replace function mawatheeq_private.local_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; a jsonb; stored text; wanted text; admin boolean;
begin
 if p_action<>'save_case' or jsonb_typeof(p_data->'case') is distinct from 'object' then return mawatheeq_private.local_request_codes(p_token,p_action,p_data); end if;
 select c.payload->>'code' into stored from public.mawatheeq_cases c where c.id=p_data->'case'->>'id';
 wanted:=p_data->'case'->>'code';
 if not found or coalesce(stored,'')='' or coalesce(wanted,'')=coalesce(stored,'') then return mawatheeq_private.local_request_codes(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 a:=mawatheeq_private.access_for(actor);
 admin:=exists(select 1 from public.mawatheeq_members m where m.user_id=actor and m.role='owner')
  or coalesce(a->'adminPowers','[]'::jsonb) ?| array['settings','backup'];
 if not admin then raise exception 'كود المكتب ثابت، ولا يغيّره إلا المسؤول.' using errcode='42501'; end if;
 return mawatheeq_private.local_request_codes(p_token,p_action,p_data);
end $$;
revoke all on function mawatheeq_private.local_request(text,text,jsonb),mawatheeq_private.local_request_codes(text,text,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.local_request(text,text,jsonb) to anon,authenticated,service_role;
commit;
