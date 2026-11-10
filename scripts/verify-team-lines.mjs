// «الهيكل الوظيفي»: who reports to whom. A lead reads the daily reports of everyone under him, down the line, and his
// own; the head above him reads him and his team; nobody reads anyone above or beside him; loops are refused; only the
// owner or an admin with the staff power changes the lines. Synthetic accounts only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects to anon,authenticated;
`);
for (const file of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql')).sort()) await db.exec(fs.readFileSync('supabase/migrations/' + file,'utf8'));
await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values('owner',extensions.crypt($1,extensions.gen_salt('bf',4)),false)",['Synthetic-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,'owner' from mawatheeq_private.accounts;set role anon");
const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
const office=(token,action,data={})=>rpc('mawatheeq_office_request',[token,action,JSON.stringify(data)]);
const daily=(token,action,data={})=>rpc('mawatheeq_daily_request',[token,action,JSON.stringify(data)]);
const login=(username,password='Synthetic-password-123')=>rpc('mawatheeq_local_login',[username,password]);
const denied=fn=>assert.rejects(fn,e=>e.code==='42501');
const owner=await login('owner');
async function member(username,extra={}){
 await db.exec('reset role');
 const m=(await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values($1,extensions.crypt('Synthetic-password-123',extensions.gen_salt('bf',4)),false) returning id",[username])).rows[0];
 await db.query("insert into public.mawatheeq_members(user_id,role) values($1,'editor')",[m.id]);await db.exec('set role anon');
 await office(owner.token,'set_member_access',{id:m.id,revision:0,permissions:{sections:['daily'],caseScope:'selected',caseIds:[],canEdit:true,canExport:false,...extra}});
 const s=await login(username);return {id:m.id,token:s.token,name:username};
}
const head=await member('head_ui'),lead=await member('lead_ui'),a=await member('lawyer_a'),b=await member('lawyer_b'),other=await member('lawyer_other');
const day='2026-11-10';
for(const p of [head,lead,a,b,other])await daily(p.token,'save',{date:day,revision:0,submit:true,payload:{hearings:[],tasks:[],admin:[{text:'عمل '+p.name,result:''}],external:[],other:[],pending:[],notes:''}});
const set=(token,userId,managerId)=>daily(token,'set_manager',{userId,managerId});
await set(owner.token,lead.id,head.id);await set(owner.token,a.id,lead.id);await set(owner.token,b.id,lead.id);
const seen=async p=>{const l=await daily(p.token,'list',{from:day,to:day});return {reports:l.reports.map(r=>r.username).sort(),expected:l.expected.map(r=>r.username).sort()}};
const names=(...ps)=>ps.map(p=>p.name).sort();

await denied(()=>daily(a.token,'list',{from:day,to:day}));
assert.deepEqual(await seen(lead),{reports:names(lead,a,b),expected:names(lead,a,b)},'A lead reads his team and himself');
assert.deepEqual(await seen(head),{reports:names(head,lead,a,b),expected:names(head,lead,a,b)},'The head reads the lead and the lead\'s team');
const all=await seen(owner);assert.ok(names(head,lead,a,b,other).every(n=>all.reports.includes(n)),'The owner reads everyone');
assert.ok(!(await seen(lead)).reports.includes('lawyer_other')&&!(await seen(lead)).reports.includes('head_ui'),'Nobody above or beside');

const t=await daily(lead.token,'team');assert.equal(t.leads,true);assert.equal(t.canManage,false);assert.deepEqual([...t.below].sort(),[a.id,b.id].sort());assert.deepEqual(t.lines,[],'A lead is not given the whole chart');
const ta=await daily(a.token,'team');assert.equal(ta.leads,false);assert.deepEqual(ta.below,[]);
assert.equal((await daily(owner.token,'team')).lines.length,3);

await assert.rejects(()=>set(owner.token,head.id,a.id),/لا يتبع أحد من هو تحته/,'No loops');
await assert.rejects(()=>set(owner.token,lead.id,lead.id),/لا يتبع أحد من هو تحته/);
await denied(()=>set(lead.token,other.id,lead.id));
await denied(()=>set(a.token,a.id,null));
// An admin with the staff power arranges the chart too.
const admin=await member('admin_ui',{adminPowers:['staff']});
await set(admin.token,b.id,null);
assert.deepEqual((await seen(lead)).reports,names(lead,a),'Taken off the team, no longer read');
await set(admin.token,other.id,a.id);
assert.deepEqual((await seen(head)).reports,names(head,lead,a,other),'Every level down the line');
assert.equal((await daily(a.token,'team')).leads,true,'Whoever has someone under him leads');
await db.exec('reset role');const ownerId=(await db.query("select user_id from public.mawatheeq_members where role='owner'")).rows[0].user_id;await db.exec('set role anon');
await assert.rejects(()=>set(admin.token,ownerId,head.id),/المالك/);
console.log('Passed team lines: leads read their team down the line and themselves, the head reads the leads and their teams, nobody reads above or beside, no loops, only the owner or a staff admin changes the lines.');
