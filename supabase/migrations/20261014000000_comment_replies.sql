begin;
-- Discussion replies, references and display names (14 October 2026).
-- • A comment can answer another comment on the same case or task, building a nested thread. The author of the
--   answered comment is notified like a mention when they are active and can still see the record.
-- • Comments can cite cases (by office code «#» or automatic number «!»), clients and tasks, as chat messages do.
--   References are checked against the writer's access when saved and against each reader's access when shown.
-- • Authors and mentioned staff carry their display name as well as their username.
alter table mawatheeq_private.comments add column parent_id bigint references mawatheeq_private.comments(id),
 add column refs jsonb not null default '[]' check (jsonb_typeof(refs)='array' and jsonb_array_length(refs)<=20);
create index comments_parent_idx on mawatheeq_private.comments(parent_id) where parent_id is not null;

create or replace function mawatheeq_private.comment_json(c mawatheeq_private.comments) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'targetType',c.target_type,'targetId',c.target_id,'parentId',c.parent_id,
  'body',case when c.deleted_at is null then c.body else '' end,'deleted',c.deleted_at is not null,
  'authorId',c.author_id,'author',(select username from mawatheeq_private.accounts where id=c.author_id),
  'authorName',(select coalesce(nullif(display_name,''),username) from mawatheeq_private.accounts where id=c.author_id),
  'mentions',case when c.deleted_at is null then (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'username',a.username,'name',coalesce(nullif(a.display_name,''),a.username)) order by a.username),'[]')
    from mawatheeq_private.accounts a where a.id=any(c.mentions)) else '[]'::jsonb end,
  'createdAt',c.created_at);
$$;

-- A comment as one reader sees it: its references, each marked whether this reader may open it.
create function mawatheeq_private.comment_for(p_user uuid,p_comment jsonb) returns jsonb
language sql stable set search_path='' as $$
 select p_comment||jsonb_build_object('refs',coalesce((select jsonb_agg(r||jsonb_build_object('ok',mawatheeq_private.chat_ref_ok(p_user,r)))
  from mawatheeq_private.comments c,jsonb_array_elements(c.refs) r where c.id=(p_comment->>'id')::bigint and c.deleted_at is null),'[]'));
$$;

alter function mawatheeq_private.comment_request(text,text,jsonb) rename to comment_request_replies;
create function mawatheeq_private.comment_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; v_parent mawatheeq_private.comments%rowtype; result jsonb; v_row mawatheeq_private.comments%rowtype; v_refs jsonb;
begin
 if p_action='mentionable' then
  result:=mawatheeq_private.comment_request_replies(p_token,p_action,p_data);
  return coalesce((select jsonb_agg(x||jsonb_build_object('name',coalesce(nullif(a.display_name,''),a.username)) order by n)
   from jsonb_array_elements(result) with ordinality t(x,n) left join mawatheeq_private.accounts a on a.id=(x->>'id')::uuid),'[]');
 end if;
 if p_action in ('list','delete','mentions') then
  result:=mawatheeq_private.comment_request_replies(p_token,p_action,p_data); actor:=mawatheeq_private.authorize(p_token);
  if p_action='list' then return coalesce((select jsonb_agg(mawatheeq_private.comment_for(actor,x) order by n) from jsonb_array_elements(result) with ordinality t(x,n)),'[]'); end if;
  if p_action='delete' then return mawatheeq_private.comment_for(actor,result); end if;
  return result||jsonb_build_object('items',coalesce((select jsonb_agg(mawatheeq_private.comment_for(actor,x) order by n) from jsonb_array_elements(result->'items') with ordinality t(x,n)),'[]'));
 end if;
 if p_action<>'post' then return mawatheeq_private.comment_request_replies(p_token,p_action,p_data); end if;
 actor:=mawatheeq_private.authorize(p_token);
 if coalesce(p_data->>'parentId','')<>'' then
  if (p_data->>'parentId')!~'^[0-9]{1,18}$' then raise exception 'التعليق المردود عليه غير صالح.'; end if;
  select * into v_parent from mawatheeq_private.comments where id=(p_data->>'parentId')::bigint;
  if v_parent.id is null or v_parent.target_type is distinct from p_data->>'targetType' or v_parent.target_id is distinct from p_data->>'targetId' then
   raise exception 'التعليق المردود عليه غير موجود في هذا السجل.'; end if;
  if v_parent.deleted_at is not null then raise exception 'لا يمكن الرد على تعليق محذوف.'; end if;
  -- The answered author hears about the reply, as a mention, when they are active and can still see the record.
  if v_parent.author_id<>actor and exists(select 1 from mawatheeq_private.accounts a where a.id=v_parent.author_id and a.enabled)
    and mawatheeq_private.can_see_comment_target(v_parent.author_id,v_parent.target_type,v_parent.target_id)
    and not coalesce(p_data->'mentions','[]') @> to_jsonb(array[v_parent.author_id::text])
    and jsonb_array_length(coalesce(p_data->'mentions','[]'))<20 then
   p_data:=jsonb_set(p_data,'{mentions}',coalesce(p_data->'mentions','[]')||to_jsonb(v_parent.author_id::text));
  end if;
 end if;
 -- Only references the writer may open are kept (cases, clients and tasks; people are mentions).
 select coalesce(jsonb_agg(jsonb_build_object('type',r->>'type','id',r->>'id','label',left(coalesce(r->>'label',''),200))),'[]') into v_refs
  from (select r from jsonb_array_elements(case when jsonb_typeof(p_data->'refs')='array' then p_data->'refs' else '[]'::jsonb end) r limit 20) t
  where r->>'type' in ('case','client','work') and length(coalesce(r->>'id',''))between 1 and 100 and mawatheeq_private.chat_ref_ok(actor,r);
 result:=mawatheeq_private.comment_request_replies(p_token,p_action,p_data);
 update mawatheeq_private.comments set parent_id=v_parent.id,refs=v_refs where id=(result->>'id')::bigint returning * into v_row;
 return mawatheeq_private.comment_for(actor,mawatheeq_private.comment_json(v_row));
end $$;
revoke all on function mawatheeq_private.comment_request(text,text,jsonb),mawatheeq_private.comment_request_replies(text,text,jsonb),mawatheeq_private.comment_for(uuid,jsonb) from public,anon,authenticated;
grant execute on function mawatheeq_private.comment_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
