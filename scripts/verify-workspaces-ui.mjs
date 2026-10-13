// Synthetic end-to-end test. Run the Pages dev server on 127.0.0.1:4175 first.
// Uses an isolated in-memory database and browser; never contacts the real backend.
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
 await page.getByRole('heading',{name:'اختر مساحة عملك',exact:true}).waitFor();assert.equal(await page.locator('.workspace-option').count(),6);
 await screen('chooser-desktop');await page.setViewportSize({width:390,height:844});await screen('chooser-mobile');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);await page.setViewportSize({width:1440,height:1000});
 await enter('السكرتارية');await click('إضافة مهمة');await field('عنوان العمل','تنسيق موعد تجريبي');await click('حفظ العمل');await page.getByText('تنسيق موعد تجريبي',{exact:true}).first().waitFor();
 await screen('secretary-desktop');await page.reload();await page.getByRole('heading',{name:'كل موعد في مكانه.',exact:true}).waitFor();
 await switchTo('القضايا');await click('المهام والجلسات');await page.getByText('تنسيق موعد تجريبي',{exact:true}).waitFor();
 await switchTo('التحصيل');await click('ملف تحصيل جديد');await page.getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-0');
 for(const [label,value] of [['الشركة المدعية','شركة اختبار التحصيل'],['المدعى عليه','خصم اختبار التحصيل'],['الرقم المدني للمدعى عليه','200000000001'],['الجنسية','كويتي'],['العنوان','عنوان تجريبي'],['الهاتف','50000000'],['الرقم المدني للشركة','SYN-1'],['السجل التجاري','SYN-2'],['رقم العقد / الحساب','SYN-ACCOUNT'],['مبلغ المطالبة (د.ك)','125.125'],['رقم أمر الأداء','1/2026'],['محكمة أمر الأداء','محكمة تجريبية'],['رقم الدعوى','1'],['سنة الدعوى','2026'],['محكمة الجلسة','محكمة تجريبية'],['الدائرة','1'],['مرجع المصدر الذي تمت مطابقته','عقد تجريبي 1']])await field(label,value);
 for(const label of ['تاريخ رفض أمر الأداء','تاريخ التكليف بالوفاء','تاريخ كشف الحساب','تاريخ الجلسة'])await pickToday(label);
 // The hearing day follows the hearing date (a choice, not typed).
 await page.getByRole('combobox',{name:'يوم الجلسة'}).getByText(/^(الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت)$/).waitFor();
 await page.getByRole('tab',{name:/^الحافظة والمستندات/}).click();await click('إضافة مستند للحافظة');await field('وصف المستند 1','عقد تجريبي تمت مراجعته');await click('حفظ ملف التحصيل');
 await page.getByRole('heading',{name:'مراجعة المصدر',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'إنشاء صحيفة Word',exact:true}).isDisabled(),true);
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
 await click('إغلاق الملف');await page.getByRole('button',{name:'المتابعات المستحقة (1)'}).click();await page.getByText('لم يرد على الاتصال').waitFor();await click('ملفات التحصيل');
 await screen('collections-desktop');
 await click('طباعة جماعية');await page.locator('.batch-table').getByText('جاهز',{exact:true}).waitFor();await click('الاثنان معاً');await click('تحديد كل الجاهز');
 {const files=[];const onDownload=d=>files.push(d);page.on('download',onDownload);await click('إنشاء ملف الطباعة (1)');for(let i=0;i<60&&files.length<2;i++)await page.waitForTimeout(250);page.off('download',onDownload);assert.equal(files.length,2,'batch print downloads one file per paper type');assert.deepEqual(files.map(d=>d.suggestedFilename().split('-2')[0]).sort(),['Mawatheeq-bundles','Mawatheeq-claims']);}
 await screen('collections-batch-desktop');await click('ملفات التحصيل');
 await switchTo('المحاسبة');await click('قيد جديد');await page.getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-0');await field('المبلغ','125.125');await field('مرجع القيد / رقم الإيصال','SYN-FEE-UI');await field('الدافع / المستفيد','طرف تجريبي');await click('ترحيل القيد');await page.getByRole('cell',{name:/SYN-FEE-UI/}).waitFor();
 await click('قيد جديد');await page.getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-0');await page.getByLabel('نوع القيد',{exact:true}).selectOption('receipt');await field('المبلغ','25.025');await field('مرجع القيد / رقم الإيصال','SYN-RECEIPT-UI');await field('الدافع / المستفيد','طرف تجريبي');await click('ترحيل القيد');
 await page.getByText('100.100 KWD',{exact:true}).waitFor();await screen('accounting-desktop');
 await page.getByRole('row').filter({has:page.getByRole('cell',{name:/SYN-RECEIPT-UI/})}).getByRole('button',{name:'فتح القيد',exact:true}).click();assert.equal(await page.getByLabel('المبلغ',{exact:true}).isDisabled(),true);await field('سبب إلغاء القيد','تصحيح تجريبي');await click('تأكيد إلغاء القيد');await page.locator('.ledger-balance').getByText('125.125 KWD',{exact:true}).waitFor();
 await switchTo('الموارد البشرية');await page.getByText('@ui_owner',{exact:true}).waitFor();await click('موظف جديد');await field('الرقم الوظيفي','EMP-UI-1');await field('اسم الموظف','موظف واجهة تجريبي');await field('المسمى الوظيفي','مساعد');await field('القسم','السكرتارية');await pickToday('تاريخ الانضمام');await click('حفظ سجل الموارد البشرية');await page.getByRole('heading',{name:'موظف واجهة تجريبي',exact:true}).waitFor();
 await screen('hr-desktop');await click('الإجازات');await click('طلب إجازة جديد');
 const people=await dept('hr','records_page');await page.getByLabel('الموظف',{exact:true}).selectOption(people.find(r=>r.kind==='employee').id);await page.getByLabel('قرار الإجازة',{exact:true}).selectOption('approved');await field('ملاحظة القرار / السبب','موافقة تجريبية');await click('حفظ سجل الموارد البشرية');await page.getByRole('cell',{name:'معتمدة',exact:true}).waitFor();
 // Archive: a location, a paper file with its number, hand-out with a printed receipt, return, label, barcode lookup and stocktake.
 await switchTo('الأرشيف');await page.getByRole('heading',{name:'الأرشيف',exact:true}).waitFor();
 await page.evaluate(()=>{window.__printed='';window.__mawatheeqPrint=h=>{window.__printed+=h}});const printed=async()=>{const h=await page.evaluate(()=>window.__printed);await page.evaluate(()=>{window.__printed=''});return h};
 await page.getByRole('button',{name:/^المواقع/}).click();await click('موقع حفظ جديد');await field('رمز الموقع','a-1');await field('اسم الموقع','غرفة الأرشيف');await field('السعة (عدد الملفات)','40');await click('حفظ الموقع');await page.getByRole('heading',{name:'غرفة الأرشيف',exact:true}).waitFor();
 await page.getByRole('button',{name:/^الملفات/}).click();await click('ملف ورقي جديد');
 assert.equal(await page.getByRole('dialog').getByLabel('رقم الأرشيف',{exact:true}).inputValue(),'ARC-00001','The next archive number is suggested');
 await page.getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-1');await page.getByLabel('موقع الحفظ',{exact:true}).selectOption({label:'A-1 · غرفة الأرشيف'});await page.getByRole('dialog').getByText('يحتوي على مستندات أصلية').click();
 await click('حفظ بيانات الملف');await page.getByRole('tab',{name:/^العهدة والحركة/}).click();
 await click('تسليم لموظف');await field('الموظف المستلم','ui_owner');await field('الغرض','حضور جلسة');await click('تسجيل الحركة');await page.locator('.custody-now.staff').waitFor();
 await page.getByRole('button',{name:/طباعة إيصال التسليم/}).click();let html=await printed();assert.ok(html.includes('إيصال تسليم ملف من الأرشيف')&&html.includes('ARC-00001')&&html.includes('حضور جلسة'),'Handover receipt prints');
 await click('إعادة للأرشيف');await click('تسجيل الحركة');await page.locator('.custody-now.in').waitFor();
 await click('ملصق الملف');html=await printed();assert.ok(html.includes('<svg')&&html.includes('ARC-00001')&&html.includes('A-1'),'Label prints with a barcode and location');
 await screen('archive-file');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 await page.getByLabel('مسح الباركود أو كتابة رقم الأرشيف',{exact:true}).fill('arc-00001');await page.keyboard.press('Enter');await page.getByRole('dialog').getByText('ARC-00001').first().waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 await page.getByRole('button',{name:/^المواقع/}).click();await page.getByRole('button',{name:/^جرد$/}).click();await click('تحديد الكل');await click('تسجيل الجرد (1)');await page.getByRole('dialog').waitFor({state:'detached'});
 const archiveRows=await dept('archive','records_page');assert.deepEqual(archiveRows.filter(r=>r.kind==='movement').map(r=>r.payload.type).sort(),['audit','checkout','return']);
 await page.getByRole('button',{name:/^سجل الحركة/}).click();await page.getByRole('cell',{name:'جرد وتأكيد الوجود',exact:true}).waitFor();await screen('archive-desktop');
 // import (synthetic): files without a case, an automatic link by court number, then manual links from the file and from the case.
 await rpc('mawatheeq_local_request',[login.token,'save_case',JSON.stringify({case:{id:'ui-case-auto',code:'AUTO-1',autoNumber:'260000001',client:'شركة اختبار الواجهة',clientGroup:'شركة اختبار الواجهة',opponent:'خصم آلي',date:'2026-09-01',type:'حكم أول درجة',outcome:'لصالحنا',procedures:[],revision:0}})]);
 {const X=require(require.resolve('xlsx',{paths:[process.cwd()]}));const w=X.utils.book_new();
  const head=['إسم الموكل','رقم الملف','إسم الخصم','حالة الملف','سبب المديونية','قيمة المطالبة','رقم العقد','الرقم الآلى - ملف','ترقيم 1','ترقيم 4','تاريخ الورود','رقم الهوية - الخصم','عنوان المنزل - الخصم','ملاحظات 1','ملاحظات 2','الجنسية - الخصم','الوظيفة - الخصم','المنطقة','القطعة','إجمالى المدفوعات','إجمالى المصروفات'];
  X.utils.book_append_sheet(w,X.utils.aoa_to_sheet([head,['شركة تجريبية','W-1','SYNTHETIC ONE','سوفت','50000001',120.5,'C-1','260000001','بدون','0','03/10/2026','200000000001','','فارغ','','TESTLAND','خارج البلاد','','',20,0],
   ['شركة تجريبية','W-2','SYNTHETIC TWO','تحت الرفع','50000002',75,'C-2','هولد','SA','','03/10/2026','200000000002','','','','','','','',0,0],
   ['شركة تجريبية','W-3','SYNTHETIC THREE','سكت','50000003',40,'C-3','','بدون','','03/10/2026','200000000003','','','','','','','',0,0]]),'Files');
  await switchTo('التحصيل');
  await page.getByLabel('ملف التصدير',{exact:true}).setInputFiles({name:'export.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(X.write(w,{type:'array',bookType:'xlsx'}))});
  const dlg=page.getByRole('dialog');const stat=async label=>dlg.locator('.import-summary>div').filter({hasText:label}).locator('b').innerText();
  await dlg.getByText('SYNTHETIC TWO').waitFor();assert.equal(await stat('ملف جديد'),'3');assert.equal(await stat('يُربط بقضية تلقائياً'),'1');
  await screen('legacy-import');await dlg.getByRole('button',{name:'استيراد 3 ملف'}).click();await dlg.waitFor({state:'detached'});
  let recs=await dept('collections','records_page');const byCode=c=>recs.find(r=>r.kind==='file'&&r.payload.code===c);
  assert.equal(byCode('W-1').caseId,'ui-case-auto','Linked by its court number');assert.equal(byCode('W-2').caseId,'');assert.equal(byCode('W-2').payload.customerId,'50000002');assert.equal(byCode('W-2').payload.fileStatus,'تحت الرفع');
  assert.ok(recs.some(r=>r.kind==='payment'&&r.subjectId===byCode('W-1').id&&r.payload.amount==='20'),'Paid total carried over');
  await page.locator('.collection-card').filter({hasText:'W-2'}).getByRole('button',{name:'فتح الملف'}).click();
  await page.getByRole('tab',{name:/^الأطراف والمطالبة/}).click();await page.getByRole('button',{name:'ربط بقضية',exact:true}).click();
  await page.getByRole('dialog').getByLabel('القضية المرتبطة',{exact:true}).selectOption('ui-case-1');await page.getByRole('button',{name:'ربط الملف بالقضية',exact:true}).click();
  await page.getByText('رُبط الملف بالقضية').first().waitFor();await page.keyboard.press('Escape');
  recs=await dept('collections','records_page');assert.equal(byCode('W-2').caseId,'ui-case-1','Linked from the file');
  // From the case: the linked file shows, and another file is attached by searching.
  await switchTo('القضايا');await page.getByRole('button',{name:/^سجل الأحكام/}).first().click();await page.getByRole('button',{name:'فتح القضية TEST-1',exact:true}).click();
  await page.getByText('ملف W-2').waitFor();await page.getByRole('button',{name:'ربط ملف تحصيل'}).click();await page.getByLabel(/ابحث برقم الملف/).fill('W-3');
  await page.locator('.linked-files li').filter({hasText:'W-3'}).getByRole('button',{name:'ربط بهذه القضية'}).click();await page.getByText('ملف W-3').waitFor();await screen('case-collections');
  recs=await dept('collections','records_page');assert.equal(byCode('W-3').caseId,'ui-case-1','Linked from the case');await page.keyboard.press('Escape');}
 for(const name of ['السكرتارية','التحصيل','المحاسبة','الموارد البشرية','الأرشيف']){
  await switchTo(name);await page.setViewportSize({width:390,height:844});await page.locator('.department-hero').waitFor();await screen('mobile-'+({'السكرتارية':'secretary','التحصيل':'collections','المحاسبة':'accounting','الموارد البشرية':'hr','الأرشيف':'archive'}[name]));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,name+' mobile overflow');await page.setViewportSize({width:1440,height:1000});
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
 await staff.getByRole('heading',{name:'اختر مساحة عملك',exact:true}).waitFor();assert.equal(await staff.locator('.workspace-option').count(),6);
 await staff.getByRole('button',{name:/^حساب /}).click();await staff.getByRole('button',{name:'تغيير كلمة المرور',exact:true}).click();assert.equal(await staff.getByLabel('كلمة المرور الحالية',{exact:true}).inputValue(),'','Cross-tab session replacement clears old password inputs');
 assert.deepEqual(errors,[]);console.log('Passed workspace UI: chooser, session refresh/new login/cross-tab replacement, shared secretary task, reviewed claim/bundle Word downloads, precise ledger/void, employee/leave forms, archive custody/receipt/label/scan/stocktake, import with automatic and manual case links from both sides, department-only readonly access, responsive layouts and no runtime errors.');
}catch(e){await screen('failure');console.error(await page.locator('body').innerText());throw e}
finally{
 await browser.close();await db.close();
}
