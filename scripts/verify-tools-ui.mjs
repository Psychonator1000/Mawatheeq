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
for(let i=0;i<3;i++)await local('save_case',{case:{id:'tools-case-'+i,code:'TOOL-'+i,autoNumber:String(7000+i),caseNumber:'2026/'+(300+i),client:'شركة أدوات تجريبية',clientGroup:'شركة أدوات تجريبية',opponent:'خصم الأدوات '+i,date:i===0?iso(-27):'2026-01-05',type:'حكم أول درجة',outcome:'لصالحنا',ruling:'<b>منطوق تجريبي</b>',procedures:[],revision:0}});
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
// The test machine has few cores; pin full effects so automatic light mode does not hide what is being tested.
await context.addInitScript(()=>{try{const k='mawatheeq.appearance.v1',a=JSON.parse(localStorage.getItem(k)||'{}');if(!a.performance){a.performance='full';localStorage.setItem(k,JSON.stringify(a))}}catch{/* test setup */}});
const page=await context.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));
let slowServer=0;const uploads=[];
// The synthetic backend for every page in a context: database calls, the files function and chat storage uploads.
async function wireFixture(ctx){
 await ctx.route('**/app-config.json',route=>route.fulfill({json:{supabaseUrl:'https://office-fixture.supabase.co',supabasePublishableKey:'sb_publishable_synthetic'}}));
 await ctx.route('https://office-fixture.supabase.co/**',async route=>{
  const req=route.request();if(slowServer)await new Promise(r=>setTimeout(r,slowServer));const url=new URL(req.url());
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  if(url.pathname.includes('/storage/v1/object/upload/sign/mawatheeq-chat/')){uploads.push(url.pathname);return route.fulfill({json:{Key:url.pathname}})}
  if(url.pathname.includes('/storage/v1/object/sign/mawatheeq-chat/'))return route.fulfill({contentType:'application/pdf',body:'%PDF-1.4 synthetic'});
  const name=url.pathname.split('/').pop();const body=req.postDataJSON();
  if(name==='local-files'){const upload=body.action==='chat_upload';
   try{const r=await rpc('mawatheeq_chat_request',[body.sessionToken,upload?'file_upload':'file_download',JSON.stringify(upload?{conversationId:body.conversationId,name:body.name,size:body.size,mime:body.mime}:{path:body.path})]);
    return route.fulfill({json:upload?{path:r.path,token:'synthetic'}:{path:r.path,url:'https://office-fixture.supabase.co/storage/v1/object/sign/mawatheeq-chat/'+r.path+'?token=synthetic'}})}
   catch(e){return route.fulfill({json:{error:e.message}})}}
  if(!['mawatheeq_local_login','mawatheeq_local_request','mawatheeq_client_request','mawatheeq_office_request','mawatheeq_department_request','mawatheeq_comment_request','mawatheeq_chat_request'].includes(name))return route.fulfill({status:400,json:{message:'Unexpected synthetic endpoint'}});
  const args=name==='mawatheeq_local_login'?[body.p_username,body.p_password]:[body.p_token,body.p_action,JSON.stringify(body.p_data||{})];
  try{await route.fulfill({json:await rpc(name,args)})}catch(e){await route.fulfill({status:400,json:{message:e.message,code:e.code||'P0001'}})}
 });
}
await wireFixture(context);
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

// A refresh opens instantly from the last visit even when the server is slow, then the server's copy takes over.
await page.waitForFunction(()=>!!localStorage.getItem('mawatheeq.boot.v1'));await page.waitForTimeout(300);
// Each server answer takes 8 s, so anything shown sooner came from the last visit, not the server.
slowServer=8000;const reloadStart=Date.now();await page.reload();
await mine.getByText('مهمة متأخرة تجريبية').waitFor({timeout:7000});
assert.ok(Date.now()-reloadStart<7500,'Workspace and work appear before the slow server answers');
assert.equal(await page.getByText('جارٍ تحميل سجلاتك',{exact:false}).count(),0,'No loading placeholder on a refresh');
await page.screenshot({path:artifacts+'/instant-reload.png'});
slowServer=0;await page.waitForTimeout(8500);

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
await editor.getByRole('heading',{name:'مهمة متأخرة تجريبية'}).waitFor();
assert.equal(await editor.getByLabel('عنوان العمل',{exact:true}).inputValue(),'مهمة متأخرة تجريبية','Notification opens that task');
// Task windows follow the case window: pinned facts, previous/next with Alt+arrows.
assert.ok(await editor.locator('.case-pin .case-facts').getByText('المسؤول',{exact:true}).isVisible(),'Task essentials are pinned');
assert.ok(await editor.locator('.case-nav').isVisible(),'Task window can step through the list');
await page.keyboard.press('Alt+ArrowLeft');
await page.waitForFunction(()=>document.querySelector('[data-record-window] input')?.value!=='مهمة متأخرة تجريبية');
assert.equal(await page.locator('[data-record-window]').getAttribute('data-enter'),'next','Next task slides in');
await page.screenshot({path:artifacts+'/task-window.png'});
await page.keyboard.press('Escape');await page.locator('[data-record-window]').waitFor({state:'hidden'});

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
await page.locator('.case-pin').getByText('خصم الأدوات 2').waitFor();
// The case file keeps company, opponent, case number and progress pinned while the rest scrolls.
{const pin=page.locator('.case-pin');assert.ok(await pin.getByText('2026/302').isVisible(),'case number in the pinned header');assert.equal(await pin.locator('.progress-steps .step').count(),3);
 await page.waitForTimeout(700);const before=await pin.boundingBox();
 await page.locator('.case-main').evaluate(e=>e.scrollTo(0,e.scrollHeight));await page.waitForTimeout(200);
 const box=await pin.boundingBox();assert.ok(before&&box&&Math.abs(box.y-before.y)<2,'the case essentials stay in place while the fields scroll');assert.ok(await pin.getByText('شركة أدوات تجريبية').isVisible());
 await page.locator('.case-main').evaluate(e=>e.scrollTo(0,0));}

// Printable case sheet uses escaped case text.
await page.evaluate(()=>{window.__printed='';window.__mawatheeqPrint=h=>{window.__printed+=h}});
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
const call=page.locator('.case-main').getByRole('link',{name:'اتصال بـ منسق تجريبي'});
assert.equal(await call.getAttribute('href'),'tel:+96599991234','Arabic-digit local number becomes an international call link');
assert.equal(await page.locator('.case-main').getByRole('link',{name:'واتساب منسق تجريبي'}).getAttribute('href'),'https://wa.me/96599991234');
assert.equal(await page.locator('.case-pin').getByRole('link',{name:'اتصال بـ منسق تجريبي'}).getAttribute('href'),'tel:+96599991234','The follow-up contact can be called from the pinned summary');
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
assert.equal(await page.getByRole('radio',{name:/أبيض وذهبي|أسود وذهبي/}).count(),0,'one gold theme, not two');
await page.getByRole('radio',{name:'ساكورا',exact:true}).check();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'rose');assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.ambient-canvas')).display),'block','Sakura draws falling petals');
await page.getByRole('radio',{name:'ذهبي',exact:true}).check();assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(11, 10, 8)','Gold is black and gold by default');
await page.getByRole('radio',{name:'فاتح',exact:true}).check();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'ivory','Gold in light mode is white and gold');await page.getByRole('radio',{name:/^حسب السمة/}).check();
await page.getByRole('radio',{name:'أزرق سماوي'}).check();await page.getByRole('radio',{name:/يراعات مضيئة/}).check();
assert.deepEqual(await page.evaluate(()=>[document.documentElement.dataset.theme,document.documentElement.dataset.backdrop]),['sky','fireflies']);
await page.getByRole('button',{name:'استعادة الافتراضي'}).click();await page.getByRole('button',{name:'تم'}).click();
assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'burgundy');
assert.equal(await page.evaluate(()=>document.documentElement.dataset.backdrop),'constellation','The living dot network is the default backdrop');
// Client profiles open in the same window as cases: pinned summary, quick actions, previous/next.
{const cards=page.locator('.client-card');if(await cards.count()>1){const first=(await cards.first().locator('h3').innerText()).trim();await cards.first().click();
 const win=page.locator('[data-record-window]');await win.locator('.case-facts').getByText('القضايا النشطة',{exact:true}).waitFor();
 assert.equal((await win.getByRole('heading').first().innerText()).trim(),first,'Client window shows the client');
 assert.ok(await win.locator('.case-quick').getByRole('button',{name:/إضافة شخص/}).isVisible(),'Quick actions are pinned');
 await page.screenshot({path:artifacts+'/client-window.png'});
 await page.keyboard.press('Alt+ArrowLeft');await page.waitForFunction(f=>document.querySelector('[data-record-window] h2')?.textContent?.trim()!==f,first);
 await page.keyboard.press('Escape');await win.waitFor({state:'hidden'})}}

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
await page.getByRole('radio',{name:/^بدون إخفاء الشكل/}).check();assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.cursor-halo')).display),'none','the cursor follower can be hidden');
await page.getByRole('radio',{name:'نقطة',exact:true}).check();assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.cursor-halo')).width),'8px');
await page.getByRole('radio',{name:'حلقة صغيرة',exact:true}).check();
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
const sheet=page.getByRole('dialog').filter({has:page.locator('.case-pin').getByText('TOOL-0')});
await sheet.getByLabel('الخصم',{exact:true}).fill('خصم معدل دون حفظ');
await page.keyboard.press('Escape');
await page.getByRole('alertdialog').getByText('تغييرات غير محفوظة').waitFor();
await page.getByRole('button',{name:'متابعة التعديل'}).click();
assert.equal(await sheet.getByLabel('الخصم',{exact:true}).inputValue(),'خصم معدل دون حفظ','Edits are kept when continuing');
await page.keyboard.press('Escape');
await page.getByRole('button',{name:'إغلاق دون حفظ'}).click();
await sheet.waitFor({state:'hidden'});
assert.equal((await rpc('mawatheeq_local_request',[login.token,'cases_page','{"offset":0}'])).find(c=>c.id==='tools-case-0').payload.opponent,'خصم الأدوات 0','Discarded edits are not saved');

// Court levels: moving to appeal closes the first-instance file as a read-only record and starts a fresh one.
await page.keyboard.press('Control+k');await page.getByRole('dialog',{name:'بحث سريع'}).getByRole('group',{name:'فُتحت مؤخراً'}).getByText(/TOOL-2/).click();
const lv=page.locator('[data-record-window]');await lv.locator('.case-pin').getByText('TOOL-2').waitFor();
await lv.locator('.case-quick').getByRole('button',{name:'نقل إلى الاستئناف'}).click();
const mv=page.getByRole('dialog',{name:/نقل القضية إلى الاستئناف/});
assert.equal(await mv.getByRole('button',{name:/نقل إلى الاستئناف وحفظ/}).isDisabled(),true,'Who appealed is required');
await mv.getByLabel('من طعن في الحكم؟',{exact:true}).selectOption('الخصم');await mv.getByLabel('رقم القضية في الاستئناف',{exact:true}).fill('2026/77 مدني استئناف');await mv.getByLabel('المحكمة / الدائرة',{exact:true}).fill('محكمة الاستئناف · الدائرة 3');
await mv.getByRole('button',{name:/نقل إلى الاستئناف وحفظ/}).click();await mv.waitFor({state:'hidden'});
const closedLevel=lv.locator('.stage-card.closed');await closedLevel.getByText('2026/302').waitFor();
assert.ok(await closedLevel.getByText('الخصم',{exact:true}).isVisible(),'The closed level records who appealed');
assert.ok(await closedLevel.getByText('tools_owner',{exact:true}).isVisible(),'The server records who closed the level');
assert.ok(await lv.locator('.case-pin').getByText('2026/77 مدني استئناف').isVisible(),'The new level\'s case number is pinned');
assert.ok(await lv.locator('.case-pin').getByText('أول درجة: 2026/302').isVisible(),'Earlier case numbers stay visible');
assert.ok(await lv.locator('.progress-steps .step.current').getByText('بانتظار الحكم').isVisible(),'The appeal is waiting for its judgment');
await page.screenshot({path:artifacts+'/case-levels.png'});
const saved=(await rpc('mawatheeq_local_request',[login.token,'cases_page','{"offset":0}'])).find(c=>c.id==='tools-case-2').payload;
assert.equal(saved.stage,'استئناف');assert.equal(saved.stages.length,1);assert.equal(saved.stages[0].caseNumber,'2026/302');assert.equal(saved.date,'');
await lv.getByRole('tab',{name:/بيانات الحكم/}).click();await lv.locator('.progress-steps .step.done').getByRole('button').click();
assert.equal(await lv.getByRole('tab',{name:/درجات التقاضي/}).getAttribute('aria-selected'),'true','A finished level opens its record');
await page.keyboard.press('Escape');await lv.waitFor({state:'hidden'});
// Sessions: an adjournment is logged in the case's level, closes today's hearing, schedules the next one (pinned and in the timeline), and the day's roll prints it.
{await page.keyboard.press('Control+k');const qs=page.getByRole('dialog',{name:'بحث سريع'});await qs.getByRole('combobox').fill('TOOL-1');await qs.getByRole('option',{name:/TOOL-1/}).first().click();
 const sw=page.locator('[data-record-window]');await sw.locator('.case-pin').getByText('TOOL-1').waitFor();
 await sw.locator('.case-quick').getByRole('button',{name:/تسجيل جلسة/}).click();
 await sw.getByRole('combobox',{name:'قرار الجلسة'}).click();await page.getByRole('option',{name:'تأجيل للإعلان',exact:true}).click();
 assert.equal(await sw.getByRole('button',{name:'تسجيل الجلسة'}).isDisabled(),true,'An adjournment needs the next session date');
 await sw.getByRole('button',{name:/^موعد الجلسة القادمة/}).click();await page.locator('.date-popover').getByRole('button',{name:'اليوم',exact:true}).click();
 await sw.getByLabel('الوقت (اختياري)',{exact:true}).fill('10:30');await sw.getByRole('button',{name:'تسجيل الجلسة'}).click();
 await sw.locator('.session-table').getByText('تأجيل للإعلان').waitFor();await sw.locator('.next-hearing').getByText(/10:30/).waitFor({timeout:8000});
 const saved=(await rpc('mawatheeq_local_request',[login.token,'cases_page','{"offset":0}'])).find(c=>c.id==='tools-case-1').payload;
 const logged=saved.procedures.find(p=>p.kind==='جلسة');assert.equal(logged.decision,'تأجيل للإعلان');assert.equal(logged.followup,today);assert.equal(logged.recordedBy,'tools_owner');
 await page.screenshot({path:artifacts+'/sessions.png'});
 await sw.getByRole('tab',{name:'السير الزمني'}).click();await sw.locator('.tl-item.session').getByText('جلسة: تأجيل للإعلان').waitFor();
 assert.ok(await sw.locator('.tl-item.hearing').filter({hasText:'جلسة · أول درجة'}).count()>=1,'The scheduled session is on the timeline');
 await page.screenshot({path:artifacts+'/timeline.png'});
 assert.equal(await sw.getByRole('tab',{name:'المالية'}).count(),1,'Accounting users see the case finances');await sw.getByRole('tab',{name:'المالية'}).click();await sw.getByText(/لا توجد حركات مالية مسجلة لهذه القضية/).waitFor();
 await page.keyboard.press('Escape');await sw.waitFor({state:'hidden'});
 await page.evaluate(()=>{location.hash='work'});await page.getByRole('heading',{name:'المهام والجلسات',level:1}).waitFor();
 await page.evaluate(()=>{window.__printed='';window.__mawatheeqPrint=h=>{window.__printed+=h}});
 await page.getByRole('button',{name:/^يوم رول الجلسات/}).click();await page.locator('.date-popover').getByRole('button',{name:'اليوم',exact:true}).click();
 await page.getByRole('button',{name:/طباعة رول الجلسات/}).click();const roll=await page.evaluate(()=>window.__printed);
 assert.ok(roll.includes('رول الجلسات')&&roll.includes('TOOL-1')&&roll.includes('10:30'),'The roll lists the day\'s hearings');}
// The lawyer is picked from the office's lawyers, or typed when new; the case list offers it afterwards.
await page.keyboard.press('Control+k');await page.getByRole('dialog',{name:'بحث سريع'}).getByRole('group',{name:'فُتحت مؤخراً'}).getByText(/TOOL-0/).click();
const lw=page.locator('[data-record-window]');await lw.locator('.case-pin').getByText('TOOL-0').waitFor();
await lw.getByRole('combobox',{name:'المحامي'}).click();await page.getByRole('option',{name:'اسم آخر…'}).click();
await lw.getByLabel('اسم المحامي',{exact:true}).fill('ا/ محامٍ تجريبي');await page.keyboard.press('Control+s');
await page.waitForFunction(async()=>true);await lw.locator('.case-facts').getByText('ا/ محامٍ تجريبي').waitFor();
await page.waitForTimeout(800);assert.equal((await rpc('mawatheeq_local_request',[login.token,'cases_page','{"offset":0}'])).find(c=>c.id==='tools-case-0').payload.lawyer,'ا/ محامٍ تجريبي','A new lawyer name is saved');
await page.keyboard.press('Escape');await lw.waitFor({state:'hidden'});
await page.keyboard.press('Control+k');await page.getByRole('dialog',{name:'بحث سريع'}).getByRole('group',{name:'فُتحت مؤخراً'}).getByText(/TOOL-2/).click();
await lw.locator('.case-pin').getByText('TOOL-2').waitFor();await lw.getByRole('combobox',{name:'المحامي'}).click();await page.getByRole('option',{name:'ا/ محامٍ تجريبي'}).click();
assert.equal(await lw.getByLabel('اسم المحامي',{exact:true}).count(),0,'A listed lawyer needs no typing');
await page.keyboard.press('Control+s');await page.waitForTimeout(800);
assert.equal((await rpc('mawatheeq_local_request',[login.token,'cases_page','{"offset":0}'])).find(c=>c.id==='tools-case-2').payload.lawyer,'ا/ محامٍ تجريبي','The listed lawyer is saved');
await page.screenshot({path:artifacts+'/lawyer-picker.png'});await page.keyboard.press('Escape');await lw.waitFor({state:'hidden'});
await page.keyboard.press('Control+k');await page.getByRole('dialog',{name:'بحث سريع'}).getByRole('combobox').fill('2026/302');
await page.getByRole('dialog',{name:'بحث سريع'}).getByText(/TOOL-2/).first().waitFor();await page.keyboard.press('Escape');

// Account actions live in the avatar menu.
const openAccount=()=>page.getByRole('button',{name:'حساب tools_owner'}).click();
await openAccount();
for(const name of ['تغيير مساحة العمل','تغيير كلمة المرور','خروج'])assert.ok(await page.getByRole('button',{name,exact:true}).isVisible(),name+' in account menu');
await page.getByRole('button',{name:'نصائح واختصارات'}).click();await page.getByRole('heading',{name:'نصائح مواثيق'}).waitFor();
for(const keys of ['Ctrl + K','Alt + 1 … 9','Shift + T','Ctrl + B'])assert.ok(await page.getByRole('dialog').getByText(keys,{exact:true}).isVisible(),keys+' listed in tips');
await page.getByRole('button',{name:'فهمت'}).click();await openAccount();
await page.getByRole('button',{name:'الوضع الداكن',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.mode),'dark','light themes switch to their dark version');
assert.match(await page.evaluate(()=>getComputedStyle(document.body).cursor),/^url\("data:image\/svg\+xml/,'the mouse pointer is drawn in the theme colours');
await openAccount();await page.getByRole('button',{name:'الوضع الفاتح',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.mode),undefined);await openAccount();
await page.getByRole('button',{name:'تغيير مساحة العمل',exact:true}).click();

// Accounting prints a statement and a receipt voucher.
const stubPrint=()=>page.evaluate(()=>{window.__printed='';window.__mawatheeqPrint=h=>{window.__printed+=h}});
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
await lively.addInitScript(()=>{try{const k='mawatheeq.appearance.v1',a=JSON.parse(localStorage.getItem(k)||'{}');if(!a.performance){a.performance='full';localStorage.setItem(k,JSON.stringify(a))}}catch{/* test setup */}});
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
{const code=async()=>(await motion.locator('.case-pin-codes').innerText()).match(/TOOL-\d/)?.[0];const first=await code();
 await motion.keyboard.press('Alt+ArrowLeft');await motion.waitForTimeout(500);const second=await code();assert.ok(first&&second&&first!==second,'Alt+← moves to the next case without closing');
 await motion.keyboard.press('Alt+ArrowRight');await motion.waitForTimeout(500);assert.equal(await code(),first,'Alt+→ returns to the previous case');}
await motion.waitForTimeout(1300);
assert.equal(await motion.locator('.ripple-host').count(),0,'Press ripples remove themselves');
assert.equal(await motion.locator('canvas.burst-canvas').count(),1);assert.equal(await motion.locator('.ambient-canvas').isVisible(),true,'The constellation backdrop is drawn');
// Rows scrolled into view rise in as one piece, then drop the effect class.
await motion.keyboard.press('Escape');await motion.setViewportSize({width:1280,height:380});await motion.goto(base+'#cases');await motion.reload();await motion.getByRole('button',{name:/فتح القضية/}).first().waitFor({state:'attached'});
await motion.evaluate(()=>{scrollTo(0,0);window.__flips=new Set();document.addEventListener('animationstart',e=>{if(e.animationName.startsWith('row-rise'))window.__flips.add(e.target.parentElement)})});await motion.waitForTimeout(600);
for(let i=0;i<8;i++){await motion.mouse.wheel(0,120);await motion.waitForTimeout(90)}
await motion.waitForTimeout(250);assert.ok(await motion.evaluate(()=>window.__flips.size)>0,'Rows entering while scrolling rise in');
await motion.waitForTimeout(2200);assert.equal(await motion.locator('tr.row-reveal').count(),0,'The reveal class is removed after the animation');
await motion.setViewportSize({width:1280,height:900});
await motion.mouse.wheel(0,600);await motion.waitForTimeout(1500);
assert.equal(await motion.evaluate(()=>document.documentElement.hasAttribute('data-scrolling')),false,'Scroll-reactive lag settles after scrolling stops');
assert.equal(await motion.evaluate(()=>document.documentElement.dataset.motion),'full');
// Light mode turns the heavy effects off while the app keeps working.
await motion.evaluate(()=>{const k='mawatheeq.appearance.v1',a=JSON.parse(localStorage.getItem(k)||'{}');localStorage.setItem(k,JSON.stringify({...a,performance:'lite'}))});await motion.reload();await motion.waitForTimeout(800);
assert.equal(await motion.evaluate(()=>document.documentElement.dataset.perf),'lite');
assert.equal(await motion.evaluate(()=>getComputedStyle(document.querySelector('.ambient-canvas')).display),'none','light mode stops the animated backdrop');
assert.equal(await motion.evaluate(()=>getComputedStyle(document.querySelector('.topbar')).backdropFilter),'none','light mode drops glass blur');
await lively.close();
// Staff chat: the owner writes to a colleague with a case reference; the colleague sees the unread badge, opens the
// case from the reference, and replies with a file; the owner downloads it and starts a group.
{const bubble=page.getByRole('button',{name:/^المحادثات/});await page.goto(base+'#overview');await bubble.click();
 const panel=page.getByRole('dialog',{name:'المحادثات'});
 await panel.getByRole('button',{name:'محادثة جديدة'}).click();await panel.getByRole('button',{name:/tools_clerk/}).click();
 const box=panel.getByLabel('نص الرسالة');await box.click();await box.pressSequentially('مرحبا، راجع #TOOL-0');
 await panel.getByRole('option',{name:/#TOOL-0/}).waitFor();await box.press('Enter');await box.pressSequentially('اليوم');
 assert.equal(await box.inputValue(),'مرحبا، راجع #TOOL-0 اليوم','Choosing a suggestion inserts the reference');await box.press('Enter');
 await panel.locator('.chat-msg.mine .chat-ref').getByText('#TOOL-0').waitFor();
 await page.screenshot({path:artifacts+'/chat-owner.png'});
 const clerkCtx=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce',timezoneId:'Asia/Kuwait'});await wireFixture(clerkCtx);
 const cp=await clerkCtx.newPage();cp.on('pageerror',e=>errors.push('clerk: '+e.message));await cp.goto(base);
 await cp.getByLabel('اسم المستخدم',{exact:true}).fill('tools_clerk');await cp.getByLabel('كلمة المرور',{exact:true}).fill('Fixture-password-123');await cp.getByRole('button',{name:'فتح مساحة العمل',exact:true}).click();
 const cb=cp.getByRole('button',{name:'المحادثات، 1 غير مقروءة'});await cb.waitFor({timeout:15000});await cb.click();
 const cpanel=cp.getByRole('dialog',{name:'المحادثات'});await cpanel.getByRole('button',{name:/tools_owner/}).click();
 await cpanel.locator('.chat-ref').getByText('#TOOL-0').click();
 await cp.locator('[data-record-window] .case-pin').getByText('TOOL-0').waitFor();assert.equal(await cpanel.count(),0,'Opening a reference shows the case');
 await cp.keyboard.press('Escape');await cp.locator('[data-record-window]').waitFor({state:'hidden'});
 await cp.getByRole('button',{name:/^المحادثات/}).click();await cpanel.getByLabel('نص الرسالة').waitFor(); // Reopening returns to the same conversation
 await cpanel.locator('input[type=file]').setInputFiles({name:'memo.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic')});
 await cpanel.getByLabel('نص الرسالة').fill('المذكرة مرفقة');await cpanel.getByRole('button',{name:'إرسال'}).click();
 await cpanel.locator('.chat-msg.mine .chat-file').getByText('memo.pdf').waitFor();assert.equal(uploads.length,1,'The file went to chat storage');
 await panel.locator('.chat-msg:not(.mine) .chat-file').getByText('memo.pdf').waitFor({timeout:15000});
 const [popup]=await Promise.all([page.waitForEvent('popup'),panel.locator('.chat-file').getByText('memo.pdf').click()]);await popup.close();
 // Edit within 15 minutes; groups with a system note.
 await panel.locator('.chat-msg.mine').first().hover();await panel.getByRole('button',{name:'تعديل الرسالة'}).first().click();
 await panel.getByLabel('نص الرسالة').fill('مرحبا، راجع #TOOL-0 اليوم من فضلك');await panel.getByRole('button',{name:'حفظ التعديل'}).click();
 await panel.getByText('عُدّلت',{exact:false}).first().waitFor();
 await panel.getByRole('button',{name:'رجوع إلى المحادثات'}).click();await panel.getByRole('button',{name:'مجموعة جديدة'}).click();
 await panel.getByLabel('اسم المجموعة').fill('فريق الأدوات');await panel.getByRole('checkbox').first().check();await panel.getByRole('button',{name:/إنشاء المجموعة/}).click();
 await panel.getByText(/أنشأ tools_owner المجموعة مع/).waitFor();await page.screenshot({path:artifacts+'/chat-group.png'});
 await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
 await clerkCtx.close();}
// Automatic light mode on a strong PC: the old permanent "slow" flag is ignored; a fresh one explains itself and can be cleared.
{const strong=await context.newPage();
 await strong.addInitScript(()=>{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>16});Object.defineProperty(navigator,'deviceMemory',{get:()=>16});
  const real=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...r){if(t==='webgl')return {getExtension:n=>n==='WEBGL_debug_renderer_info'?{UNMASKED_RENDERER_WEBGL:1}:null,getParameter:()=>'ANGLE (NVIDIA GeForce RTX)',RENDERER:2};return real.call(this,t,...r)};
  try{const k='mawatheeq.appearance.v1',a=JSON.parse(localStorage.getItem(k)||'{}');localStorage.setItem(k,JSON.stringify({...a,performance:'auto'}))}catch{/* test setup */}});
 await strong.goto(base);await strong.evaluate(()=>localStorage.setItem('mawatheeq.slow-device','1'));await strong.reload();await strong.waitForTimeout(600);
 assert.notEqual(await strong.evaluate(()=>document.documentElement.dataset.perf),'lite','The old permanent slow flag no longer forces light mode');
 await strong.evaluate(()=>localStorage.setItem('mawatheeq.slow-device',JSON.stringify({at:Date.now(),reason:'graphics'})));await strong.reload();await strong.waitForTimeout(600);
 assert.equal(await strong.evaluate(()=>document.documentElement.dataset.perf),'lite','A fresh measurement applies light mode');
 await strong.getByRole('button',{name:'حساب tools_owner'}).click();await strong.getByRole('button',{name:'المظهر والحركة'}).click();
 await strong.getByText(/تكررت إعادة تشغيل الرسوميات/).waitFor();await strong.screenshot({path:artifacts+'/perf-reason.png'});
 await strong.getByRole('button',{name:'إعادة تفعيل المؤثرات وقياس الجهاز من جديد'}).click();
 assert.notEqual(await strong.evaluate(()=>document.documentElement.dataset.perf),'lite','Re-enabling brings the effects back');
 assert.equal(await strong.evaluate(()=>localStorage.getItem('mawatheeq.slow-device')),null);
 await strong.evaluate(()=>{const k='mawatheeq.appearance.v1',a=JSON.parse(localStorage.getItem(k)||'{}');localStorage.setItem(k,JSON.stringify({...a,performance:'full'}))});await strong.close();}
// Signing out deletes the stored account and every stored copy of its records from this browser.
await page.getByRole('button',{name:'حساب tools_owner'}).click();await page.getByRole('menuitem',{name:/خروج/}).or(page.getByRole('button',{name:/^خروج/})).first().click();
await page.getByRole('button',{name:'فتح مساحة العمل',exact:true}).waitFor();await page.waitForTimeout(300);
assert.equal(await page.evaluate(()=>localStorage.getItem('mawatheeq.boot.v1')),null,'Stored account removed on sign-out');
assert.equal(await page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('mawatheeq-cache',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onsuccess=()=>{const q=r.result.transaction('snapshots').objectStore('snapshots').count();q.onsuccess=()=>{res(q.result);r.result.close()}}})),0,'Stored records removed on sign-out');
await page.reload();await page.getByRole('button',{name:'فتح مساحة العمل',exact:true}).waitFor();
assert.deepEqual(errors,[],'No runtime errors');
await browser.close();
console.log('Passed tools UI: staff chat (references, unread badge, open case from chat, file upload/download, edit, groups), automatic light mode explains itself and expires on strong PCs, sessions (decision, next hearing scheduled and pinned, timeline, finance tab, hearings roll), lawyer picker (listed and new names), court levels (move to appeal, closed read-only record, pinned numbers, search by earlier number), instant refresh from the last visit with a slow server and full removal on sign-out, personal work panel, prioritized notifications that open tasks, month calendar navigation, Ctrl+K case/section search, escaped printable case sheet, account menu without floating bars, per-page help from settings, contact call/WhatsApp links, accounting statement and receipt printing, HR leave days, full-motion interaction smoke test, @mention discussion with replies and moderation, persistent themes and backgrounds, keyboard shortcuts, recent cases, unsaved-edit protection and no runtime errors.');
