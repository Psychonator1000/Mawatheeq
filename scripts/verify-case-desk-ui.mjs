// Synthetic end-to-end test. Run the Pages dev server on 127.0.0.1:4175 first.
// Uses an isolated in-memory database and browser; never contacts the real backend.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.PLAYWRIGHT_MODULES_PATH||process.cwd()]}));
const artifacts=(process.env.OFFICE_TEST_ARTIFACTS||'/tmp/mawatheeq-office-ui')+'/case-desk';fs.mkdirSync(artifacts,{recursive:true});
const db=new PGlite({extensions:{pgcrypto}});
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values ('ui_owner',extensions.crypt($1,extensions.gen_salt('bf',4)),false)",['Synthetic-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,'owner' from mawatheeq_private.accounts;set role anon");
const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
const login=await rpc('mawatheeq_local_login',['ui_owner','Synthetic-password-123']);
const day=n=>{const d=new Date(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait'}).format(new Date())+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const today=day(0);
const sitting=(id,date,decision,followup)=>({id,kind:'جلسة',date,court:'المحكمة الكلية',venue:'المحكمة',decision,text:decision,followup});
const seed=[
 {id:'desk-due',code:'DESK-DUE',procedures:[sitting('p1',day(-7),'تأجيل للإعلان',today)]},
 {id:'desk-missed',code:'DESK-MISSED',procedures:[sitting('p2',day(-9),'تأجيل لتقديم مستندات',day(-2))]},
 {id:'desk-struck',code:'DESK-STRUCK',contractNumber:'ع-1',procedures:[sitting('p3',day(-10),'شطب الدعوى','')]},
 {id:'desk-study',code:'DESK-STUDY',workflow:'study',procedures:[]},
];
for(const c of seed)await rpc('mawatheeq_local_request',[login.token,'save_case',JSON.stringify({case:{autoNumber:'',client:'شركة اختبار المكتب',clientGroup:'شركة اختبار المكتب',opponent:'خصم تجريبي',date:'',type:'',outcome:'',ruling:'',appealConfirmation:'',revision:0,...c}})]);
const caseOf=async id=>(await rpc('mawatheeq_local_request',[login.token,'cases_page',JSON.stringify({})])).map(r=>({...r.payload,id:r.id})).find(c=>c.id===id);
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();const errors=[];const calls=[];
async function configurePage(page){
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/app-config.json',route=>route.fulfill({json:{supabaseUrl:'https://office-fixture.supabase.co',supabasePublishableKey:'sb_publishable_synthetic'}}));
await page.route('https://office-fixture.supabase.co/**',async route=>{
 const req=route.request();const url=new URL(req.url());
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
 const name=url.pathname.split('/').pop();const body=req.postDataJSON();calls.push({name,action:body?.p_action});
 if(!['mawatheeq_local_login','mawatheeq_local_request','mawatheeq_client_request','mawatheeq_office_request','mawatheeq_department_request'].includes(name))return route.fulfill({status:400,json:{message:'Unexpected synthetic endpoint'}});
 const args=name==='mawatheeq_local_login'?[body.p_username,body.p_password]:[body.p_token,body.p_action,JSON.stringify(body.p_data||{})];
 try{await route.fulfill({json:await rpc(name,args)})}catch(e){await route.fulfill({status:400,json:{message:e.message,code:e.code||'P0001'}})}
});
}
await configurePage(page);
const base='http://127.0.0.1:4175/Mawatheeq/';
const click=async name=>page.getByRole('button',{name,exact:true}).first().click();
const nav=async name=>{await page.locator('.nav-button',{hasText:name}).first().click();await page.getByRole('heading',{level:1,name,exact:true}).waitFor()};
const count=async(label,expected)=>{let n='';for(let i=0;i<50;i++){n=(await page.locator('.nav-button',{hasText:label}).first().innerText()).replace(/\D/g,'');if(n===expected)return n;await page.waitForTimeout(200)}return n};
const screen=async name=>page.screenshot({path:artifacts+'/'+name+'.png',fullPage:true});
try{
 await page.goto(base);await page.getByLabel('اسم المستخدم',{exact:true}).fill('ui_owner');await page.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');await click('فتح مساحة العمل');
 await click('فتح القضايا');await page.locator('.nav-section',{hasText:'أعمال القضايا'}).waitFor();
 assert.equal(await count('سجل الأحكام','3'),'3','Cases under study stay out of the judgments register');
 assert.equal(await count('أخطاء الترحيل','1'),'1','One posting error in the sidebar');

 await nav('ترحيل الجلسات');const row=page.locator('tr',{hasText:'DESK-DUE'});await row.waitFor();
 await row.getByLabel('قرار جلسة DESK-DUE').selectOption('شطب الدعوى');await row.getByRole('button',{name:'ترحيل'}).click();
 await page.getByText('رُحّلت جلسة DESK-DUE').waitFor();await page.getByText('لا جلسات بانتظار الترحيل في هذا اليوم').waitFor();
 const due=await caseOf('desk-due');assert.equal(due.procedures.length,2,'Posting adds the sitting to the case');assert.equal(due.procedures.at(-1).decision,'شطب الدعوى');
 await screen('posting');

 await nav('أخطاء الترحيل');await page.locator('tr',{hasText:'DESK-MISSED'}).first().waitFor();await page.getByText('جلسات فائتة لم تُرحَّل (1)').waitFor();await screen('posting-errors');
 await nav('القضايا الموقوفة');await page.locator('tr',{hasText:'DESK-STRUCK'}).waitFor();await page.locator('tr',{hasText:'DESK-DUE'}).waitFor();
 assert.equal(await page.locator('.nav-button',{hasText:/مواعيد الجلسات|^الأحكام/}).count(),0,'The sessions roll and judgments issued open as windows from the register, not the sidebar');await nav('سجل الأحكام');await click('رول الجلسات');const win=page.getByRole('dialog');await win.getByRole('heading',{name:'مواعيد الجلسات (رول)',exact:true}).waitFor();await win.getByText('لا جلسات في هذه الفترة').waitFor();await screen('sessions-roll-window');await page.keyboard.press('Escape');await win.waitFor({state:'detached'});
 await click('الأحكام الصادرة');await win.getByRole('heading',{name:'الأحكام الصادرة',exact:true}).waitFor();await win.getByText('لا أحكام في هذه الفترة').waitFor();await page.keyboard.press('Escape');await win.waitFor({state:'detached'});await page.getByRole('heading',{level:1,name:'سجل الأحكام',exact:true}).waitFor();
 await nav('القضايا بدون عقود');await page.locator('tr',{hasText:'DESK-MISSED'}).waitFor();assert.equal(await page.locator('tr',{hasText:'DESK-STRUCK'}).count(),0,'Cases with a contract are not listed');
 const contract=page.locator('tr',{hasText:'DESK-MISSED'});await contract.getByLabel('رقم العقد DESK-MISSED').fill('ع-77');await contract.getByRole('button',{name:'حفظ العقد'}).click();
 await page.getByText('حُفظ في ملف القضية').waitFor();assert.equal((await caseOf('desk-missed')).contractNumber,'ع-77');

 await nav('الاستشارات');await click('استشارة جديدة');const dialog=page.getByRole('dialog');
 const client=dialog.getByLabel('الموكل',{exact:true});const options=await client.locator('option').allTextContents();assert.ok(options.includes('شركة اختبار المكتب'),'Clients can be picked');
 await client.selectOption({label:'شركة اختبار المكتب'});await dialog.getByLabel('موضوع الاستشارة',{exact:true}).fill('مراجعة عقد إيجار تجريبي');await dialog.getByRole('button',{name:'حفظ',exact:true}).click();
 await page.getByText('حُفظت الاستشارة').waitFor();await page.locator('tr',{hasText:'مراجعة عقد إيجار تجريبي'}).waitFor();await screen('consultations');
 assert.equal(await count('سجل الأحكام','3'),'3','Consultations stay out of the judgments register');

 await nav('قضايا تحت الدراسة');const study=page.locator('tr',{hasText:'DESK-STUDY'});await study.getByRole('button',{name:'قيد الدعوى'}).click();
 const filing=page.getByRole('dialog');await filing.getByLabel('رقم القضية',{exact:true}).fill('123/2026');
 await filing.getByRole('button',{name:/^موعد الجلسة الأولى/}).click();await page.locator('.date-popover').getByRole('button',{name:'اليوم',exact:true}).click();
 await filing.getByRole('button',{name:'قيد الدعوى',exact:true}).click();await page.getByText(/قُيدت الدعوى DESK-STUDY/).waitFor();
 const filed=await caseOf('desk-study');assert.equal(filed.workflow,'','Filing moves the case into the register');assert.equal(filed.procedures.at(-1).followup,today);
 assert.equal(await count('سجل الأحكام','4'),'4');
 await nav('ترحيل الجلسات');await page.locator('tr',{hasText:'DESK-STUDY'}).waitFor();

 await page.setViewportSize({width:390,height:844});await screen('posting-mobile');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'No horizontal page scroll on phones');
 assert.deepEqual(errors,[],'No page errors');
 console.log('Passed cases desk: posting a sitting, posting errors, stayed cases, roll, contracts, a consultation and filing a case under study.');
}finally{await browser.close();await db.close()}
