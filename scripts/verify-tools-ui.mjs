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
await rpc('mawatheeq_client_request',[login.token,'save',JSON.stringify({client:{id:'44444444-4444-4444-8444-444444444444',name:'شركة اتصال تجريبية',kind:'organization',sector:'other',contacts:[{id:'55555555-5555-4555-8555-555555555555',name:'منسق تجريبي',role:'متابعة',phone:'٩٩٩٩ ١٢٣٤',notes:''}],aliases:[],notes:'',needsReview:false,revision:0}})]);
const dept=(workspace,record)=>rpc('mawatheeq_department_request',[login.token,'save_record',JSON.stringify({workspace,record:{revision:0,caseId:'',subjectId:'',...record}})]);
await dept('accounting',{id:'66666666-6666-4666-8666-666666666661',workspace:'accounting',kind:'entry',payload:{type:'fee',date:iso(-3),currency:'KWD',amount:'10',reference:'FEE-1',party:'موكل تجريبي',notes:''}});
await dept('accounting',{id:'66666666-6666-4666-8666-666666666662',workspace:'accounting',kind:'entry',payload:{type:'receipt',date:iso(-1),currency:'KWD',amount:'2.5',reference:'RC-1',party:'موكل تجريبي',notes:'دفعة أولى'}});
await dept('hr',{id:'77777777-7777-4777-8777-777777777771',workspace:'hr',kind:'employee',payload:{employeeNumber:'E-1',name:'موظف تجريبي',title:'محامٍ',department:'القضايا',phone:'',startDate:'2025-01-01',status:'active',notes:''}});
const clerk=await office('create_member',{username:'tools_clerk',password:'Temporary-password-123',permissions:{sections:['cases','work'],caseScope:'selected',caseIds:['tools-case-0'],canEdit:true,canExport:false}});
const clerkSession=await rpc('mawatheeq_local_login',['tools_clerk','Temporary-password-123']);
await rpc('mawatheeq_local_request',[clerkSession.token,'password',JSON.stringify({currentPassword:'Temporary-password-123',newPassword:'Fixture-password-123'})]);
await rpc('mawatheeq_comment_request',[clerkSession.token,'post',JSON.stringify({targetType:'case',targetId:'tools-case-0',body:'هل استلمنا صيغة الحكم؟',mentions:[me]})]);
const leaveYear=today.slice(0,4),leaveStart=leaveYear+'-02-10',leaveEnd=leaveYear+'-02-12';
await dept('hr',{id:'77777777-7777-4777-8777-777777777772',workspace:'hr',kind:'leave',subjectId:'77777777-7777-4777-8777-777777777771',payload:{type:'سنوية',fromDate:leaveStart,toDate:leaveEnd,status:'approved',notes:'',decisionNote:'معتمدة'}});

const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',timezoneId:'Asia/Kuwait'});
const page=await context.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/app-config.json',route=>route.fulfill({json:{supabaseUrl:'https://office-fixture.supabase.co',supabasePublishableKey:'sb_publishable_synthetic'}}));
await page.route('https://office-fixture.supabase.co/**',async route=>{
 const req=route.request();const url=new URL(req.url());
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
 const name=url.pathname.split('/').pop();const body=req.postDataJSON();
 if(!['mawatheeq_local_login','mawatheeq_local_request','mawatheeq_client_request','mawatheeq_office_request','mawatheeq_department_request','mawatheeq_comment_request'].includes(name))return route.fulfill({status:400,json:{message:'Unexpected synthetic endpoint'}});
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

// A mention opens the case discussion; replies can mention colleagues and authors can delete their own comments.
await bell.click();
await panel.getByText('أشار إليك tools_clerk').click();
const discussion=page.getByRole('region',{name:'النقاش الداخلي'});
await discussion.getByText('هل استلمنا صيغة الحكم؟').waitFor();
await discussion.getByLabel('تعليق جديد').fill('نعم، استلمناها اليوم');
await discussion.getByLabel('@tools_clerk').check();
await discussion.getByRole('button',{name:'إرسال التعليق'}).click();
await discussion.getByText('نعم، استلمناها اليوم').waitFor();
await discussion.getByRole('list').getByText('@tools_clerk').waitFor(); // Reply shows its mention
await page.screenshot({path:artifacts+'/discussion.png'});
assert.equal((await rpc('mawatheeq_comment_request',[clerkSession.token,'mentions','{}'])).items.length,1,'The mentioned colleague receives the reply');
await discussion.getByRole('listitem').filter({hasText:'نعم، استلمناها اليوم'}).getByRole('button',{name:'حذف التعليق'}).click();
await discussion.getByText('حُذف هذا التعليق.').waitFor();
assert.equal(await discussion.getByRole('listitem').filter({hasText:'هل استلمنا صيغة الحكم؟'}).getByRole('button',{name:'حذف التعليق'}).count(),1,'The office owner can moderate colleagues\' comments');
await page.keyboard.press('Escape');
await bell.click();
await page.waitForFunction(()=>document.querySelector('.notice-panel')&&![...document.querySelectorAll('.notice-item')].some(e=>e.textContent.includes('أشار إليك')),null,{timeout:5000});
await page.keyboard.press('Escape');
assert.equal((await rpc('mawatheeq_comment_request',[clerkSession.token,'mentions','{}'])).items.length,0,'A deleted reply leaves the colleague\'s mentions');

// Search finds sections too, and the header fits a phone.
await page.keyboard.press('Control+k');
await page.getByRole('dialog',{name:'بحث سريع'}).getByRole('combobox').fill('الإعدادات');
await page.keyboard.press('Enter');
await page.getByRole('heading',{name:'الإعدادات والبيانات',level:1}).waitFor();
await page.setViewportSize({width:390,height:844});
await page.goto(base+'#overview');await page.reload();await mine.getByText('مهمة متأخرة تجريبية').waitFor();
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'No horizontal viewport overflow on mobile');
await page.screenshot({path:artifacts+'/mobile-overview.png',fullPage:true});
assert.equal(await page.locator('.account-bar,.legal-workspace-switch').count(),0,'No floating account controls over page content');
await page.setViewportSize({width:1440,height:1000});

// The guide page and duplicate shortcut cards are gone; guidance sits on each page and follows the settings.
assert.equal(await page.locator('.quick-card').count(),0);
assert.equal(await page.getByText('دليل الاستخدام').count(),0);
await page.goto(base+'#deadlines');await page.reload();
await page.getByText('كيف يعمل هذا القسم؟').click();
await page.getByText(/حكم أول درجة 30 يوماً، الاستئناف 60 يوماً/).waitFor();

// Client contacts can be called or messaged from the profile.
await page.goto(base+'#clients');await page.reload();
await page.getByRole('button',{name:/شركة اتصال تجريبية/}).click();
const call=page.getByRole('link',{name:'اتصال بـ منسق تجريبي'});
assert.equal(await call.getAttribute('href'),'tel:+96599991234','Arabic-digit local number becomes an international call link');
assert.equal(await page.getByRole('link',{name:'واتساب منسق تجريبي'}).getAttribute('href'),'https://wa.me/96599991234');
await page.keyboard.press('Escape');

// Appearance choices apply instantly and persist on this device.
await page.getByRole('button',{name:'حساب tools_owner'}).click();
await page.getByRole('button',{name:'المظهر والحركة'}).click();
await page.getByRole('radio',{name:'كحلي'}).check();
await page.getByRole('radio',{name:/شبكة وضوء/}).check();
assert.deepEqual(await page.evaluate(()=>[document.documentElement.dataset.theme,document.documentElement.dataset.backdrop]),['navy','spotlight']);
await page.getByRole('button',{name:'تم'}).click();
await page.reload();await page.getByRole('heading',{name:'الموكلون',level:1}).waitFor();
assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'navy','Theme survives a reload');
assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.btn.primary')).backgroundColor),'rgb(31, 61, 99)','Primary actions follow the theme');
await page.getByRole('button',{name:'حساب tools_owner'}).click();await page.getByRole('button',{name:'المظهر والحركة'}).click();
await page.getByRole('radio',{name:'أصفر مشمس'}).check();assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()),'#a57400','Yellow theme applies');
await page.getByRole('radio',{name:'أسود وذهبي'}).check();assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(11, 10, 8)','Black and gold darkens the page');
await page.getByRole('radio',{name:'أبيض وذهبي'}).check();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'ivory');
await page.getByRole('radio',{name:'أزرق سماوي'}).check();await page.getByRole('radio',{name:/يراعات مضيئة/}).check();
assert.deepEqual(await page.evaluate(()=>[document.documentElement.dataset.theme,document.documentElement.dataset.backdrop]),['sky','fireflies']);
await page.getByRole('button',{name:'استعادة الافتراضي'}).click();await page.getByRole('button',{name:'تم'}).click();
assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'burgundy');
assert.equal(await page.evaluate(()=>document.documentElement.dataset.backdrop),'constellation','The living dot network is the default backdrop');

// Easter egg: typing "persona" switches to the hidden theme; typing it again returns to the previous theme,
// and the hidden theme is listed only while it is active.
const theme=()=>page.evaluate(()=>document.documentElement.dataset.theme);
await page.locator('body').click({position:{x:5,y:5}});await page.keyboard.type('persona');
assert.equal(await theme(),'phantom','The secret word applies the hidden theme');
await page.keyboard.type('persona');assert.equal(await theme(),'burgundy','Typing it again restores the previous theme');
await page.getByRole('button',{name:'حساب tools_owner'}).click();await page.getByRole('button',{name:'المظهر والحركة'}).click();
assert.equal(await page.getByRole('radio',{name:'لصوص القلوب'}).count(),0,'Hidden while inactive');await page.getByRole('button',{name:'تم'}).click();
await page.keyboard.type('persona');assert.equal(await theme(),'phantom');
await page.getByRole('button',{name:'حساب tools_owner'}).click();await page.getByRole('button',{name:'المظهر والحركة'}).click();
assert.equal(await page.getByRole('radio',{name:'لصوص القلوب'}).count(),1,'Listed while active');
await page.getByRole('radio',{name:'عنابي مواثيق'}).check();
assert.equal(await page.getByRole('radio',{name:'لصوص القلوب'}).count(),0,'Choosing another theme hides it again');
await page.getByRole('button',{name:'تم'}).click();assert.equal(await theme(),'burgundy');

// Keyboard shortcuts.
await page.locator('body').press('Shift+Slash');
await page.getByRole('heading',{name:'اختصارات لوحة المفاتيح'}).waitFor();
await page.keyboard.press('Escape');
await page.locator('body').press('Alt+Digit2');
await page.getByRole('heading',{name:'سجل الأحكام',level:1}).waitFor();

// Closing an edited case asks first; recently opened cases appear in quick search.
await page.keyboard.press('Control+k');
const recentGroup=page.getByRole('dialog',{name:'بحث سريع'}).getByRole('group',{name:'فُتحت مؤخراً'});
await recentGroup.getByText(/TOOL-0/).waitFor();
assert.ok(await recentGroup.getByText(/TOOL-2/).isVisible(),'Both recently opened cases are offered');
await recentGroup.getByText(/TOOL-0/).click();
const sheet=page.getByRole('dialog').filter({hasText:'CASE FILE · TOOL-0'});
await sheet.getByLabel('الخصم',{exact:true}).fill('خصم معدل دون حفظ');
await page.keyboard.press('Escape');
await page.getByRole('alertdialog').getByText('تغييرات غير محفوظة').waitFor();
await page.getByRole('button',{name:'متابعة التعديل'}).click();
assert.equal(await sheet.getByLabel('الخصم',{exact:true}).inputValue(),'خصم معدل دون حفظ','Edits are kept when continuing');
await page.keyboard.press('Escape');
await page.getByRole('button',{name:'إغلاق دون حفظ'}).click();
await sheet.waitFor({state:'hidden'});
assert.equal((await rpc('mawatheeq_local_request',[login.token,'cases_page','{"offset":0}'])).find(c=>c.id==='tools-case-0').payload.opponent,'خصم الأدوات 0','Discarded edits are not saved');

// Account actions live in the avatar menu.
const openAccount=()=>page.getByRole('button',{name:'حساب tools_owner'}).click();
await openAccount();
for(const name of ['تغيير مساحة العمل','تغيير كلمة المرور','خروج'])assert.ok(await page.getByRole('button',{name,exact:true}).isVisible(),name+' in account menu');
await page.getByRole('button',{name:'تغيير مساحة العمل',exact:true}).click();

// Accounting prints a statement and a receipt voucher.
const stubPrint=()=>page.evaluate(()=>{window.__printed='';window.open=()=>({document:{write:h=>{window.__printed+=h},close(){}},focus(){},print(){}})});
await page.getByRole('button',{name:'فتح المحاسبة'}).click();
await page.getByText('RC-1').waitFor();await stubPrint();
await page.getByRole('button',{name:'طباعة كشف حساب'}).click();
await page.waitForFunction(()=>window.__printed.includes('كشف حساب'));
let finance=await page.evaluate(()=>window.__printed);
assert.ok(finance.includes('10.000 KWD')&&finance.includes('2.500 KWD')&&finance.includes('7.500 KWD'),'Statement totals and outstanding fees');
await page.getByRole('row',{name:/RC-1/}).getByRole('button',{name:'فتح القيد'}).click();
await stubPrint();await page.getByRole('button',{name:'طباعة السند'}).click();
finance=await page.evaluate(()=>window.__printed);
assert.ok(finance.includes('<h1>سند قبض</h1>')&&finance.includes('ديناران كويتيان وخمسمائة فلس'),'Receipt voucher with amount in words');
await page.keyboard.press('Escape');

// HR shows approved leave used this year and request lengths.
await page.getByRole('button',{name:'حساب tools_owner'}).click();await page.getByRole('button',{name:'تغيير مساحة العمل',exact:true}).click();
await page.getByRole('button',{name:'فتح الموارد البشرية'}).click();
await page.getByText(`إجازات معتمدة ${leaveYear}: 3 يوم`).waitFor();
await page.getByRole('button',{name:'الإجازات',exact:true}).click();
await page.getByText('3 يوم',{exact:true}).waitFor();
await page.screenshot({path:artifacts+'/hr.png'});
// With full motion, effects never block work: ripples, view transitions, tabs and workspace switches stay interactive.
const lively=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference',timezoneId:'Asia/Kuwait'});
const motion=await lively.newPage();motion.on('pageerror',e=>errors.push('motion: '+e.message));
await motion.route('**/app-config.json',route=>route.fulfill({json:{supabaseUrl:'https://office-fixture.supabase.co',supabasePublishableKey:'sb_publishable_synthetic'}}));
await motion.route('https://office-fixture.supabase.co/**',async route=>{const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
 const name=new URL(req.url()).pathname.split('/').pop(),body=req.postDataJSON(),args=name==='mawatheeq_local_login'?[body.p_username,body.p_password]:[body.p_token,body.p_action,JSON.stringify(body.p_data||{})];
 try{await route.fulfill({json:await rpc(name,args)})}catch(e){await route.fulfill({status:400,json:{message:e.message,code:e.code||'P0001'}})}});
await motion.goto(base);
await motion.getByLabel('اسم المستخدم',{exact:true}).fill('tools_owner');await motion.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');
await motion.getByRole('button',{name:'فتح مساحة العمل',exact:true}).click();
for(const round of [1,2]){
 await motion.getByRole('button',{name:'فتح القضايا'}).click();
 await motion.getByRole('heading',{name:'كل قضاياك، في مكان واحد'}).waitFor();
 await motion.getByRole('button',{name:'حساب tools_owner'}).click();await motion.getByRole('button',{name:'تغيير مساحة العمل',exact:true}).click();
 await motion.getByRole('button',{name:'فتح المحاسبة'}).click();await motion.getByText('RC-1').waitFor();
 await motion.getByRole('button',{name:'حساب tools_owner'}).click();await motion.getByRole('button',{name:'تغيير مساحة العمل',exact:true}).click();
}
await motion.getByRole('button',{name:'فتح القضايا'}).click();
await motion.getByRole('heading',{name:'كل قضاياك، في مكان واحد'}).waitFor();
await motion.goto(base+'#cases');await motion.getByRole('button',{name:/فتح القضية/}).first().click();
await motion.getByRole('tab',{name:'الطعن والتنفيذ'}).click();
await motion.getByRole('tabpanel').waitFor();
await motion.waitForTimeout(1300);
assert.equal(await motion.locator('.ripple-host').count(),0,'Press ripples remove themselves');
assert.equal(await motion.locator('canvas.burst-canvas').count(),1);assert.equal(await motion.locator('.ambient-canvas').isVisible(),true,'The constellation backdrop is drawn');
await motion.mouse.wheel(0,600);await motion.waitForTimeout(1500);
assert.equal(await motion.evaluate(()=>document.documentElement.hasAttribute('data-scrolling')),false,'Scroll-reactive lag settles after scrolling stops');
assert.equal(await motion.evaluate(()=>document.documentElement.dataset.motion),'full');
await lively.close();
assert.deepEqual(errors,[],'No runtime errors');
await browser.close();
console.log('Passed tools UI: personal work panel, prioritized notifications that open tasks, month calendar navigation, Ctrl+K case/section search, escaped printable case sheet, account menu without floating bars, per-page help from settings, contact call/WhatsApp links, accounting statement and receipt printing, HR leave days, full-motion interaction smoke test, @mention discussion with replies and moderation, persistent themes and backgrounds, keyboard shortcuts, recent cases, unsaved-edit protection and no runtime errors.');
