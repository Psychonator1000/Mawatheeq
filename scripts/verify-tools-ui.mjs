// Synthetic end-to-end test for notifications, quick search, personal work, calendar and printing.
// Run the Pages dev server on 127.0.0.1:4175 first. Uses an isolated in-memory database; never contacts the real backend.
import {supportFilterSelects} from './filter-select-helper.mjs';
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
await office('create_member',{username:'tools_clerk',password:'Temporary-password-123',permissions:{sections:['cases','work'],caseScope:'selected',caseIds:['tools-case-0'],canEdit:true,canExport:false}});
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
supportFilterSelects(page.locator('body'));
page.on('pageerror',e=>errors.push(e.message));
let slowServer=0;const uploads=[],caseUploads=[],caseRemoved=[];
// The synthetic backend for every page in a context: database calls, the files function and chat storage uploads.
async function wireFixture(ctx){
 await ctx.route('**/app-config.json',route=>route.fulfill({json:{supabaseUrl:'https://office-fixture.supabase.co',supabasePublishableKey:'sb_publishable_synthetic'}}));
 await ctx.route('https://office-fixture.supabase.co/**',async route=>{
  const req=route.request();if(slowServer)await new Promise(r=>setTimeout(r,slowServer));const url=new URL(req.url());
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  if(url.pathname.includes('/storage/v1/object/upload/sign/mawatheeq-chat/')){uploads.push(url.pathname);return route.fulfill({json:{Key:url.pathname}})}
  if(url.pathname.includes('/storage/v1/object/sign/mawatheeq-chat/'))return route.fulfill({contentType:'application/pdf',body:'%PDF-1.4 synthetic'});
  // Case documents: a signed upload stores the object (the database checks it exists before saving the record).
  if(url.pathname.includes('/storage/v1/object/upload/sign/mawatheeq-case-files/')){const path=decodeURIComponent(url.pathname.split('/mawatheeq-case-files/')[1]);caseUploads.push(path);
   if(/^cases\/[0-9a-f]{32}\/[0-9a-f-]{36}$/.test(path))await db.exec(`reset role;insert into storage.objects(bucket_id,name) values('mawatheeq-case-files','${path}');set role anon`);return route.fulfill({json:{Key:'mawatheeq-case-files/'+path}})}
  if(url.pathname.includes('/storage/v1/object/sign/mawatheeq-case-files/'))return route.fulfill({contentType:'application/pdf',body:'%PDF-1.4 synthetic'});
  const name=url.pathname.split('/').pop();const body=req.postDataJSON();
  if(name==='local-files'&&/^case_/.test(body.action)){const action=body.action.slice(5);
   try{const r=await rpc('mawatheeq_case_file_request',[body.sessionToken,action,JSON.stringify(action==='upload'?{caseId:body.caseId,size:body.size,mime:body.mime}:{id:body.id})]);
    if(action==='delete')caseRemoved.push(r.path);
    return route.fulfill({json:action==='upload'?{path:r.path,token:'synthetic'}:action==='download'?{path:r.path,url:'https://office-fixture.supabase.co/storage/v1/object/sign/mawatheeq-case-files/'+r.path+'?token=synthetic'}:{path:r.path}})}
   catch(e){return route.fulfill({json:{error:e.message}})}}
  if(name==='local-files'){const upload=body.action==='chat_upload';
   try{const r=await rpc('mawatheeq_chat_request',[body.sessionToken,upload?'file_upload':'file_download',JSON.stringify(upload?{conversationId:body.conversationId,name:body.name,size:body.size,mime:body.mime}:{path:body.path})]);
    return route.fulfill({json:upload?{path:r.path,token:'synthetic'}:{path:r.path,url:'https://office-fixture.supabase.co/storage/v1/object/sign/mawatheeq-chat/'+r.path+'?token=synthetic'}})}
   catch(e){return route.fulfill({json:{error:e.message}})}}
  if(!['mawatheeq_local_login','mawatheeq_local_request','mawatheeq_client_request','mawatheeq_office_request','mawatheeq_department_request','mawatheeq_comment_request','mawatheeq_chat_request','mawatheeq_case_file_request'].includes(name))return route.fulfill({status:400,json:{message:'Unexpected synthetic endpoint'}});
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

// The overview is statistics only: personal work lives on «المهام والجلسات» and in the notifications.
const latest=page.locator('.ov-col .panel').filter({has:page.getByRole('heading',{name:'أحدث الأحكام'})});
await latest.getByText('TOOL-0').first().waitFor();
assert.equal(await page.getByRole('region',{name:'عملي'}).count(),0,'No personal work list on the overview');

// A refresh opens instantly from the last visit even when the server is slow, then the server's copy takes over.
await page.waitForFunction(()=>!!localStorage.getItem('mawatheeq.boot.v1'));await page.waitForTimeout(300);
// Each server answer takes 8 s, so anything shown sooner came from the last visit, not the server.
slowServer=8000;const reloadStart=Date.now();await page.reload();
await latest.getByText('TOOL-0').first().waitFor({timeout:7000});
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
// Typing «@» offers colleagues who can see the case; the chosen one is notified.
const newComment=discussion.getByLabel('تعليق جديد');
await newComment.fill('نعم، استلمناها اليوم ');await newComment.pressSequentially('@tools_c');
await discussion.getByRole('option').filter({hasText:'@tools_clerk'}).click();
await discussion.getByRole('button',{name:'إرسال التعليق'}).click();
await discussion.getByText('نعم، استلمناها اليوم').waitFor();
await discussion.getByRole('list').getByRole('button',{name:'@tools_clerk'}).waitFor(); // The mention shows as a name chip
assert.equal((await rpc('mawatheeq_comment_request',[clerkSession.token,'mentions','{}'])).items.length,1,'The mentioned colleague receives the comment');
// Replies nest under the comment they answer, notify its author, and can cite a case by office code with «#».
const question=discussion.locator('.comment-list>li').filter({hasText:'هل استلمنا صيغة الحكم؟'});
await question.getByRole('button',{name:'رد'}).first().click();
const replyBox=question.getByLabel(/الرد على/);await replyBox.fill('راجع ');await replyBox.pressSequentially('#TOOL');
await question.getByRole('option').filter({hasText:'كود TOOL-0'}).first().click();await replyBox.pressSequentially('أيضاً');
assert.match(await replyBox.inputValue(),/^راجع كود TOOL-0 أيضاً$/,'«#» inserts the office code in a reply');
await question.getByRole('button',{name:'إرسال الرد'}).click();
const answer=question.locator('.comment-replies>li').filter({hasText:'أيضاً'});
await answer.waitFor({timeout:15000}).catch(async e=>{console.log('Discussion when the reply did not appear:\n'+await discussion.innerText());throw e});
await answer.getByRole('button',{name:'كود TOOL-0'}).waitFor();
assert.equal((await rpc('mawatheeq_comment_request',[clerkSession.token,'mentions','{}'])).items.length,2,'The answered author is notified of the reply');
// Mentioning someone offers «المشار إليهم فقط»: the comment is then private to them, the author and the office owner.
await newComment.fill('ملاحظة خاصة ');await newComment.pressSequentially('@tools_c');
await discussion.getByRole('option').filter({hasText:'@tools_clerk'}).click();
await discussion.getByLabel(/المشار إليهم فقط/).check();await discussion.getByRole('button',{name:'إرسال التعليق'}).click();
const secret=discussion.locator('.comment-list>li').filter({hasText:'ملاحظة خاصة'});await secret.locator('.comment-private').getByText(/خاص/).waitFor();
assert.equal((await rpc('mawatheeq_comment_request',[clerkSession.token,'list',JSON.stringify({targetType:'case',targetId:'tools-case-0'})])).find(c=>c.body.startsWith('ملاحظة خاصة')).private,true,'The comment is stored as private');
await page.screenshot({path:artifacts+'/discussion.png'});
await secret.getByRole('button',{name:'حذف التعليق'}).click();await secret.waitFor({state:'detached'}).catch(()=>{});
await question.getByRole('button',{name:'إخفاء الردود'}).click();await answer.waitFor({state:'detached'});await question.getByRole('button',{name:/عرض الرد/}).click();await answer.waitFor();
// A colleague's name opens a one-to-one chat with them.
await question.getByRole('button',{name:'tools_clerk'}).first().click();
const withClerk=page.getByRole('dialog',{name:'المحادثات'});await withClerk.locator('.chat-title').getByText('tools_clerk').waitFor();
await withClerk.getByLabel('نص الرسالة').fill('بخصوص النقاش');await withClerk.getByRole('button',{name:'إرسال'}).click();await withClerk.locator('.chat-main').getByText('بخصوص النقاش').waitFor();
await withClerk.getByRole('button',{name:'إغلاق المحادثات'}).click();await withClerk.waitFor({state:'detached'});
await answer.getByRole('button',{name:'حذف التعليق'}).click();await question.locator('.comment-replies>li.deleted').waitFor();
await discussion.getByRole('listitem').filter({hasText:'نعم، استلمناها اليوم'}).getByRole('button',{name:'حذف التعليق'}).click();
await page.waitForFunction(()=>document.querySelectorAll('.comment-thread li.deleted').length===3);
assert.equal(await question.locator(':scope>.comment-meta').getByRole('button',{name:'حذف التعليق'}).count(),1,'The office owner can moderate colleagues\' comments');
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
await page.goto(base+'#overview');await page.reload();await latest.getByText('TOOL-0').first().waitFor();
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
 // The circuit is picked from a list of kinds, with its number beside it.
 await sw.getByRole('combobox',{name:'الدائرة'}).click();await page.getByRole('option',{name:'تجاري كلي',exact:true}).click();await sw.getByLabel('رقم الدائرة / القاعة',{exact:true}).fill('5');
 await sw.getByRole('combobox',{name:'قرار الجلسة'}).click();await page.getByRole('option',{name:'تأجيل للإعلان',exact:true}).click();
 assert.equal(await sw.getByRole('button',{name:'تسجيل الجلسة'}).isDisabled(),true,'An adjournment needs the next session date');
 await sw.getByRole('button',{name:/^موعد الجلسة القادمة/}).click();await page.locator('.date-popover').getByRole('button',{name:'اليوم',exact:true}).click();
 await sw.getByLabel('الوقت (اختياري)',{exact:true}).fill('10:30');await sw.getByRole('button',{name:'تسجيل الجلسة'}).click();
 await sw.locator('.session-table').getByText('تأجيل للإعلان').waitFor();await sw.locator('.next-hearing').getByText(/10:30/).waitFor({timeout:8000});
 const saved=(await rpc('mawatheeq_local_request',[login.token,'cases_page','{"offset":0}'])).find(c=>c.id==='tools-case-1').payload;
 const logged=saved.procedures.find(p=>p.kind==='جلسة');assert.equal(logged.decision,'تأجيل للإعلان');assert.equal(logged.court,'تجاري كلي / 5','The circuit is saved as kind and number');assert.equal(logged.followup,today);assert.equal(logged.recordedBy,'tools_owner');
 await page.screenshot({path:artifacts+'/sessions.png'});
 await sw.getByRole('tab',{name:'السير الزمني'}).click();await sw.locator('.tl-item.session').getByText('جلسة: تأجيل للإعلان').waitFor();
 assert.ok(await sw.locator('.tl-item.hearing').filter({hasText:'جلسة · أول درجة'}).count()>=1,'The scheduled session is on the timeline');
 await page.screenshot({path:artifacts+'/timeline.png'});
 assert.equal(await sw.getByRole('tab',{name:'المالية'}).count(),1,'Accounting users see the case finances');await sw.getByRole('tab',{name:'المالية'}).click();await sw.getByText(/لا توجد حركات مالية مسجلة لهذه القضية/).waitFor();
 // صفة الموكل is a list with «أخرى…» for anything else (looked at, not changed, so nothing is left unsaved).
 await sw.getByRole('tab',{name:/^بيانات الحكم/}).click();await sw.getByRole('combobox',{name:'صفة الموكل'}).click();
 for(const o of ['مدعي','مدعى عليه','أخرى…'])await page.getByRole('option',{name:o,exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('listbox').waitFor({state:'hidden'});
 assert.equal(await sw.locator('input[aria-autocomplete=list]').count()>0,true,'Court and opponent fields offer typing suggestions');
 await page.keyboard.press('Escape');await sw.waitFor({state:'hidden'});
 await page.evaluate(()=>{location.hash='work'});await page.getByRole('heading',{name:'المهام والجلسات',level:2}).waitFor();
 await page.evaluate(()=>{window.__printed='';window.__mawatheeqPrint=h=>{window.__printed+=h}});
 await page.getByRole('button',{name:/^يوم رول الجلسات/}).click();await page.locator('.date-popover').getByRole('button',{name:'اليوم',exact:true}).click();
 await page.getByRole('button',{name:/طباعة رول الجلسات/}).click();const roll=await page.evaluate(()=>window.__printed);
 assert.ok(roll.includes('رول الجلسات')&&roll.includes('TOOL-1')&&roll.includes('10:30'),'The roll lists the day\'s hearings');}
// An admin can correct a recorded session (its next hearing follows) or delete it (cancelling the hearing it scheduled).
{await page.keyboard.press('Control+k');const qs=page.getByRole('dialog',{name:'بحث سريع'});await qs.getByRole('combobox').fill('TOOL-1');await qs.getByRole('option',{name:/TOOL-1/}).first().click();
 const sw=page.locator('[data-record-window]');await sw.locator('.case-pin').getByText('TOOL-1').waitFor();
 await sw.locator('.case-quick').getByRole('button',{name:/تسجيل جلسة/}).click();
 await sw.locator('.session-table').getByRole('button',{name:/^تعديل جلسة/}).click();await sw.getByRole('heading',{name:/تعديل جلسة/}).waitFor();
 assert.equal(await sw.getByLabel('رقم الدائرة / القاعة',{exact:true}).inputValue(),'5','Editing loads the recorded session');
 await sw.getByLabel('الدور',{exact:true}).fill('2');await sw.getByLabel('تفاصيل القرار (اختياري)',{exact:true}).fill('تصحيح تجريبي');await sw.getByLabel('الوقت (اختياري)',{exact:true}).fill('11:15');
 await sw.getByRole('button',{name:'حفظ التعديل'}).click();await sw.locator('.session-table').getByText('تصحيح تجريبي').waitFor();
 await sw.locator('.next-hearing').getByText(/11:15/).waitFor({timeout:8000});
 let sessions=(await rpc('mawatheeq_local_request',[login.token,'cases_page','{"offset":0}'])).find(c=>c.id==='tools-case-1').payload.procedures.filter(p=>p.kind==='جلسة');
 assert.deepEqual(sessions.map(p=>[p.court,p.text,p.nextTime,p.recordedBy]),[['تجاري كلي / 5 · الدور 2','تأجيل للإعلان — تصحيح تجريبي','11:15','tools_owner']],'The session is changed in place');
 await sw.locator('.session-table').getByRole('button',{name:/^حذف جلسة/}).click();const confirm=page.getByRole('alertdialog');
 await confirm.getByRole('checkbox',{name:/ألغِ الجلسة القادمة/}).waitFor();assert.equal(await confirm.getByRole('checkbox',{name:/ألغِ الجلسة القادمة/}).isChecked(),true);
 await confirm.getByRole('button',{name:'حذف الجلسة'}).click();await sw.getByText('لا توجد جلسات مسجلة في هذه الدرجة بعد.').waitFor();
 sessions=(await rpc('mawatheeq_local_request',[login.token,'cases_page','{"offset":0}'])).find(c=>c.id==='tools-case-1').payload.procedures.filter(p=>p.kind==='جلسة');
 assert.equal(sessions.length,0,'The session is deleted');await sw.locator('.next-hearing').waitFor({state:'detached',timeout:8000});
 await page.keyboard.press('Escape');await sw.waitFor({state:'hidden'});
 await page.evaluate(()=>{location.hash='cases'});const row=page.locator('.case-row').filter({hasText:'TOOL-1'}).first();await row.waitFor();
 assert.equal(await row.locator('.hearing-chip').count(),0,'A cancelled hearing no longer shows as the next session in the case list');}
// Case documents: several files chosen at once, each with a title, category and date; filtered by category, previewed, edited and deleted.
{await page.keyboard.press('Control+k');const qs=page.getByRole('dialog',{name:'بحث سريع'});await qs.getByRole('combobox').fill('TOOL-1');await qs.getByRole('option',{name:/TOOL-1/}).first().click();
 const sw=page.locator('[data-record-window]');await sw.locator('.case-pin').getByText('TOOL-1').waitFor();
 await sw.getByRole('tab',{name:/^المستندات/}).click();await sw.getByText('لا توجد مستندات مرفوعة لهذه القضية بعد.').waitFor();
 const pdf=Buffer.from('%PDF-1.4 synthetic');
 await sw.getByLabel('اختيار ملفات للقضية').setInputFiles([{name:'مذكرة دفاع.pdf',mimeType:'application/pdf',buffer:pdf},{name:'حافظة مستندات خبرة.pdf',mimeType:'application/pdf',buffer:pdf},
  {name:'صورة العقد.png',mimeType:'image/png',buffer:Buffer.from('89504e47','hex')},{name:'برنامج.exe',mimeType:'application/x-msdownload',buffer:Buffer.from('MZ')}]);
 await page.getByText(/لم تُضف هذه الملفات: برنامج\.exe/).waitFor();
 const queue=sw.locator('.case-files-queue');await queue.getByText('3 ملفات بانتظار الرفع').waitFor();
 assert.equal(await queue.getByLabel('تصنيف المستند 1',{exact:true}).inputValue(),'مذكرات','The category is guessed from the file name');
 assert.equal(await queue.getByLabel('تصنيف المستند 2',{exact:true}).inputValue(),'حوافظ مستندات');
 assert.equal(await queue.getByLabel('عنوان المستند 1',{exact:true}).inputValue(),'مذكرة دفاع','The title starts as the file name');
 await queue.getByLabel('عنوان المستند 3',{exact:true}).fill('صورة عقد التوريد');
 await page.screenshot({path:artifacts+'/case-files-queue.png'});
 await queue.getByRole('button',{name:'رفع 3 ملفات'}).click();await sw.locator('.case-files-table').getByText('صورة عقد التوريد').waitFor();
 await queue.waitFor({state:'detached'});assert.equal(caseUploads.length,3,'Each file is uploaded');
 assert.equal(await sw.locator('.case-files-table tbody tr').count(),3);
 await sw.locator('.case-files-cats').getByRole('tab',{name:/^مذكرات/}).click();assert.equal(await sw.locator('.case-files-table tbody tr').count(),1,'Categories filter the list');
 await sw.locator('.case-files-cats').getByRole('tab',{name:/^الكل/}).click();
 await sw.getByRole('button',{name:'عرض مذكرة دفاع'}).click();const frame=sw.locator('.case-files-preview iframe');await frame.waitFor();
 assert.match(await frame.getAttribute('src'),/mawatheeq-case-files\/cases\//,'A PDF opens beside the list');
 await page.screenshot({path:artifacts+'/case-files.png'});
 await sw.getByRole('button',{name:'تعديل مذكرة دفاع'}).click();const dlg=page.getByRole('alertdialog');await dlg.getByLabel('عنوان المستند',{exact:true}).fill('مذكرة دفاع منا');
 await dlg.getByRole('button',{name:'حفظ',exact:true}).click();await sw.locator('.case-files-table').getByText('مذكرة دفاع منا').waitFor();
 await sw.getByRole('button',{name:'حذف صورة عقد التوريد'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'حذف المستند'}).click();
 await sw.locator('.case-files-table').getByText('صورة عقد التوريد').waitFor({state:'detached'});assert.equal(caseRemoved.length,1,'Deleting removes the stored file');
 const kept=await rpc('mawatheeq_case_file_request',[login.token,'list',JSON.stringify({caseId:'tools-case-1'})]);
 assert.deepEqual(kept.files.map(f=>f.title).sort(),['حافظة مستندات خبرة','مذكرة دفاع منا'].sort());
 await page.keyboard.press('Escape');await sw.waitFor({state:'hidden'});}
// Court roll import: a synthetic roll with one case already in the register (TOOL-2, automatic number 7002) and one new.
{const X=createRequire(import.meta.url)('xlsx');const row=cells=>{const r=Array(81).fill('');for(const [k,v] of Object.entries(cells))r[k]=v;return r};
 const dmy=d=>d.split('-').reverse().join('/'),soon=iso(6),before=iso(-3);
 const block=(seq,auto,client,opp,date,outcome,next)=>[row({0:'5'+seq,8:'للاعلان',21:dmy(iso(-30)),26:'الرقعى',30:'إبتدائى',39:'12',41:'51',55:auto,64:'26',69:'ت كلى',76:'محكمة',80:seq}),
  row({0:'ا/ محامٍ تجريبي',8:'للاطلاع',21:dmy(date),29:'91'+seq,43:'مطالبة من الرول',61:'مدعى',68:client}),row({0:'6',8:outcome,21:next?dmy(next):'',31:'متداول',46:'تجارى',59:'2026/9'+seq,68:opp})];
 const sheet=[row({34:'رول الجلســـات'}),...block('1','7002','شركة أدوات تجريبية','خصم الأدوات 2',before,'للحكم',soon),...block('2','880000001','موكل من الرول','خصم من الرول',soon,'','')];
 const w=X.utils.book_new();X.utils.book_append_sheet(w,X.utils.aoa_to_sheet(sheet),'Sheet');fs.writeFileSync(artifacts+'/roll.xls',X.write(w,{type:'buffer',bookType:'xls'}));
 await page.evaluate(()=>{location.hash='cases'});await page.getByRole('button',{name:'استيراد القضايا من Excel',exact:true}).waitFor();
 await page.getByRole('button',{name:'استيراد الجلسات من Excel'}).click();const dlg=page.getByRole('dialog',{name:'استيراد الجلسات من Excel'});
 await dlg.getByLabel('ملف رول الجلسات').setInputFiles(artifacts+'/roll.xls');await dlg.getByText(/2 جلسة لـ 2 قضية/).waitFor();
 const stat=async t=>Number(await dlg.locator('.roll-stats div').filter({hasText:t}).locator('dd').textContent());
 assert.deepEqual([await stat('قضايا موجودة'),await stat('قضايا جديدة'),await stat('جلسات منعقدة'),await stat('جلسات قادمة')],[1,1,1,2],'The preview counts what the roll adds');
 assert.equal((await rpc('mawatheeq_local_request',[login.token,'cases_page','{"offset":0}'])).length,3,'The preview writes nothing');
 await page.screenshot({path:artifacts+'/roll-import.png'});
 await dlg.getByRole('button',{name:'تطبيق الاستيراد'}).click();await dlg.getByRole('button',{name:'تم'}).waitFor();await dlg.getByRole('button',{name:'تم'}).click();
 await page.evaluate(()=>{location.hash='work'});await page.getByRole('heading',{name:'المهام والجلسات',level:2}).waitFor();
 const after=await rpc('mawatheeq_local_request',[login.token,'cases_page','{"offset":0}']);const added=after.find(c=>c.payload.autoNumber==='880000001').payload;
 assert.deepEqual([added.code,added.client,added.opponent,added.caseNumber,added.lawyer],['912','موكل من الرول','خصم من الرول','2026/92','ا/ محامٍ تجريبي'],'A new ongoing case is added from the roll');
 const tool2=after.find(c=>c.id==='tools-case-2').payload;assert.ok(tool2.procedures.some(p=>p.date===before&&p.decision==='حجز للحكم'&&p.followup===soon),'The held session is in the case\'s session log');
 await page.locator('.office-table').getByText('النطق بالحكم · أول درجة · 7002').first().waitFor();
 // The same roll again adds nothing.
 await page.evaluate(()=>{location.hash='cases'});await page.getByRole('button',{name:'استيراد الجلسات من Excel'}).click();await dlg.getByLabel('ملف رول الجلسات').setInputFiles(artifacts+'/roll.xls');await dlg.getByText(/موجود من قبل ولن يتكرر/).waitFor();
 assert.equal(await dlg.getByRole('button',{name:'تطبيق الاستيراد'}).isDisabled(),true,'Nothing new to apply');await page.keyboard.press('Escape');}
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
await page.locator('.people-table').getByRole('columnheader',{name:`إجازات ${leaveYear}`}).waitFor();await page.locator('.people-table td').getByText('3 يوم',{exact:true}).waitFor();
await page.getByRole('button',{name:/^الإجازات/}).click();
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
for(let round=1;round<=2;round++){
 await motion.getByRole('button',{name:'فتح القضايا'}).click();
 await motion.getByRole('heading',{name:'كل قضاياك، في مكان واحد'}).waitFor();
 await motion.getByRole('button',{name:'حساب tools_owner'}).click();await motion.getByRole('button',{name:'تغيير مساحة العمل',exact:true}).click();
 await motion.getByRole('button',{name:'فتح المحاسبة'}).click();await motion.getByRole('heading',{name:'الدفاتر اليومية',exact:true}).waitFor();
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
await motion.keyboard.press('Escape');await motion.setViewportSize({width:1280,height:620});await motion.goto(base+'#cases');await motion.reload();await motion.getByRole('button',{name:/فتح القضية/}).first().waitFor({state:'attached'});
await motion.evaluate(()=>{scrollTo(0,0);window.__flips=new Set();document.addEventListener('animationstart',e=>{if(e.animationName.startsWith('row-rise'))window.__flips.add(e.target.parentElement)})});await motion.waitForTimeout(600);
{const b=await motion.locator('.list-desk-panel .table-wrap').boundingBox();await motion.mouse.move(b.x+b.width/2,b.y+Math.min(60,b.height/2))}for(let i=0;i<8;i++){await motion.mouse.wheel(0,120);await motion.waitForTimeout(90)}
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
 // The header button shows the latest conversations, like the mail; «فتح المحادثات» opens the chat window.
 await page.locator('.chat-latest').getByRole('button',{name:'فتح المحادثات'}).click();
 const panel=page.getByRole('dialog',{name:'المحادثات'});
 await panel.getByRole('button',{name:'محادثة جديدة'}).click();await panel.locator('.chat-main').getByRole('button',{name:/tools_clerk/}).click();
 const box=panel.getByLabel('نص الرسالة');await box.click();await box.pressSequentially('مرحبا، راجع #TOOL-0');
 await panel.getByRole('option',{name:/كود TOOL-0/}).waitFor();await box.press('Enter');await box.pressSequentially('و !7001');
 await panel.getByRole('option',{name:/الرقم الآلي 7001/}).waitFor();await box.press('Enter');await box.pressSequentially('اليوم');
 assert.equal(await box.inputValue(),'مرحبا، راجع كود TOOL-0 و الرقم الآلي 7001 اليوم','«#» inserts the office code and «!» the automatic number');await box.press('Enter');
 await panel.locator('.chat-msg.mine .chat-ref').getByText('كود TOOL-0').waitFor();await panel.locator('.chat-msg.mine .chat-ref').getByText('الرقم الآلي 7001').waitFor();
 await page.screenshot({path:artifacts+'/chat-owner.png'});
 const clerkCtx=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce',timezoneId:'Asia/Kuwait'});await wireFixture(clerkCtx);
 const cp=await clerkCtx.newPage();cp.on('pageerror',e=>errors.push('clerk: '+e.message));await cp.goto(base);
 await cp.getByLabel('اسم المستخدم',{exact:true}).fill('tools_clerk');await cp.getByLabel('كلمة المرور',{exact:true}).fill('Fixture-password-123');await cp.getByRole('button',{name:'فتح مساحة العمل',exact:true}).click();
 // Two unread: the note sent from the discussion and this message.
 const cb=cp.getByRole('button',{name:'المحادثات، 2 غير مقروءة'});await cb.waitFor({timeout:15000});await cb.click();
 await cp.locator('.chat-latest-item.unread',{hasText:'tools_owner'}).click(); // A conversation in the popover opens the window on it
 const cpanel=cp.getByRole('dialog',{name:'المحادثات'});
 await cpanel.locator('.chat-ref').getByText('كود TOOL-0').click();
 await cp.locator('[data-record-window] .case-pin').getByText('TOOL-0').waitFor();assert.equal(await cpanel.count(),0,'Opening a reference shows the case');
 await cp.keyboard.press('Escape');await cp.locator('[data-record-window]').waitFor({state:'hidden'});
 await cp.getByRole('button',{name:/^المحادثات/}).click();await cp.locator('.chat-latest').getByRole('button',{name:'فتح المحادثات'}).click();await cpanel.getByLabel('نص الرسالة').waitFor(); // Reopening returns to the same conversation
 await cpanel.locator('input[type=file]').setInputFiles({name:'memo.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic')});
 await cpanel.getByLabel('نص الرسالة').fill('المذكرة مرفقة');await cpanel.getByRole('button',{name:'إرسال'}).click();
 await cpanel.locator('.chat-msg.mine .chat-file').getByText('memo.pdf').waitFor();assert.equal(uploads.length,1,'The file went to chat storage');
 // Pasting a screenshot attaches it like a chosen file.
 await cpanel.getByLabel('نص الرسالة').evaluate(el=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array([137,80,78,71])],'image.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))});
 await cpanel.locator('.chat-editing').getByText(/لقطة شاشة .*\.png/).waitFor();await cpanel.locator('.chat-editing').getByRole('button',{name:'إزالة'}).click();
 await panel.locator('.chat-msg:not(.mine) .chat-file').getByText('memo.pdf').waitFor({timeout:15000});
 // Images and PDFs open centred inside the app, not in a new tab; Esc closes the viewer and leaves the chat open.
 let popups=0;page.on('popup',()=>popups++);await panel.locator('.chat-file').getByText('memo.pdf').click();
 const viewer=page.getByRole('dialog',{name:'memo.pdf'});await viewer.locator('iframe.chat-viewer-pdf').waitFor();
 const vb=await viewer.boundingBox(),vp=page.viewportSize();assert.ok(vb&&Math.abs(vb.x+vb.width/2-vp.width/2)<4,'The viewer is centred on the screen');assert.equal(popups,0,'No new tab opens');
 await page.keyboard.press('Escape');await viewer.waitFor({state:'detached'});assert.ok(await panel.isVisible(),'Esc closes only the viewer');
 // Edit within 15 minutes; groups with a system note.
 await panel.locator('.chat-msg.mine').first().hover();await panel.getByRole('button',{name:'تعديل الرسالة'}).first().click();
 await panel.getByLabel('نص الرسالة').fill('مرحبا، راجع #TOOL-0 اليوم من فضلك');await panel.getByRole('button',{name:'حفظ التعديل'}).click();
 await panel.getByText('عُدّلت',{exact:false}).first().waitFor();
 await panel.getByRole('button',{name:'رجوع إلى المحادثات'}).click();await panel.getByRole('button',{name:'مجموعة جديدة'}).click();
 await panel.getByLabel('اسم المجموعة').fill('فريق الأدوات');await panel.getByRole('checkbox').first().check();await panel.getByRole('button',{name:/إنشاء المجموعة/}).click();
 await panel.locator('.chat-main').getByText(/أنشأ tools_owner المجموعة مع/).waitFor();await page.screenshot({path:artifacts+'/chat-group.png'});
 // Closing a conversation removes it from the list but keeps it; starting a chat with that person brings it back with its history.
 await panel.getByRole('button',{name:'رجوع إلى المحادثات'}).click();const rows=panel.locator('.chat-row-wrap'),before=await rows.count();
 const direct=rows.filter({hasText:'tools_clerk'}).filter({hasNotText:'فريق'}).first();await direct.hover();await direct.getByRole('button',{name:/^إغلاق /}).click();
 await page.waitForTimeout(300);assert.equal(await rows.count(),before-1,'A closed conversation leaves the list');
 await panel.getByRole('button',{name:'محادثة جديدة'}).click();await panel.locator('.chat-main button',{hasText:'tools_clerk'}).first().click();
 await panel.locator('.chat-msg').first().waitFor();await panel.getByRole('button',{name:'رجوع إلى المحادثات'}).click();assert.equal(await rows.count(),before,'Messaging the person again reopens it with its history');
 // A closed conversation comes back when the other person writes, even when this computer's clock runs ahead of the server.
 await page.evaluate(()=>{const real=Date.now;window.__realNow=real;Date.now=()=>real()+30*60e3});
 const again=rows.filter({hasText:'tools_clerk'}).filter({hasNotText:'فريق'}).first();await again.hover();await again.getByRole('button',{name:/^إغلاق /}).click();
 await page.evaluate(()=>{Date.now=window.__realNow});await page.waitForTimeout(300);assert.equal(await rows.count(),before-1);
 const clerkChats=await rpc('mawatheeq_chat_request',[clerkSession.token,'summary','{}']);const withOwner=clerkChats.conversations.find(c=>c.kind==='direct'&&c.members.some(m=>m.id===me));
 await rpc('mawatheeq_chat_request',[clerkSession.token,'send',JSON.stringify({conversationId:withOwner.id,clientId:crypto.randomUUID(),body:'رسالة بعد الإغلاق'})]);
 await rows.filter({hasText:'رسالة بعد الإغلاق'}).waitFor({timeout:15000});assert.equal(await rows.count(),before,'A new message brings a closed conversation back');
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
