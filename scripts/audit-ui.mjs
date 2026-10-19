// UI sweep: opens every workspace and every page tab (synthetic data only) at desktop and phone width, and reports
// sideways overflow, elements sticking out of the screen, controls without a name or label, clipped button text,
// duplicate ids and runtime errors. Screenshots go to OFFICE_TEST_ARTIFACTS/audit. Run the Pages dev server on 127.0.0.1:4175.
import {supportFilterSelects} from './filter-select-helper.mjs';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.PLAYWRIGHT_MODULES_PATH||process.cwd()]}));
const out=(process.env.OFFICE_TEST_ARTIFACTS||'/tmp/mawatheeq-office-ui')+'/audit';fs.mkdirSync(out,{recursive:true});
const db=new PGlite({extensions:{pgcrypto}});
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
grant usage on schema storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password,display_name) values ('ui_owner',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'المسؤول')",['Synthetic-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,'owner' from mawatheeq_private.accounts;set role anon");
const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
const login=await rpc('mawatheeq_local_login',['ui_owner','Synthetic-password-123']);
for(let i=0;i<30;i++)await rpc('mawatheeq_local_request',[login.token,'save_case',JSON.stringify({case:{id:'ui-case-'+i,code:'TEST-'+i,autoNumber:String(1000+i),client:'شركة اختبار الواجهة ذات الاسم الطويل جداً للتجربة',clientGroup:'شركة اختبار الواجهة',opponent:'خصم تجريبي رقم '+i,date:'2026-09-01',type:'حكم أول درجة',outcome:i%2?'لصالحنا':'ضدنا',ruling:'حكم تجريبي لا يمثل بيانات حقيقية',notificationDate:'2026-09-10',appealConfirmation:'لا يوجد',court:'محكمة تجريبية',procedures:[],revision:0}})]);
for(let i=0;i<8;i++)await rpc('mawatheeq_office_request',[login.token,'save_work',JSON.stringify({item:{id:crypto.randomUUID(),revision:0,caseId:i%2?'ui-case-'+i:'',title:'عمل تجريبي بعنوان طويل نسبياً رقم '+i,kind:i%3?'task':'hearing',dueDate:new Date(Date.now()+(i-3)*86400000).toISOString().slice(0,10),dueTime:'09:'+String(10+i),assigneeId:login.user.id,priority:i%4?'normal':'urgent',status:'open',location:'محكمة تجريبية',notes:'',completionNote:''}})]).catch(()=>{});

const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
await context.route('**/app-config.json',route=>route.fulfill({json:{supabaseUrl:'https://office-fixture.supabase.co',supabasePublishableKey:'sb_publishable_synthetic'}}));
await context.route('https://office-fixture.supabase.co/**',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
 const name=url.pathname.split('/').pop(),body=req.postDataJSON();
 if(!name.startsWith('mawatheeq_'))return route.fulfill({status:200,json:{synced:0,added:0,more:false,errors:[]}});
 const args=name==='mawatheeq_local_login'?[body.p_username,body.p_password]:[body.p_token,body.p_action,JSON.stringify(body.p_data||{})];
 try{await route.fulfill({json:await rpc(name,args)})}catch(e){await route.fulfill({status:400,json:{message:e.message,code:e.code||'P0001'}})}
});
const page=await context.newPage();supportFilterSelects(page.locator('body'));
const runtime=[];page.on('pageerror',e=>runtime.push({where:current,msg:e.message}));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|ERR_|404/.test(m.text()))runtime.push({where:current,msg:m.text().slice(0,300)})});
let current='login';const report=[];const settle=()=>page.waitForTimeout(700);

async function audit(name){
 current=name;
 for(const [w,h] of [[1440,900],[390,844]]){
  await page.setViewportSize({width:w,height:h});await page.waitForTimeout(350);
  const r=await page.evaluate(()=>{
   const vis=e=>{const s=getComputedStyle(e),b=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&b.width>0&&b.height>0};
   const path=e=>{const p=[];for(let x=e;x&&x!==document.body&&p.length<4;x=x.parentElement)p.unshift(x.tagName.toLowerCase()+(x.classList.length?'.'+[...x.classList].slice(0,2).join('.'):''));return p.join('>')};
   const clipped=e=>{for(let x=e.parentElement;x&&x!==document.body;x=x.parentElement){const o=getComputedStyle(x).overflowX;if(o!=='visible')return true}return false};
   const name=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||e.getAttribute('aria-labelledby')&&document.getElementById(e.getAttribute('aria-labelledby'))?.innerText||e.querySelector('img[alt]')?.alt||'').trim();
   const all=[...document.querySelectorAll('body *')].filter(vis);
   const sticking=all.filter(e=>{const b=e.getBoundingClientRect();return (b.right>innerWidth+2||b.left<-2)&&!clipped(e)&&!e.closest('[data-sonner-toaster],[role=dialog] [data-radix-scroll-area-viewport]')}).slice(0,6).map(e=>path(e)+' «'+(e.innerText||'').slice(0,30).replace(/\s+/g,' ')+'» '+Math.round(e.getBoundingClientRect().left)+'→'+Math.round(e.getBoundingClientRect().right));
   const unnamed=all.filter(e=>e.matches('button,[role=button],a[href]')&&!name(e)).slice(0,6).map(path);
   const unlabeled=all.filter(e=>e.matches('input:not([type=hidden]):not([type=file]),select,textarea')&&!(e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||e.closest('label')||(e.id&&document.querySelector(`label[for="${CSS.escape(e.id)}"]`))||e.getAttribute('title'))).slice(0,6).map(e=>path(e)+' '+(e.getAttribute('placeholder')||e.type));
   const cut=all.filter(e=>e.matches('button,.btn,.tag,th')&&e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflow!=='visible').slice(0,6).map(e=>path(e)+' «'+e.innerText.slice(0,30)+'»');
   const ids={};for(const e of document.querySelectorAll('[id]'))ids[e.id]=(ids[e.id]||0)+1;
   const dup=Object.entries(ids).filter(([,n])=>n>1).map(([k])=>k).slice(0,5);
   const imgs=[...document.querySelectorAll('img')].filter(i=>vis(i)&&!i.hasAttribute('alt')).length;
   return {overflowX:document.documentElement.scrollWidth-innerWidth,sticking,unnamed,unlabeled,cut,dup,imgs,height:document.documentElement.scrollHeight};
  });
  const file=name.replace(/[^\w؀-ۿ-]+/g,'_')+'-'+w+'.png';
  await page.screenshot({path:out+'/'+file,fullPage:w>400?false:true}).catch(()=>{});
  const issues=Object.entries(r).filter(([k,v])=>k!=='height'&&(Array.isArray(v)?v.length:k==='overflowX'?v>2:v));
  report.push({page:name,width:w,height:r.height,file,issues:Object.fromEntries(issues)});
 }
 await page.setViewportSize({width:1440,height:900});
}
const click=async(n)=>page.getByRole('button',{name:n,exact:true}).first().click();
// Clicks every tab in tab groups (two levels deep), auditing each page once.
async function tabs(prefix,depth=0,seen=new Set()){
 const groups=page.locator('main [role=group]:visible');const labels=[];
 for(let g=0;g<await groups.count();g++){const grp=groups.nth(g);const gl=await grp.getAttribute('aria-label')||'';if(/طريقة العرض|المواعيد|المجلد|صفحات المساحة/.test(gl))continue;
  for(const b of await grp.locator(':scope > button').all()){const t=(await b.innerText()).trim().replace(/\s+\d+$/,'');if(t&&!seen.has(gl+'/'+t))labels.push([gl,t])}}
 for(const [gl,t] of labels){if(seen.has(gl+'/'+t))continue;seen.add(gl+'/'+t);
  const b=page.locator('main [role=group]:visible').filter({has:page.getByRole('button',{name:t})}).getByRole('button',{name:t}).first();
  if(!await b.count())continue;await b.click().catch(()=>{});await settle();await audit(prefix+' › '+t);
  if(depth<2)await tabs(prefix+' › '+t,depth+1,seen);}
}
async function toChooser(){await page.getByRole('button',{name:/^حساب /}).click();await click('تغيير مساحة العمل');await page.getByRole('heading',{name:'اختر مساحة عملك'}).waitFor()}
try{
 await page.goto('http://127.0.0.1:4175/Mawatheeq/');await audit('تسجيل الدخول');
 await page.getByLabel('اسم المستخدم',{exact:true}).fill('ui_owner');await page.getByLabel('كلمة المرور',{exact:true}).fill('Synthetic-password-123');await click('فتح مساحة العمل');
 await page.getByRole('heading',{name:'اختر مساحة عملك'}).waitFor();await audit('اختيار المساحة');
 const options=await page.locator('.workspace-option h2').allInnerTexts();
 for(const ws of options){
  await click('فتح '+ws);await settle();await settle();
  if(ws==='القضايا'){
   const navs=await page.locator('[data-sidebar=sidebar] .nav-button').allInnerTexts();
   for(const n of navs.map(x=>x.replace(/\s*\d+$/,'').trim()).filter(Boolean)){await page.locator('[data-sidebar=sidebar] .nav-button').filter({hasText:n}).first().click().catch(()=>{});await settle();await audit('القضايا › '+n);}
  }else{await audit(ws);await tabs(ws);
   for(const t of ['طباعة مستندات التحصيل','البريد']){const b=page.getByRole('group',{name:'صفحات المساحة'}).getByRole('button',{name:new RegExp('^'+t)});if(await b.count()){await b.first().click();await settle();await audit(ws+' › '+t)}}}
  await toChooser();
 }
}catch(e){runtime.push({where:current,msg:'AUDIT STOPPED: '+e.message.slice(0,300)})}
fs.writeFileSync(out+'/report.json',JSON.stringify({report,runtime},null,1));
const bad=report.filter(r=>Object.keys(r.issues).length);
console.log(`Audited ${new Set(report.map(r=>r.page)).size} pages × 2 widths; ${bad.length} with findings; ${runtime.length} runtime errors.`);
for(const r of bad)console.log('-',r.page,r.width,JSON.stringify(r.issues).slice(0,600));
for(const e of runtime)console.log('! ',e.where,e.msg);
await browser.close();
