begin;
-- Private discussion comments (14 October 2026). A comment that mentions colleagues can be shown to everyone who can
-- see the record (as before), or only to its author, the colleagues it mentions and the office owner. A reply to a
-- private comment stays private, and everyone already in that private exchange is included and notified.
alter table mawatheeq_private.comments add column private boolean not null default false;

create or replace function mawatheeq_private.comment_json(c mawatheeq_private.comments) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'targetType',c.target_type,'targetId',c.target_id,'parentId',c.parent_id,'private',c.private,
  'body',case when c.deleted_at is null then c.body else '' end,'deleted',c.deleted_at is not null,
  'authorId',c.author_id,'author',(select username from mawatheeq_private.accounts where id=c.author_id),
  'authorName',(select coalesce(nullif(display_name,''),username) from mawatheeq_private.accounts where id=c.author_id),
  'mentions',case when c.deleted_at is null then (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'username',a.username,'name',coalesce(nullif(a.display_name,''),a.username)) order by a.username),'[]')
    from mawatheeq_private.accounts a where a.id=any(c.mentions)) else '[]'::jsonb end,
  'createdAt',c.created_at);
$$;

-- Who may read a comment: everyone who can see the record, or for a private one only its author, the people it
-- mentions and the office owner.
create function mawatheeq_private.comment_readable(p_user uuid,p_owner boolean,p_id bigint) returns boolean
language sql stable set search_path='' as $$
 select coalesce((select not c.private or c.author_id=p_user or p_user=any(c.mentions) or p_owner from mawatheeq_private.comments c where c.id=p_id),false);
$$;

create or replace function mawatheeq_private.comment_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; owner boolean; v_parent mawatheeq_private.comments%rowtype; result jsonb; v_row mawatheeq_private.comments%rowtype; v_refs jsonb; v_private boolean; v_add uuid;
begin
 if p_action='mentionable' then
  result:=mawatheeq_private.comment_request_replies(p_token,p_action,p_data);
  return coalesce((select jsonb_agg(x||jsonb_build_object('name',coalesce(nullif(a.display_name,''),a.username)) order by n)
   from jsonb_array_elements(result) with ordinality t(x,n) left join mawatheeq_private.accounts a on a.id=(x->>'id')::uuid),'[]');
 end if;
 if p_action in ('list','delete','mentions') then
  result:=mawatheeq_private.comment_request_replies(p_token,p_action,p_data); actor:=mawatheeq_private.authorize(p_token); owner:=mawatheeq_private.is_owner();
  if p_action='list' then return coalesce((select jsonb_agg(mawatheeq_private.comment_for(actor,x) order by n) from jsonb_array_elements(result) with ordinality t(x,n)
   where mawatheeq_private.comment_readable(actor,owner,(x->>'id')::bigint)),'[]'); end if;
  if p_action='delete' then return mawatheeq_private.comment_for(actor,result); end if;
  return result||jsonb_build_object('items',coalesce((select jsonb_agg(mawatheeq_private.comment_for(actor,x) order by n) from jsonb_array_elements(result->'items') with ordinality t(x,n)),'[]'));
 end if;
 if p_action<>'post' then return mawatheeq_private.comment_request_replies(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token); owner:=mawatheeq_private.is_owner();
 v_private:=coalesce((p_data->>'private')::boolean,false);
 if jsonb_typeof(coalesce(p_data->'mentions','[]'))<>'array' then raise exception 'الإشارات غير صالحة.'; end if;
 if coalesce(p_data->>'parentId','')<>'' then
  if (p_data->>'parentId')!~'^[0-9]{1,18}$' then raise exception 'التعليق المردود عليه غير صالح.'; end if;
  select * into v_parent from mawatheeq_private.comments where id=(p_data->>'parentId')::bigint;
  if v_parent.id is null or v_parent.target_type is distinct from p_data->>'targetType' or v_parent.target_id is distinct from p_data->>'targetId'
    or not mawatheeq_private.comment_readable(actor,owner,v_parent.id) then
   raise exception 'التعليق المردود عليه غير موجود في هذا السجل.'; end if;
  if v_parent.deleted_at is not null then raise exception 'لا يمكن الرد على تعليق محذوف.'; end if;
  -- A reply to a private comment stays private and includes everyone already in that exchange.
  if v_parent.private then v_private:=true; end if;
  for v_add in select x from unnest(array[v_parent.author_id]||case when v_parent.private then v_parent.mentions else '{}'::uuid[] end) x loop
   -- The answered author (and, in a private exchange, its other members) hear about the reply, as a mention,
   -- when they are active and can still see the record.
   if v_add<>actor and exists(select 1 from mawatheeq_private.accounts a where a.id=v_add and a.enabled)
     and mawatheeq_private.can_see_comment_target(v_add,v_parent.target_type,v_parent.target_id)
     and not coalesce(p_data->'mentions','[]') @> to_jsonb(array[v_add::text])
     and jsonb_array_length(coalesce(p_data->'mentions','[]'))<20 then
    p_data:=jsonb_set(p_data,'{mentions}',coalesce(p_data->'mentions','[]')||to_jsonb(v_add::text));
   end if;
  end loop;
 end if;
 if v_private and jsonb_array_length(coalesce(p_data->'mentions','[]'))=0 then
  raise exception 'التعليق الخاص يحتاج إلى الإشارة إلى زميل واحد على الأقل بـ @.'; end if;
 -- Only references the writer may open are kept (cases, clients and tasks; people are mentions).
 select coalesce(jsonb_agg(jsonb_build_object('type',r->>'type','id',r->>'id','label',left(coalesce(r->>'label',''),200))),'[]') into v_refs
  from (select r from jsonb_array_elements(case when jsonb_typeof(p_data->'refs')='array' then p_data->'refs' else '[]'::jsonb end) r limit 20) t
  where r->>'type' in ('case','client','work') and length(coalesce(r->>'id',''))between 1 and 100 and mawatheeq_private.chat_ref_ok(actor,r);
 result:=mawatheeq_private.comment_request_replies(p_token,p_action,p_data);
 update mawatheeq_private.comments set parent_id=v_parent.id,refs=v_refs,private=v_private where id=(result->>'id')::bigint returning * into v_row;
 return mawatheeq_private.comment_for(actor,mawatheeq_private.comment_json(v_row));
end $$;
revoke all on function mawatheeq_private.comment_request(text,text,jsonb),mawatheeq_private.comment_readable(uuid,boolean,bigint) from public,anon,authenticated;
grant execute on function mawatheeq_private.comment_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
