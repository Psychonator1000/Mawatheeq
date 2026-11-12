-- The full copy of the office's data is the owner's alone (owner, 12 November 2026: «limit to my account»): the pages a
-- backup reads (office «export_page», collections «backup_page») are refused to any other account, whatever admin
-- powers it holds, and to the owner's switched-into staff sessions.
do $$
declare d text;
begin
 d:=pg_get_functiondef('mawatheeq_private.set_power(text,text,text)'::regprocedure);
 if position('perform set_config(''mawatheeq.power''' in d)=0 then raise exception 'set_power is not as expected'; end if;
 d:=replace(d,'perform set_config(''mawatheeq.power''',
  'if (p_fn=''office'' and p_action=''export_page'') or (p_fn=''department'' and p_action=''backup_page'') then
   if not exists(select 1 from public.mawatheeq_members m join mawatheeq_private.sessions s on s.user_id=m.user_id
     where s.token_hash=extensions.digest(coalesce(p_token,''''),''sha256'') and s.impersonated_by is null and m.role=''owner'') then
    raise exception ''النسخة الكاملة للبيانات متاحة لحساب مالك التطبيق فقط.'' using errcode=''42501''; end if;
  end if;
 perform set_config(''mawatheeq.power''');
 execute d;
end $$;
