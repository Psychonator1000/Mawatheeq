begin;
-- Additive staff discussion on cases and tasks. Existing records, grants and sessions stay untouched.
create table mawatheeq_private.comments (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('case','work')),
  target_id text not null check (length(target_id) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 4000),
  mentions uuid[] not null default '{}' check (cardinality(mentions) <= 20),
  author_id uuid not null references mawatheeq_private.accounts(id),
  created_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  deleted_by uuid references mawatheeq_private.accounts(id)
);
create index comments_target_idx on mawatheeq_private.comments(target_type,target_id,id);
create index comments_mentions_idx on mawatheeq_private.comments using gin(mentions);
create table mawatheeq_private.mention_reads (
  user_id uuid primary key references mawatheeq_private.accounts(id),
  last_read_id bigint not null default 0,
  updated_at timestamptz not null default clock_timestamp()
);
alter table mawatheeq_private.comments enable row level security;
alter table mawatheeq_private.mention_reads enable row level security;
revoke all on mawatheeq_private.comments,mawatheeq_private.mention_reads from public,anon,authenticated;

-- A comment is visible exactly when its case or task is visible to the user.
create function mawatheeq_private.can_see_comment_target(p_user uuid,p_type text,p_id text) returns boolean
language sql stable set search_path='' as $$
 select coalesce(case p_type
  when 'case' then exists(select 1 from public.mawatheeq_cases where id=p_id) and mawatheeq_private.can_case(p_user,p_id)
  when 'work' then exists(select 1 from mawatheeq_private.work_items w where w.id::text=p_id and (mawatheeq_private.can_work_payload(p_user,w.payload)
    or (mawatheeq_private.can_access_work(p_user) and coalesce(w.payload->>'caseId','')='' and w.created_by=p_user)))
  else false end,false);
$$;

create function mawatheeq_private.comment_json(c mawatheeq_private.comments) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'targetType',c.target_type,'targetId',c.target_id,
  'body',case when c.deleted_at is null then c.body else '' end,'deleted',c.deleted_at is not null,
  'authorId',c.author_id,'author',(select username from mawatheeq_private.accounts where id=c.author_id),
  'mentions',case when c.deleted_at is null then (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'username',a.username) order by a.username),'[]')
    from mawatheeq_private.accounts a where a.id=any(c.mentions)) else '[]'::jsonb end,
  'createdAt',c.created_at);
$$;

create function mawatheeq_private.comment_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; owner boolean; result jsonb; v_type text; v_id text; v_body text; v_mentions uuid[]; v_offset integer; v_row mawatheeq_private.comments%rowtype; last_id bigint;
begin
 actor:=mawatheeq_private.authorize(p_token); owner:=mawatheeq_private.is_owner();
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>20000 then raise exception 'الطلب غير صالح أو كبير جداً.'; end if;
 v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),1000000));
 if p_action in ('list','post','mentionable') then
  v_type:=p_data->>'targetType'; v_id:=p_data->>'targetId';
  perform mawatheeq_private.require_access(mawatheeq_private.can_see_comment_target(actor,v_type,v_id));
 end if;
 case p_action
 when 'list' then
  select coalesce(jsonb_agg(mawatheeq_private.comment_json(t) order by t.id),'[]') into result
   from (select * from mawatheeq_private.comments where target_type=v_type and target_id=v_id order by id limit 200 offset v_offset) t;
  return result;
 when 'mentionable' then
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'username',a.username) order by a.username),'[]') into result
   from mawatheeq_private.accounts a where a.enabled and a.id<>actor and mawatheeq_private.can_see_comment_target(a.id,v_type,v_id);
  return result;
 when 'post' then
  perform mawatheeq_private.require_access((mawatheeq_private.access_for(actor)->>'canEdit')::boolean);
  v_body:=btrim(coalesce(p_data->>'body',''));
  if length(v_body) not between 1 and 4000 then raise exception 'اكتب تعليقاً لا يتجاوز 4000 حرف.'; end if;
  if jsonb_typeof(coalesce(p_data->'mentions','[]'))<>'array' or jsonb_array_length(coalesce(p_data->'mentions','[]'))>20 then raise exception 'الإشارات غير صالحة.'; end if;
  select coalesce(array_agg(distinct (m#>>'{}')::uuid),'{}') into v_mentions from jsonb_array_elements(coalesce(p_data->'mentions','[]')) m;
  if exists(select 1 from unnest(v_mentions) m where m=actor or not exists(select 1 from mawatheeq_private.accounts a where a.id=m and a.enabled)
    or not mawatheeq_private.can_see_comment_target(m,v_type,v_id)) then
   raise exception 'يمكن الإشارة فقط إلى موظف فعال يملك صلاحية هذا السجل.' using errcode='42501';
  end if;
  insert into mawatheeq_private.comments(target_type,target_id,body,mentions,author_id) values(v_type,v_id,v_body,v_mentions,actor) returning * into v_row;
  return mawatheeq_private.comment_json(v_row);
 when 'delete' then
  select * into v_row from mawatheeq_private.comments where id=(p_data->>'id')::bigint for update;
  if v_row.id is null then raise exception 'التعليق غير موجود.'; end if;
  perform mawatheeq_private.require_access(mawatheeq_private.can_see_comment_target(actor,v_row.target_type,v_row.target_id) and (v_row.author_id=actor or owner));
  if v_row.deleted_at is null then
   update mawatheeq_private.comments set deleted_at=clock_timestamp(),deleted_by=actor where id=v_row.id returning * into v_row;
  end if;
  return mawatheeq_private.comment_json(v_row);
 when 'mentions' then
  select coalesce(jsonb_agg(mawatheeq_private.comment_json(t) order by t.id desc),'[]') into result from
   (select * from mawatheeq_private.comments c where actor=any(c.mentions) and c.deleted_at is null and c.author_id<>actor
     and mawatheeq_private.can_see_comment_target(actor,c.target_type,c.target_id) order by c.id desc limit 50) t;
  return jsonb_build_object('items',result,'lastRead',coalesce((select last_read_id from mawatheeq_private.mention_reads where user_id=actor),0));
 when 'mark_mentions_read' then
  last_id:=least(greatest(coalesce((p_data->>'lastId')::bigint,0),0),coalesce((select max(id) from mawatheeq_private.comments),0));
  insert into mawatheeq_private.mention_reads(user_id,last_read_id) values(actor,last_id)
   on conflict(user_id) do update set last_read_id=greatest(mawatheeq_private.mention_reads.last_read_id,excluded.last_read_id),updated_at=clock_timestamp()
   returning jsonb_build_object('lastRead',last_read_id) into result;
  return result;
 else raise exception 'العملية المطلوبة غير متاحة.';
 end case;
end $$;

create function public.mawatheeq_comment_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mawatheeq_private.comment_request(p_token,p_action,p_data); $$;
revoke all on all functions in schema mawatheeq_private from public,anon,authenticated;
revoke all on function public.mawatheeq_department_request(text,text,jsonb),public.mawatheeq_comment_request(text,text,jsonb) from public;
grant execute on function mawatheeq_private.local_login(text,text),mawatheeq_private.local_request(text,text,jsonb),mawatheeq_private.client_request(text,text,jsonb),mawatheeq_private.office_request(text,text,jsonb),mawatheeq_private.department_request(text,text,jsonb),mawatheeq_private.comment_request(text,text,jsonb),public.mawatheeq_department_request(text,text,jsonb),public.mawatheeq_comment_request(text,text,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
