'use client';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Download,FolderInput,FolderOpen,FolderPlus,FolderTree,Inbox,CalendarDays,Scale,Building2,LoaderCircle,RefreshCw,ExternalLink,ShieldCheck,FileText,ArrowLeftRight,MonitorCog,Save} from 'lucide-react';
import {toast} from 'sonner';
import type {CaseSummary} from '@/lib/departments';
import type {Permissions} from '@/lib/permissions';
import {clientName,tidyName} from '@/lib/clients';
import {normalizeSearch} from '@/lib/case-browse';
import {formatDate,todayISO,caseCode} from '@/lib/domain';
import {assetUrl} from '@/lib/asset-url';
import {HELPER_FILES,ROOTS,ROOT_KEYS,allowed,autoDaily,browserStore,canPick,dailyCounts,endsWithCode,fileToCase,fileToOrders,filesIn,folderSummaries,foldersIn,helperStatus,helperStore,loadPlaced,loadRoots,notePlaced,openFile,pickRoot,placesOf,readFile,saveRoots,setHelperRoots,
 type FileItem,type Folder,type HelperStatus,type Placed,type RootKey,type Roots,type Store} from '@/lib/file-room';
import {DayBars,PulseStrip,PulseTile} from '../pulse';
import {FilterBox} from '../filter-select';
import {Empty} from '../shared';

type Tab='inbox'|'daily'|'cases'|'orders'|'setup';
/** How this browser reaches the folders: through «برنامج الملفات» (any browser), the browser's own folder access (Chrome or Edge), or not yet. */
type Way={kind:'helper';status:HelperStatus}|{kind:'browser';roots:Roots;ok:Record<string,boolean>}|{kind:'none'};
const size=(n:number)=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
const when=(t:number)=>{const d=new Date(t),iso=d.toISOString().slice(0,10),today=todayISO();return (iso===today?'اليوم':formatDate(iso))+' '+d.toTimeString().slice(0,5)};
// «عدد ملفات» with the right number form.
const filesAr=(n:number)=>n===0?'لا ملفات':n===1?'ملف واحد':n===2?'ملفان':n%100>=3&&n%100<=10?`${n} ملفات`:`${n} ملفاً`;
const placedFilesAr=(n:number)=>n===1?'رُتب ملف واحد':n===2?'رُتب ملفان':n%100>=3&&n%100<=10?`رُتبت ${n} ملفات`:`رُتب ${n} ملفاً`;

/**
 * «الملفات»: the office's file room on its network share (lib/file-room.ts). Scans arrive in «الوارد», a copy of each
 * is placed by day into «المسح اليومي» by itself, and each document is copied into its case's folder as «الاسم الكود»
 * or into a company's payment orders. The originals always stay in «الوارد». Every list says what it holds.
 */
export default function FileRoom({cases,access}:{cases:CaseSummary[];access:Permissions}){
 const [way,setWay]=useState<Way|null>(null),[tab,setTab]=useState<Tab>('inbox'),[tick,setTick]=useState(0);
 const reload=useCallback(()=>setTick(t=>t+1),[]);
 useEffect(()=>{let live=true;void (async()=>{
  // The helper first (any browser); then the browser's own folder access; else how to start the helper.
  const roots=canPick()?await loadRoots().catch(()=>({} as Roots)):null,given=!!(window as unknown as {__mawatheeqFileRoots?:unknown}).__mawatheeqFileRoots;
  const status=given?null:await helperStatus();
  if(!live)return;
  if(status){setWay({kind:'helper',status});if(!ROOT_KEYS.some(k=>status.roots[k].ok))setTab('setup');return}
  if(roots){const ok:Record<string,boolean>={};for(const k of ROOT_KEYS)if(roots[k])ok[k]=await allowed(roots[k]!).catch(()=>false);if(live){setWay({kind:'browser',roots,ok});if(!ROOT_KEYS.some(k=>roots[k]))setTab('setup')}return}
  setWay({kind:'none'});
 })();return()=>{live=false}},[tick]);
 const store=useMemo<Store|null>(()=>way?.kind==='helper'?helperStore(way.status):way?.kind==='browser'?browserStore(way.roots):null,[way]);
 if(!way)return <p className="day-empty" role="status"><LoaderCircle className="spin" size={14}/> جارٍ تجهيز الملفات…</p>;
 if(way.kind==='none'||!store)return <section className="panel file-room"><div className="work-desk-head"><h2>الملفات</h2><div className="actions"><button type="button" className="btn" onClick={reload}><RefreshCw size={15}/> إعادة الفحص</button></div></div><HelperGuide/></section>;
 const ready=(k:RootKey)=>way.kind==='helper'?!!way.status.roots[k]?.ok:!!way.roots[k]&&!!way.ok[k];
 const missing=ROOT_KEYS.filter(k=>!ready(k)),blocked=way.kind==='browser'?ROOT_KEYS.filter(k=>way.roots[k]&&!way.ok[k]):[];
 async function allowAll(){if(way?.kind!=='browser')return;const ok={...way.ok};for(const k of blocked)ok[k]=await allowed(way.roots[k]!,true);setWay({...way,ok})}
 const tabs:[Tab,string,typeof Inbox][]=[['inbox','الوارد',Inbox],['daily','المسح اليومي',CalendarDays],['cases','ملفات القضايا',Scale],['orders','أوامر الأداء',Building2],['setup','المجلدات',FolderTree]];
 const need=(k:RootKey)=><NeedRoot k={k} onSetup={()=>setTab('setup')}/>;
 return <section className="panel work-desk file-room">
  <div className="work-desk-head"><h2>الملفات</h2>
   <div className="work-chips" role="group" aria-label="أقسام الملفات">{tabs.map(([id,l,Icon])=><button key={id} type="button" className={'work-chip'+(tab===id?' on':'')} aria-pressed={tab===id} onClick={()=>setTab(id)}><Icon size={14}/> {l}</button>)}</div>
   <div className="actions"><span className="tag" title={way.kind==='helper'?'يعمل في أي متصفح عبر برنامج الملفات على هذا الجهاز':'عبر وصول المتصفح إلى المجلدات (Chrome أو Edge)'}>{way.kind==='helper'?'عبر برنامج الملفات':'عبر المتصفح'}</span><button type="button" className="btn" onClick={reload}><RefreshCw size={15}/> تحديث</button></div></div>
  {blocked.length>0&&<div className="notice file-room-allow" role="status"><ShieldCheck size={16}/><span>يحتاج المتصفح إذنك لفتح مجلدات الشبكة في هذه الجلسة.</span><button type="button" className="btn primary" onClick={()=>void allowAll()}>السماح بالوصول</button></div>}
  {missing.length>0&&!blocked.length&&tab!=='setup'&&<div className="notice" role="status"><FolderPlus size={16}/><span>لم يُحدد بعد: {missing.map(k=>ROOTS[k].label).join('، ')}.</span><button type="button" className="btn" onClick={()=>setTab('setup')}>تحديد المجلدات</button></div>}
  <div className="work-desk-body">
   {tab==='setup'&&(way.kind==='helper'?<HelperSetup status={way.status} onSaved={status=>setWay({kind:'helper',status})}/>:<BrowserSetup roots={way.roots} ok={way.ok} onSaved={reload}/>)}
   {tab==='inbox'&&(ready('inbox')?<InboxTab key={tick} store={store} ready={ready} cases={cases} canEdit={access.canEdit}/>:need('inbox'))}
   {tab==='daily'&&(ready('daily')?<DailyTab key={tick} store={store}/>:need('daily'))}
   {tab==='cases'&&(ready('cases')?<CasesTab key={tick} store={store} cases={cases}/>:need('cases'))}
   {tab==='orders'&&(ready('orders')?<OrdersTab key={tick} store={store}/>:need('orders'))}
  </div></section>;
}

function NeedRoot({k,onSetup}:{k:RootKey;onSetup:()=>void}){return <div className="file-room-need"><Empty title={'لم يُحدد مجلد «'+ROOTS[k].label+'»'} text={ROOTS[k].hint}/><button type="button" className="btn primary" onClick={onSetup}><FolderPlus size={15}/> تحديد المجلدات</button></div>}

/** How to start «برنامج الملفات» on the office computer, so the page works in any browser. */
function HelperGuide({compact=false}:{compact?:boolean}){
 return <div className="file-helper-guide">
  {!compact&&<p className="notice"><MonitorCog size={16} aria-hidden/> <span>لتعمل هذه الصفحة في أي متصفح (مثل Zen أو Firefox)، شغّل «برنامج الملفات» على جهاز المكتب الذي يرى مجلدات الشبكة. لا يحذف البرنامج أي ملف، ولا يرسل شيئاً خارج الجهاز.</span></p>}
  <ol className="file-helper-steps">
   <li>ثبّت <b>Node.js</b> مرة واحدة على الجهاز (الإصدار LTS، مجاني) من <bdi>nodejs.org</bdi>.</li>
   <li>نزّل الملفين وضعهما معاً في مجلد على الجهاز، مثل <bdi dir="ltr">C:\Mawatheeq\Files</bdi>: {HELPER_FILES.map(f=><a key={f} className="btn" href={assetUrl("/"+f)} download aria-label={"تنزيل "+f.split("/").pop()}><Download size={14}/> <bdi>{f.split('/').pop()}</bdi></a>)}</li>
   <li>شغّل <bdi>start-mawatheeq-files.bat</bdi> بنقرة مزدوجة، واترك نافذته مفتوحة.</li>
   <li>عُد إلى هذه الصفحة واضغط «إعادة الفحص»، ثم اكتب في «المجلدات» مسار كل مجلد من مجلدات الشبكة.</li>
   <li>ليعمل تلقائياً عند تشغيل الجهاز: اضغط <bdi dir="ltr">Win + R</bdi> واكتب <bdi dir="ltr">shell:startup</bdi>، وضع في المجلد الذي يُفتح اختصاراً للملف <bdi>start-mawatheeq-files.bat</bdi>.</li>
  </ol></div>;
}

/** «المجلدات» through the helper: the full path of each folder on that computer. */
function HelperSetup({status,onSaved}:{status:HelperStatus;onSaved:(s:HelperStatus)=>void}){
 const [paths,setPaths]=useState<Record<RootKey,string>>(()=>Object.fromEntries(ROOT_KEYS.map(k=>[k,status.roots[k]?.path||'']))as Record<RootKey,string>),[busy,setBusy]=useState(false);
 async function save(){setBusy(true);try{const s=await setHelperRoots(paths);toast.success('حُفظت المجلدات في برنامج الملفات.');onSaved(s)}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <div className="file-room-setup"><p className="subtitle">برنامج الملفات {status.version} يعمل على هذا الجهاز. اكتب المسار الكامل لكل مجلد كما يظهر في مستكشف الملفات، مثل <bdi dir="ltr">Z:\Scans</bdi> أو <bdi dir="ltr">\\SERVER\Share\Scans</bdi>. لا يُحذف أي ملف: الترتيب نسخ فقط، وتبقى الأصول في الوارد.</p>
  <ul className="story-list file-roots" aria-label="المجلدات">{ROOT_KEYS.map(k=><li key={k}><div className={'story-row e-'+(!status.roots[k]?.path?'amber':status.roots[k].ok?'green':'red')}>
   <span className="story-name"><FolderOpen size={15} aria-hidden/><b>{ROOTS[k].label}</b></span>
   <label className="file-root-path"><span className="sr-only">{'مسار '+ROOTS[k].label}</span><input dir="ltr" aria-label={'مسار '+ROOTS[k].label} value={paths[k]} onChange={e=>setPaths(p=>({...p,[k]:e.target.value}))} placeholder={ROOTS[k].hint}/></label>
   <span className="line-story">{!status.roots[k]?.path?'لم يُحدد':status.roots[k].ok?'متاح':'لا يصل الجهاز إلى هذا المسار الآن'}</span></div></li>)}</ul>
  <div className="actions"><button type="button" className="btn primary" disabled={busy} onClick={()=>void save()}>{busy?<LoaderCircle className="spin" size={14}/>:<Save size={15}/>} حفظ المجلدات</button></div></div>;
}

/** «المجلدات» through the browser (Chrome or Edge): the four folders of the share given once on this computer. */
function BrowserSetup({roots,ok,onSaved}:{roots:Roots;ok:Record<string,boolean>;onSaved:()=>void}){
 const [busy,setBusy]=useState('');
 async function choose(k:RootKey){setBusy(k);try{const h=await pickRoot(k,roots[k]);await saveRoots({...roots,[k]:h});toast.success('حُدد مجلد «'+ROOTS[k].label+'».');onSaved()}catch(e){if((e as Error).name!=='AbortError')toast.error((e as Error).message)}finally{setBusy('')}}
 return <div className="file-room-setup"><p className="subtitle">حدد مجلدات الشبكة مرة واحدة على هذا الجهاز. لا تُرفع الملفات إلى أي خادم، ولا يُحذف أي ملف: الترتيب نسخ فقط، وتبقى الأصول في الوارد.</p>
  <ul className="story-list file-roots" aria-label="المجلدات">{ROOT_KEYS.map(k=><li key={k}><div className={'story-row e-'+(!roots[k]?'amber':ok[k]?'green':'red')}>
   <span className="story-name"><FolderOpen size={15} aria-hidden/><b>{ROOTS[k].label}</b></span>
   <span className="line-story">{roots[k]?<>المجلد: <bdi>{roots[k]!.name}</bdi>{ok[k]?' · متاح':' · يحتاج الإذن'}</>:ROOTS[k].hint}</span>
   <button type="button" className={'btn'+(roots[k]?'':' primary')} disabled={!!busy} onClick={()=>void choose(k)}>{busy===k?<LoaderCircle className="spin" size={14}/>:<FolderInput size={14}/>} {roots[k]?'تغيير':'تحديد'}</button></div></li>)}</ul>
  <details className="file-helper-more"><summary>العمل من أي متصفح (Zen أو Firefox)</summary><HelperGuide compact/></details></div>;
}

/** A PDF preview that empties itself before it is taken away: Chrome's PDF viewer, removed while showing a document, raises an error in the page. */
function PdfFrame({title,src}:{title:string;src:string}){
 const ref=useRef<HTMLIFrameElement>(null);
 useLayoutEffect(()=>{const f=ref.current;return()=>{if(f)f.src='about:blank'}},[]);
 return <iframe ref={ref} className="file-preview" title={title} src={src}/>;
}
type Show='pending'|'case'|'orders'|'all';
/** «الوارد»: what the scanner put on the share; each scan copied by day by itself, then into a case or a company's payment orders. */
function InboxTab({store,ready,cases,canEdit}:{store:Store;ready:(k:RootKey)=>boolean;cases:CaseSummary[];canEdit:boolean}){
 const [files,setFiles]=useState<FileItem[]|null>(null),[placed,setPlaced]=useState<Placed>({}),[open,setOpen]=useState<FileItem|null>(null),[busy,setBusy]=useState(false),[show,setShow]=useState<Show>('pending');
 const [title,setTitle]=useState(''),[code,setCode]=useState(''),[company,setCompany]=useState(''),[preview,setPreview]=useState('');
 const [companies,setCompanies]=useState<string[]>([]),[now]=useState(()=>Date.now());
 useEffect(()=>{let live=true;void (async()=>{
  try{
   const [f,p]=await Promise.all([filesIn(store,'inbox'),loadPlaced(store)]);if(!live)return;setFiles(f);setPlaced(p);
   // Owner: «auto place». A copy of every new scan goes into its day; the scan itself stays here.
   if(canEdit&&ready('daily')){const r=await autoDaily(store,f,p);if(!live)return;setPlaced(r.placed);if(r.copied)toast.success(placedFilesAr(r.copied)+' تلقائياً في المسح اليومي.')}
  }catch(e){if(live){setFiles(f=>f||[]);toast.error((e as Error).message)}}
 })();
  if(ready('orders'))foldersIn(store,'orders').then(fs=>{if(live)setCompanies(fs.sort((a,b)=>a.localeCompare(b,'ar')))}).catch(()=>{});
  return()=>{live=false}},[store,ready,canEdit]);
 useEffect(()=>{if(!open){
  // eslint-disable-next-line react-hooks/set-state-in-effect -- no file chosen: no preview
  setPreview('');return}let url='',live=true;readFile(store,open).then(f=>{if(!live)return;url=URL.createObjectURL(f);setPreview(url)}).catch(()=>{if(live)setPreview('')});return()=>{live=false;
  // Released a while after the preview closes: the PDF viewer may still be loading it.
  if(url){const u=url;setTimeout(()=>URL.revokeObjectURL(u),30000)}}},[store,open]);
 const caseOptions=useMemo(()=>cases.filter(c=>!c.archived&&caseCode(c)).map(c=>({value:caseCode(c),label:caseCode(c),hint:`${tidyName(clientName(c))} ضد ${tidyName(c.opponent||'—')}`})),[cases]);
 const theCase=cases.find(c=>caseCode(c)===code);
 if(!files)return <p className="day-empty" role="status"><LoaderCircle className="spin" size={14}/> جارٍ قراءة الوارد…</p>;
 const where=(f:FileItem)=>placesOf(placed,f),filed=(f:FileItem,w:'cases'|'orders')=>where(f).some(p=>p.where===w);
 const pending=files.filter(f=>!filed(f,'cases')&&!filed(f,'orders')),inCase=files.filter(f=>filed(f,'cases')),inOrders=files.filter(f=>filed(f,'orders'));
 const list=(show==='pending'?pending:show==='case'?inCase:show==='orders'?inOrders:files).slice(0,300);
 const days=Array.from({length:7},(_,i)=>{const d=new Date(now-(6-i)*86400000).toISOString().slice(0,10);return {label:i===6?'اليوم':formatDate(d).slice(0,5),value:files.filter(f=>new Date(f.modified).toISOString().slice(0,10)===d).length,tone:(i===6?'amber':'brand') as 'amber'|'brand'}});
 const story=(f:FileItem)=>{const ps=where(f);return [ps.some(p=>p.where==='daily')?'في المسح اليومي':'',...ps.filter(p=>p.where!=='daily').map(p=>(p.where==='cases'?'في القضية ':'في أوامر أداء ')+p.path.split('/')[0])].filter(Boolean).join(' · ')||'لم يُرتب بعد'};
 async function file(label:string,w:'cases'|'orders',fn:(f:FileItem)=>Promise<{name:string}>,dir:string[]){if(!open)return;setBusy(true);
  try{const r=await fn(open);setPlaced(await notePlaced(store,[{item:open,where:w,dir,name:r.name}]));toast.success(label);setTitle('');setOpen(null)}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 const pick=(v:Show)=>()=>setShow(show===v?'all':v);
 return <>
  <PulseStrip label="ملخص الوارد">
   <PulseTile icon={<Inbox size={16} aria-hidden/>} title="في الوارد" value={files.length} sub="تبقى الأصول هنا" on={show==='all'} onClick={()=>setShow('all')} parts={[{label:'لم يُحفظ في مكانه بعد',value:pending.length,tone:'amber',on:show==='pending',onClick:pick('pending')},{label:'في ملف قضية',value:inCase.length,tone:'green',on:show==='case',onClick:pick('case')},{label:'في أوامر الأداء',value:inOrders.length,tone:'blue',on:show==='orders',onClick:pick('orders')}]}/>
   <DayBars title="الوارد يوماً بيوم" sub="آخر سبعة أيام" days={days}/>
  </PulseStrip>
  {!files.length?<Empty title="الوارد فارغ" text="تظهر هنا الملفات فور حفظها في مجلد الوارد."/>:<div className="file-inbox">
   <div className="file-inbox-list">
    {!list.length?<Empty title="لا ملفات بهذا التصنيف" text="اضغط «في الوارد» لعرض كل الملفات."/>:<ul className="story-list file-lines" aria-label="ملفات الوارد"><li className="story-head" aria-hidden><span>الملف</span><span>مُسح</span><span>الحجم</span><span>باختصار</span></li>
     {list.map(f=>{const done=filed(f,'cases')||filed(f,'orders');return <li key={f.name}><button type="button" className={'story-row e-'+(done?'green':now-f.modified>7*86400000?'red':'amber')+(open?.name===f.name?' on':'')} aria-pressed={open?.name===f.name} onClick={()=>setOpen(f)}>
      <span className="story-name"><FileText size={14} aria-hidden/><b><bdi>{f.name}</bdi></b></span><span className="story-num">{when(f.modified)}</span><span className="muted">{size(f.size)}</span><span className="line-story">{story(f)}</span></button></li>})}</ul>}
    {(show==='pending'?pending:show==='case'?inCase:show==='orders'?inOrders:files).length>300&&<p className="subtitle">تُعرض أحدث 300 ملف.</p>}</div>
   <aside className="file-inbox-side" aria-label="الملف المختار">{!open?<p className="day-empty">اختر ملفاً من القائمة لمعاينته وحفظه في مكانه.</p>:<>
    <div className="file-preview-head"><b><bdi>{open.name}</bdi></b><button type="button" className="icon-btn" aria-label="فتح في نافذة" title="فتح في نافذة" onClick={()=>{openFile(store,open).catch(e=>toast.error('تعذر فتح الملف: '+(e as Error).message))}}><ExternalLink size={15}/></button></div>
    {preview&&/\.pdf$/i.test(open.name)?<PdfFrame title={'معاينة '+open.name} src={preview}/>:preview&&/\.(png|jpe?g)$/i.test(open.name)?<img className="file-preview" alt={'معاينة '+open.name} src={preview}/>:<p className="day-empty">لا معاينة لهذا النوع؛ افتحه في نافذة.</p>}
    <p className="subtitle">{story(open)}</p>
    {canEdit&&<div className="file-actions">
     {ready('cases')&&<fieldset className="file-action"><legend><Scale size={14} aria-hidden/> إلى ملف قضية</legend>
      <label className="field"><span>اسم المستند</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثل: صحيفة الدعوى، حكم أول درجة"/></label>
      <div className="field"><span>كود القضية</span><FilterBox label="كود القضية" value={code} onChange={setCode} options={caseOptions} placeholder="اكتب الكود أو جزءاً منه"/></div>
      {theCase&&<p className="subtitle">{tidyName(clientName(theCase))} ضد {tidyName(theCase.opponent||'—')}</p>}
      {title.trim()&&code&&<p className="subtitle">ستُحفظ نسخة باسم: <bdi>{`${title.trim()} ${code}`}</bdi></p>}
      <button type="button" className="btn primary" disabled={busy||!title.trim()||!code} onClick={()=>void file(`حُفظ في ملف القضية ${code}.`,'cases',f=>fileToCase(store,f,code,title.trim()),[code])}><ArrowLeftRight size={15}/> حفظ في ملف القضية</button></fieldset>}
     {ready('orders')&&<fieldset className="file-action"><legend><Building2 size={14} aria-hidden/> إلى أوامر الأداء</legend>
      <label className="field"><span>الشركة</span><input list="file-room-companies" value={company} onChange={e=>setCompany(e.target.value)} placeholder="اختر الشركة أو اكتب اسماً جديداً"/><datalist id="file-room-companies">{companies.map(c=><option key={c} value={c}/>)}</datalist></label>
      <button type="button" className="btn" disabled={busy||!company.trim()} onClick={()=>void file(`حُفظ في أوامر أداء ${company}.`,'orders',f=>fileToOrders(store,f,company.trim()),[company.trim()])}><Building2 size={15}/> حفظ في أوامر الأداء</button></fieldset>}
    </div>}</>}</aside></div>}
 </>;
}

/** «المسح اليومي»: each day's scans, day by day, and the files of a chosen day. */
function DailyTab({store}:{store:Store}){
 const [days,setDays]=useState<Map<string,{count:number;dir:string[]}>|null>(null),[day,setDay]=useState(''),[files,setFiles]=useState<FileItem[]>([]),[now]=useState(()=>Date.now());
 useEffect(()=>{let live=true;dailyCounts(store).then(d=>{if(live){setDays(d);const last=[...d.keys()].sort().at(-1);if(last)setDay(last)}}).catch(e=>{if(live)setDays(new Map());toast.error((e as Error).message)});return()=>{live=false}},[store]);
 useEffect(()=>{const dir=day&&days?.get(day)?.dir;if(!dir){
  // eslint-disable-next-line react-hooks/set-state-in-effect -- no day chosen: nothing to list
  setFiles([]);return}let live=true;filesIn(store,'daily',dir).then(f=>{if(live)setFiles(f)}).catch(()=>{if(live)setFiles([])});return()=>{live=false}},[store,day,days]);
 if(!days)return <p className="day-empty" role="status"><LoaderCircle className="spin" size={14}/> جارٍ قراءة المسح اليومي…</p>;
 const keys=[...days.keys()].sort(),total=keys.reduce((n,k)=>n+days.get(k)!.count,0),month=todayISO().slice(0,7);
 const last14=Array.from({length:14},(_,i)=>{const d=new Date(now-(13-i)*86400000).toISOString().slice(0,10);return {label:formatDate(d).slice(0,5),value:days.get(d)?.count||0,tone:(d===day?'amber':'brand') as 'amber'|'brand',on:d===day,onClick:()=>setDay(d)}});
 return <>
  <PulseStrip label="ملخص المسح اليومي">
   <PulseTile icon={<CalendarDays size={16} aria-hidden/>} title="المسح اليومي" value={total} sub={keys.length===1?'في يوم واحد':keys.length===2?'في يومين':`في ${keys.length} ${keys.length%100>=3&&keys.length%100<=10?'أيام':'يوماً'}`} parts={[{label:'هذا الشهر',value:keys.filter(k=>k.startsWith(month)).reduce((n,k)=>n+days.get(k)!.count,0),tone:'brand'},{label:'قبل ذلك',value:keys.filter(k=>!k.startsWith(month)).reduce((n,k)=>n+days.get(k)!.count,0),tone:'grey'}]}/>
   <DayBars title="آخر أسبوعين" sub="اضغط يوماً لعرض ملفاته" days={last14}/>
  </PulseStrip>
  <div className="file-day-pick"><label className="field"><span>اليوم</span><select aria-label="اليوم" value={day} onChange={e=>setDay(e.target.value)}>{[...keys].reverse().map(k=><option key={k} value={k}>{formatDate(k)} ({days.get(k)!.count})</option>)}</select></label></div>
  {!files.length?<Empty title="لا ملفات في هذا اليوم" text="اختر يوماً آخر."/>:<ul className="story-list file-lines day-files" aria-label={'ملفات '+formatDate(day)}><li className="story-head" aria-hidden><span>الملف</span><span>الوقت</span><span>الحجم</span></li>
   {files.map(f=><li key={f.name}><button type="button" className="story-row e-green" onClick={()=>{openFile(store,f).catch(e=>toast.error('تعذر فتح الملف: '+(e as Error).message))}}><span className="story-name"><FileText size={14} aria-hidden/><b><bdi>{f.name}</bdi></b></span><span className="story-num">{new Date(f.modified).toTimeString().slice(0,5)}</span><span className="muted">{size(f.size)}</span></button></li>)}</ul>}
 </>;
}

/** «ملفات القضايا»: a folder per case code; each line tells its case, how many files and whether their names end with the code. */
function CasesTab({store,cases}:{store:Store;cases:CaseSummary[]}){
 const [folders,setFolders]=useState<Folder[]|null>(null),[progress,setProgress]=useState<[number,number]>([0,0]),[q,setQ]=useState(''),[show,setShow]=useState<''|'nocase'|'misnamed'|'empty'>(''),[open,setOpen]=useState('');
 useEffect(()=>{let live=true;folderSummaries(store,'cases',(d,t)=>{if(live)setProgress([d,t])},true).then(f=>{if(live)setFolders(f.sort((a,b)=>b.latest-a.latest))}).catch(e=>{if(live)setFolders([]);toast.error((e as Error).message)});return()=>{live=false}},[store]);
 const byCode=useMemo(()=>new Map(cases.filter(c=>caseCode(c)).map(c=>[normalizeSearch(caseCode(c)),c])),[cases]);
 const rows=useMemo(()=>(folders||[]).map(f=>{const c=byCode.get(normalizeSearch(f.name)),bad=(f.files||[]).filter(x=>!endsWithCode(x.name,f.name)).length;return {f,c,bad}}),[folders,byCode]);
 if(!folders)return <p className="day-empty" role="status"><LoaderCircle className="spin" size={14}/> جارٍ قراءة مجلدات القضايا… {progress[1]?`${progress[0]} من ${progress[1]}`:''}</p>;
 const named=new Set(folders.map(f=>normalizeSearch(f.name))),active=cases.filter(c=>!c.archived&&caseCode(c)),noFolder=active.filter(c=>!named.has(normalizeSearch(caseCode(c)))).length;
 const total=rows.reduce((n,r)=>n+r.f.count,0),noCase=rows.filter(r=>!r.c).length,misnamed=rows.filter(r=>r.bad).length,empty=rows.filter(r=>!r.f.count).length;
 const t=normalizeSearch(q),shown=rows.filter(r=>(!show||(show==='nocase'?!r.c:show==='misnamed'?r.bad>0:!r.f.count))&&(!t||normalizeSearch([r.f.name,r.c&&clientName(r.c),r.c?.opponent,...(r.f.files||[]).map(x=>x.name)].join(' ')).includes(t))).slice(0,300);
 const most=Math.max(1,...rows.map(r=>r.f.count)),pick=(v:typeof show)=>()=>setShow(show===v?'':v);
 return <>
  <PulseStrip label="ملخص ملفات القضايا">
   <PulseTile icon={<FolderTree size={16} aria-hidden/>} title="مجلدات القضايا" value={folders.length} sub={filesAr(total)} parts={[{label:'مطابقة للسجل',value:folders.length-noCase,tone:'green'},{label:'بلا قضية في السجل',value:noCase,tone:'red',on:show==='nocase',onClick:pick('nocase')},{label:'فارغة',value:empty,tone:'grey',on:show==='empty',onClick:pick('empty')}]}/>
   <PulseTile icon={<Scale size={16} aria-hidden/>} title="قضايا السجل" value={active.length} parts={[{label:'لها مجلد',value:active.length-noFolder,tone:'green'},{label:'بلا مجلد بعد',value:noFolder,tone:'amber'}]}/>
   <PulseTile icon={<FileText size={16} aria-hidden/>} title="تسمية الملفات" sub="تنتهي أسماؤها بالكود" parts={[{label:'سليمة',value:folders.length-misnamed,tone:'green'},{label:'فيها أسماء لا تنتهي بالكود',value:misnamed,tone:'amber',on:show==='misnamed',onClick:pick('misnamed')}]}/>
  </PulseStrip>
  <div className="work-desk-filters"><label className="field"><span>بحث في ملفات القضايا</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="الكود، الموكل، الخصم أو اسم ملف"/></label></div>
  {!shown.length?<Empty title="لا مجلدات مطابقة" text="غيّر البحث أو التصفية."/>:<ul className="story-list case-folders" aria-label="مجلدات القضايا"><li className="story-head" aria-hidden><span>الكود</span><span>القضية</span><span>الملفات</span><span>آخر ملف</span><span>باختصار</span></li>
   {shown.map(({f,c,bad})=><li key={f.name}><button type="button" className={'story-row e-'+(!c?'red':bad?'amber':f.count?'green':'grey')+(open===f.name?' on':'')} onClick={()=>setOpen(open===f.name?'':f.name)} aria-expanded={open===f.name}>
    <span className="story-name"><FolderOpen size={14} aria-hidden/><b><bdi>{f.name}</bdi></b></span>
    <span>{c?<>{tidyName(clientName(c))} <small className="muted">ضد {tidyName(c.opponent||'—')}</small></>:<span className="muted">لا قضية بهذا الكود في السجل</span>}</span>
    <span className="line-meter m-grey"><i aria-hidden><s className="t-brand" style={{width:f.count/most*100+'%'}}/></i><b>{f.count}</b></span>
    <span className="story-num">{f.latest?formatDate(new Date(f.latest).toISOString().slice(0,10)):'—'}</span>
    <span className="line-story">{[filesAr(f.count),bad?`${bad===1?'اسم واحد':bad===2?'اسمان':bad+' أسماء'} لا ${bad===1?'ينتهي':'تنتهي'} بالكود`:'',!c?'تحقق من الكود':''].filter(Boolean).join(' · ')}</span></button>
    {open===f.name&&<ul className="file-sublist" aria-label={'ملفات '+f.name}>{(f.files||[]).map(x=><li key={x.name}><button type="button" className="text-link" onClick={()=>{openFile(store,x).catch(e=>toast.error('تعذر فتح الملف: '+(e as Error).message))}}><FileText size={13} aria-hidden/> <bdi>{x.name}</bdi></button><small className={endsWithCode(x.name,f.name)?'muted':'file-misnamed'}>{endsWithCode(x.name,f.name)?formatDate(new Date(x.modified).toISOString().slice(0,10)):'لا ينتهي بالكود'}</small></li>)}</ul>}</li>)}</ul>}
  {rows.length>shown.length&&shown.length===300&&<p className="subtitle">تُعرض أول 300 مجلد؛ ابحث للوصول إلى غيرها.</p>}
 </>;
}

/** «أوامر الأداء»: a folder per company, each with how many orders it holds and when the newest came. */
function OrdersTab({store}:{store:Store}){
 const [folders,setFolders]=useState<Folder[]|null>(null),[open,setOpen]=useState(''),[now]=useState(()=>Date.now());
 useEffect(()=>{let live=true;folderSummaries(store,'orders',undefined,true).then(f=>{if(live)setFolders(f.sort((a,b)=>b.count-a.count))}).catch(e=>{if(live)setFolders([]);toast.error((e as Error).message)});return()=>{live=false}},[store]);
 if(!folders)return <p className="day-empty" role="status"><LoaderCircle className="spin" size={14}/> جارٍ قراءة أوامر الأداء…</p>;
 const total=folders.reduce((n,f)=>n+f.count,0),most=Math.max(1,...folders.map(f=>f.count)),tones=['brand','blue','amber','green'] as const,top=folders.slice(0,4),week=now-7*86400000;
 const recent=folders.reduce((n,f)=>n+(f.files||[]).filter(x=>x.modified>=week).length,0);
 return <>
  <PulseStrip label="ملخص أوامر الأداء">
   <PulseTile icon={<Building2 size={16} aria-hidden/>} title="أوامر الأداء" value={total} sub={`من ${folders.length} شركة`} parts={[...top.map((f,i)=>({label:f.name,value:f.count,tone:tones[i]})),...(folders.length>4?[{label:'الباقي',value:total-top.reduce((n,f)=>n+f.count,0),tone:'grey' as const}]:[])]}/>
   <PulseTile title="الوارد حديثاً" sub="آخر سبعة أيام" value={recent} parts={[{label:'هذا الأسبوع',value:recent,tone:'amber'},{label:'قبل ذلك',value:total-recent,tone:'grey'}]}/>
  </PulseStrip>
  {!folders.length?<Empty title="لا شركات بعد" text="تُنشأ مجلدات الشركات عند حفظ أول أمر أداء لكل شركة من الوارد."/>:<ul className="story-list order-folders" aria-label="شركات أوامر الأداء"><li className="story-head" aria-hidden><span>الشركة</span><span>الملفات</span><span>آخر ملف</span><span>باختصار</span></li>
   {folders.map(f=><li key={f.name}><button type="button" className={'story-row e-'+(f.count?'green':'grey')+(open===f.name?' on':'')} onClick={()=>setOpen(open===f.name?'':f.name)} aria-expanded={open===f.name}>
    <span className="story-name"><Building2 size={14} aria-hidden/><b><bdi>{f.name}</bdi></b></span>
    <span className="line-meter m-grey"><i aria-hidden><s className="t-brand" style={{width:f.count/most*100+'%'}}/></i><b>{f.count}</b></span>
    <span className="story-num">{f.latest?formatDate(new Date(f.latest).toISOString().slice(0,10)):'—'}</span>
    <span className="line-story">{filesAr(f.count)}{(f.files||[]).filter(x=>x.modified>=week).length?' · هذا الأسبوع: '+(f.files||[]).filter(x=>x.modified>=week).length:''}</span></button>
    {open===f.name&&<ul className="file-sublist" aria-label={'ملفات '+f.name}>{(f.files||[]).map(x=><li key={x.name}><button type="button" className="text-link" onClick={()=>{openFile(store,x).catch(e=>toast.error('تعذر فتح الملف: '+(e as Error).message))}}><FileText size={13} aria-hidden/> <bdi>{x.name}</bdi></button><small className="muted">{formatDate(new Date(x.modified).toISOString().slice(0,10))}</small></li>)}</ul>}</li>)}</ul>}
 </>;
}
