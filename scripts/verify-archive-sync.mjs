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
await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values('admin',extensions.crypt($1,extensions.gen_salt('bf',4)),false)",['Fixture-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,'owner' from mawatheeq_private.accounts;set role anon");
const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
const local=(token,action,data={})=>rpc('mawatheeq_local_request',[token,action,JSON.stringify(data)]);
const login=(username,password='Fixture-password-123')=>rpc('mawatheeq_local_login',[username,password]);
// The archive follows the cases: one paper file per case code (insurance «ARC-T»), created and kept in step automatically.
const admin=await login('admin');
const dept=(action,data={})=>rpc('mawatheeq_department_request',[admin.token,action,JSON.stringify({workspace:'archive',...data})]);
await db.exec('reset role');
const files=async()=>(await db.query("select case_id, payload->>'number' num, payload->>'title' title, payload->>'locationId' loc from mawatheeq_private.department_records where workspace='archive' and kind='file' order by 2")).rows;
await db.exec('set role anon');
const base={client:'Base Client',clientGroup:'Base Client',opponent:'Opponent One',type:'حكم أول درجة',outcome:'لصالحنا',date:'2026-01-01',procedures:[]};
await local(admin.token,'save_case',{case:{...base,id:'arc-a',code:'12',autoNumber:'100000001',revision:0}});
await local(admin.token,'save_case',{case:{...base,id:'arc-ins',code:'12',autoNumber:'100000002',insurance:true,client:'Insurer',clientGroup:'Insurer',revision:0}});
await local(admin.token,'save_case',{case:{...base,id:'arc-a-appeal',code:'12',autoNumber:'100000003',revision:0}});
await local(admin.token,'save_case',{case:{...base,id:'arc-nocode',code:'',autoNumber:'100000004',revision:0}});
await db.exec('reset role');let f=await files();await db.exec('set role anon');
assert.deepEqual(f.map(x=>x.num),['ARC-12','ARC-T12'],'One file per code; the insurance case has its own; a case without a code has none; another court level shares its file');
assert.equal(f.find(x=>x.num==='ARC-12').title,'Base Client ضد Opponent One');
// A changed code or opponent moves the file with it; its own details stay.
await db.exec('reset role');await db.query("update mawatheeq_private.department_records set payload=payload||'{\"locationId\":\"loc-1\"}' where payload->>'number'='ARC-12'");await db.exec('set role anon');
let cur=await local(admin.token,'case_full',{id:'arc-a'});
await local(admin.token,'save_case',{case:{...cur.payload,code:'13',opponent:'Opponent Two',revision:cur.revision}});
await db.exec('reset role');f=await files();await db.exec('set role anon');
const moved=f.find(x=>x.case_id==='arc-a');
assert.equal(moved.num,'ARC-13','The number follows the code');assert.equal(moved.title,'Base Client ضد Opponent Two','The title follows the parties');assert.equal(moved.loc,'loc-1','Its place is kept');
// The other court level still carrying code 12 gets its own file again when it is saved.
cur=await local(admin.token,'case_full',{id:'arc-a-appeal'});await local(admin.token,'save_case',{case:{...cur.payload,revision:cur.revision}});
await db.exec('reset role');f=await files();await db.exec('set role anon');
assert.deepEqual(f.map(x=>x.num),['ARC-12','ARC-13','ARC-T12']);
void dept;
console.log('Passed archive sync: one file per case code (insurance ARC-T), created with the case, number and title following it, place and details kept.');
await db.close();
