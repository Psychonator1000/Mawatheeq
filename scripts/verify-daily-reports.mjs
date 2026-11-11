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
const denied=fn=>assert.rejects(fn,e=>e.code==='42501');
const owner=await login('owner');
let visible=await local(owner.token,'save_case',{case:{id:'workspace-visible',code:'WS-1',autoNumber:'1001',client:'Synthetic Client',clientGroup:'Synthetic Client',opponent:'Synthetic Opponent',date:'2026-10-01',procedures:[],revision:0}});
await local(owner.token,'save_case',{case:{...visible,id:'workspace-hidden',code:'WS-2',opponent:'Hidden Opponent',revision:0}});
const grants=sections=>({sections,caseScope:'selected',caseIds:[visible.id],canEdit:true,canExport:true});
// Synthetic account provisioning avoids repeatedly benchmarking bcrypt in WASM.
// Production account creation/defaults/rotation are covered by test:permissions/local-auth.
async function member(username,permissions){
 await db.exec('reset role');
 const m=(await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values($1,extensions.crypt('Synthetic-password-123',extensions.gen_salt('bf',4)),false) returning id",[username])).rows[0];
 await db.query("insert into public.mawatheeq_members(user_id,role) values($1,'editor')",[m.id]);await db.exec('set role anon');
 await office(owner.token,'set_member_access',{id:m.id,revision:0,permissions});return {...await login(username),member:m};
}

const daily=(token,action,data={})=>rpc('mawatheeq_daily_request',[token,action,JSON.stringify(data)]);
// A lawyer who holds only «التقرير اليومي»: no case at all, only their own report.
const reporter=await member('daily_only',{...grants(['daily']),caseIds:[]});
const lawyer=await member('daily_lawyer',grants(['cases','work','daily']));
const outsider=await member('no_daily',grants(['cases','work']));
const reviewer=await member('daily_reviewer',{...grants(['work']),adminPowers:['reviews']});
assert.deepEqual((await local(reporter.token,'access')).sections,['daily'],'The section is kept when permissions are saved');
await denied(()=>local(reporter.token,'cases_page'));
await denied(()=>local(reporter.token,'case_full',{id:visible.id}));
// Hearings can only be assigned to staff who may see the case, so a report-only account starts with an empty list.
const today=(await db.query("select ((now() at time zone 'Asia/Kuwait')::date)::text d")).rows[0].d;
let mine=await daily(reporter.token,'mine');
assert.equal(mine.report,null);assert.deepEqual(mine.hearings,[]);
const payload={hearings:[{caseNumber:'2026/1',court:'Synthetic court',decision:'تأجيل للإعلان',next:'2026-12-01'}],admin:[],external:[],other:'',pending:'',notes:''};
let saved=await daily(reporter.token,'save',{date:today,payload,revision:0});
assert.equal(saved.revision,1);assert.equal(saved.submittedAt,null);assert.equal(saved.payload.hearings[0].decision,'تأجيل للإعلان');
await assert.rejects(()=>daily(reporter.token,'save',{date:today,payload,revision:0}),e=>e.code==='40001','A stale copy is refused');
saved=await daily(reporter.token,'save',{date:today,payload:{...payload,notes:'ملاحظة'},revision:1,submit:true});
assert.equal(saved.revision,2);assert.ok(saved.submittedAt,'Submitting stamps the time');
await assert.rejects(()=>daily(reporter.token,'save',{date:'2999-01-01',payload,revision:0}),/لم يأتِ/);
// The lawyer sees their own case details on an assigned hearing.
await office(owner.token,'save_work',{item:{id:'53000000-0000-4000-8000-000000000002',caseId:visible.id,title:'Lawyer hearing',kind:'hearing',dueDate:today,dueTime:'10:00',assigneeId:lawyer.user.id,priority:'normal',status:'open',notes:'',location:'',completionNote:'',revision:0}});
assert.equal((await daily(lawyer.token,'mine')).hearings[0].code,'WS-1');
await daily(lawyer.token,'save',{date:today,payload,revision:0});
// Reports are each person's own; reading everyone's needs the owner or the staff/reviews power.
await denied(()=>daily(outsider.token,'mine'));
await denied(()=>daily(reporter.token,'list',{from:today}));
await denied(()=>daily(lawyer.token,'list',{from:today}));
for(const who of [owner,reviewer]){
 const all=await daily(who.token,'list',{from:today,to:today});
 assert.equal(all.reports.length,2);assert.deepEqual(all.expected.map(x=>x.username).sort(),['daily_lawyer','daily_only']);
 assert.equal(all.reports.find(r=>r.username==='daily_only').payload.notes,'ملاحظة');
}
assert.equal((await daily(reporter.token,'mine')).report.revision,2,'Each person reads back only their own report');
await assert.rejects(()=>daily(owner.token,'list',{from:'2026-01-01',to:'2026-12-31'}),/شهرين/);
console.log('Passed daily reports: a report-only account sees no case, a lawyer starts from the hearings assigned to them, each saves and submits its own report (stale copies refused, no future days); the owner and reviewers read everyone\'s reports and who is expected to report.');
