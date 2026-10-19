// Synthetic end-to-end test of section mail in the browser: the administrator connects the secretary's mailbox (tested against a
// fake IMAP/SMTP server), mail arrives and is announced by the mail icon, a reply goes out, and the stand-in secretary sees the
// secretary's mail only after being allowed. Run the Pages dev server on 127.0.0.1:4175 first; run with --experimental-strip-types.
// Needs postal-mime (installed, or MAIL_TEST_MODULES) and Playwright (PLAYWRIGHT_MODULES_PATH).
import {supportFilterSelects} from './filter-select-helper.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {buildMessage} from '../supabase/functions/mail/protocol.ts';
import {handle} from '../supabase/functions/mail/core.ts';
import {startFakeMail} from './mail-fakes.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.PLAYWRIGHT_MODULES_PATH||process.cwd()]}));
const PostalMime=(await import(process.env.MAIL_TEST_MODULES?pathToFileURL(path.join(process.env.MAIL_TEST_MODULES,'postal-mime/src/postal-mime.js')).href:'postal-mime')).default;
const artifacts=(process.env.OFFICE_TEST_ARTIFACTS||'/tmp/mawatheeq-office-ui')+'/mail';fs.mkdirSync(artifacts,{recursive:true});

const fake=await startFakeMail({user:'amal@example.test',password:'synthetic-app-pass'});
fake.add('INBOX',buildMessage({from:{name:'محكمة الاستئناف',address:'court@example.test'},to:[{address:'amal@example.test'}],subject:'إعلان بموعد جلسة',text:'الجلسة يوم الأحد.',messageId:'<old-1@example.test>',date:new Date('2026-10-10T08:00:00Z')}));

const db=new PGlite({extensions:{pgcrypto}});
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
grant usage on schema storage to anon,authenticated,service_role;`);
for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
await db.query(`insert into mawatheeq_private.accounts(username,password_hash,must_change_password,display_name) values
 ('ui_owner',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'المسؤول'),('amal',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'أمل'),('badr',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'بدر')`,['Synthetic-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,case when username='ui_owner' then 'owner' else 'editor' end from mawatheeq_private.accounts;set role anon");
const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
const owner=await rpc('mawatheeq_local_login',['ui_owner','Synthetic-password-123']);
const office=(action,data)=>rpc('mawatheeq_office_request',[owner.token,action,JSON.stringify(data)]);
for(const u of ['amal','badr']){await rpc('mawatheeq_local_login',[u,'Synthetic-password-123']);const m=(await office('context',{})).members.find(x=>x.username===u);
 await office('set_member_access',{id:m.id,revision:m.permissions.revision,permissions:{sections:['secretary'],caseScope:'all',caseIds:[],canEdit:true,canExport:false}})}

// The «mail» edge function, served from its own code with the fake servers and the synthetic database.
const store=new Map();
const fnDeps=token=>({connect:fake.connect,parse:raw=>PostalMime.parse(raw),
 rpc:async(action,data={})=>{await db.exec('reset role;set role service_role');try{return await rpc('mawatheeq_mail_service',[token,action,JSON.stringify(data)])}catch(e){throw Object.assign(new Error(e.message),{code:e.code,db:true})}finally{await db.exec('reset role;set role anon')}},
 upload:async(p,d)=>{store.set(p,d)},download:async p=>store.get(p),signUpload:async()=>'synthetic',signDownload:async p=>'https://office-fixture.supabase.co/storage/v1/object/sign/mawatheeq-mail/'+p+'?token=synthetic'});

const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const errors=[];
async function open(username){
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.route('**/app-config.json',route=>route.fulfill({json:{supabaseUrl:'https://office-fixture.supabase.co',supabasePublishableKey:'sb_publishable_synthetic'}}));
 await context.route('https://office-fixture.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  const name=url.pathname.split('/').pop(),body=req.postDataJSON();
  if(name==='mail'){const out=await handle(fnDeps(body.sessionToken),body);return route.fulfill({status:out.status,json:out.data})}
  if(!name.startsWith('mawatheeq_'))return route.fulfill({status:400,json:{message:'Unexpected synthetic endpoint'}});
  const args=name==='mawatheeq_local_login'?[body.p_username,body.p_password]:[body.p_token,body.p_action,JSON.stringify(body.p_data||{})];
  try{await route.fulfill({json:await rpc(name,args)})}catch(e){await route.fulfill({status:400,json:{message:e.message,code:e.code||'P0001'}})}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));supportFilterSelects(page.locator('body'));
 await page.goto('http://127.0.0.1:4175/Mawatheeq/');
 await page.getByLabel('اسم المستخدم',{exact:true}).fill(username);await page.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');
 await page.getByRole('button',{name:'فتح مساحة العمل',exact:true}).click();
 return {context,page};
}
const click=(page,name)=>page.getByRole('button',{name,exact:true}).first().click();
const screen=(page,name)=>page.screenshot({path:artifacts+'/'+name+'.png',fullPage:true});
try{
 // The administrator connects the secretary's own mailbox to the secretary section.
 const {page}=await open('ui_owner');
 await click(page,'فتح السكرتارية');
 await page.getByRole('button',{name:/^البريد/}).first().waitFor();await page.getByRole('group',{name:'صفحات المساحة'}).getByRole('button',{name:/البريد/}).click();
 await page.getByRole('heading',{name:'لا يوجد بريد مرتبط بهذا القسم'}).waitFor();
 await click(page,'إعدادات البريد');await click(page,'ربط بريد');
 {const d=page.getByRole('dialog',{name:'ربط بريد'});
  await d.getByLabel('لمن هذا البريد',{exact:true}).selectOption({label:'بريد أمل'});await d.getByLabel('مزود البريد',{exact:true}).selectOption('custom');
  await d.getByLabel('عنوان البريد',{exact:true}).fill('amal@example.test');await d.getByLabel('الاسم الظاهر للمستلم',{exact:true}).fill('مكتب مواثيق — السكرتارية');
  await d.getByLabel('كلمة المرور / كلمة مرور التطبيقات',{exact:true}).fill('wrong-pass');
  await d.getByLabel('خادم الوارد (IMAP)',{exact:true}).fill('127.0.0.1');await d.getByLabel('منفذ الوارد',{exact:true}).fill(String(fake.IMAP_PORT));
  await d.getByLabel('خادم الإرسال (SMTP)، اتركه فارغاً للعرض فقط',{exact:true}).fill('127.0.0.1');await d.getByLabel('منفذ الإرسال',{exact:true}).fill('587');
  await d.getByText('الإرسال من الخادم يعمل بالمنفذ 465 (SSL) فقط').waitFor();
  await d.getByLabel('منفذ الإرسال',{exact:true}).fill(String(fake.SMTP_PORT));
  await d.getByRole('button',{name:'اختبار الاتصال',exact:true}).click();await page.getByText(/كلمة مرور التطبيقات/).first().waitFor();
  await d.getByLabel('كلمة المرور / كلمة مرور التطبيقات',{exact:true}).fill('synthetic-app-pass');
  await d.getByRole('button',{name:'اختبار الاتصال',exact:true}).click();await d.getByText('نجح الاتصال · مجلد الصادر: Sent Items').waitFor();
  await screen(page,'mail-connect');await d.getByRole('button',{name:'حفظ',exact:true}).click();await d.waitFor({state:'detached'});}
 await page.getByRole('dialog',{name:'إعدادات البريد'}).locator('.mail-boxes').getByText('amal@example.test').waitFor();
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 // Existing mail is fetched as already read; new mail is announced by the mail icon.
 await page.locator('.mail-row').filter({hasText:'إعلان بموعد جلسة'}).waitFor();
 assert.equal(await page.locator('.mail-row.unread').count(),0,'Mail already in the mailbox is not counted as new');
 fake.add('INBOX',buildMessage({from:{name:'الموكل',address:'client@example.test'},to:[{address:'amal@example.test'}],subject:'استفسار عن القضية',text:'متى الجلسة القادمة؟',html:'<p dir="rtl">متى <b>الجلسة</b> القادمة؟</p><img src="https://tracker.example/p.png">',messageId:'<new-1@example.test>'}));
 await click(page,'جلب البريد');
 await page.getByRole('button',{name:'البريد: 1 غير مقروءة',exact:true}).waitFor();
 await page.locator('.mail-row.unread').filter({hasText:'استفسار عن القضية'}).waitFor();await screen(page,'mail-list');
 await page.getByRole('button',{name:'البريد: 1 غير مقروءة',exact:true}).click();
 await page.locator('.mail-panel').getByRole('button',{name:/استفسار عن القضية/}).click();
 const reader=page.locator('.mail-message');await reader.getByRole('heading',{name:'استفسار عن القضية'}).waitFor();
 assert.match(await reader.locator('iframe.mail-frame').getAttribute('srcdoc'),/img-src data:;/,'Outside pictures are blocked until asked for');
 await reader.getByRole('button',{name:'عرض الصور الخارجية',exact:true}).click();
 assert.match(await reader.locator('iframe.mail-frame').getAttribute('srcdoc'),/img-src data: https:/);
 await page.getByLabel('البريد',{exact:true}).waitFor();
 await reader.getByText(/قرأها: المسؤول/).waitFor();
 // Reply from the secretary's address.
 await reader.getByRole('button',{name:'رد',exact:true}).click();
 {const d=page.getByRole('dialog',{name:'رد'});assert.equal(await d.getByLabel('إلى',{exact:true}).inputValue(),'client@example.test');
  assert.equal(await d.getByLabel('الموضوع',{exact:true}).inputValue(),'رد: استفسار عن القضية');
  const body=d.locator('textarea.mail-body');await body.fill('الجلسة الأحد القادم.\n\nالمسؤول');await screen(page,'mail-reply');
  await d.getByRole('button',{name:'إرسال',exact:true}).click();await d.waitFor({state:'detached'});}
 await page.getByText('أُرسلت الرسالة').waitFor();
 assert.equal(fake.smtpSent.length,1);assert.deepEqual(fake.smtpSent[0].to,['<client@example.test>']);
 assert.equal((await PostalMime.parse(fake.smtpSent[0].raw)).from.name,'مكتب مواثيق — السكرتارية');
 await reader.getByText(/رد عليها المسؤول/).waitFor();
 await page.getByRole('group',{name:'المجلد'}).getByRole('button',{name:'الصادر',exact:true}).click();await page.locator('.mail-row').filter({hasText:'رد: استفسار عن القضية'}).waitFor();
 // The stand-in sees the secretary's mail only once allowed.
 const {page:temp,context:tempCtx}=await open('badr');
 // A single-workspace account opens it directly.
 await temp.getByRole('group',{name:'صفحات المساحة'}).getByRole('button',{name:/البريد/}).click();
 await temp.getByRole('heading',{name:'لا يوجد بريد مرتبط بهذا القسم'}).waitFor();
 await click(page,'إعدادات البريد');await click(page,'من يرى بريد من');
 {const d=page.getByRole('dialog',{name:'إعدادات البريد'});await d.getByLabel('بدر: الوارد',{exact:true}).check();await d.getByLabel('بدر: الإرسال',{exact:true}).check();
  await d.getByLabel('بدر: الإرسال',{exact:true}).isChecked();await screen(page,'mail-access');}
 await page.keyboard.press('Escape');
 await temp.reload();
 await temp.getByRole('group',{name:'صفحات المساحة'}).getByRole('button',{name:/البريد/}).click();
 await temp.locator('.mail-row').filter({hasText:'استفسار عن القضية'}).click();
 await temp.locator('.mail-message').getByRole('button',{name:'رد',exact:true}).waitFor();
 await temp.getByRole('group',{name:'المجلد'}).getByRole('button',{name:'الصادر',exact:true}).click();
 await temp.getByText('لا توجد رسائل').waitFor();
 await screen(temp,'mail-stand-in');
 // Phone width: list then message, no sideways scrolling.
 await page.setViewportSize({width:390,height:844});await page.getByRole('group',{name:'المجلد'}).getByRole('button',{name:'الوارد',exact:true}).click();
 // An open message takes the whole width on a phone; closing it shows the list again.
 if(await page.locator('.mail-message').count())await page.getByRole('button',{name:'إغلاق الرسالة',exact:true}).click();
 await screen(page,'mail-mobile-list');await page.locator('.mail-row').first().click();await page.locator('.mail-message').waitFor();await screen(page,'mail-mobile');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'Mail fits a phone');
 await tempCtx.close();
 assert.deepEqual(errors,[]);
 console.log('Passed mail UI: connecting a mailbox with a connection test (wrong password and blocked port explained), first fetch as read, new mail on the mail icon and in the list, outside pictures blocked until asked, reply from the section address recorded as answered, stand-in sees the secretary\'s mail only once allowed (incoming but not outgoing), phone layout, no runtime errors.');
}finally{await browser.close();fake.close()}
