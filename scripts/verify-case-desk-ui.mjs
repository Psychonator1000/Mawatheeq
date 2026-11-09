// Synthetic end-to-end test. Run the Pages dev server on 127.0.0.1:4175 first.
// Uses an isolated in-memory database and browser; never contacts the real backend.
import {supportFilterSelects} from './filter-select-helper.mjs';
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
await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values ('ui_reporter',extensions.crypt($1,extensions.gen_salt('bf',4)),false)",['Synthetic-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,case when username='ui_owner' then 'owner' else 'editor' end from mawatheeq_private.accounts;set role anon");
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
const reporterId=(await rpc('mawatheeq_office_request',[login.token,'context','{}'])).members.find(m=>m.username==='ui_reporter').id;
await rpc('mawatheeq_office_request',[login.token,'set_member_access',JSON.stringify({id:reporterId,revision:0,permissions:{sections:['daily'],caseScope:'selected',caseIds:[],canEdit:true,canExport:false}})]);
const caseOf=async id=>(await rpc('mawatheeq_local_request',[login.token,'cases_page',JSON.stringify({})])).map(r=>({...r.payload,id:r.id})).find(c=>c.id===id);
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();const errors=[];const calls=[];
supportFilterSelects(page.locator('body'));
async function configurePage(page){
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/app-config.json',route=>route.fulfill({json:{supabaseUrl:'https://office-fixture.supabase.co',supabasePublishableKey:'sb_publishable_synthetic'}}));
await page.route('https://office-fixture.supabase.co/**',async route=>{
 const req=route.request();const url=new URL(req.url());
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
 const name=url.pathname.split('/').pop();const body=req.postDataJSON();calls.push({name,action:body?.p_action});
 if(!['mawatheeq_local_login','mawatheeq_local_request','mawatheeq_client_request','mawatheeq_office_request','mawatheeq_department_request','mawatheeq_daily_request'].includes(name))return route.fulfill({status:400,json:{message:'Unexpected synthetic endpoint'}});
 const args=name==='mawatheeq_local_login'?[body.p_username,body.p_password]:[body.p_token,body.p_action,JSON.stringify(body.p_data||{})];
 try{await route.fulfill({json:await rpc(name,args)})}catch(e){await route.fulfill({status:400,json:{message:e.message,code:e.code||'P0001'}})}
});
}
await configurePage(page);
const base='http://127.0.0.1:4175/Mawatheeq/';
const click=async name=>page.getByRole('button',{name,exact:true}).first().click();
// Pages kept out of the sidebar (reached from «مهام اليوم والتقرير») open by their address.
const HIDDEN={'ترحيل الجلسات':'posting'};
const nav=async name=>{if(HIDDEN[name])await page.evaluate(h=>{location.hash=h},HIDDEN[name]);else await page.locator('.nav-button',{hasText:name}).first().click();await page.getByRole('heading',{level:1,name,exact:true}).waitFor()};
const count=async(label,expected)=>{let n='';for(let i=0;i<50;i++){n=(await page.locator('.nav-button',{hasText:label}).first().innerText()).replace(/\D/g,'');if(n===expected)return n;await page.waitForTimeout(200)}return n};
const screen=async name=>page.screenshot({path:artifacts+'/'+name+'.png',fullPage:true});
try{
 await page.goto(base);await page.getByLabel('اسم المستخدم',{exact:true}).fill('ui_owner');await page.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');await click('فتح مساحة العمل');
 await click('فتح القضايا');await page.locator('.nav-section',{hasText:'الجلسات والمواعيد'}).waitFor();
 assert.equal(await count('سجل الأحكام','3'),'3','Cases under study stay out of the judgments register');
 // On a Friday or Saturday the hearing set for today is also flagged as a weekend date, a second error.
 {const weekend=[5,6].includes(new Date(today+'T12:00:00Z').getUTCDay()),n=weekend?'2':'1';
 assert.equal(await count('أخطاء الترحيل',n),n,'One posting error in the sidebar (two on a weekend day)');}

 await nav('ترحيل الجلسات');const row=page.locator('tr',{hasText:'DESK-DUE'});await row.waitFor();
 await row.getByLabel('قرار جلسة DESK-DUE').selectOption('شطب الدعوى');await row.getByRole('button',{name:'ترحيل'}).click();
 await page.getByText('رُحّلت جلسة DESK-DUE').waitFor();await page.getByText('لا جلسات بانتظار الترحيل في هذا اليوم').waitFor();
 const due=await caseOf('desk-due');assert.equal(due.procedures.length,2,'Posting adds the sitting to the case');assert.equal(due.procedures.at(-1).decision,'شطب الدعوى');
 await screen('posting');

 await nav('أخطاء الترحيل');await page.locator('tr',{hasText:'DESK-MISSED'}).first().waitFor();await page.getByText('جلسات فائتة لم تُرحَّل (1)').waitFor();await screen('posting-errors');
 // An open list is drawn above the rows and panels after it (each animated row cell has its own layer).
 {const row=page.locator('tr',{hasText:'DESK-MISSED'}).first();await row.getByRole('combobox').first().click();const list=page.locator('.filter-select-list');await list.waitFor();
  const hidden=await list.evaluate(ul=>[...ul.querySelectorAll('li')].filter(li=>{const r=li.getBoundingClientRect(),box=ul.getBoundingClientRect();if(r.bottom>innerHeight||r.top<box.top||r.bottom>box.bottom)return false;const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !hit||!ul.contains(hit)}).map(li=>li.textContent));
  assert.deepEqual(hidden,[],'No option of an open list is covered');await screen('posting-errors-list');await page.keyboard.press('Escape');}
 await nav('القضايا الموقوفة');await page.locator('tr',{hasText:'DESK-STRUCK'}).waitFor();await page.locator('tr',{hasText:'DESK-DUE'}).waitFor();
 assert.equal(await page.locator('.nav-button',{hasText:/مواعيد الجلسات|^الأحكام/}).count(),0,'The sessions roll and judgments issued open as windows from the register, not the sidebar');await nav('سجل الأحكام');await click('رول الجلسات');const win=page.getByRole('dialog');await win.getByRole('heading',{name:'مواعيد الجلسات (رول)',exact:true}).waitFor();await win.getByText('لا جلسات في هذه الفترة').waitFor();await screen('sessions-roll-window');await page.keyboard.press('Escape');await win.waitFor({state:'detached'});
 await click('الأحكام الصادرة');await win.getByRole('heading',{name:'الأحكام الصادرة',exact:true}).waitFor();await win.getByText('لا أحكام في هذه الفترة').waitFor();await page.keyboard.press('Escape');await win.waitFor({state:'detached'});await page.getByRole('heading',{level:1,name:'سجل الأحكام',exact:true}).waitFor();
 await nav('القضايا بدون عقود');await page.locator('tr',{hasText:'DESK-MISSED'}).waitFor();assert.equal(await page.locator('tr',{hasText:'DESK-STRUCK'}).count(),0,'Cases with a contract are not listed');
 const contract=page.locator('tr',{hasText:'DESK-MISSED'});await contract.getByLabel('رقم العقد DESK-MISSED').fill('ع-77');await contract.getByRole('button',{name:'حفظ العقد'}).click();
 await page.getByText('حُفظ في ملف القضية').waitFor();assert.equal((await caseOf('desk-missed')).contractNumber,'ع-77');

 await nav('الاستشارات');await click('استشارة جديدة');const dialog=page.getByRole('dialog');
 const client=dialog.getByLabel('الموكل',{exact:true});await client.click();const options=await dialog.locator('.filter-select-list [role=option] b').allTextContents();await client.press('Escape');assert.ok(options.includes('شركة اختبار المكتب'),'Clients can be picked');
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

 // «مهام اليوم والتقرير»: the owner sees the whole team's missions, posts a sitting from the list, and writes a report.
 await nav('مهام اليوم والتقرير');assert.equal(await page.locator('.nav-section',{hasText:'الجلسات والمواعيد'}).locator('xpath=following-sibling::*[1]').locator('.nav-button').count(),2,'One page for the day, plus posting errors');
 const mission=code=>page.locator('.mission',{hasText:code});await mission('DESK-STUDY').waitFor();
 assert.match(await mission('DESK-MISSED').getAttribute('class'),/late/,'A sitting not posted is late');assert.match(await mission('DESK-DUE').getAttribute('class'),/done/,'A sitting posted today is done');
 await page.getByText('لا أحد مكلف بالتقرير اليومي').waitFor({state:'detached'}).catch(()=>{});await page.locator('.team-board tr',{hasText:'ui_reporter'}).waitFor();await screen('daily-team');
 await mission('DESK-STUDY').getByRole('button',{name:'ترحيل'}).click();await page.getByLabel('قرار جلسة DESK-STUDY').selectOption('شطب الدعوى');await mission('DESK-STUDY').getByRole('button',{name:/حفظ في القضية/}).click();
 await page.getByText('رُحّلت جلسة DESK-STUDY').waitFor();await page.waitForFunction(()=>document.querySelector('.mission:has(.mission-main b)')&&[...document.querySelectorAll('.mission')].some(m=>m.textContent.includes('DESK-STUDY')&&m.classList.contains('done')));
 assert.equal((await caseOf('desk-study')).procedures.at(-1).decision,'شطب الدعوى','Posted into the case');
 await page.getByLabel('تقرير من').selectOption('me');const mine=page.getByRole('region',{name:'تقريري اليومي'});await mine.getByText('لم يُحفظ بعد').waitFor();
 await mine.getByRole('button',{name:'إضافة سطر: الأعمال الإدارية داخل المحاكم'}).click();await mine.getByPlaceholder('العمل المنجز ورقم الملف').fill('قيد صحيفة دعوى');await mine.getByPlaceholder('النتيجة أو الإجراء المتخذ').fill('تم القيد');
 await mine.getByRole('button',{name:'إرسال التقرير'}).click();await page.getByText('أُرسل التقرير').waitFor();await mine.getByText(/^أُرسل /).waitFor();await screen('daily-mine');
 const stored=(await rpc('mawatheeq_daily_request',[login.token,'mine',JSON.stringify({date:today})])).report;
 assert.deepEqual(stored.payload.admin,[{text:'قيد صحيفة دعوى',result:'تم القيد'}]);assert.ok(stored.submittedAt,'Sent');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),true,'The day fits one screen');
 // An account holding only the report section: the report and nothing else, no case at all.
 {const other=await context.browser().newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const p2=await other.newPage();await configurePage(p2);
  await p2.goto(base);await p2.getByLabel('اسم المستخدم',{exact:true}).fill('ui_reporter');await p2.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');await p2.getByRole('button',{name:'فتح مساحة العمل',exact:true}).click();
  const open=p2.getByRole('button',{name:'فتح القضايا',exact:true});if(await open.count())await open.click();
  const own=p2.getByRole('region',{name:'تقريري اليومي'});await own.waitFor();assert.equal(await p2.locator('.day-missions').count(),0,'No missions column');
  assert.deepEqual(await p2.locator('.nav-button').allInnerTexts().then(t=>t.map(x=>x.trim()).filter(x=>/سجل الأحكام|ترحيل|المهام والجلسات/.test(x))),[],'No case pages');
  await own.getByRole('button',{name:'إضافة سطر: الأعمال والمراجعات الخارجية'}).click();await own.getByPlaceholder('الجهة التي تمت مراجعتها').fill('وزارة العدل — شهادة');await own.getByRole('button',{name:'حفظ',exact:true}).click();await own.getByText('مسودة محفوظة').waitFor();
  await p2.screenshot({path:artifacts+'/daily-reporter.png'});await other.close();}
 await page.getByLabel('تقرير من').selectOption('team');const sent=page.locator('.team-board tr',{hasText:'ui_reporter'});await sent.getByText('مسودة').waitFor();await sent.getByRole('button',{name:'اقرأ التقرير'}).click();await page.getByText('وزارة العدل — شهادة').waitFor();

 // The views of the page: all the day's sittings, the dates ahead, the month — and a day of the month opens that day.
 await page.getByRole('tab',{name:'ترحيل الجلسات'}).click();await page.getByRole('region',{name:'ترحيل الجلسات'}).locator('.mission',{hasText:'DESK-DUE'}).waitFor();
 await page.getByRole('tab',{name:'المواعيد'}).click();await page.getByRole('region',{name:'المواعيد'}).waitFor();
 await page.getByRole('tab',{name:'التقويم'}).click();await page.locator('.day-cal-cell.today').click();await page.getByRole('tab',{name:'اليوم',selected:true}).waitFor();await mission('DESK-DUE').waitFor();
 // «الأداء»: one row a person; the owner's sent report counts, the reporter's draft does not; a row opens that person's day.
 await page.getByRole('tab',{name:'الأداء'}).click();const perf=page.locator('.perf-table tbody tr',{hasText:'ui_reporter'});await perf.waitFor();
 assert.match(await page.locator('.perf-table tbody tr',{hasText:'ui_owner'}).innerText(),/1 من/,'The owner sent one report');assert.match(await perf.innerText(),/0 من[\s\S]*مسودة|مسودة[\s\S]*0 من/,'The reporter has a draft, none sent');
 await perf.click();await page.getByRole('tab',{name:'اليوم',selected:true}).waitFor();await page.getByRole('region',{name:'تقرير الزميل'}).getByText('وزارة العدل — شهادة').waitFor();
 await page.setViewportSize({width:390,height:844});await screen('posting-mobile');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'No horizontal page scroll on phones');
 assert.deepEqual(errors,[],'No page errors');
 console.log('Passed cases desk: posting a sitting, posting errors, stayed cases, roll, contracts, a consultation and filing a case under study.');
}finally{await browser.close();await db.close()}
