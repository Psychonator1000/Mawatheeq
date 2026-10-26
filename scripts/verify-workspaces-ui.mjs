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
supportFilterSelects(page.locator('body'));
async function configurePage(page){
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/app-config.json',route=>route.fulfill({json:{supabaseUrl:'https://office-fixture.supabase.co',supabasePublishableKey:'sb_publishable_synthetic'}}));
await page.route('https://office-fixture.supabase.co/**',async route=>{
 const req=route.request();const url=new URL(req.url());
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
 const name=url.pathname.split('/').pop();const body=req.postDataJSON();calls.push({name,action:body?.p_action});
 if(!['mawatheeq_local_login','mawatheeq_local_request','mawatheeq_client_request','mawatheeq_office_request','mawatheeq_department_request','mawatheeq_books_request'].includes(name))return route.fulfill({status:400,json:{message:'Unexpected synthetic endpoint'}});
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
async function switchTo(name){await page.getByRole('button',{name:/^حساب /}).click();await click('تغيير مساحة العمل');await click('فتح '+name);}
async function pickToday(label){await page.getByRole('dialog').getByRole('button',{name:label,exact:true}).click();await page.locator('.date-popover').getByRole('button',{name:'اليوم',exact:true}).click();}
async function downloadWord(button,expected){
 const promise=page.waitForEvent('download');await click(button);const download=await promise;
 const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);
 const PizZip=(await import('pizzip')).default;const xml=new PizZip(Buffer.concat(chunks)).file('word/document.xml').asText();
 assert.ok(xml.includes(expected),'Word contains entered party data');assert.equal(xml.includes('{{'),false,'No unresolved template placeholders');
}
try{
 await page.goto(base);await page.getByLabel('اسم المستخدم',{exact:true}).fill('ui_owner');await page.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');await click('فتح مساحة العمل');
 await page.getByRole('heading',{name:'اختر مساحة عملك',exact:true}).waitFor();assert.equal(await page.locator('.workspace-option').count(),7,'Six workspaces and the owner-only «فريق المكتب» page');
 await screen('chooser-desktop');await page.setViewportSize({width:390,height:844});await screen('chooser-mobile');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);await page.setViewportSize({width:1440,height:1000});
 await enter('السكرتارية');await click('إضافة مهمة');await field('عنوان العمل','تنسيق موعد تجريبي');await click('حفظ العمل');await page.getByText('تنسيق موعد تجريبي',{exact:true}).first().waitFor();
 await screen('secretary-desktop');
 // The secretary's desk fits one screen: the page itself does not scroll, the lists scroll inside their panels.
 assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),true,'Secretary desk fits the screen');
 await page.locator('.sec-agenda').getByRole('button',{name:/تنسيق موعد تجريبي/}).click();await page.getByRole('heading',{name:'تنسيق موعد تجريبي'}).first().waitFor();await page.keyboard.press('Escape');
 await page.reload();await page.getByRole('heading',{name:'أجندة اليوم',exact:true}).waitFor();
 await switchTo('القضايا');await click('المهام والجلسات');await page.getByText('تنسيق موعد تجريبي',{exact:true}).waitFor();
 await switchTo('التحصيل');await click('ملف تحصيل جديد');await page.getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-0');
 for(const [label,value] of [['المدعي (الموكل)','شركة اختبار التحصيل'],['المدعى عليه','خصم اختبار التحصيل'],['الرقم المدني للمدعى عليه','200000000001'],['الجنسية','كويتي'],['العنوان','عنوان تجريبي'],['الهاتف','50000000'],['الرقم المدني للمدعي','SYN-1'],['السجل التجاري للمدعي','SYN-2'],['رقم العقد / الحساب','SYN-ACCOUNT'],['مبلغ المطالبة (د.ك)','125.125'],['رقم أمر الأداء','1/2026'],['محكمة أمر الأداء','محكمة تجريبية'],['رقم الدعوى','1'],['سنة الدعوى','2026'],['محكمة الجلسة','محكمة تجريبية'],['رقم الدائرة / القاعة','1'],['مرجع المصدر الذي تمت مطابقته','عقد تجريبي 1']])await field(label,value);
 await page.getByLabel('الدائرة',{exact:true}).selectOption({label:'تجاري كلي'});assert.equal(await page.getByLabel('رقم الدائرة / القاعة',{exact:true}).inputValue(),'1','The circuit number stays when the kind is picked after it');
 for(const label of ['تاريخ رفض أمر الأداء','تاريخ التكليف بالوفاء','تاريخ كشف الحساب','تاريخ الجلسة'])await pickToday(label);
 // The hearing day follows the hearing date (a choice, not typed).
 await page.waitForFunction(()=>/^(الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت)$/.test(document.querySelector('input[role=combobox][aria-label="يوم الجلسة"]')?.value||''));
 await page.getByRole('tab',{name:/^الحافظة والمستندات/}).click();await click('إضافة مستند للحافظة');await field('وصف المستند 1','عقد تجريبي تمت مراجعته');await click('حفظ ملف التحصيل');
 await page.getByRole('heading',{name:'مراجعة المصدر',exact:true}).waitFor();await page.getByText('لا يمكن الإنشاء بعد: سجّل «مراجعة المصدر» أعلاه أولاً.').first().waitFor();assert.equal(await page.getByRole('button',{name:'إنشاء صحيفة Word',exact:true}).isDisabled(),true);
 await page.getByRole('checkbox',{name:'راجعت البيانات الحالية وطابقتها مع المصدر المسجل.',exact:true}).check();await click('تسجيل مراجعة المصدر');
 await page.getByText(/راجع ui_owner هذه النسخة/).waitFor();
 await downloadWord('إنشاء صحيفة Word','شركة اختبار التحصيل');await downloadWord('إنشاء حافظة Word','عقد تجريبي تمت مراجعته');
 await screen('collections-review-desktop');
 // File statements (إفادات): a call that is not done yet becomes a due follow-up.
 await page.getByRole('tab',{name:/^إفادات الملف/}).click();await page.getByRole('combobox',{name:'إجراء التحصيل أو التنفيذ'}).click();await page.getByRole('option',{name:'اتصال بالخصم',exact:true}).click();
 await field('الإجراء (نص الإفادة)','لم يرد على الاتصال');await page.getByRole('radio',{name:'غير منجز',exact:true}).click();await click('إضافة الإفادة');
 await page.locator('.statements-table').getByText('لم يرد على الاتصال').waitFor();await screen('collections-statements-desktop');
 // Financial position: a payment lowers the remaining amount.
 await page.getByRole('tab',{name:/^الوضع المالي/}).click();await field('المبلغ (د.ك)','25.125');await click('إضافة دفعة');
 await page.locator('.position-tile').filter({hasText:'إجمالي المسدد'}).getByText('25.125').waitFor();await page.locator('.position-tile').filter({hasText:'الباقي'}).getByText('100.000').waitFor();await screen('collections-money-desktop');
 // Follow-up fields: changing the file status keeps the source review.
 await page.getByRole('tab',{name:/^بيانات الملف/}).click();await page.getByRole('combobox',{name:'حالة الملف'}).click();await page.getByRole('option',{name:'تحصيل ودي',exact:true}).click();await click('حفظ ملف التحصيل');
 await page.locator('[data-record-window]').getByText('تمت المراجعة',{exact:true}).first().waitFor();
 await click('إغلاق الملف');await page.locator('.sec-agenda').getByText('لم يرد على الاتصال').waitFor();await page.getByRole('button',{name:'المتابعات المستحقة (1)'}).click();await page.locator('.work-desk-body').getByText('لم يرد على الاتصال').waitFor();await click('ملفات التحصيل');
 await screen('collections-desktop');assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),true,'Collections desk fits the screen');
 await click('طباعة جماعية');await page.locator('.batch-table').getByText('جاهز',{exact:true}).waitFor();await click('الاثنان معاً');await click('تحديد كل الجاهز');
 {const files=[];const onDownload=d=>files.push(d);page.on('download',onDownload);await click('إنشاء ملف الطباعة (1)');for(let i=0;i<60&&files.length<2;i++)await page.waitForTimeout(250);page.off('download',onDownload);assert.equal(files.length,2,'batch print downloads one file per paper type');assert.deepEqual(files.map(d=>d.suggestedFilename().split('-2')[0]).sort(),['Mawatheeq-bundles','Mawatheeq-claims']);}
 await screen('collections-batch-desktop');await click('ملفات التحصيل');
 await switchTo('المحاسبة');await page.getByRole('heading',{name:'الدفاتر اليومية',exact:true}).waitFor();await click('دفتر الحركات');await click('قيد جديد');await page.getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-0');await field('المبلغ','125.125');await field('مرجع القيد / رقم الإيصال','SYN-FEE-UI');await field('الدافع / المستفيد','طرف تجريبي');await click('ترحيل القيد');await page.getByRole('cell',{name:/SYN-FEE-UI/}).waitFor();
 await click('قيد جديد');await page.getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-0');await page.getByLabel('نوع القيد',{exact:true}).selectOption('receipt');await field('المبلغ','25.025');await field('مرجع القيد / رقم الإيصال','SYN-RECEIPT-UI');await field('الدافع / المستفيد','طرف تجريبي');await click('ترحيل القيد');
 await page.getByText('100.100 KWD',{exact:true}).waitFor();await screen('accounting-desktop');
 await page.getByRole('row').filter({has:page.getByRole('cell',{name:/SYN-RECEIPT-UI/})}).getByRole('button',{name:'فتح القيد',exact:true}).click();assert.equal(await page.getByLabel('المبلغ',{exact:true}).isDisabled(),true);await field('سبب إلغاء القيد','تصحيح تجريبي');await click('تأكيد إلغاء القيد');await page.locator('.ledger-balance').getByText('125.125 KWD',{exact:true}).waitFor();

 // The double-entry books: a fee entry drafted, refused while unbalanced, balanced, posted with its number, then the reports.
 await click('الدفاتر المحاسبية');await page.getByRole('heading',{name:'الدفاتر اليومية',exact:true}).waitFor();await screen('books-dashboard');
 await click('قيد في MISC');const entry=page.getByRole('dialog');
 await entry.getByLabel('المرجع',{exact:true}).fill('SYN-BOOKS-1');await entry.getByLabel('القضية',{exact:true}).selectOption('ui-case-0');
 await entry.getByLabel('حساب السطر 1',{exact:true}).selectOption({label:'121000'});await entry.getByLabel('بيان السطر 1',{exact:true}).fill('أتعاب تجريبية');await entry.getByLabel('مدين السطر 1',{exact:true}).fill('250.750');
 await entry.getByLabel('حساب السطر 2',{exact:true}).selectOption({label:'401000'});await entry.getByLabel('دائن السطر 2',{exact:true}).fill('200');
 await entry.getByText(/القيد غير متوازن: الفرق 50\.750/).waitFor();assert.equal(await entry.getByRole('button',{name:'ترحيل',exact:true}).isDisabled(),true,'An unbalanced entry cannot be posted');
 await entry.getByLabel('دائن السطر 2',{exact:true}).fill('250.750');await entry.getByRole('button',{name:'ترحيل',exact:true}).click();
 await page.getByRole('dialog',{name:'MISC/'+new Date().getFullYear()+'/0001'}).waitFor();await screen('books-entry-posted');
 assert.equal(await page.getByRole('dialog').getByLabel('مدين السطر 1',{exact:true}).count(),0,'A posted entry is read-only');
 await page.getByRole('dialog').getByRole('button',{name:'إغلاق',exact:true}).last().click();
 await click('القيود اليومية');await page.getByRole('cell',{name:'SYN-BOOKS-1',exact:true}).waitFor();
 await click('ميزان المراجعة');await page.locator('.books-table').getByRole('button',{name:'121000 ذمم الموكلين المدينة',exact:true}).waitFor();
 await page.locator('.books-table tfoot').getByText('250.750').first().waitFor();await screen('books-trial-balance');
 await page.locator('.books-table').getByRole('button',{name:'121000 ذمم الموكلين المدينة',exact:true}).click();await page.locator('.books-group').getByText(/121000/).waitFor();
 await click('الأرباح والخسائر');await page.locator('.books-totals .net').getByText('250.750').waitFor();
 await click('الميزانية العمومية');await page.locator('.books-totals').getByText('الميزانية متوازنة',{exact:true}).waitFor();await screen('books-balance-sheet');
 await click('دليل الحسابات');await page.getByRole('cell',{name:'أتعاب المحاماة',exact:true}).waitFor();
 await click('حساب جديد');await page.getByRole('dialog').getByLabel('اسم الحساب',{exact:true}).fill('مصروفات تدريب تجريبية');await page.getByRole('dialog').getByRole('button',{name:'حفظ الحساب',exact:true}).click();await page.getByRole('cell',{name:'مصروفات تدريب تجريبية',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.getByLabel('صفحة المحاسبة',{exact:true}).selectOption('dashboard');await screen('books-mobile');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'Books fit a phone');await page.setViewportSize({width:1440,height:1000});
 // Invoicing: a customer added from the invoice, a service line with quantity and discount, confirmed, then paid in part.
 await click('فواتير الموكلين');await click('فاتورة موكل جديدة');const invoice=page.getByRole('dialog');
 await invoice.getByLabel('موكل جديد',{exact:true}).fill('عميل واجهة تجريبي');await invoice.getByRole('button',{name:'إضافة',exact:true}).click();await invoice.getByLabel('الموكل',{exact:true}).and(page.locator('[data-value]:not([data-value=""])')).waitFor();
 await invoice.getByLabel('خدمة السطر 1',{exact:true}).selectOption({label:'أتعاب محاماة'});await invoice.getByLabel('سعر السطر 1',{exact:true}).fill('120');await invoice.getByLabel('كمية السطر 1',{exact:true}).fill('2');await invoice.getByLabel('خصم السطر 1',{exact:true}).fill('10');
 await invoice.locator('tfoot').getByText('216.000').waitFor();await screen('invoice-draft');
 await invoice.getByRole('button',{name:'تأكيد',exact:true}).click();await page.getByRole('dialog',{name:'INV/'+new Date().getFullYear()+'/0001'}).waitFor();
 await page.getByRole('dialog').getByRole('button',{name:'تسجيل دفعة',exact:true}).click();await page.getByRole('dialog').getByLabel('المبلغ',{exact:true}).fill('100');
 await page.getByRole('dialog').getByText(/دفعة جزئية: يبقى 116\.000/).waitFor();await page.getByRole('dialog').getByRole('button',{name:'تسجيل الدفعة',exact:true}).click();
 await page.getByRole('dialog').getByText(/مدفوعة جزئياً/).first().waitFor();await page.getByRole('dialog').locator('.books-totals').getByText('116.000').waitFor();await screen('invoice-partly-paid');
 await page.getByRole('dialog').getByRole('button',{name:'إغلاق',exact:true}).last().click();
 await page.getByRole('row').filter({hasText:'عميل واجهة تجريبي'}).getByText('مدفوعة جزئياً').waitFor();
 await click('المقبوضات');await page.getByRole('cell',{name:'PBNK1/'+new Date().getFullYear()+'/0001'}).waitFor();
 await click('فواتير الموردين');await page.getByRole('button',{name:'فاتورة مورد جديدة',exact:true}).waitFor();
 await click('شروط الدفع');await page.getByRole('cell',{name:'30 يوماً',exact:true}).waitFor();await click('الخدمات');await page.getByRole('cell',{name:'أتعاب استشارة',exact:true}).waitFor();
 // Bank: a statement imported from the bank's file; the transfer pays what is left on the invoice, the charge goes to its account.
 {const t=new Date(),dmy=`${String(t.getDate()).padStart(2,'0')}/${String(t.getMonth()+1).padStart(2,'0')}/${t.getFullYear()}`;
  fs.writeFileSync(artifacts+'/statement.csv','﻿التاريخ,البيان,سحب,إيداع,الرصيد\n'+`${dmy},تحويل INV/${t.getFullYear()}/0001,,116,616\n${dmy},عمولة بنكية,1.5,,614.5\n`);}
 await click('كشوف الحساب');await click('استيراد كشف من ملف');await page.getByLabel('ملف كشف البنك').setInputFiles(artifacts+'/statement.csv');
 await page.getByRole('dialog').getByText(/2 حركة/).waitFor();await screen('bank-import');await page.getByRole('dialog').getByRole('button',{name:'استيراد',exact:true}).click();
 const stmt=page.getByRole('dialog');await stmt.getByText(/مطابقة: تحويل INV/).waitFor();await stmt.locator('.books-suggest input:checked').waitFor();
 await stmt.getByRole('button',{name:'تأكيد المطابقة',exact:true}).click();await stmt.getByText(/مطابقة: عمولة بنكية/).waitFor();
 await stmt.getByRole('button',{name:'حساب مباشر',exact:true}).click();await stmt.getByLabel('الحساب المقابل',{exact:true}).selectOption({label:'509000'});await stmt.getByRole('button',{name:'تأكيد المطابقة',exact:true}).click();
 await stmt.getByRole('button',{name:/^فك مطابقة عمولة/}).waitFor();await screen('bank-reconciled');await stmt.getByRole('button',{name:'إغلاق',exact:true}).last().click();
 await page.locator('.books-pick').first().getByText(/حركة للمطابقة/).waitFor({state:'detached'});
 await click('فواتير الموكلين');await page.getByRole('row').filter({hasText:'عميل واجهة تجريبي'}).getByText('مدفوعة',{exact:true}).waitFor();
 // Reports: summary, partner ledger, aged balances, cash flow, a comparison with last year and an Excel export.
 await click('الملخص التنفيذي');await page.locator('.books-kpis').getByText('صافي الربح',{exact:true}).waitFor();await screen('books-summary');
 await click('دفتر الشركاء');await page.getByRole('button',{name:'عميل واجهة تجريبي',exact:true}).click();await page.locator('.books-table').getByRole('button',{name:'INV/'+new Date().getFullYear()+'/0001'}).waitFor();
 await click('أعمار ديون الموكلين');await page.getByRole('row').filter({hasText:'بلا شريك'}).getByText('250.750').first().waitFor();
 await click('التدفقات النقدية');await page.locator('.books-totals').getByText('النقد آخر الفترة',{exact:true}).waitFor();
 await click('الأرباح والخسائر');await page.getByLabel('مقارنة',{exact:true}).selectOption({label:'الفترة نفسها من العام السابق'});await page.locator('.books-statement thead').getByText('المقارنة',{exact:true}).first().waitFor();await screen('books-pl-compare');
 {const dl=page.waitForEvent('download');await click('Excel');assert.match((await dl).suggestedFilename(),/^Mawatheeq-pl\.xlsx$/);}
 // Advanced: taxes switched on and used on an invoice, a fixed asset depreciated, the tax report and the year-end checklist.
 await click('الضرائب');await page.getByRole('checkbox',{name:/تفعيل الضرائب/}).click();await page.getByText(/فُعّلت الضرائب/).first().waitFor();await page.getByText('(مفعّلة)',{exact:false}).waitFor();
 await click('فواتير الموكلين');await click('فاتورة موكل جديدة');{const v=page.getByRole('dialog');await v.getByLabel('الموكل',{exact:true}).selectOption({label:'عميل واجهة تجريبي'});
  await v.getByLabel('خدمة السطر 1',{exact:true}).selectOption({label:'أتعاب استشارة'});await v.getByLabel('سعر السطر 1',{exact:true}).fill('100');await v.getByLabel('ضريبة السطر 1',{exact:true}).selectOption({label:'ضريبة مبيعات 5٪'});
  await v.locator('tfoot').getByText('105.000').waitFor();await screen('invoice-tax');await v.getByRole('button',{name:'تأكيد',exact:true}).click();
  await page.getByRole('dialog',{name:'INV/'+new Date().getFullYear()+'/0002'}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'إغلاق',exact:true}).last().click();}
 await click('الأصول الثابتة');await click('أصل جديد');{const v=page.getByRole('dialog');await v.getByLabel('الاسم',{exact:true}).fill('حاسوب تجريبي');await v.getByLabel('قيمة الشراء',{exact:true}).fill('1200');
  await v.getByLabel('عدد الأشهر',{exact:true}).fill('12');await v.getByText(/قسط شهري تقريباً/).waitFor();await v.getByRole('button',{name:'حفظ الجدول',exact:true}).click();}
 {const v=page.getByRole('dialog',{name:'حاسوب تجريبي'});await v.getByRole('button',{name:'تأكيد وبدء',exact:true}).click();await v.getByRole('button',{name:'ترحيل المستحق',exact:true}).click();await v.getByRole('button',{name:/^MISC\//}).first().waitFor();await screen('asset');
  await v.getByRole('button',{name:'إغلاق',exact:true}).last().click();}
 await click('إقفال السنة');await page.locator('.books-checklist').waitFor();
 await click('تقرير الضريبة');await page.getByRole('cell',{name:'ضريبة مبيعات 5٪',exact:true}).waitFor();await page.locator('.books-totals').getByText('ضريبة المخرجات').waitFor();
 // Money handled outside the office: a court fee for a case, posted, its original receipt moved to the archive, then billed to the client.
 await click('لوحة المحاسبة');await page.locator('.books-chart svg.books-bars').waitFor();
 await click('المعاملات الخارجية');await click('معاملة جديدة');{const v=page.getByRole('dialog');await v.getByLabel('نوع المعاملة',{exact:true}).selectOption({label:'رسوم قيد دعوى'});
  await v.getByLabel('القضية',{exact:true}).selectOption('ui-case-2');await v.getByLabel('المبلغ',{exact:true}).fill('12.500');await v.getByLabel('المستند',{exact:true}).selectOption({label:'إيصال رسوم'});
  await v.getByLabel('رقم الإيصال / المرجع',{exact:true}).fill('R-77');await v.getByLabel('أين الأصل الآن',{exact:true}).selectOption('staff');await v.getByLabel('مع من / لدى أي جهة',{exact:true}).fill('مندوب تجريبي');
  await v.getByRole('button',{name:'حفظ',exact:true}).click();}
 {const v=page.getByRole('dialog',{name:'رسوم قيد دعوى'});await v.getByRole('button',{name:'ترحيل إلى الدفاتر',exact:true}).click();await v.getByText(/^مرحّلة/).waitFor();
  await v.getByRole('button',{name:'نقل الأصل',exact:true}).click();await v.getByLabel('إلى',{exact:true}).selectOption('archive');await v.getByLabel('رقم ملف الأرشيف',{exact:true}).fill('ARC-9');await v.getByRole('button',{name:'تسجيل',exact:true}).click();
  await v.locator('.books-custody li').nth(1).waitFor();await screen('outside-transaction');await v.getByRole('button',{name:'إغلاق',exact:true}).last().click();}
 await page.locator('.books-table').getByText('ARC-9').waitFor();await page.getByLabel('تحديد رسوم قيد دعوى R-77',{exact:true}).check();await click('مطالبة الموكل (1)');
 await page.getByRole('dialog').locator('.books-invoice-lines').waitFor();await screen('outside-billed');await page.getByRole('dialog').getByRole('button',{name:'إغلاق',exact:true}).last().click();
 // Controls: approval requests, a client credit limit, the payment run, closing and reopening a month, the change log and the approval rules.
 await click('طلبات الاعتماد');await page.getByText('لا طلبات بانتظار الاعتماد').waitFor();
 await click('حدود الائتمان');await click('إضافة حد ائتمان');{const v=page.getByRole('dialog');await v.getByLabel('الموكل',{exact:true}).selectOption({label:'عميل واجهة تجريبي'});
  await v.getByLabel('الحد (د.ك)',{exact:true}).fill('50');await v.getByRole('checkbox',{name:/منع الفواتير/}).check();await v.getByRole('button',{name:'حفظ',exact:true}).click();}
 await page.getByText('حُفظ حد الائتمان').first().waitFor();await page.getByRole('row').filter({hasText:'عميل واجهة تجريبي'}).getByText('موقوف عند التجاوز').waitFor();
 await click('دفعة الموردين');await page.getByText(/لا شيء مستحق حتى هذا التاريخ|^دفع \d+ مستند/).first().waitFor();
 {const year=new Date().getFullYear();await click('الفترات الشهرية');const jan=page.getByRole('row').filter({hasText:'يناير '+year});
  await jan.getByRole('button',{name:'إقفال',exact:true}).click();await jan.getByText('مقفل',{exact:true}).waitFor();await screen('books-periods');
  await jan.getByRole('button',{name:'إعادة فتح',exact:true}).click();await jan.getByText('مفتوح',{exact:true}).waitFor();}
 await click('سجل التغييرات');await page.getByRole('row').filter({hasText:'إعادة فتح شهر'}).first().waitFor();
 await page.getByRole('row').filter({hasText:'حد ائتمان'}).getByRole('button',{name:'قبل وبعد',exact:true}).first().click();
 {const v=page.getByRole('dialog');await v.getByRole('columnheader',{name:'قبل',exact:true}).waitFor();await screen('books-change');await v.getByRole('button',{name:'إغلاق',exact:true}).last().click();}
 await click('صلاحيات الاعتماد');await page.getByRole('checkbox',{name:/تفعيل الاعتماد/}).waitFor();await screen('books-approval-rules');
 await switchTo('الموارد البشرية');await page.getByText('@ui_owner',{exact:true}).waitFor();await click('موظف جديد');await field('الرقم الوظيفي','EMP-UI-1');await field('اسم الموظف','موظف واجهة تجريبي');await field('المسمى الوظيفي','مساعد');await field('القسم','السكرتارية');await pickToday('تاريخ الانضمام');await click('حفظ سجل الموارد البشرية');await page.locator('.people-table').getByText('موظف واجهة تجريبي',{exact:true}).waitFor();
 await screen('hr-desktop');await click('الإجازات');await click('طلب إجازة جديد');
 const people=await dept('hr','records_page');await page.getByLabel('الموظف',{exact:true}).selectOption(people.find(r=>r.kind==='employee').id);await page.getByLabel('قرار الإجازة',{exact:true}).selectOption('approved');await field('ملاحظة القرار / السبب','موافقة تجريبية');await click('حفظ سجل الموارد البشرية');await page.getByRole('cell',{name:'معتمدة',exact:true}).waitFor();
 // Archive: a location, a paper file with its number, hand-out with a printed receipt, return, label, barcode lookup and stocktake.
 await switchTo('الأرشيف');await page.getByRole('heading',{name:'الأرشيف',exact:true}).waitFor();
 await page.evaluate(()=>{window.__printed='';window.__mawatheeqPrint=h=>{window.__printed+=h}});const printed=async()=>{const h=await page.evaluate(()=>window.__printed);await page.evaluate(()=>{window.__printed=''});return h};
 await page.getByRole('button',{name:/^خريطة الحفظ/}).click();await click('مكان حفظ جديد');await field('رمز المكان','a-1');await field('الغرفة','غرفة الأرشيف');await field('السعة (عدد الملفات)','40');await click('حفظ المكان');await page.getByRole('heading',{name:'غرفة الأرشيف',exact:true}).waitFor();
 await page.getByRole('button',{name:/^الملفات/}).click();await click('ملف ورقي جديد');
 assert.equal(await page.getByRole('dialog').getByLabel('رقم الأرشيف',{exact:true}).inputValue(),'ARC-00001','The next archive number is suggested');
 await page.getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-1');await page.getByLabel('موقع الحفظ',{exact:true}).selectOption({label:'A-1 · غرفة الأرشيف'});await page.getByRole('dialog').getByText('يحتوي على مستندات أصلية').click();
 await click('حفظ بيانات الملف');await page.getByRole('tab',{name:/^العهدة والحركة/}).click();
 await click('تسليم لموظف');await page.getByRole('dialog').getByLabel('الموظف المستلم',{exact:true}).selectOption({label:'ui_owner'});await page.getByRole('dialog').getByLabel('الغرض',{exact:true}).selectOption('حضور جلسة');await click('تسجيل الحركة');await page.locator('.custody-now.staff').waitFor();
 await page.getByRole('button',{name:/طباعة إيصال التسليم/}).click();let html=await printed();assert.ok(html.includes('إيصال تسليم ملف من الأرشيف')&&html.includes('ARC-00001')&&html.includes('حضور جلسة'),'Handover receipt prints');
 await click('إعادة للأرشيف');await page.getByRole('dialog',{name:/^استلام الملف ARC-00001/}).getByRole('button',{name:'عاد كاملاً'}).click();await page.locator('.custody-now.in').waitFor();
 await click('ملصق الملف');html=await printed();assert.ok(html.includes('<svg')&&html.includes('ARC-00001')&&html.includes('A-1'),'Label prints with a barcode and location');
 await screen('archive-file');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 await page.getByLabel('مسح الباركود أو كتابة رقم الأرشيف',{exact:true}).fill('arc-00001');await page.keyboard.press('Enter');await page.getByRole('dialog').getByText('ARC-00001').first().waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 await page.getByRole('button',{name:/^خريطة الحفظ/}).click();await page.getByRole('button',{name:/^A-1 ·/}).click();await page.getByRole('button',{name:/^جرد$/}).click();await click('تحديد الكل');await click('تسجيل الجرد (1)');await page.getByRole('dialog').waitFor({state:'detached'});
 // A whole cabinet at once, a file placed in a drawer by scanning it, and the search lighting up where it is.
 await click('خزانة جديدة بأدراجها');await field('اسم الخزانة أو رقمها','B');await field('عدد الأدراج أو الرفوف','2');await click('إضافة الخزانة (2)');await page.getByRole('dialog').waitFor({state:'detached'});
 // Cabinets are arranged by dragging their top: the last one dropped on the top half of the first goes above it.
 {const names=()=>page.locator('.map-cabinet-name').allInnerTexts();const before=await names();assert.ok(before.length>=2);
  const a=await page.locator('.map-cabinet-name').last().boundingBox(),b=await page.locator('.map-cabinet').first().boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2+15,a.y+a.height/2+8,{steps:3});await page.locator('.cab-card').waitFor();
  await page.mouse.move(b.x+b.width/2,b.y+14,{steps:8});await page.locator('.map-cabinet.cab-above').waitFor();await page.mouse.up();
  await page.getByText(/رُتّبت/).first().waitFor();assert.equal((await names())[0],before.at(-1),'The dragged cabinet now comes first');}
 await page.getByRole('button',{name:/^B-2 · درج 2/}).click();await page.getByLabel('ضع ملفاً في هذا المكان',{exact:true}).fill('ARC-00001');await page.keyboard.press('Enter');await page.locator('.map-files').getByText('ARC-00001').waitFor();
 await page.getByLabel('ابحث عن مكان ملف',{exact:true}).fill('00001');await page.locator('.map-hits').getByRole('button').first().click();await page.locator('.map-found').getByText(/خزانة B ← درج 2/).waitFor();await page.locator('.map-slot.lit').waitFor();await screen('archive-map');
 await page.getByRole('button',{name:'نقل ARC-00001',exact:true}).click();await page.getByLabel('نقل ARC-00001 إلى',{exact:true}).selectOption({label:'غرفة الأرشيف · خزانة B · درج 1'});await page.getByText(/نُقل ARC-00001 إلى درج 1/).first().waitFor();
 // Dragging it back: the row leaves the list as a card that follows the pointer, and drops into the drawer under it.
 await page.getByRole('button',{name:/^B-1 · درج 1/}).click();const row=page.locator('.map-files li.grabbable',{hasText:'ARC-00001'});await row.waitFor();
 {const a=await row.boundingBox(),b=await page.getByRole('button',{name:/^B-2 · درج 2/}).boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  await page.mouse.move(a.x+a.width/2+20,a.y+a.height/2+10,{steps:3});await page.locator('.drag-card').waitFor();assert.ok(await row.evaluate(e=>e.classList.contains('dragging')),'the picked-up row should leave the list');
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.locator('.drag-card.aimed').waitFor();await page.mouse.up();}
 await page.getByText(/نُقل ARC-00001 إلى درج 2/).first().waitFor();await page.locator('.drag-card').waitFor({state:'detached'});
 // A cabinet is renamed in place, and removed when replaced: its files are taken off their places to be put in the new one.
 await page.getByRole('button',{name:'تسمية خزانة B',exact:true}).click();await page.getByLabel('اسم الخزانة',{exact:true}).fill('C');await page.keyboard.press('Enter');
 await page.getByText(/سُمّيت الخزانة «C»/).first().waitFor();await page.locator('.map-cabinet-name').getByText('خزانة C',{exact:true}).waitFor();
 await page.getByRole('button',{name:'إزالة خزانة C',exact:true}).click();{const dlg=page.getByRole('dialog',{name:'إزالة خزانة C'});
  await dlg.getByLabel('تُرفع من أماكنها وأضعها في الخزانة الجديدة لاحقاً بمسحها').check();await dlg.getByRole('button',{name:'رفع الملفات وإزالة الخزانة'}).click();await dlg.waitFor({state:'detached'});}
 await page.getByText(/أُزيلت خزانة C/).first().waitFor();await page.locator('.map-cabinet-name').getByText('خزانة C',{exact:true}).waitFor({state:'detached'});
 await page.locator('.notice').getByText(/ملف بلا مكان حفظ/).waitFor();
 const archiveRows=await dept('archive','records_page');assert.deepEqual(archiveRows.filter(r=>r.kind==='movement').map(r=>r.payload.type).sort(),['audit','checkout','move','move','move','move','return']);
 await page.getByRole('button',{name:/^سجل الحركة/}).click();await page.getByRole('cell',{name:'جرد وتأكيد الوجود',exact:true}).waitFor();await screen('archive-desktop');
 // The owner clears a range of the log; what the files' custody stands on stays, and the clearing is noted for everyone.
 await click('مسح السجل');{const dlg=page.getByRole('dialog',{name:'مسح سجل الحركة'});await dlg.getByRole('button',{name:'إلى تاريخ',exact:true}).click();await page.getByRole('button',{name:'اليوم',exact:true}).click();
  await dlg.getByLabel('أفهم أن الحركات الممسوحة لا تعود',{exact:true}).check();await dlg.getByRole('button',{name:/^مسح حركات/}).click();await dlg.waitFor({state:'detached'});}
 await page.locator('.log-cleared').getByText(/مُسحت حركات/).waitFor();
 assert.ok((await dept('archive','records_page')).filter(r=>r.kind==='movement').length>=1,'The movements the files stand on remain');
 // A file moved to «حفظ» leaves the active list and is found there; taking it out brings it back.
 await page.getByLabel('مسح الباركود أو كتابة رقم الأرشيف',{exact:true}).fill('ARC-00001');await page.keyboard.press('Enter');await click('نقل إلى الحفظ (إتلاف أو انتهاء المدة)');await page.getByText(/نُقل الملف إلى «الحفظ»/).first().waitFor();
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});await page.getByRole('button',{name:/^حفظ\s*1$/}).click();
 await page.locator('.archive-table').getByText('ARC-00001').click();await click('إخراج من الحفظ');await page.getByText('أُخرج الملف من الحفظ').first().waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 // The handover sheet: the file goes out, its recipient confirms receipt from the header and reports the return, and the archive confirms it is back.
 await page.getByRole('button',{name:/^كشف التسليم/}).click();await page.getByLabel('رقم الأرشيف أو كود القضية',{exact:true}).fill('arc-00001');await page.keyboard.press('Enter');
 await page.getByLabel('مستلم ARC-00001',{exact:true}).selectOption({label:'ui_owner'});await page.getByLabel('غرض ARC-00001',{exact:true}).fill('حضور جلسة');
 // By recipient: the file sits under its person, and each person can get a page of their own to sign.
 await page.getByRole('button',{name:/^حسب المستلم/}).click();await page.locator('.dispatch-group').getByText('ui_owner · 1 ملف').waitFor();
 await page.getByLabel('طريقة الطباعة',{exact:true}).selectOption({label:'صفحة لكل مستلم'});await page.getByRole('button',{name:'معاينة الكشف'}).click();
 {const sheet=await printed();assert.ok(sheet.includes('المستلم: ui_owner')&&sheet.includes('توقيع المستلم')&&sheet.includes('ARC-00001'),'Each recipient gets a sheet to sign');}
 await page.getByRole('button',{name:/^كل الملفات/}).click();
 await page.getByRole('button',{name:/^إرسال وإشعار المستلمين \(1\)/}).click();await page.getByText(/أُرسل كشف/).waitFor();
 await page.getByRole('button',{name:'طباعة الكشف للتوقيع'}).click();html=await printed();assert.ok(html.includes('كشف تسليم ملفات من الأرشيف')&&html.includes('ARC-00001')&&html.includes('توقيع المستلم'),'The handover sheet prints for signatures');
 await page.getByRole('button',{name:/^العهدة/}).click();await page.getByText('بانتظار تأكيد الاستلام').first().waitFor();
 await page.getByRole('button',{name:/^ملفاتي الورقية: 1 بانتظار تأكيد استلامك/}).click();const mine=page.getByRole('dialog',{name:'ملفاتي الورقية'});
 await mine.getByRole('button',{name:'استلمت',exact:true}).click();await mine.getByRole('button',{name:'أرجعت الملف'}).click();await mine.getByText('بانتظار تأكيد الأرشيف').waitFor();await screen('paper-files');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/^العهدة/}).click();await page.getByText('أبلغ بإرجاعه · بانتظار تأكيدك').first().waitFor();
 await page.locator('.office-table').getByRole('button',{name:'عاد الملف'}).click();
 // The return check: a reported return can be rejected, then the file comes back short and the gap stays on record.
 {const check=page.getByRole('dialog',{name:/^استلام الملف ARC-00001/});await check.getByRole('button',{name:'لم يصل الملف'}).click();await check.getByLabel('سبب رفض الإرجاع',{exact:true}).fill('لم يُسلَّم في المكتب');await check.getByRole('button',{name:'تأكيد الرفض'}).click();await check.waitFor({state:'detached'});}
 await page.getByRole('button',{name:/^ملفاتي الورقية/}).click();await page.getByRole('dialog',{name:'ملفاتي الورقية'}).getByRole('button',{name:'أرجعت الملف'}).click();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/^العهدة/}).click();await page.getByText('أبلغ بإرجاعه · بانتظار تأكيدك').first().waitFor();await page.locator('.office-table').getByRole('button',{name:'عاد الملف'}).click();
 {const check=page.getByRole('dialog',{name:/^استلام الملف ARC-00001/});await check.getByLabel('ناقص غير ما سبق',{exact:true}).fill('صورة الحكم');await check.getByRole('button',{name:'عاد ناقصاً'}).click();await check.waitFor({state:'detached'});}
 await page.getByRole('button',{name:/^الملفات/}).click();await page.getByRole('button',{name:/^نواقص مفتوحة/}).click();await page.locator('.archive-table').getByText('ناقص',{exact:true}).waitFor();await page.getByRole('button',{name:/^كل الملفات/}).click();
 await page.getByRole('button',{name:/^ملفاتي الورقية/}).waitFor({state:'detached'});
 // Every case gets a paper file: the cases without one are offered in one step, numbered from their office code.
 await page.getByRole('button',{name:/^الملفات/}).click();await page.locator('.archive-missing').getByText('24').waitFor();await click('إنشاء ملفاتها');
 await page.getByText('أُنشئ 24 ملف ورقي').waitFor({timeout:30000});await page.locator('.archive-missing').waitFor({state:'detached'});
 const papers=(await dept('archive','records_page')).filter(r=>r.kind==='file');assert.equal(papers.length,25,'One paper file per case');assert.ok(papers.some(r=>r.payload.number==='ARC-TEST-0'&&r.caseId==='ui-case-0'),'Numbered from the office code');
 // import (synthetic): files without a case, an automatic link by court number, then manual links from the file and from the case.
 await rpc('mawatheeq_local_request',[login.token,'save_case',JSON.stringify({case:{id:'ui-case-auto',code:'AUTO-1',autoNumber:'260000001',client:'شركة اختبار الواجهة',clientGroup:'شركة اختبار الواجهة',opponent:'خصم آلي',date:'2026-09-01',type:'حكم أول درجة',outcome:'لصالحنا',procedures:[],revision:0}})]);
 await db.exec('reset role');
 const uiClient=(await db.query(`insert into mawatheeq_private.client_entities(payload) values('{"name":"شركة تجريبية للاتصالات","kind":"organization","sector":"telecom","aliases":[],"contacts":[],"notes":"","needsReview":false}') returning id::text`)).rows[0].id;
 await db.exec("update mawatheeq_private.client_entities set payload=payload||jsonb_build_object('id',id::text) where payload->>'id' is null;set role anon");
 {const X=require(require.resolve('xlsx',{paths:[process.cwd()]}));const w=X.utils.book_new();
  const head=['إسم الموكل','رقم الملف','إسم الخصم','حالة الملف','سبب المديونية','قيمة المطالبة','رقم العقد','الرقم الآلى - ملف','ترقيم 1','ترقيم 4','تاريخ الورود','رقم الهوية - الخصم','عنوان المنزل - الخصم','ملاحظات 1','ملاحظات 2','الجنسية - الخصم','الوظيفة - الخصم','المنطقة','القطعة','إجمالى المدفوعات','إجمالى المصروفات'];
  X.utils.book_append_sheet(w,X.utils.aoa_to_sheet([head,['شركة تجريبية','W-1','SYNTHETIC ONE','سوفت','50000001',120.5,'C-1','260000001','بدون','0','03/10/2026','290010100126','','فارغ','','TESTLAND','خارج البلاد','','',20,0],
   ['شركة تجريبية','W-2','SYNTHETIC TWO','تحت الرفع','50000002',75,'C-2','هولد','SA','','03/10/2026','200000000002','','','','','','','',0,0],
   ['شركة تجريبية','W-3','SYNTHETIC TWO','سكت','50000003',40,'C-3','','بدون','','03/10/2026','200000000002','','','','','','','',0,0]]),'Files');
  await switchTo('التحصيل');
  await page.getByLabel('ملف Excel للتحصيل',{exact:true}).setInputFiles({name:'collections.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(X.write(w,{type:'array',bookType:'xlsx'}))});
  const dlg=page.getByRole('dialog');const stat=async label=>dlg.locator('.import-summary>div').filter({hasText:label}).locator('b').innerText();
  await dlg.getByText('SYNTHETIC TWO').first().waitFor();assert.equal(await stat('ملف جديد'),'3');assert.equal(await stat('بالرقم الآلي لأمر الأداء'),'1');
  await screen('collection-import');await dlg.getByRole('button',{name:'استيراد 3 ملف'}).click();await dlg.waitFor({state:'detached'});
  let recs=await dept('collections','records_page');const byCode=c=>recs.find(r=>r.kind==='file'&&r.payload.code===c);
  assert.equal(byCode('W-1').caseId,'','A file is not linked to a case by number: the order\'s automatic number is not the case\'s');assert.equal(byCode('W-1').payload.fileAutoNumber,'260000001');assert.equal(byCode('W-1').payload.orderAuto||'','');assert.equal(byCode('W-2').caseId,'');assert.equal(byCode('W-2').payload.customerId,'50000002');assert.equal(byCode('W-2').payload.fileStatus,'تحت الرفع');
  assert.ok(recs.some(r=>r.kind==='payment'&&r.subjectId===byCode('W-1').id&&r.payload.amount==='20'),'Paid total carried over');
  // Data checks: civil IDs failing the check digit, debtors with several files, files without a phone.
  const cards=async()=>(await page.locator('.collection-row .collection-code').allInnerTexts()).filter(c=>c.startsWith('W-')).sort();
  if(!await page.getByLabel('تدقيق البيانات',{exact:true}).count())await page.getByRole('button',{name:/^تصفية إضافية/}).click();const check=page.getByLabel('تدقيق البيانات',{exact:true});
  await check.selectOption('badcivil');await page.waitForTimeout(150);assert.deepEqual(await cards(),['W-2','W-3'],'Civil IDs failing the check digit are flagged');
  await page.locator('.collection-row').filter({hasText:'W-2'}).getByText('رقم مدني؟').waitFor();
  await check.selectOption('shared');await page.waitForTimeout(150);assert.deepEqual(await cards(),['W-2','W-3'],'Files of the same debtor');
  await page.locator('.collection-row').filter({hasText:'W-2'}).getByText('2 ملفات للخصم').waitFor();
  await check.selectOption('nophone');await page.waitForTimeout(150);assert.ok((await cards()).includes('W-1'));
  await check.selectOption('');
  // Select every result, share the files in turn between two people and link them to the client profile.
  await page.getByRole('checkbox',{name:/^تحديد كل النتائج/}).check();
  const pickedCount=Number((await page.locator('.pick-bar b').innerText()).match(/\d+/)[0]);
  await page.getByLabel('توزيع على موظف أو أكثر (افصل بـ ،)',{exact:true}).fill('علي، منى');
  await page.getByLabel('ربط بملف الموكل',{exact:true}).selectOption({label:'شركة تجريبية للاتصالات'});
  await page.locator('.pick-bar').getByText(/بالتناوب على 2 موظفين/).waitFor();await screen('collection-distribute');
  await page.getByRole('button',{name:'تطبيق على المحدد'}).click();await page.getByText(`حُدّث ${pickedCount} ملف`).first().waitFor();
  recs=await dept('collections','records_page');const shared=recs.filter(r=>r.kind==='file'&&!r.archived);
  assert.equal(shared.filter(r=>r.payload.assignedTo==='علي').length,Math.ceil(pickedCount/2),'Round-robin first person');
  assert.equal(shared.filter(r=>r.payload.assignedTo==='منى').length,Math.floor(pickedCount/2),'Round-robin second person');
  assert.ok(shared.every(r=>r.payload.clientEntityId===uiClient),'Bulk client link');
  // In the file: the other file of the same debtor and the civil ID warning.
  await page.locator('.collection-row').filter({hasText:'W-3'}).getByRole('button',{name:'فتح الملف'}).click();
  await page.getByRole('tab',{name:/^الأطراف والمطالبة/}).click();await page.getByText('ملفات أخرى لنفس الخصم (1)').waitFor();
  await page.getByText(/لا يطابق رقم التحقق/).waitFor();assert.equal(await page.getByLabel('الموكل في سجل الموكلين',{exact:true}).inputValue(),uiClient);
  await screen('collection-debtor');
  // Several parties: a second defendant is added, saved, counted in the title and kept with the file.
  await page.getByRole('button',{name:'إضافة مدعى عليه'}).click();const extra=page.locator('.extra-party').first();
  await extra.getByLabel('الاسم 2',{exact:true}).fill('SYNTHETIC THREE');await extra.getByLabel('الرقم المدني',{exact:true}).fill('280010100002');
  await page.getByRole('button',{name:'حفظ ملف التحصيل'}).click();await page.getByText('حُفظ ملف التحصيل').first().waitFor();
  await page.locator('[data-record-window] .case-pin').getByText(/SYNTHETIC TWO وآخر/).waitFor();await screen('collection-parties');
  recs=await dept('collections','records_page');assert.deepEqual(byCode('W-3').payload.defendants.map(x=>[x.name,x.civilId]),[['SYNTHETIC THREE','280010100002']],'The second defendant is saved');
  assert.equal(await page.getByText('المدعي (الموكل)',{exact:true}).count()>0,true,'The plaintiff is not assumed to be a company');
  // «إنشاء قضية من الملف»: blocked with a reason while edits are unsaved; asks for the office code (a file number is not a case code), refuses a taken code, then opens the case and links the file.
  const makeCase=page.getByRole('button',{name:'إنشاء قضية من الملف'});await page.getByLabel('العنوان',{exact:true}).fill('عنوان مؤقت');
  assert.equal(await makeCase.isDisabled(),true);await screen('make-case-blocked');await page.locator('.make-case-needs').getByText('احفظ تعديلات الملف أولاً').waitFor();
  await page.getByLabel('العنوان',{exact:true}).fill((byCode('W-3').payload.address)||'');await page.waitForFunction(()=>!document.querySelector('.make-case')?.disabled);
  await makeCase.click();const mk=page.getByRole('dialog',{name:'إنشاء قضية من ملف التحصيل'});
  assert.equal(await mk.getByRole('button',{name:'إنشاء القضية وربط الملف'}).isDisabled(),true);await mk.getByLabel('كود المكتب للقضية',{exact:true}).fill('TEST-0');await mk.getByText('هذا الكود لقضية موجودة؛').waitFor();
  // A code (or automatic number) that belongs to a case shows that case and the files already linked to it, and offers to link to it instead.
  const existing=mk.locator('.existing-case');await existing.getByText(/كود TEST-0 · الرقم الآلي 1000/).waitFor();await existing.getByText(/ملفات التحصيل المرتبطة بها \(\d+\)/).waitFor();
  assert.ok(await existing.getByRole('button',{name:'ربط هذا الملف بهذه القضية بدلاً من إنشاء قضية'}).isVisible());await screen('make-case-existing');
  await mk.getByLabel('كود المكتب للقضية',{exact:true}).fill('');await mk.getByLabel('الرقم الآلي للقضية (بوابة العدل)',{exact:true}).fill('1000');
  await mk.getByText('هذا الرقم الآلي لقضية موجودة؛').waitFor();await existing.getByText(/^هذا الرقم الآلي لقضية موجودة/).waitFor();await mk.getByLabel('الرقم الآلي للقضية (بوابة العدل)',{exact:true}).fill('');
  await mk.getByLabel('كود المكتب للقضية',{exact:true}).fill('W-3');await mk.getByText('هذا رقم ملف التحصيل').waitFor();
  assert.equal(await mk.getByLabel('الرقم الآلي للقضية (بوابة العدل)',{exact:true}).inputValue(),'','The case automatic number is not taken from the file');
  await mk.getByLabel('كود المكتب للقضية',{exact:true}).fill('COL-W3');await screen('make-case');await mk.getByRole('button',{name:'إنشاء القضية وربط الملف'}).click();
  await page.getByText(/أُنشئت القضية COL-W3 ورُبط بها الملف/).first().waitFor();await page.locator('.case-link').getByText(/COL-W3/).waitFor();
  assert.equal(await makeCase.count(),0,'The button leaves once the file has a case');
  recs=await dept('collections','records_page');const made=(await rpc('mawatheeq_local_request',[login.token,'cases_page',JSON.stringify({offset:0})])).find(c=>c.payload?.code==='COL-W3'||c.code==='COL-W3');
  assert.ok(made,'The case is in the cases register');assert.equal(byCode('W-3').caseId,made.id,'The file is linked to the new case');
  const mp=made.payload||made;assert.equal(mp.opponent,byCode('W-3').payload.defendant+' وSYNTHETIC THREE','The case names every defendant');assert.equal(mp.clientEntityId,uiClient);assert.equal(mp.workflow||'','','A filed case, not a study');
  await page.keyboard.press('Escape');
  await dept('collections','link_case',{id:byCode('W-3').id,revision:byCode('W-3').revision,caseId:'ui-case-0'}); // the steps below move W-3 to another case from that case
  await page.locator('.collection-row').filter({hasText:'W-2'}).getByRole('button',{name:'فتح الملف'}).click();
  // The side panel's «ربط بقضية» opens the picker in «الأطراف والمطالبة».
  await page.locator('.case-quick').getByRole('button',{name:'ربط بقضية',exact:true}).click();await page.getByRole('tab',{name:/^الأطراف والمطالبة/,selected:true}).waitFor();
  await page.getByRole('dialog').getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-1');await page.getByRole('button',{name:'ربط الملف بالقضية',exact:true}).click();
  await page.getByText('رُبط الملف بالقضية').first().waitFor();await page.keyboard.press('Escape');
  recs=await dept('collections','records_page');assert.equal(byCode('W-2').caseId,'ui-case-1','Linked from the file');
  // From the case: the linked file shows, and another file is attached by searching.
  await switchTo('القضايا');
  // «ملفاتي الورقية»: every file the archive handed you, here the one sent, received and returned earlier.
  await page.getByRole('button',{name:'ملفاتي الورقية',exact:true}).click();await page.getByRole('button',{name:/^المكتملة/}).click();
  await page.getByRole('button',{name:/^الجارية/}).click();const trip=page.locator('.journey.short').first();for(const step of ['أرسله الأرشيف إليك','استلمتَه','رفض الأرشيف إرجاعك','أبلغتَ بإرجاعه','عاد ناقصاً: صورة الحكم'])await trip.getByText(step,{exact:true}).waitFor();await screen('paper-page');
  await page.getByRole('button',{name:/^سجل الأحكام/}).first().click();await page.getByRole('button',{name:'فتح القضية TEST-1',exact:true}).click();
  // The case's paper file: where it is, and a request the archive receives.
  await page.locator('.case-paper').getByText('ARC-00001').waitFor();await page.locator('.case-paper').getByRole('button',{name:'طلب الملف'}).first().click();
  await page.getByRole('button',{name:'إرسال الطلب'}).click();await page.locator('.case-paper').getByText(/طلبته · بانتظار التجهيز/).first().waitFor();
  assert.ok((await dept('archive','records_page')).some(r=>r.kind==='request'&&r.payload.status==='pending'&&r.payload.requester),'The request reaches the archive');
  await page.getByRole('tab',{name:/^ملفات التحصيل/}).click();await page.getByText('ملف W-2').waitFor();await page.getByRole('button',{name:'ربط ملف تحصيل'}).click();await page.getByLabel(/ابحث برقم الملف/).fill('W-3');
  // A file already linked elsewhere names that case, and moving it asks first.
  const w3=page.locator('.linked-files li').filter({hasText:'W-3'});await w3.getByText(/مرتبط بالقضية كود TEST-0 · الرقم الآلي 1000/).waitFor();
  let asked='';page.once('dialog',d=>{asked=d.message();void d.accept()});
  await w3.getByRole('button',{name:'ربط بهذه القضية'}).click();await page.getByText('ملف W-3').waitFor();await screen('case-collections');
  assert.match(asked,/مرتبط بالقضية كود TEST-0/,'Moving a file names the case it leaves');
  recs=await dept('collections','records_page');assert.equal(byCode('W-3').caseId,'ui-case-1','Linked from the case');await page.keyboard.press('Escape');
  // The client profile lists its collection files.
  await page.getByRole('button',{name:/^الموكلون/}).first().click();await page.locator('.client-card').filter({hasText:'شركة تجريبية للاتصالات'}).click();
  await page.getByText(/^ملفات التحصيل \(\d+\)$/).waitFor();await page.locator('.entity-collections').getByText('ملف W-2').waitFor();await screen('client-collections');await page.keyboard.press('Escape');}
 for(const name of ['السكرتارية','التحصيل','المحاسبة','الموارد البشرية','الأرشيف']){
  await switchTo(name);await page.setViewportSize({width:390,height:844});await page.locator('.department-hero, .sec-agenda, .work-desk').first().waitFor();await screen('mobile-'+({'السكرتارية':'secretary','التحصيل':'collections','المحاسبة':'accounting','الموارد البشرية':'hr','الأرشيف':'archive'}[name]));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,name+' mobile overflow');await page.setViewportSize({width:1440,height:1000});
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
 await staff.getByRole('button',{name:'فتح الملف',exact:true}).click();await staff.getByRole('tab',{name:/^الأطراف والمطالبة/}).click();assert.equal(await staff.getByLabel('العنوان',{exact:true}).isDisabled(),true);assert.equal(await staff.getByRole('button',{name:'إضافة الإفادة'}).count(),0,'Read-only staff cannot add statements');assert.equal(await staff.getByRole('button',{name:'تسجيل مراجعة المصدر',exact:true}).count(),0);assert.equal(await staff.getByRole('button',{name:'إنشاء صحيفة Word',exact:true}).count(),0);await staff.keyboard.press('Escape');
 await staff.getByRole('button',{name:/^حساب /}).click();await staff.getByRole('button',{name:'خروج',exact:true}).click();await staff.getByLabel('اسم المستخدم',{exact:true}).fill('dept_ui_reader');await staff.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');await staff.getByRole('button',{name:'فتح مساحة العمل',exact:true}).click();await staff.getByRole('heading',{name:'اختر مساحة عملك',exact:true}).waitFor();
 await staff.evaluate(()=>sessionStorage.setItem('mawatheeq.workspace.v1','legal'));await staff.reload();await staff.getByRole('heading',{name:'اختر مساحة عملك',exact:true}).waitFor();assert.equal(await staff.locator('.workspace-option').count(),2,'Forged workspace preference cannot grant legal access');
 await staff.getByRole('button',{name:/^حساب /}).click();await staff.getByRole('button',{name:'تغيير كلمة المرور',exact:true}).click();await staff.getByLabel('كلمة المرور الحالية',{exact:true}).fill('Unsaved-password-from-previous-user');
 const otherTab=await sc.newPage();await configurePage(otherTab);await otherTab.goto(base);
 await otherTab.evaluate(token=>localStorage.setItem('mawatheeq.local-session.v1',token),login.token);
 await staff.getByRole('heading',{name:'اختر مساحة عملك',exact:true}).waitFor();assert.equal(await staff.locator('.workspace-option').count(),7);
 await staff.getByRole('button',{name:/^حساب /}).click();await staff.getByRole('button',{name:'تغيير كلمة المرور',exact:true}).click();assert.equal(await staff.getByLabel('كلمة المرور الحالية',{exact:true}).inputValue(),'','Cross-tab session replacement clears old password inputs');
 assert.deepEqual(errors,[]);console.log('Passed workspace UI: chooser, session refresh/new login/cross-tab replacement, shared secretary task, reviewed claim/bundle Word downloads, double-entry books (balanced posting, numbering, trial balance, ledger drill-down, profit and loss, balance sheet, new account), invoicing (customer added from the invoice, service line with discount, confirmed, partly paid, receipts, terms and services), bank (statement file imported, line matched to the invoice it names, charge to an account), reports (summary, partner ledger, aged, cash flow, comparison, Excel), advanced (taxes switched on and invoiced, asset depreciated, tax report, year-end checklist), precise ledger/void, employee/leave forms, archive custody/receipt/label/scan/stocktake, import with automatic and manual case links from both sides, civil ID/debtor/phone checks, select-all round-robin distribution with client links, client profile collection files, department-only readonly access, responsive layouts and no runtime errors.');
}catch(e){await screen('failure');console.error(await page.locator('body').innerText());throw e}
finally{
 await browser.close();await db.close();
}
