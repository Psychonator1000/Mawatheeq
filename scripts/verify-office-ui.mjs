// Synthetic end-to-end test. Run the Pages dev server on 127.0.0.1:4175 first.
// Uses an isolated in-memory database and browser; never contacts the real backend.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.PLAYWRIGHT_MODULES_PATH||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
const artifacts=process.env.OFFICE_TEST_ARTIFACTS||'/tmp/mawatheeq-office-ui';fs.mkdirSync(artifacts,{recursive:true});
const db=new PGlite({extensions:{pgcrypto}});
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
if(fs.existsSync('supabase/user_permissions.pending.sql')) await db.exec(fs.readFileSync('supabase/user_permissions.pending.sql','utf8'));
await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values ('ui_owner',extensions.crypt($1,extensions.gen_salt('bf',4)),false)",['Synthetic-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,'owner' from mawatheeq_private.accounts;set role anon");
const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
const login=await rpc('mawatheeq_local_login',['ui_owner','Synthetic-password-123']);
for(let i=0;i<25;i++)await rpc('mawatheeq_local_request',[login.token,'save_case',JSON.stringify({case:{id:'ui-case-'+i,code:'TEST-'+i,autoNumber:String(1000+i),client:'شركة اختبار الواجهة',clientGroup:'شركة اختبار الواجهة',opponent:'خصم تجريبي '+i,date:'2026-09-01',type:i===0?'':'حكم أول درجة',outcome:'لصالحنا',ruling:'حكم تجريبي لا يمثل بيانات حقيقية',notificationDate:'2026-09-10',appealConfirmation:'لا يوجد',procedures:[],revision:0}})]);
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
 if(!['mawatheeq_local_login','mawatheeq_local_request','mawatheeq_client_request','mawatheeq_office_request'].includes(name))return route.fulfill({status:400,json:{message:'Unexpected synthetic endpoint'}});
 const args=name==='mawatheeq_local_login'?[body.p_username,body.p_password]:[body.p_token,body.p_action,JSON.stringify(body.p_data||{})];
 try{await route.fulfill({json:await rpc(name,args)})}catch(e){await route.fulfill({status:400,json:{message:e.message,code:e.code||'P0001'}})}
});
}
await configurePage(page);
const base='http://127.0.0.1:4175/Mawatheeq/';
const go=async(name)=>{await page.getByRole('button',{name:name==='سجل الأحكام'?/^سجل الأحكام/:name,exact:name!=='سجل الأحكام'}).first().click()};
try{
 await page.goto(base);await page.getByLabel('اسم المستخدم',{exact:true}).fill('ui_owner');await page.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');await go('فتح مساحة العمل');
 await page.getByRole('heading',{name:'كل قضاياك، في مكان واحد'}).waitFor();await page.getByRole('button',{name:/بيانات أحكام معتمدة بالمراجعة/}).waitFor();
 await go('التحليل والإحصائيات');await page.getByRole('button',{name:'يحتاج مراجعة 1',exact:true}).click();
 await page.getByText('من التحليل:',{exact:false}).waitFor();assert.match(page.url(),/analysisField=type/);assert.equal(await page.locator('tbody tr').count(),1);
 await page.reload();await page.getByText('من التحليل:',{exact:false}).waitFor();assert.equal(await page.locator('tbody tr').count(),1);
 await go('سجل الأحكام');await page.getByRole('button',{name:'الصفحة 2',exact:true}).click();assert.equal(await page.locator('tbody tr').count(),5);
 await go('إضافة قضية');const sheet=page.getByRole('dialog');await sheet.getByLabel('كود المكتب',{exact:true}).fill('NEW-FORM');await sheet.getByLabel('الرقم الآلي',{exact:true}).fill('9000');
 // The existing client selector is a native select.
 await sheet.getByLabel('الموكل / الجهة',{exact:true}).selectOption({index:1});
 await sheet.getByLabel('الخصم',{exact:true}).fill('طرف جديد دون مرفق');await sheet.getByLabel('منطوق الحكم',{exact:true}).fill('إدخال يدوي تجريبي');
 await sheet.getByRole('button',{name:'حفظ التغييرات',exact:true}).click();await page.getByText('تم حفظ السجل وتحديث القوائم',{exact:true}).waitFor();
 await page.keyboard.press('Escape');await go('التحقق من القضايا');await page.getByLabel('البحث عن سجل للمراجعة',{exact:true}).fill('TEST-1');await page.getByRole('button',{name:'فتح التحقق',exact:true}).first().click();
 const verify=page.getByRole('dialog');await verify.getByLabel('قرار المراجعة',{exact:true}).selectOption('verified');await verify.getByLabel('مرجع المصدر الذي تمت مراجعته',{exact:true}).fill('السجل الرسمي التجريبي 1001');await verify.getByLabel('ملاحظات المطابقة أو سبب طلب المراجعة',{exact:true}).fill('تمت مطابقة الأطراف والنتيجة والتاريخ مع السجل التجريبي');
 await verify.getByRole('checkbox',{name:/راجعت المصدر المحدد/}).check();await verify.getByRole('button',{name:'حفظ الاعتماد',exact:true}).click();await page.getByText('حُفظ الاعتماد ومراجعه',{exact:true}).waitFor();
 await verify.getByText('اعتمدت بالمراجعة',{exact:true}).waitFor();assert.equal(calls.filter(c=>c.action==='file_upload').length,0,'No PDF is required for case entry or review');
 await verify.getByRole('tab',{name:'بيانات الحكم',exact:true}).click();await verify.getByLabel('ملاحظات',{exact:true}).fill('تعديل بعد الاعتماد');await verify.getByRole('button',{name:'حفظ التغييرات',exact:true}).click();await verify.getByRole('tab',{name:'التحقق والمصادر',exact:true}).click();await verify.getByText('تغيّر بعد الاعتماد',{exact:true}).waitFor();
 await verify.getByText('سجل التغييرات',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await go('المهام والجلسات');await go('إضافة مهمة');const work=page.getByRole('dialog');await work.getByLabel('عنوان العمل',{exact:true}).fill('متابعة تجريبية');await work.getByRole('button',{name:'حفظ العمل',exact:true}).click();await page.getByText('متابعة تجريبية',{exact:true}).waitFor();
 await go('فتح العمل');await page.getByLabel('حالة العمل',{exact:true}).selectOption('done');assert.equal(await page.getByRole('button',{name:'حفظ العمل',exact:true}).isDisabled(),true);await page.getByLabel('نتيجة المهمة / قرار الجلسة',{exact:true}).fill('تمت المتابعة التجريبية');await go('حفظ العمل');await page.getByRole('button',{name:'مغلقة 1',exact:true}).click();await page.getByText('متابعة تجريبية',{exact:true}).waitFor();
 await go('إضافة جلسة');await page.getByLabel('عنوان العمل',{exact:true}).fill('جلسة تجريبية');assert.equal(await page.getByRole('button',{name:'حفظ العمل',exact:true}).isDisabled(),true);await page.getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-2');await go('حفظ العمل');await page.getByLabel('المواعيد',{exact:true}).selectOption('active');await page.getByText('جلسة تجريبية',{exact:true}).waitFor();
 await go('فحص الأطراف');await page.getByLabel('اسم الطرف أو الجهة المراد فحصها',{exact:true}).fill('خصم تجريبي 2');await page.getByText('خصم',{exact:true}).first().waitFor();
 await go('الإعدادات والبيانات');await go('إضافة موظف');await page.getByLabel('اسم المستخدم الجديد',{exact:true}).fill('ui_staff');await page.getByLabel('كلمة المرور المؤقتة',{exact:true}).fill('Temporary-synthetic-123');
 await page.getByRole('checkbox',{name:'سجل الأحكام',exact:true}).check();await page.getByRole('checkbox',{name:'التحليل والإحصائيات',exact:true}).check();await page.getByRole('checkbox',{name:'التحقق من القضايا',exact:true}).check();await page.getByRole('checkbox',{name:'المهام والجلسات',exact:true}).check();
 await page.getByLabel('البحث لاختيار القضايا',{exact:true}).fill('TEST-2');await page.getByRole('checkbox',{name:'إتاحة القضية TEST-2',exact:true}).check();
 assert.equal(await page.getByRole('checkbox',{name:'السماح بالتعديل في الأقسام المتاحة',exact:true}).isChecked(),false);
 await page.screenshot({path:artifacts+'/permission-editor-desktop.png',fullPage:true});await go('حفظ الحساب');await page.getByRole('cell',{name:'ui_staff',exact:true}).waitFor();
 await go('التحليل والإحصائيات');await page.screenshot({path:artifacts+'/office-analytics-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.reload();await page.getByRole('heading',{name:'التحليل والإحصائيات',exact:true}).waitFor();await page.screenshot({path:artifacts+'/office-analytics-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'No horizontal viewport overflow on mobile');
 // Independent staff browser keeps its session active while the admin changes grants.
 const staffContext=await browser.newContext({viewport:{width:1360,height:900},reducedMotion:'reduce'});
 const staff=await staffContext.newPage();await configurePage(staff);const staffSheet=staff.getByRole('dialog');
 const staffGo=async name=>staff.getByRole('button',{name:name==='سجل الأحكام'?/^سجل الأحكام/:name,exact:name!=='سجل الأحكام'}).first().click();
 await staff.goto(base+'#cases');await staff.getByLabel('اسم المستخدم',{exact:true}).fill('ui_staff');await staff.getByLabel('كلمة المرور',{exact:true}).fill('Temporary-synthetic-123');await staffGo('فتح مساحة العمل');
 await staff.getByLabel('كلمة المرور الحالية',{exact:true}).fill('Temporary-synthetic-123');await staff.getByLabel('كلمة المرور الجديدة',{exact:true}).fill('Staff-synthetic-123');await staff.getByLabel('تأكيد كلمة المرور الجديدة',{exact:true}).fill('Staff-synthetic-123');await staffGo('حفظ كلمة المرور');
 await staff.getByRole('heading',{name:'سجل الأحكام',exact:true}).waitFor();await staff.getByRole('button',{name:'فتح القضية TEST-2',exact:true}).waitFor();
 assert.equal(await staff.locator('tbody tr').count(),1);assert.equal(await staff.getByRole('button',{name:'الإعدادات والبيانات',exact:true}).count(),0);assert.equal(await staff.getByRole('button',{name:'إعداد المستندات',exact:true}).count(),0);
 assert.equal(await staff.getByRole('button',{name:'إضافة قضية',exact:true}).count(),0);assert.equal(await staff.getByRole('button',{name:'تصدير',exact:true}).count(),0);
 await staffGo('فتح القضية TEST-2');assert.equal(await staffSheet.getByLabel('الخصم',{exact:true}).isDisabled(),true);assert.equal(await staff.getByRole('button',{name:'حفظ التغييرات',exact:true}).count(),0);
 await staff.getByRole('tab',{name:'التحقق والمصادر',exact:true}).click();await staff.getByText('سجل التغييرات',{exact:true}).waitFor();assert.equal(await staff.getByRole('button',{name:'حفظ طلب المراجعة',exact:true}).count(),0);await staff.keyboard.press('Escape');
 await staff.evaluate(()=>{location.hash='settings'});await staff.getByRole('heading',{name:'هذا القسم غير متاح لحسابك',exact:true}).waitFor();assert.equal(await staff.getByRole('button',{name:'إضافة موظف',exact:true}).count(),0);
 await staffGo('التحليل والإحصائيات');await staff.getByText('تُحسب الأعداد من 1 سجل حكم نشط',{exact:false}).waitFor();await staff.screenshot({path:artifacts+'/restricted-analytics-desktop.png',fullPage:true});
 await staff.setViewportSize({width:390,height:844});await staff.screenshot({path:artifacts+'/restricted-analytics-mobile.png',fullPage:true});assert.equal(await staff.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true);await staff.setViewportSize({width:1360,height:900});
 await page.setViewportSize({width:1440,height:1000});await go('الإعدادات والبيانات');await page.getByRole('row').filter({has:page.getByRole('cell',{name:'ui_staff',exact:true})}).getByRole('button',{name:'تعديل الصلاحيات',exact:true}).click();
 await page.getByLabel('البحث لاختيار القضايا',{exact:true}).fill('TEST-2');assert.equal(await page.getByRole('checkbox',{name:'إتاحة القضية TEST-2',exact:true}).isChecked(),true);await page.getByRole('checkbox',{name:'إتاحة القضية TEST-2',exact:true}).uncheck();
 await page.getByLabel('البحث لاختيار القضايا',{exact:true}).fill('TEST-3');await page.getByRole('checkbox',{name:'إتاحة القضية TEST-3',exact:true}).check();await page.getByRole('checkbox',{name:'السماح بالتعديل في الأقسام المتاحة',exact:true}).check();await go('حفظ الصلاحيات وإنهاء الجلسات');
 await page.getByRole('dialog').waitFor({state:'hidden'});await staff.evaluate(()=>window.dispatchEvent(new Event('focus')));await staff.getByRole('heading',{name:'تسجيل الدخول',exact:true}).waitFor();
 await staff.getByLabel('اسم المستخدم',{exact:true}).fill('ui_staff');await staff.getByLabel('كلمة المرور',{exact:true}).fill('Staff-synthetic-123');await staffGo('فتح مساحة العمل');await staff.getByRole('heading',{name:'التحليل والإحصائيات',exact:true}).waitFor();await staffGo('سجل الأحكام');
 await staff.getByRole('button',{name:'فتح القضية TEST-3',exact:true}).waitFor();assert.equal(await staff.getByRole('button',{name:'فتح القضية TEST-2',exact:true}).count(),0);await staffGo('فتح القضية TEST-3');
 assert.equal(await staffSheet.getByLabel('الخصم',{exact:true}).isDisabled(),false);assert.equal(await staffSheet.getByLabel('الموكل / الجهة',{exact:true}).isDisabled(),true);await staffSheet.getByLabel('ملاحظات',{exact:true}).fill('Allowed restricted staff edit');await staffGo('حفظ التغييرات');await staff.getByText('تم حفظ السجل وتحديث القوائم',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('Passed office UI: form-only case entry, PDF-free source approval, stale approval, audit history, analytics links/refresh, pagination, task completion, linked hearings, party search, admin grants on creation/edit, selected-case isolation, hidden sections/direct hash denial, read-only forms, restricted edits, revoked active sessions, mobile layout, and no runtime errors.');
}catch(e){await page.screenshot({path:artifacts+'/office-ui-failure.png',fullPage:true});console.error(await page.locator('body').innerText());throw e}
finally{
 await browser.close();await db.close();
 // Optional synthetic screenshots for review when artifact downloads are unavailable.
 if(process.env.OFFICE_TEST_INLINE_SCREENSHOTS==='1')for(const name of ['permission-editor-desktop.png','restricted-analytics-mobile.png']){const file=artifacts+'/'+name;if(fs.existsSync(file))console.log('OFFICE_UI_SCREENSHOT '+name+' '+fs.readFileSync(file).toString('base64'))}
}
