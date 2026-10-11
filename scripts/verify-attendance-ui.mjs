// Synthetic end-to-end test for attendance, devices, the office bridge and payroll. Run the Pages dev server on 127.0.0.1:4175 first.
// Uses an isolated in-memory database and browser; never contacts the real backend or a real device.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.PLAYWRIGHT_MODULES_PATH||process.cwd()]}));
const artifacts=(process.env.OFFICE_TEST_ARTIFACTS||'/tmp/mawatheeq-office-ui')+'/attendance';fs.mkdirSync(artifacts,{recursive:true});
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
const dept=(workspace,action,data={})=>rpc('mawatheeq_department_request',[login.token,action,JSON.stringify({workspace,...data})]);
const att=(action,data={})=>rpc('mawatheeq_attendance_request',[login.token,action,JSON.stringify(data)]);
const employee=(n,name)=>({id:'53000000-0000-4000-8000-00000000000'+n,workspace:'hr',kind:'employee',caseId:'',subjectId:'',revision:0,payload:{employeeNumber:'EMP-AT-'+n,name,title:'',department:'',phone:'',startDate:'',status:'active',notes:''}});
await dept('hr','save_record',{record:employee(1,'موظف حضور أول')});await dept('hr','save_record',{record:employee(2,'موظف حضور ثان')});
// Previous office month, so every day is in the past: a late day and an on-time day for PIN 101.
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait'}).format(new Date());
const prev=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7))-2,1));const month=prev.toISOString().slice(0,7);
const workdays=[];for(let d=1;d<=28;d++){const date=new Date(Date.UTC(prev.getUTCFullYear(),prev.getUTCMonth(),d));if(date.getUTCDay()<=4)workdays.push(date.toISOString().slice(0,10))}
const [lateDay,onTimeDay]=workdays;
await att('import_punches',{punches:[{pin:'101',wall:lateDay+' 08:40:00'},{pin:'101',wall:lateDay+' 16:00:00'},{pin:'101',wall:onTimeDay+' 07:58:00'},{pin:'101',wall:onTimeDay+' 16:05:00'},{pin:'999',wall:onTimeDay+' 08:00:00'}]});
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/app-config.json',route=>route.fulfill({json:{supabaseUrl:'https://office-fixture.supabase.co',supabasePublishableKey:'sb_publishable_synthetic'}}));
await page.route('https://office-fixture.supabase.co/**',async route=>{
 const req=route.request();const url=new URL(req.url());
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
 const name=url.pathname.split('/').pop();const body=req.postDataJSON();
 if(!['mawatheeq_local_login','mawatheeq_local_request','mawatheeq_client_request','mawatheeq_office_request','mawatheeq_department_request','mawatheeq_attendance_request'].includes(name))return route.fulfill({status:404,json:{message:'Could not find the function',code:'PGRST202'}});
 const args=name==='mawatheeq_local_login'?[body.p_username,body.p_password]:[body.p_token,body.p_action,JSON.stringify(body.p_data||{})];
 try{await route.fulfill({json:await rpc(name,args)})}catch(e){await route.fulfill({status:400,json:{message:e.message,code:e.code||'P0001'}})}
});
const base='http://127.0.0.1:4175/Mawatheeq/';
const click=async name=>page.getByRole('button',{name,exact:true}).first().click();
const dialog=()=>page.getByRole('dialog');
const field=async(label,value)=>dialog().getByLabel(label,{exact:true}).fill(value);
const screen=async name=>page.screenshot({path:artifacts+'/'+name+'.png',fullPage:true});
const toast=async text=>page.locator('[data-sonner-toast]').filter({hasText:text}).first().waitFor();
async function switchTo(name){await page.getByRole('button',{name:/^حساب /}).click();await click('تغيير مساحة العمل');await click('فتح '+name);}
async function toPrevMonth(){await click('الشهر السابق');await page.locator('.month-switcher b').filter({hasNotText:'—'}).waitFor();}
try{
 await page.goto(base);await page.getByLabel('اسم المستخدم',{exact:true}).fill('ui_owner');await page.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');await click('فتح مساحة العمل');
 await click('فتح الموارد البشرية');await page.locator('.department-hero').waitFor();

 // Pay and fingerprint profile: link PIN 101 and a salary with exact decimals.
 await click('الرواتب والبصمات');await click('تعديل موظف حضور أول');await field('رقم البصمة','101');await field('الراتب الشهري','600.0001');
 await dialog().getByRole('alert').filter({hasText:'خانات عشرية'}).waitFor();assert.equal(await dialog().getByRole('button',{name:'حفظ ملف الحضور',exact:true}).isDisabled(),true,'Excess decimals are refused');
 await field('الراتب الشهري','600');await click('حفظ ملف الحضور');await toast('حُفظ ملف الحضور والراتب');
 await page.getByRole('cell',{name:'600.000 KWD',exact:true}).waitFor();
 await click('تعديل موظف حضور ثان');await field('رقم البصمة','101');await click('حفظ ملف الحضور');await dialog().getByRole('alert').filter({hasText:'مستخدم لموظف آخر'}).waitFor();await click('إغلاق');

 // Monthly grid: the late day, an excuse that clears it, and the unknown PIN notice.
 await click('الحضور');await toPrevMonth();
 const lateCell=page.getByRole('button',{name:new RegExp('^موظف حضور أول .*: متأخر دخول 08:40')});await lateCell.waitFor();
 await page.getByText('بصمات لأرقام غير مربوطة بأي موظف: 999',{exact:false}).waitFor();
 await screen('attendance-grid');
 await lateCell.click();await dialog().getByText('40 د',{exact:true}).waitFor();
 await dialog().getByLabel('نوع التعديل',{exact:true}).selectOption('excuse');await field('سبب التعديل','موعد طبي تجريبي');await click('حفظ التعديل');await toast('حُفظ تعديل الحضور');
 await page.getByRole('button',{name:new RegExp('^موظف حضور أول .*: معذور')}).first().waitFor();

 // File import (attlog.dat format) adds the second employee's punches without duplicates.
 await click('استيراد ملف بصمات');
 await dialog().getByLabel('ملف البصمات').setInputFiles({name:'attlog.dat',mimeType:'text/plain',buffer:Buffer.from(`  101\t${onTimeDay} 07:58:00\t1\t0\t1\t0\n  102\t${onTimeDay} 08:03:00\t1\t0\t1\t0\nnot a punch line\n`)});
 await dialog().getByText('2 بصمة صالحة',{exact:false}).waitFor();await dialog().getByText('1 سطر غير مقروء',{exact:false}).waitFor();
 await click('استيراد البصمات');await toast('استُورد 1 بصمة جديدة، و1 موجودة مسبقاً');

 // Work schedule settings are revision-checked and audited.
 await click('إعدادات الدوام');await page.getByLabel('فترة السماح اليومية (دقائق)',{exact:true}).fill('15');await page.getByLabel('سماحية التأخير الشهرية (دقائق)',{exact:true}).fill('30');
 await page.getByLabel('اسم العطلة',{exact:true}).fill('عطلة تجريبية');assert.equal(await page.getByRole('button',{name:'إضافة العطلة'}).isDisabled(),true,'A holiday needs a date');
 await click('حفظ إعدادات الدوام');await toast('حُفظت إعدادات الدوام');
 assert.equal((await att('context')).settings.graceMinutes,15);

 // Devices: add, rename, queue commands and create a bridge key shown once.
 await click('الأجهزة');await click('إضافة جهاز');await field('اسم الجهاز','جهاز تجريبي');await field('عنوان IP','192.168.50.10');await click('حفظ الجهاز');await toast('حُفظ الجهاز');
 await click('تعديل جهاز تجريبي');await field('اسم الجهاز','جهاز الاستقبال التجريبي');await click('حفظ الجهاز');await page.getByRole('heading',{name:'جهاز الاستقبال التجريبي',exact:true}).waitFor();
 await click('مزامنة');await toast('مزامنة كاملة للبصمات');await page.getByRole('cell',{name:'بانتظار الجسر',exact:true}).first().waitFor();
 await click('مستخدمو جهاز الاستقبال التجريبي');await dialog().getByRole('button',{name:'إضافة موظف حضور أول (101)'}).click();await toast('إضافة مستخدم إلى الجهاز');await page.keyboard.press('Escape');
 const queued=await att('commands');assert.deepEqual(queued.map(c=>c.kind).sort(),['add_user','sync_logs']);assert.deepEqual(queued.find(c=>c.kind==='add_user').payload,{pin:'101',name:'موظف حضور أول'});
 await page.getByLabel('اسم حاسوب الجسر',{exact:true}).fill('حاسوب تجريبي');await click('إنشاء مفتاح جسر');
 const key=(await dialog().locator('.bridge-key code').innerText()).trim();assert.match(key,/^[0-9a-f]{64}$/);
 await dialog().getByText('"bridgeKey": "'+key+'"',{exact:false}).waitFor();assert.equal(await dialog().getByText('sb_publishable_synthetic',{exact:false}).count(),1,'Config snippet uses only the publishable key');
 await screen('devices');await click('تم النسخ');
 assert.equal(await page.getByText(key).count(),0,'The key is not shown again');
 const bridge=await rpc('mawatheeq_bridge_request',[key,'config','{}']);assert.equal(bridge.devices[0].name,'جهاز الاستقبال التجريبي');

 // Accounting: payroll estimate in warning mode, details and a printed warning letter.
 await switchTo('المحاسبة');await click('الرواتب والحضور');await toPrevMonth();
 const row=page.getByRole('row').filter({hasText:'موظف حضور أول'});await row.waitFor();
 assert.ok((await row.innerText()).includes('600.000 KWD'),'Warning mode keeps the full salary as the net estimate');
 await page.getByText('وضع التنبيه',{exact:false}).first().waitFor();await screen('payroll');
 await page.evaluate(()=>{window.__printed='';window.open=()=>({document:{write:h=>{window.__printed+=h},close(){}},focus(){},print(){}})});
 await click('طباعة كشف الرواتب');await page.waitForFunction(()=>window.__printed.includes('كشف الرواتب التقديري'));
 const sheet=await page.evaluate(()=>window.__printed);assert.ok(sheet.includes('موظف حضور أول')&&sheet.includes('خصم محتمل (تنبيه فقط)'));
 await click('تفاصيل موظف حضور أول');await dialog().getByText('الصافي التقديري',{exact:true}).waitFor();
 await page.evaluate(()=>{window.__printed=''});await click('طباعة إنذار');await page.waitForFunction(()=>window.__printed.includes('إنذار بشأن الحضور'));
 assert.ok((await page.evaluate(()=>window.__printed)).includes('غياب'),'The letter lists absences');await page.keyboard.press('Escape');
 await click('رواتب الموظفين');await page.getByRole('cell',{name:'600.000 KWD',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await click('الرواتب والحضور');await page.locator('.payroll-panel').waitFor();await screen('payroll-mobile');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'Payroll mobile overflow');
 assert.deepEqual(errors,[]);console.log('Passed attendance UI: pay profiles with exact amounts and unique PINs, monthly grid, excuses, unknown PINs, attlog import without duplicates, schedule settings, device add/rename/sync/users, one-time bridge key with publishable-only config, payroll warning mode, printed payroll sheet and warning letter, mobile layout and no runtime errors.');
}catch(e){await screen('failure');console.error(await page.locator('body').innerText());throw e}
finally{await browser.close();await db.close();}
