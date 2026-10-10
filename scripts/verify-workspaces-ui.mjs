// Synthetic end-to-end test. Run the Pages dev server on 127.0.0.1:4175 first.
// Uses an isolated in-memory database and browser; never contacts the real backend.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.PLAYWRIGHT_MODULES_PATH||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
const artifacts=(process.env.OFFICE_TEST_ARTIFACTS||'/tmp/mawatheeq-office-ui')+'/workspaces';fs.mkdirSync(artifacts,{recursive:true});
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
 if(!['mawatheeq_local_login','mawatheeq_local_request','mawatheeq_client_request','mawatheeq_office_request','mawatheeq_department_request'].includes(name))return route.fulfill({status:400,json:{message:'Unexpected synthetic endpoint'}});
 const args=name==='mawatheeq_local_login'?[body.p_username,body.p_password]:[body.p_token,body.p_action,JSON.stringify(body.p_data||{})];
 try{await route.fulfill({json:await rpc(name,args)})}catch(e){await route.fulfill({status:400,json:{message:e.message,code:e.code||'P0001'}})}
});
}
await configurePage(page);
const base='http://127.0.0.1:4175/Mawatheeq/';
const click=async name=>page.getByRole('button',{name,exact:true}).first().click();
const field=async(label,value)=>page.getByRole('dialog').getByLabel(label,{exact:true}).fill(value);
const dept=(workspace,action,data={})=>rpc('mawatheeq_department_request',[login.token,action,JSON.stringify({workspace,...data})]);
const screen=async name=>page.screenshot({path:artifacts+'/'+name+'.png',fullPage:true});
async function enter(name){await click('فتح '+name);await page.getByRole('button',{name:'تحديث',exact:true}).waitFor();}
async function switchTo(name){await click('تغيير مساحة العمل');await click('فتح '+name);}
async function pickToday(label){await page.getByRole('dialog').getByRole('button',{name:label,exact:true}).click();await page.locator('.date-popover').getByRole('button',{name:'اليوم',exact:true}).click();}
async function downloadWord(button,expected){
 const promise=page.waitForEvent('download');await click(button);const download=await promise;
 const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);
 const PizZip=(await import('pizzip')).default;const xml=new PizZip(Buffer.concat(chunks)).file('word/document.xml').asText();
 assert.ok(xml.includes(expected),'Word contains entered party data');assert.equal(xml.includes('{{'),false,'No unresolved template placeholders');
}
try{
 await page.goto(base);await page.getByLabel('اسم المستخدم',{exact:true}).fill('ui_owner');await page.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');await click('فتح مساحة العمل');
 await page.getByRole('heading',{name:'اختر مساحة عملك',exact:true}).waitFor();assert.equal(await page.locator('.workspace-option').count(),5);
 await screen('chooser-desktop');await page.setViewportSize({width:390,height:844});await screen('chooser-mobile');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);await page.setViewportSize({width:1440,height:1000});
 await enter('السكرتارية');await click('إضافة مهمة');await field('عنوان العمل','تنسيق موعد تجريبي');await click('حفظ العمل');await page.getByText('تنسيق موعد تجريبي',{exact:true}).first().waitFor();
 await screen('secretary-desktop');await page.reload();await page.getByRole('heading',{name:'كل موعد في مكانه.',exact:true}).waitFor();
 await switchTo('القضايا');await click('المهام والجلسات');await page.getByText('تنسيق موعد تجريبي',{exact:true}).waitFor();
 await switchTo('التحصيل');await click('ملف تحصيل جديد');await page.getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-0');
 for(const [label,value] of [['الشركة المدعية','شركة اختبار التحصيل'],['المدعى عليه','خصم اختبار التحصيل'],['الرقم المدني للمدعى عليه','200000000001'],['الجنسية','كويتي'],['العنوان','عنوان تجريبي'],['الهاتف','50000000'],['الرقم المدني للشركة','SYN-1'],['السجل التجاري','SYN-2'],['رقم العقد / الحساب','SYN-ACCOUNT'],['مبلغ المطالبة (د.ك)','125.125'],['رقم أمر الأداء','1/2026'],['محكمة أمر الأداء','محكمة تجريبية'],['رقم الدعوى','1'],['سنة الدعوى','2026'],['محكمة الجلسة','محكمة تجريبية'],['الدائرة','1'],['يوم الجلسة','يوم تجريبي'],['مرجع المصدر الذي تمت مطابقته','عقد تجريبي 1']])await field(label,value);
 for(const label of ['تاريخ رفض أمر الأداء','تاريخ التكليف بالوفاء','تاريخ كشف الحساب','تاريخ الجلسة'])await pickToday(label);
 await click('إضافة مستند للحافظة');await field('وصف المستند 1','عقد تجريبي تمت مراجعته');await click('حفظ ملف التحصيل');
 await page.getByRole('heading',{name:'مراجعة المصدر',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'إنشاء صحيفة Word',exact:true}).isDisabled(),true);
 await page.getByRole('checkbox',{name:'راجعت البيانات الحالية وطابقتها مع المصدر المسجل.',exact:true}).check();await click('تسجيل مراجعة المصدر');
 await page.getByText(/راجع ui_owner هذه النسخة/).waitFor();
 await downloadWord('إنشاء صحيفة Word','شركة اختبار التحصيل');await downloadWord('إنشاء حافظة Word','عقد تجريبي تمت مراجعته');
 await screen('collections-review-desktop');await click('إغلاق الملف');await screen('collections-desktop');
 await switchTo('المحاسبة');await click('قيد جديد');await page.getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-0');await field('المبلغ','125.125');await field('مرجع القيد / رقم الإيصال','SYN-FEE-UI');await field('الدافع / المستفيد','طرف تجريبي');await click('ترحيل القيد');await page.getByRole('cell',{name:/SYN-FEE-UI/}).waitFor();
 await click('قيد جديد');await page.getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-0');await page.getByLabel('نوع القيد',{exact:true}).selectOption('receipt');await field('المبلغ','25.025');await field('مرجع القيد / رقم الإيصال','SYN-RECEIPT-UI');await field('الدافع / المستفيد','طرف تجريبي');await click('ترحيل القيد');
 await page.getByText('100.100 KWD',{exact:true}).waitFor();await screen('accounting-desktop');
 await page.getByRole('row').filter({has:page.getByRole('cell',{name:/SYN-RECEIPT-UI/})}).getByRole('button',{name:'فتح القيد',exact:true}).click();assert.equal(await page.getByLabel('المبلغ',{exact:true}).isDisabled(),true);await field('سبب إلغاء القيد','تصحيح تجريبي');await click('تأكيد إلغاء القيد');await page.locator('.ledger-balance').getByText('125.125 KWD',{exact:true}).waitFor();
 await switchTo('الموارد البشرية');await click('موظف جديد');await field('الرقم الوظيفي','EMP-UI-1');await field('اسم الموظف','موظف واجهة تجريبي');await field('المسمى الوظيفي','مساعد');await field('القسم','السكرتارية');await pickToday('تاريخ الانضمام');await click('حفظ سجل الموارد البشرية');await page.getByRole('heading',{name:'موظف واجهة تجريبي',exact:true}).waitFor();
 await screen('hr-desktop');await click('الإجازات');await click('طلب إجازة جديد');
 const people=await dept('hr','records_page');await page.getByLabel('الموظف',{exact:true}).selectOption(people.find(r=>r.kind==='employee').id);await page.getByLabel('قرار الإجازة',{exact:true}).selectOption('approved');await field('ملاحظة القرار / السبب','موافقة تجريبية');await click('حفظ سجل الموارد البشرية');await page.getByRole('cell',{name:'معتمدة',exact:true}).waitFor();
 for(const name of ['السكرتارية','التحصيل','المحاسبة','الموارد البشرية']){
  await switchTo(name);await page.setViewportSize({width:390,height:844});await page.locator('.department-hero').waitFor();await screen('mobile-'+({'السكرتارية':'secretary','التحصيل':'collections','المحاسبة':'accounting','الموارد البشرية':'hr'}[name]));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,name+' mobile overflow');await page.setViewportSize({width:1440,height:1000});
 }
 // Department-only read-only account gets exactly its chooser cards and safe case summaries.
 await db.exec('reset role');const staffId=(await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values('dept_ui_reader',extensions.crypt('Synthetic-password-123',extensions.gen_salt('bf',4)),false) returning id")).rows[0].id;
 await db.query("insert into public.mawatheeq_members(user_id,role) values($1,'editor')",[staffId]);await db.exec('set role anon');
 await rpc('mawatheeq_office_request',[login.token,'set_member_access',JSON.stringify({id:staffId,revision:0,permissions:{sections:['collections','hr'],caseScope:'selected',caseIds:['ui-case-0'],canEdit:false,canExport:false}})]);
 const sc=await browser.newContext({viewport:{width:1280,height:900}}),staff=await sc.newPage();await configurePage(staff);
 await staff.goto(base+'#settings');await staff.getByLabel('اسم المستخدم',{exact:true}).fill('dept_ui_reader');await staff.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');await staff.getByRole('button',{name:'فتح مساحة العمل',exact:true}).click();await staff.getByRole('heading',{name:'اختر مساحة عملك',exact:true}).waitFor();
 assert.equal(await staff.locator('.workspace-option').count(),2);assert.equal(await staff.getByRole('button',{name:'فتح القضايا',exact:true}).count(),0);
 const before=calls.length;await staff.getByRole('button',{name:'فتح التحصيل',exact:true}).click();await staff.getByRole('button',{name:'فتح الملف',exact:true}).waitFor();
 assert.equal(calls.slice(before).some(c=>c.name==='mawatheeq_local_request'&&c.action==='cases_page'),false);
 assert.equal(await staff.getByRole('button',{name:'ملف تحصيل جديد',exact:true}).count(),0);assert.equal(await staff.getByRole('button',{name:'تصدير القائمة',exact:true}).count(),0);
 await staff.getByRole('button',{name:'فتح الملف',exact:true}).click();assert.equal(await staff.getByLabel('العنوان',{exact:true}).isDisabled(),true);assert.equal(await staff.getByRole('button',{name:'تسجيل مراجعة المصدر',exact:true}).count(),0);assert.equal(await staff.getByRole('button',{name:'إنشاء صحيفة Word',exact:true}).count(),0);await staff.keyboard.press('Escape');
 await staff.getByRole('button',{name:'خروج',exact:true}).click();await staff.getByLabel('اسم المستخدم',{exact:true}).fill('dept_ui_reader');await staff.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');await staff.getByRole('button',{name:'فتح مساحة العمل',exact:true}).click();await staff.getByRole('heading',{name:'اختر مساحة عملك',exact:true}).waitFor();
 await staff.evaluate(()=>sessionStorage.setItem('mawatheeq.workspace.v1','legal'));await staff.reload();await staff.getByRole('heading',{name:'اختر مساحة عملك',exact:true}).waitFor();assert.equal(await staff.locator('.workspace-option').count(),2,'Forged workspace preference cannot grant legal access');
 await staff.getByRole('button',{name:'تغيير كلمة المرور',exact:true}).click();await staff.getByLabel('كلمة المرور الحالية',{exact:true}).fill('Unsaved-password-from-previous-user');
 const otherTab=await sc.newPage();await configurePage(otherTab);await otherTab.goto(base);
 await otherTab.evaluate(token=>localStorage.setItem('mawatheeq.local-session.v1',token),login.token);
 await staff.getByRole('heading',{name:'اختر مساحة عملك',exact:true}).waitFor();assert.equal(await staff.locator('.workspace-option').count(),5);
 await staff.getByRole('button',{name:'تغيير كلمة المرور',exact:true}).click();assert.equal(await staff.getByLabel('كلمة المرور الحالية',{exact:true}).inputValue(),'','Cross-tab session replacement clears old password inputs');
 assert.deepEqual(errors,[]);console.log('Passed workspace UI: chooser, session refresh/new login/cross-tab replacement, shared secretary task, reviewed claim/bundle Word downloads, precise ledger/void, employee/leave forms, department-only readonly access, responsive layouts and no runtime errors.');
}catch(e){await screen('failure');console.error(await page.locator('body').innerText());throw e}
finally{
 await browser.close();await db.close();
}
