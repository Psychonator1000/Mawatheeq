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
const local=(token,action,data={})=>rpc('mawatheeq_local_request',[token,action,JSON.stringify(data)]);
const office=(token,action,data={})=>rpc('mawatheeq_office_request',[token,action,JSON.stringify(data)]);
const login=(username,password='Synthetic-password-123')=>rpc('mawatheeq_local_login',[username,password]);
// Fast case reads: each case keeps its light form and normalized lawyer name; the reads return the same as before.
const owner=await login('owner');
const day=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const sit=(i,date)=>({id:'s'+i,kind:'جلسة',date,court:'الكلية',decision:'تأجيل',text:'تأجيل',followup:''});
const base={autoNumber:'',client:'شركة',clientGroup:'شركة',opponent:'خصم',date:'',type:'',outcome:'',ruling:'',appealConfirmation:'',revision:0};
// Six old sittings and one recent: the light form keeps the last three.
const long=await local(owner.token,'save_case',{case:{...base,id:'long',code:'L-1',lawyer:'أحمد علي',procedures:[...[400,390,380,370,360,350].map((n,i)=>sit(i,day(-n))),sit(9,day(-10))]}});
await local(owner.token,'save_case',{case:{...base,id:'short',code:'S-1',lawyer:'سارة',procedures:[sit(1,day(-5))]}});
await db.exec('reset role');
const row=async id=>(await db.query('select light,lawyer_norm,payload,updated_at from public.mawatheeq_cases where id=$1',[id])).rows[0];
let l=await row('long');
assert.equal(l.light.proceduresTrimmed,true,'Old sittings are left out of the light form');
assert.deepEqual(l.light.procedures.map(x=>x.id),['s4','s5','s9'],'The last three sittings are kept');
assert.equal(l.lawyer_norm,'احمد علي','The lawyer name is stored normalized');
assert.deepEqual((await row('short')).light,(await row('short')).payload,'A short case is its own light form');
await db.exec('set role anon');
// The light list returns exactly what trimming on the fly returned.
await db.exec('reset role');
const expected=(await db.query("select id,mawatheeq_private.trim_case(payload) p from public.mawatheeq_cases order by id")).rows;
await db.exec('set role anon');
const page=await local(owner.token,'cases_page',{offset:0,light:true});
assert.deepEqual(page.map(r=>[r.id,r.payload]),expected.map(r=>[r.id,r.p]),'The light list is unchanged');
const full=await local(owner.token,'cases_page',{offset:0});
assert.equal(full.find(r=>r.id==='long').payload.procedures.length,7,'The full list still has every sitting');
// A saved change updates the light form at once.
await local(owner.token,'save_case',{case:{...long,procedures:[...long.procedures,sit(10,day(-1))]}});
const again=await local(owner.token,'cases_page',{offset:0,light:true});
assert.deepEqual(again.find(r=>r.id==='long').payload.procedures.map(x=>x.id),['s5','s9','s10'],'A new sitting appears in the light list');
const changes=await local(owner.token,'cases_changes',{since:new Date(Date.now()-3600e3).toISOString(),light:true});
assert.deepEqual(changes.rows.find(r=>r.id==='long').payload.procedures.map(x=>x.id),['s5','s9','s10'],'Changes come light too');
// A lawyer account sees the cases under its name, spelling variants included, and nothing else.
await db.exec('reset role');
const m=(await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values('lawyer_ahmad',extensions.crypt('Synthetic-password-123',extensions.gen_salt('bf',4)),false) returning id")).rows[0];
await db.query("insert into public.mawatheeq_members(user_id,role) values($1,'editor')",[m.id]);await db.exec('set role anon');
await office(owner.token,'set_member_access',{id:m.id,revision:0,permissions:{sections:['cases'],caseScope:'selected',caseIds:[],lawyerNames:['احمد علي'],canEdit:true,canExport:false}});
const lawyer=await login('lawyer_ahmad');
assert.deepEqual((await local(lawyer.token,'cases_page',{offset:0,light:true})).map(r=>r.id),['long'],'Only the case under the lawyer\'s name');
assert.equal((await local(lawyer.token,'cases_changes',{since:'',light:true})).count,1);
assert.equal((await local(lawyer.token,'case_full',{id:'long'})).payload.procedures.length,8,'The full case opens');
await assert.rejects(()=>local(lawyer.token,'case_full',{id:'short'}),/غير متاحة/,'Another lawyer\'s case stays closed');
// Running the migration again changes nothing: no history entry and no new «changed at».
await db.exec('reset role');
const before=(await db.query('select count(*)::int n from mawatheeq_private.case_changes')).rows[0].n,stamp=(await row('long')).updated_at;
await db.exec(fs.readFileSync('supabase/migrations/20261118000000_fast_case_reads.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261118000100_fast_case_reads_direct.sql','utf8'));
await db.exec("update public.mawatheeq_cases set light=null where id='short'");
await db.exec(fs.readFileSync('supabase/migrations/20261118000000_fast_case_reads.sql','utf8'));
assert.ok((await row('short')).light,'A missing light form is filled');
assert.equal((await db.query('select count(*)::int n from mawatheeq_private.case_changes')).rows[0].n,before+1,'Filling records nothing (the one entry is the manual clear above)');
assert.equal(String((await row('long')).updated_at),String(stamp),'Filling does not mark cases as changed');
console.log('Passed fast case reads: light form and lawyer name stored on save, the same light list and changes, full cases intact, lawyer accounts by name, refilling quietly.');
