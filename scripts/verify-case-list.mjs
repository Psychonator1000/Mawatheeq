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
// The server's register («mawatheeq_case_list») must list the same cases in the same order as the page's listCases(),
// for hundreds of register views over a varied office: every filter, search (Arabic and Indian digits, «ت-» codes,
// spelling variants), category, column sort in both directions, deadline views on several days, and changed rules.
import { listCases } from '../lib/case-list.ts';
import { DEFAULT_RULES, todayISO, emptyCase } from '../lib/domain.ts';
import { enrichCase } from '../lib/clients.ts';
import { workflowOf } from '../lib/case-desk.ts';
import { EMPTY_CASE_FILTERS } from '../lib/case-browse.ts';
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,'owner' from mawatheeq_private.accounts");
const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;

let seed=Number(process.env.CASE_LIST_SEED||7);const rand=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648,pick=a=>a[Math.floor(rand()*a.length)],maybe=(p,v)=>rand()<p?v:undefined;
const today=todayISO(),shift=n=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
// Client files: sectors, contacts.
const CLIENTS=[['شركة الاتصالات المتنقلة','telecom'],['شركة الاتصالات الكويتية STC','telecom'],['شركة الخليج للتأمين','insurance'],['بنك الكويت الوطني','other'],['أحمد علي','other'],['مؤسسة إيلاف','other'],['الشركة الأولى للتأمين التكافلي','insurance'],['ورثة المرحوم سالم','other']];
const entities=[];
for(const [name,sector] of CLIENTS){const contacts=[{id:crypto.randomUUID(),name:'مندوب '+name.split(' ')[1],role:'',phone:'',notes:''}];
 const id=(await db.query("insert into mawatheeq_private.client_entities(payload) values($1) returning id",[{name,kind:'organization',sector,contacts,aliases:[],notes:'',needsReview:false}])).rows[0].id;entities.push({id,name,contacts})}
const NAMES=['شركة الاتصالات المتنقلة','شركة الإتصالات المتنقلة','الاتصالات المتنقله','بنك الكويت الوطني','مدرسة الصالحين','فاطمة عبدالعزيز','  أحمد   علي ','',undefined];
const LAWYERS=['عمرو عاطف','عمرو عاطف ','احمد سالم','أحمد سالم','سارة','',undefined];
const CODES=['12','120','1200','3326','٣٢٦','326','0012','ت-15','A12','12أ','',undefined,'15','1500'];
const AUTO=['202500123','202500124','12','٢٠٢٥٠٠١٢٣','','  ','abc12',undefined,'2025/77'];
const DATES=['',today,shift(-3),shift(-26),shift(-29),shift(-30),shift(-31),shift(-58),shift(-61),shift(-100),'2025-01-15','2024-12-31','2026-02-30','bad',undefined];
const TYPES=['حكم أول درجة','حكم استئناف','حكم تمييز','إشكال','حكم ابتدائي','',undefined,'يحتاج مراجعة'];
const OUTCOMES=['لصالحنا','لصالحنا -','غير صالحنا','غير محدد','',undefined];
const reportDays=[today,shift(1),shift(-2),shift(7)];
// Saved as the owner (the archive's paper files record who added them).
await db.query("select set_config('request.jwt.claim.sub',(select id::text from mawatheeq_private.accounts where username='owner'),false)");
for(let i=0;i<1500;i++){
 const e=rand()<0.6?pick(entities):null;
 const p={code:pick(CODES),autoNumber:pick(AUTO),client:pick(NAMES),clientGroup:maybe(0.4,pick(NAMES)),opponent:pick(['خصم تجريبي','محمد عبدالله','شركة زين','',undefined,'فاطمه']),
  lawyer:pick(LAWYERS),date:pick(DATES),type:pick(TYPES),outcome:pick(OUTCOMES),role:pick(['مدعي','متهم','مدعى عليه','']),appealRecorded:pick(['','لا يوجد','تم','منتهي',undefined]),
  executionNote:pick(['','تم عمل اجراءات التنفيذ','غير متداول',undefined]),insurance:maybe(0.15,true),executionFile:maybe(0.08,pick([true,false])),telecom:maybe(0.05,true),
  workflow:maybe(0.05,pick(['consultation','study'])),caseNumber:pick(['123/2025','٤٥٦/٢٠٢٤','',undefined]),ruling:maybe(0.2,'إلزام المدعى عليه بالمبلغ'),casePerson:maybe(0.1,'وكيل الورثة'),
  clientEntityId:e?.id,clientContactId:e&&rand()<0.5?e.contacts[0].id:undefined,
  stages:maybe(0.07,[{level:'appeal',caseNumber:'777/2026',autoNumber:'909090'}]),
  procedures:rand()<0.3?[{id:'p'+i,date:shift(-20),kind:pick(['جلسة','إجراء']),text:'متابعة',followup:pick(reportDays)}]:[]};
 for(const k of Object.keys(p))if(p[k]===undefined)delete p[k];
 await db.query('insert into public.mawatheeq_cases(id,payload,revision,archived) values($1,$2,1,$3)',['k'+String(i).padStart(4,'0'),{...emptyCase(),...p,id:undefined},rand()<0.08]);
}
// Work due on the report days (the deadlines view's «followup» tab lists their cases).
const owner=(await db.query("select id from mawatheeq_private.accounts where username='owner'")).rows[0].id;
for(let i=0;i<40;i++)await db.query('insert into mawatheeq_private.work_items(id,payload,created_by,updated_by) values(gen_random_uuid(),$1,$2,$2)',[{caseId:'k'+String(Math.floor(rand()*1500)).padStart(4,'0'),kind:'task',title:'مهمة',dueDate:pick(reportDays),status:pick(['open','done','in_progress','cancelled']),assigneeId:owner},owner]);
await db.exec('set role anon');
const token=(await rpc('mawatheeq_local_login',['owner','Synthetic-password-123'])).token;

// The page's view of the same office: the cases as stored, joined to their client files.
async function pageSide(){
 await db.exec('reset role');
 const clients=(await db.query('select id,payload from mawatheeq_private.client_entities')).rows.map(r=>({id:r.id,...r.payload}));
 const rows=(await db.query('select id,payload,revision,archived from public.mawatheeq_cases order by id')).rows;
 const work=(await db.query('select payload from mawatheeq_private.work_items')).rows.map(r=>r.payload);
 const rules=(await db.query("select value from public.mawatheeq_settings where key='rules'")).rows[0]?.value||DEFAULT_RULES;
 await db.exec('set role anon');
 const records=rows.map(r=>enrichCase({...r.payload,id:r.id,revision:r.revision,archived:r.archived},clients)).filter(c=>!workflowOf(c));
 return {records,work,rules};
}
const SEARCH=['','12','١٢','326','ت-15','ت15','شركة','الاتصالات','الإتصالات','احمد','زين','2025','٢٠٢٥','777','909090','مندوب','وكيل','إلزام','A1','  ', 'abc'];
const SORTS=['date','number','code','client','remaining','lawyer'];
async function compare(n,label){
 const {records,work,rules}=await pageSide();let checked=0;
 for(let i=0;i<n;i++){
  const view=rand()<0.25?'deadlines':'cases',reportDate=pick(reportDays);
  const filters={...EMPTY_CASE_FILTERS,search:pick(SEARCH),category:view==='cases'?pick(['','','execution','insurance','telecom']):'',
   year:maybe(0.15,pick(['2025','2026',today.slice(0,4)]))||'',month:maybe(0.1,pick(['01','09','11',today.slice(5,7)]))||'',code:maybe(0.1,pick(['12','ت','٣']))||'',
   client:maybe(0.12,pick(['الاتصالات','بنك','احمد علي','ورثه']))||'',opponent:maybe(0.08,pick(['محمد','زين','فاطمة']))||'',numberStatus:maybe(0.1,'missing')||'',
   clientEntityId:maybe(0.08,pick(entities).id)||''};
  if(rand()<0.1){filters.analysisField=pick(['type','outcome','status','appeal','appealRecorded']);filters.analysisValue=pick(['لصالحنا','بيانات ناقصة','غير مسجل','حكم استئناف','تم','يحتاج مراجعة','متداول'])}
  const q={view,archive:rand()<0.1,filters,outcome:maybe(0.1,pick(['لصالحنا','غير محدد']))||'',type:maybe(0.1,pick(['حكم استئناف','يحتاج مراجعة']))||'',lawyer:maybe(0.08,pick(['عمرو عاطف','سارة']))||'',
   deadlineFilter:pick(['overdue','soon','followup']),reportDate,sort:{key:pick(SORTS),dir:pick([1,-1])}};
  const dueWork=new Set(work.filter(w=>w.caseId&&w.dueDate===reportDate&&w.status!=='done'&&w.status!=='cancelled').map(w=>w.caseId));
  const want=listCases(records,rules,q,today,dueWork).map(c=>c.id);
  const got=[];let total=0;
  for(let off=0;;off+=200){const r=await rpc('mawatheeq_case_list',[token,JSON.stringify({...q,offset:off,limit:200})]);total=r.total;got.push(...r.rows.map(x=>x.id));if(r.rows.length<200)break}
  try{assert.equal(total,want.length);assert.deepEqual(got,want)}catch(e){console.error(label,'query',JSON.stringify(q));const at=got.findIndex((x,j)=>x!==want[j]);console.error('first difference at',at,'got',got.slice(Math.max(0,at-2),at+3),'want',want.slice(Math.max(0,at-2),at+3));throw e}
  checked++;
 }
 return checked;
}
let n=await compare(300,'default rules');
// The office changes its deadlines: the server works every case out again.
await db.exec('reset role');await db.query("insert into public.mawatheeq_settings(key,value) values('rules',$1) on conflict (key) do update set value=excluded.value",[{first:7,appeal:21,objection:3,execution:10,warning:2}]);await db.exec('set role anon');
n+=await compare(100,'changed rules');
// A case saved and a client renamed: their rows follow at once.
await db.exec('reset role');
await db.query("update public.mawatheeq_cases set payload=payload||'{\"opponent\":\"خصم جديد للاختبار\"}' where id='k0001'");
await db.query("update mawatheeq_private.client_entities set payload=payload||'{\"name\":\"اسم موكل جديد\",\"sector\":\"insurance\"}' where id=$1",[entities[3].id]);
await db.exec('set role anon');
const found=await rpc('mawatheeq_case_list',[token,JSON.stringify({filters:{...EMPTY_CASE_FILTERS,search:'خصم جديد للاختبار'}})]);
assert.deepEqual(found.rows.map(r=>r.id),['k0001'],'A saved case is found by its new text');
n+=await compare(60,'after edits');
// A lawyer account sees only the cases under its name.
await db.exec('reset role');
const m=(await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values('lawyer_amr',extensions.crypt('Synthetic-password-123',extensions.gen_salt('bf',4)),false) returning id")).rows[0];
await db.query("insert into public.mawatheeq_members(user_id,role) values($1,'editor')",[m.id]);await db.exec('set role anon');
await rpc('mawatheeq_office_request',[token,'set_member_access',JSON.stringify({id:m.id,revision:0,permissions:{sections:['cases'],caseScope:'selected',caseIds:[],lawyerNames:['عمرو عاطف'],canEdit:true,canExport:false}})]);
const lawyer=await rpc('mawatheeq_local_login',['lawyer_amr','Synthetic-password-123']);
const mine=await rpc('mawatheeq_case_list',[lawyer.token,JSON.stringify({limit:200})]);
assert.ok(mine.total>0&&mine.rows.every(r=>String(r.payload.lawyer).trim()==='عمرو عاطف'),'Only the cases under the lawyer\'s name');
await assert.rejects(()=>rpc('mawatheeq_case_list',['not-a-token','{}']));
console.log(`Passed case list: the server lists the same cases in the same order as the page for ${n} register views (filters, searches, categories, sorts, deadline days, changed rules, edits), and keeps a lawyer to the cases under their name.`);
