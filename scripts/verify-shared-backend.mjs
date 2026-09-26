import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Execute the real migration in PostgreSQL/WASM. Only Supabase's managed
// auth/storage schemas are represented by fixtures; app policies are unchanged.
const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
  $$;
  grant usage on schema auth to anon,authenticated,service_role;
  grant execute on function auth.uid() to anon,authenticated,service_role;
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon,authenticated,service_role;
  grant select,insert,update,delete on storage.objects to anon,authenticated;
`);
await db.exec(fs.readFileSync('supabase/migrations/202609250001_shared_office.sql','utf8'));
const owner='10000000-0000-4000-8000-000000000001';
const editor='10000000-0000-4000-8000-000000000002';
const outsider='10000000-0000-4000-8000-000000000003';
const pending='10000000-0000-4000-8000-000000000004';
await db.query(`insert into auth.users values ($1,'owner@example.invalid',now()),($2,'editor@example.invalid',now()),($3,'outsider@example.invalid',now()),($4,'pending@example.invalid',null)`,[owner,editor,outsider,pending]);
await db.query(`insert into public.mawatheeq_members(user_id,role) values($1,'owner'),($2,'editor')`,[owner,editor]);
async function asUser(id,role='authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
  await db.exec(`set role ${role}`);
}
const call=async(name,args={})=>{
  const keys=Object.keys(args);
  const params=keys.map((key,i)=>`${key} => $${i+1}`).join(',');
  const values=keys.map(key=>typeof args[key]==='object'&&args[key]!==null?JSON.stringify(args[key]):args[key]);
  return (await db.query(`select public.${name}(${params}) as result`,values)).rows[0].result;
};
const count=async(table)=>(await db.query(`select count(*)::int as total from ${table}`)).rows[0].total;
const sample={id:'test-case',code:'TEST-1',autoNumber:'123456789',client:'شركة الاختبار',opponent:'طرف تجريبي',date:'2026-09-25',executionNote:'لم يتم عمل اجراءات التنفيذ',procedures:[],revision:0,archived:false};

assert.equal((await db.query("select count(*)::int as total from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'mawatheeq_%' and p.prosecdef")).rows[0].total,0,'Data API wrappers do not run with elevated privileges');

await asUser(null,'anon');
await assert.rejects(()=>count('public.mawatheeq_cases'),/permission denied/);
await assert.rejects(()=>call('mawatheeq_save_case',{p_case:sample}),/permission denied/);
assert.equal(await count('storage.objects'),0);

await asUser(outsider);
for(const table of ['mawatheeq_cases','mawatheeq_settings','mawatheeq_documents','mawatheeq_members']) assert.equal(await count('public.'+table),0);
await assert.rejects(()=>call('mawatheeq_save_case',{p_case:sample}),/صلاحية/);
await assert.rejects(()=>db.query("insert into public.mawatheeq_members(user_id,role) values($1,'owner')",[outsider]),/permission denied/);

await asUser(owner);
let saved=await call('mawatheeq_save_case',{p_case:sample});
assert.equal(saved.revision,1);
await asUser(editor);
assert.equal(await count('public.mawatheeq_cases'),1);
saved=await call('mawatheeq_save_case',{p_case:{...saved,notes:'updated by second member'}});
assert.equal(saved.revision,2);
await assert.rejects(()=>call('mawatheeq_save_case',{p_case:{...sample,revision:1}}),/مستخدم آخر/);
await assert.rejects(()=>db.query("update public.mawatheeq_cases set revision=99"),/permission denied/);
await assert.rejects(()=>call('mawatheeq_add_member',{p_email:'outsider@example.invalid'}),/مسؤول/);
await assert.rejects(()=>call('mawatheeq_save_case',{p_case:{...saved,autoNumber:'abc'}}),/الرقم الآلي/);
await assert.rejects(()=>call('mawatheeq_save_case',{p_case:{...saved,date:'2026-02-31'}}));
await assert.rejects(()=>call('mawatheeq_save_case',{p_case:{...saved,executionNote:'unknown'}}),/ملاحظات/);
await assert.rejects(()=>call('mawatheeq_save_rules',{p_rules:{first:-1}}),/المدة/);
await call('mawatheeq_save_rules',{p_rules:{first:20,appeal:30,objection:10,execution:25,warning:3}});

assert.deepEqual(await call('mawatheeq_import_cases',{p_cases:[sample,{...sample,client:'شركه الاختبار'}]}),{added:0,skipped:2});
assert.deepEqual(await call('mawatheeq_import_cases',{p_cases:[{...sample,autoNumber:'222'},{...sample,autoNumber:'222'}]}),{added:1,skipped:1});
const before=await count('public.mawatheeq_cases');
await assert.rejects(()=>call('mawatheeq_import_cases',{p_cases:[{...sample,autoNumber:'333'},{...sample,client:''}]}));
assert.equal(await count('public.mawatheeq_cases'),before,'invalid import rolls back the entire batch');

const docId='20000000-0000-4000-8000-000000000001';
const fileKey=`documents/${docId}/fixture.pdf`;
await db.query("insert into storage.objects(bucket_id,name) values('mawatheeq-documents',$1)",[fileKey]);
let doc=await call('mawatheeq_save_document',{p_id:docId,p_payload:{data:{defendant:'اختبار'}},p_filename:'test.pdf',p_file_key:fileKey,p_revision:0});
assert.equal(doc.revision,1);
assert.equal(doc.fileKey,fileKey);
await db.query('delete from storage.objects where name=$1',[fileKey]);
assert.equal(await count('storage.objects'),1,'a referenced PDF cannot be removed');
await asUser(owner);
assert.equal(await count('public.mawatheeq_documents'),1);
assert.equal(await count('storage.objects'),1);
doc=await call('mawatheeq_save_document',{p_id:docId,p_payload:{data:{defendant:'اختبار محدث'}},p_filename:'test.pdf',p_file_key:null,p_revision:1});
assert.equal(doc.fileKey,fileKey,'metadata edit preserves the original PDF');
await assert.rejects(()=>call('mawatheeq_save_document',{p_id:docId,p_payload:{},p_filename:'test.pdf',p_file_key:null,p_revision:1}),/مستخدم آخر/);
await assert.rejects(()=>call('mawatheeq_add_member',{p_email:'pending@example.invalid'}),/تأكيد/);
await call('mawatheeq_add_member',{p_email:'outsider@example.invalid'});
await asUser(outsider);
assert.equal(await count('public.mawatheeq_cases'),before);
assert.equal(await count('storage.objects'),1);
await asUser(owner);
await call('mawatheeq_remove_member',{p_user_id:outsider});
await assert.rejects(()=>call('mawatheeq_remove_member',{p_user_id:owner}),/مسؤول/);
await asUser(outsider);
assert.equal(await count('public.mawatheeq_cases'),0);
assert.equal(await count('storage.objects'),0);
await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('mawatheeq-documents','documents/forbidden.pdf')"),/row-level security/);
await assert.rejects(()=>call('mawatheeq_save_document',{p_id:docId,p_payload:{},p_filename:'test.pdf',p_file_key:null,p_revision:2}),/صلاحية/);
await db.close();
console.log('Passed: shared records, anonymous/nonmember denial, membership administration and revocation, private PDFs, concurrent-edit conflicts, validation, import deduplication, and atomic rollback.');
