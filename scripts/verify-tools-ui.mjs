// Synthetic end-to-end test for notifications, quick search, personal work, calendar and printing.
// Run the Pages dev server on 127.0.0.1:4175 first. Uses an isolated in-memory database; never contacts the real backend.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.PLAYWRIGHT_MODULES_PATH||process.cwd()]}));
const artifacts=(process.env.OFFICE_TEST_ARTIFACTS||'/tmp/mawatheeq-office-ui')+'/tools';fs.mkdirSync(artifacts,{recursive:true});
const db=new PGlite({extensions:{pgcrypto}});
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values ('tools_owner',extensions.crypt($1,extensions.gen_salt('bf',4)),false)",['Synthetic-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,'owner' from mawatheeq_private.accounts;set role anon");
const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
const login=await rpc('mawatheeq_local_login',['tools_owner','Synthetic-password-123']);
const local=(action,data)=>rpc('mawatheeq_local_request',[login.token,action,JSON.stringify(data)]);
const office=(action,data={})=>rpc('mawatheeq_office_request',[login.token,action,JSON.stringify(data)]);
const iso=d=>new Date(Date.now()+d*864e5).toLocaleDateString('en-CA',{timeZone:'Asia/Kuwait'});
const today=iso(0);
for(let i=0;i<3;i++)await local('save_case',{case:{id:'tools-case-'+i,code:'TOOL-'+i,autoNumber:String(7000+i),client:'شركة أدوات تجريبية',clientGroup:'شركة أدوات تجريبية',opponent:'خصم الأدوات '+i,date:i===0?iso(-27):'2026-01-05',type:'حكم أول درجة',outcome:'لصالحنا',ruling:'<b>منطوق تجريبي</b>',procedures:[],revision:0}});
const me=(await office('context')).user.id;
const work=(id,extra)=>office('save_work',{item:{id,revision:0,caseId:'tools-case-1',title:'عمل '+id,kind:'task',dueDate:today,dueTime:'',assigneeId:me,priority:'normal',status:'open',location:'',notes:'',completionNote:'',...extra}});
await work('11111111-1111-4111-8111-111111111111',{title:'مهمة متأخرة تجريبية',dueDate:iso(-2)});
await work('22222222-2222-4222-8222-222222222222',{title:'جلسة اليوم التجريبية',kind:'hearing',dueTime:'09:30',location:'المحكمة الكلية'});
await work('33333333-3333-4333-8333-333333333333',{title:'مهمة الأسبوع القادم',dueDate:iso(3)});

const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',timezoneId:'Asia/Kuwait'});
const page=await context.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/app-config.json',route=>route.fulfill({json:{supabaseUrl:'https://office-fixture.supabase.co',supabasePublishableKey:'sb_publishable_synthetic'}}));
await page.route('https://office-fixture.supabase.co/**',async route=>{
 const req=route.request();const url=new URL(req.url());
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
 const name=url.pathname.split('/').pop();const body=req.postDataJSON();
 if(!['mawatheeq_local_login','mawatheeq_local_request','mawatheeq_client_request','mawatheeq_office_request','mawatheeq_department_request'].includes(name))return route.fulfill({status:400,json:{message:'Unexpected synthetic endpoint'}});
 const args=name==='mawatheeq_local_login'?[body.p_username,body.p_password]:[body.p_token,body.p_action,JSON.stringify(body.p_data||{})];
 try{await route.fulfill({json:await rpc(name,args)})}catch(e){await route.fulfill({status:400,json:{message:e.message,code:e.code||'P0001'}})}
});
const base='http://127.0.0.1:4175/Mawatheeq/';
await page.goto(base);
await page.getByLabel('اسم المستخدم',{exact:true}).fill('tools_owner');await page.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');
await page.getByRole('button',{name:'فتح مساحة العمل',exact:true}).click();
await page.getByRole('button',{name:'فتح القضايا'}).click();

// Personal work on the overview.
const mine=page.getByRole('region',{name:'عملي'});
await mine.getByText('مهمة متأخرة تجريبية').waitFor();
assert.ok(await mine.getByText('جلسة اليوم التجريبية').isVisible());
assert.ok(await mine.getByText('مهمة الأسبوع القادم').isVisible());

// Notifications: my overdue and today work plus the approaching deadline, most urgent first.
const bell=page.getByRole('button',{name:/^التنبيهات/});
await page.waitForFunction(()=>/التنبيهات: [3-9]/.test(document.querySelector('.notice-trigger')?.getAttribute('aria-label')||''));
await bell.click();
const panel=page.locator('.notice-panel');
await panel.getByText('مهمة متأخرة: مهمة متأخرة تجريبية').waitFor();
assert.ok(await panel.getByText('جلسة اليوم: جلسة اليوم التجريبية').isVisible());
assert.ok(await panel.getByText('مهلة الطعن تقترب: TOOL-0').isVisible(),'Approaching appeal deadline');
assert.ok(await panel.getByText(/قضية انتهت مهلة الطعن فيها/).isVisible(),'Expired deadlines are summarized');
assert.equal(await panel.locator('.notice-item').first().innerText().then(t=>t.includes('متأخرة')),true,'Overdue work is listed first');
await page.screenshot({path:artifacts+'/notifications.png'});
await panel.getByText('مهمة متأخرة: مهمة متأخرة تجريبية').click();
const editor=page.getByRole('dialog');
await editor.getByRole('heading',{name:'تفاصيل العمل'}).waitFor();
assert.equal(await editor.getByLabel('عنوان العمل',{exact:true}).inputValue(),'مهمة متأخرة تجريبية','Notification opens that task');
await page.keyboard.press('Escape');await editor.waitFor({state:'hidden'});

// Month calendar.
await page.getByRole('button',{name:'تقويم شهري'}).click();
const calendar=page.getByRole('grid');
await calendar.getByRole('button',{name:/جلسة اليوم التجريبية/}).waitFor();
assert.ok(await page.locator('.calendar-day.today').count()===1,'Today is highlighted');
await page.screenshot({path:artifacts+'/calendar.png'});
await calendar.getByRole('button',{name:/جلسة اليوم التجريبية/}).click();
assert.equal(await page.getByRole('dialog').getByLabel('عنوان العمل',{exact:true}).inputValue(),'جلسة اليوم التجريبية');
await page.keyboard.press('Escape');
await page.getByRole('button',{name:'الشهر التالي'}).click();
assert.equal(await calendar.getByRole('button',{name:/جلسة اليوم التجريبية/}).count(),0,'Next month does not repeat this month\'s work');
await page.getByRole('button',{name:'هذا الشهر'}).click();

// Quick search with the keyboard shortcut.
await page.keyboard.press('Control+k');
const search=page.getByRole('dialog',{name:'بحث سريع'});
await search.getByRole('combobox').fill('7002');
await search.getByText('TOOL-2 · شركة أدوات تجريبية').waitFor();
await page.keyboard.press('Enter');
await page.getByText('CASE FILE · TOOL-2').waitFor();

// Printable case sheet uses escaped case text.
await page.evaluate(()=>{window.__printed='';window.open=()=>({document:{write:h=>{window.__printed+=h},close(){}},focus(){},print(){}})});
await page.getByRole('button',{name:'طباعة الملف'}).click();
const printed=await page.evaluate(()=>window.__printed);
assert.ok(printed.includes('TOOL-2')&&printed.includes('&lt;b&gt;منطوق تجريبي&lt;/b&gt;')&&!printed.includes('<b>منطوق'),'Case sheet is printed with escaped text');
assert.ok(!printed.includes('مهمة متأخرة تجريبية'),'Work linked to another case is not printed');
await page.keyboard.press('Escape');

// Search finds sections too, and the header fits a phone.
await page.keyboard.press('Control+k');
await page.getByRole('dialog',{name:'بحث سريع'}).getByRole('combobox').fill('الإعدادات');
await page.keyboard.press('Enter');
await page.getByRole('heading',{name:'الإعدادات والبيانات',level:1}).waitFor();
await page.setViewportSize({width:390,height:844});
await page.goto(base+'#overview');await page.reload();await mine.getByText('مهمة متأخرة تجريبية').waitFor();
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'No horizontal viewport overflow on mobile');
await page.screenshot({path:artifacts+'/mobile-overview.png',fullPage:true});
assert.deepEqual(errors,[],'No runtime errors');
await browser.close();
console.log('Passed tools UI: personal work panel, prioritized notifications that open tasks, month calendar navigation, Ctrl+K case/section search, escaped printable case sheet, mobile header and no runtime errors.');
