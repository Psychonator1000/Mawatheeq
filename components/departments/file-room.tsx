'use client';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {FolderInput,FolderOpen,FolderPlus,FolderTree,Inbox,CalendarDays,Scale,Building2,LoaderCircle,RefreshCw,ExternalLink,ShieldCheck,FileText,ArrowLeftRight} from 'lucide-react';
import {toast} from 'sonner';
import type {CaseSummary} from '@/lib/departments';
import type {Permissions} from '@/lib/permissions';
import {clientName,tidyName} from '@/lib/clients';
import {normalizeSearch} from '@/lib/case-browse';
import {formatDate,todayISO,caseCode} from '@/lib/domain';
import {ROOTS,allowed,dailyCounts,endsWithCode,fileToCase,fileToDaily,fileToOrders,filesIn,folderSummaries,loadRoots,openFile,pickRoot,saveRoots,snapshot,supported,type FileItem,type Folder,type RootKey,type Roots} from '@/lib/file-room';
import {DayBars,PulseStrip,PulseTile} from '../pulse';
import {FilterBox} from '../filter-select';
import {Empty} from '../shared';

type Tab='inbox'|'daily'|'cases'|'orders'|'setup';
const KEYS=Object.keys(ROOTS) as RootKey[];
/** Opens a file; a file moved or refused by the browser is said, not thrown. */
const openSafe=(f:Pick<FileItem,'handle'>)=>{openFile(f).catch(e=>toast.error('تعذر فتح الملف: '+(e as Error).message))};
const size=(n:number)=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
const when=(t:number)=>{const d=new Date(t),iso=d.toISOString().slice(0,10),today=todayISO();return (iso===today?'اليوم':formatDate(iso))+' '+d.toTimeString().slice(0,5)};
// «عدد ملفات» with the right number form.
const filesAr=(n:number)=>n===0?'لا ملفات':n===1?'ملف واحد':n===2?'ملفان':n%100>=3&&n%100<=10?`${n} ملفات`:`${n} ملفاً`;

/**
 * «الملفات»: the office's file room on its network share (lib/file-room.ts). Scans arrive in «الوارد», are filed by
 * day into «المسح اليومي», and each document is filed into its case's folder as «الاسم الكود» or into a company's
 * payment orders. Every list says at a glance what it holds and what needs doing.
 */
export default function FileRoom({cases,access}:{cases:CaseSummary[];access:Permissions}){
 const [roots,setRoots]=useState<Roots|null>(null),[ok,setOk]=useState<Record<string,boolean>>({}),[tab,setTab]=useState<Tab>('inbox'),[tick,setTick]=useState(0);
 const reload=useCallback(()=>setTick(t=>t+1),[]);
 useEffect(()=>{let live=true;loadRoots().then(async r=>{const o:Record<string,boolean>={};for(const k of KEYS)if(r[k])o[k]=await allowed(r[k]!);if(live){setRoots(r);setOk(o);if(!KEYS.some(k=>r[k]))setTab('setup')}}).catch(()=>{if(live){setRoots({});setTab('setup')}});return()=>{live=false}},[tick]);
 const ready=(k:RootKey)=>!!roots?.[k]&&ok[k];
 const missing=KEYS.filter(k=>!roots?.[k]),blocked=KEYS.filter(k=>roots?.[k]&&!ok[k]);
 async function allowAll(){const o={...ok};for(const k of blocked)o[k]=await allowed(roots![k]!,true);setOk(o)}
 if(!supported())return <section className="panel file-room"><h2>الملفات</h2><p className="notice">هذه الصفحة تعمل على أجهزة المكتب بمتصفح Chrome أو Edge، لأنها تتصل بمجلدات الشبكة مباشرة. افتحها من جهاز المكتب.</p></section>;
 if(!roots)return <p className="day-empty" role="status"><LoaderCircle className="spin" size={14}/> جارٍ تجهيز الملفات…</p>;
 const tabs:[Tab,string,typeof Inbox][]=[['inbox','الوارد',Inbox],['daily','المسح اليومي',CalendarDays],['cases','ملفات القضايا',Scale],['orders','أوامر الأداء',Building2],['setup','المجلدات',FolderTree]];
 return <section className="panel work-desk file-room">
  <div className="work-desk-head"><h2>الملفات</h2>
   <div className="work-chips" role="group" aria-label="أقسام الملفات">{tabs.map(([id,l,Icon])=><button key={id} type="button" className={'work-chip'+(tab===id?' on':'')} aria-pressed={tab===id} onClick={()=>setTab(id)}><Icon size={14}/> {l}</button>)}</div>
   <div className="actions"><button type="button" className="btn" onClick={reload}><RefreshCw size={15}/> تحديث</button></div></div>
  {blocked.length>0&&<div className="notice file-room-allow" role="status"><ShieldCheck size={16}/><span>يحتاج المتصفح إذنك لفتح مجلدات الشبكة في هذه الجلسة.</span><button type="button" className="btn primary" onClick={()=>void allowAll()}>السماح بالوصول</button></div>}
  {missing.length>0&&tab!=='setup'&&<div className="notice" role="status"><FolderPlus size={16}/><span>لم يُحدد بعد: {missing.map(k=>ROOTS[k].label).join('، ')}.</span><button type="button" className="btn" onClick={()=>setTab('setup')}>تحديد المجلدات</button></div>}
  <div className="work-desk-body">
   {tab==='setup'&&<Setup roots={roots} ok={ok} onSaved={reload}/>}
   {tab==='inbox'&&(ready('inbox')?<InboxTab key={tick} roots={roots} ready={ready} cases={cases} canEdit={access.canEdit} onChanged={reload}/>:<NeedRoot k="inbox" onSetup={()=>setTab('setup')}/>)}
   {tab==='daily'&&(ready('daily')?<DailyTab key={tick} dir={roots.daily!}/>:<NeedRoot k="daily" onSetup={()=>setTab('setup')}/>)}
   {tab==='cases'&&(ready('cases')?<CasesTab key={tick} dir={roots.cases!} cases={cases}/>:<NeedRoot k="cases" onSetup={()=>setTab('setup')}/>)}
   {tab==='orders'&&(ready('orders')?<OrdersTab key={tick} dir={roots.orders!}/>:<NeedRoot k="orders" onSetup={()=>setTab('setup')}/>)}
  </div></section>;
}

function NeedRoot({k,onSetup}:{k:RootKey;onSetup:()=>void}){return <div className="file-room-need"><Empty title={'لم يُحدد مجلد «'+ROOTS[k].label+'»'} text={ROOTS[k].hint}/><button type="button" className="btn primary" onClick={onSetup}><FolderPlus size={15}/> تحديد المجلدات</button></div>}

/** «المجلدات»: the four folders of the share given to the app on this computer. */
function Setup({roots,ok,onSaved}:{roots:Roots;ok:Record<string,boolean>;onSaved:()=>void}){
 const [busy,setBusy]=useState('');
 async function choose(k:RootKey){setBusy(k);try{const h=await pickRoot(k,roots[k]);await saveRoots({...roots,[k]:h});toast.success('حُدد مجلد «'+ROOTS[k].label+'».');onSaved()}catch(e){if((e as Error).name!=='AbortError')toast.error((e as Error).message)}finally{setBusy('')}}
 return <div className="file-room-setup"><p className="subtitle">حدد مجلدات الشبكة مرة واحدة على هذا الجهاز. لا تُرفع الملفات إلى أي خادم؛ يعمل التطبيق داخل هذه المجلدات فقط.</p>
  <ul className="story-list file-roots" aria-label="المجلدات">{KEYS.map(k=><li key={k}><div className={'story-row e-'+(!roots[k]?'amber':ok[k]?'green':'red')}>
   <span className="story-name"><FolderOpen size={15} aria-hidden/><b>{ROOTS[k].label}</b></span>
   <span className="line-story">{roots[k]?<>المجلد: <bdi>{roots[k]!.name}</bdi>{ok[k]?' · متاح':' · يحتاج الإذن'}</>:ROOTS[k].hint}</span>
   <button type="button" className={'btn'+(roots[k]?'':' primary')} disabled={!!busy} onClick={()=>void choose(k)}>{busy===k?<LoaderCircle className="spin" size={14}/>:<FolderInput size={14}/>} {roots[k]?'تغيير':'تحديد'}</button></div></li>)}</ul></div>;
}

/** «الوارد»: what the scanner put on the share, to file by day, into a case or into a company's payment orders. */
/** A PDF preview that empties itself before it is taken away: Chrome's PDF viewer, removed while showing a document, raises an error in the page. */
function PdfFrame({title,src}:{title:string;src:string}){
 const ref=useRef<HTMLIFrameElement>(null);
 useLayoutEffect(()=>{const f=ref.current;return()=>{if(f)f.src='about:blank'}},[]);
 return <iframe ref={ref} className="file-preview" title={title} src={src}/>;
}
function InboxTab({roots,ready,cases,canEdit,onChanged}:{roots:Roots;ready:(k:RootKey)=>boolean;cases:CaseSummary[];canEdit:boolean;onChanged:()=>void}){
 const [files,setFiles]=useState<FileItem[]|null>(null),[open,setOpen]=useState<FileItem|null>(null),[busy,setBusy]=useState(false),[picked,setPicked]=useState<Set<string>>(new Set());
 const [title,setTitle]=useState(''),[code,setCode]=useState(''),[company,setCompany]=useState(''),[keep,setKeep]=useState(true),[preview,setPreview]=useState('');
 const [companies,setCompanies]=useState<string[]>([]),[now]=useState(()=>Date.now());
 useEffect(()=>{let live=true;filesIn(roots.inbox!).then(f=>{if(live)setFiles(f)}).catch(e=>toast.error((e as Error).message));
  if(roots.orders&&ready('orders'))folderSummaries(roots.orders).then(fs=>{if(live)setCompanies(fs.map(f=>f.name).sort((a,b)=>a.localeCompare(b,'ar')))}).catch(()=>{});
  return()=>{live=false}},[roots,ready]);
 useEffect(()=>{if(!open){
  // eslint-disable-next-line react-hooks/set-state-in-effect -- no file chosen: no preview
  setPreview('');return}let url='',live=true;snapshot(open).then(f=>{if(!live)return;url=URL.createObjectURL(f);setPreview(url)}).catch(()=>{if(live)setPreview('')});return()=>{live=false;
  // Released a while after the preview closes: the PDF viewer may still be loading it, and a link taken from under it
  // raises an error in the page (seen in Chrome when a document is filed straight from its preview).
  if(url){const u=url;setTimeout(()=>URL.revokeObjectURL(u),30000)}}},[open]);
 const caseOptions=useMemo(()=>cases.filter(c=>!c.archived&&caseCode(c)).map(c=>({value:caseCode(c),label:caseCode(c),hint:`${tidyName(clientName(c))} ضد ${tidyName(c.opponent||'—')}`})),[cases]);
 const theCase=cases.find(c=>caseCode(c)===code);
 if(!files)return <p className="day-empty" role="status"><LoaderCircle className="spin" size={14}/> جارٍ قراءة الوارد…</p>;
 const today=todayISO(),todayN=files.filter(f=>new Date(f.modified).toISOString().slice(0,10)===today).length;
 const days=Array.from({length:7},(_,i)=>{const d=new Date(now-(6-i)*86400000).toISOString().slice(0,10);return {label:i===6?'اليوم':formatDate(d).slice(0,5),value:files.filter(f=>new Date(f.modified).toISOString().slice(0,10)===d).length,tone:(i===6?'amber':'brand') as 'amber'|'brand'}});
 const older=files.filter(f=>now-f.modified>7*86400000).length;
 async function run(label:string,fn:()=>Promise<unknown>){setBusy(true);try{await fn();toast.success(label);onChanged()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 const chosen=files.filter(f=>picked.has(f.name));
 return <>
  <PulseStrip label="ملخص الوارد">
   <PulseTile icon={<Inbox size={16} aria-hidden/>} title="في الوارد" value={files.length} sub="بانتظار الترتيب" parts={[{label:'اليوم',value:todayN,tone:'amber'},{label:'هذا الأسبوع',value:files.length-todayN-older,tone:'brand'},{label:'أقدم من أسبوع',value:older,tone:'red'}]}/>
   <DayBars title="الوارد يوماً بيوم" sub="آخر سبعة أيام" days={days}/>
  </PulseStrip>
  {!files.length?<Empty title="الوارد فارغ" text="كل ما مسحه الماسح رُتب. تظهر هنا الملفات الجديدة فور حفظها في مجلد الوارد."/>:<div className="file-inbox">
   <div className="file-inbox-list">
    {canEdit&&ready('daily')&&<div className="pick-bar" role="group" aria-label="ترتيب الوارد"><label className="checkbox-line"><input type="checkbox" checked={picked.size===files.length} onChange={e=>setPicked(e.target.checked?new Set(files.map(f=>f.name)):new Set())}/> تحديد الكل</label>
     <button type="button" className="btn primary" disabled={busy||!chosen.length} onClick={()=>void run(`رُتب ${filesAr(chosen.length)} في المسح اليومي.`,async()=>{for(const f of chosen)await fileToDaily(f,roots.daily!);setPicked(new Set());setOpen(null)})}><CalendarDays size={15}/> ترتيب المحدد في المسح اليومي ({chosen.length})</button></div>}
    <ul className="story-list file-lines" aria-label="ملفات الوارد"><li className="story-head" aria-hidden><span/><span>الملف</span><span>مُسح</span><span>الحجم</span></li>
     {files.map(f=><li key={f.name}><div className={'story-row e-'+(now-f.modified>7*86400000?'red':open?.name===f.name?'green':'amber')+(open?.name===f.name?' on':'')} onClick={e=>{if(!(e.target as HTMLElement).closest('input'))setOpen(f)}}>
      <span>{canEdit&&<input type="checkbox" aria-label={'تحديد '+f.name} checked={picked.has(f.name)} onChange={e=>setPicked(p=>{const n=new Set(p);if(e.target.checked)n.add(f.name);else n.delete(f.name);return n})}/>}</span>
      <span className="story-name"><FileText size={14} aria-hidden/><b><bdi>{f.name}</bdi></b></span><span className="story-num">{when(f.modified)}</span><span className="muted">{size(f.size)}</span></div></li>)}</ul></div>
   <aside className="file-inbox-side" aria-label="الملف المختار">{!open?<p className="day-empty">اختر ملفاً من القائمة لمعاينته وترتيبه.</p>:<>
    <div className="file-preview-head"><b><bdi>{open.name}</bdi></b><button type="button" className="icon-btn" aria-label="فتح في نافذة" title="فتح في نافذة" onClick={()=>openSafe(open)}><ExternalLink size={15}/></button></div>
    {preview&&/\.pdf$/i.test(open.name)?<PdfFrame title={'معاينة '+open.name} src={preview}/>:preview&&/\.(png|jpe?g)$/i.test(open.name)?<img className="file-preview" alt={'معاينة '+open.name} src={preview}/>:<p className="day-empty">لا معاينة لهذا النوع؛ افتحه في نافذة.</p>}
    {canEdit&&<div className="file-actions">
     {ready('cases')&&<fieldset className="file-action"><legend><Scale size={14} aria-hidden/> إلى ملف قضية</legend>
      <label className="field"><span>اسم المستند</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثل: صحيفة الدعوى، حكم أول درجة"/></label>
      <div className="field"><span>كود القضية</span><FilterBox label="كود القضية" value={code} onChange={setCode} options={caseOptions} placeholder="اكتب الكود أو جزءاً منه"/></div>
      {theCase&&<p className="subtitle">{tidyName(clientName(theCase))} ضد {tidyName(theCase.opponent||'—')}</p>}
      {title.trim()&&code&&<p className="subtitle">سيُحفظ باسم: <bdi>{`${title.trim()} ${code}`}</bdi></p>}
      <label className="checkbox-line"><input type="checkbox" checked={keep} onChange={e=>setKeep(e.target.checked)}/> إبقاء نسخة في المسح اليومي</label>
      <button type="button" className="btn primary" disabled={busy||!title.trim()||!code} onClick={()=>void run(`حُفظ في ملف القضية ${code}.`,async()=>{
       let item=open;if(keep&&ready('daily')){const kept=await fileToDaily(open,roots.daily!);const dir=await dayDir(roots.daily!,open.modified);item={...open,name:kept,dir,handle:await dir.getFileHandle(kept)}}
       await fileToCase(item,roots.cases!,code,title.trim(),keep&&ready('daily'));setTitle('');setOpen(null)})}><ArrowLeftRight size={15}/> حفظ في ملف القضية</button></fieldset>}
     {ready('orders')&&<fieldset className="file-action"><legend><Building2 size={14} aria-hidden/> إلى أوامر الأداء</legend>
      <label className="field"><span>الشركة</span><input list="file-room-companies" value={company} onChange={e=>setCompany(e.target.value)} placeholder="اختر الشركة أو اكتب اسماً جديداً"/><datalist id="file-room-companies">{companies.map(c=><option key={c} value={c}/>)}</datalist></label>
      <button type="button" className="btn" disabled={busy||!company.trim()} onClick={()=>void run(`حُفظ في أوامر أداء ${company}.`,async()=>{await fileToOrders(open,roots.orders!,company.trim(),false);setOpen(null)})}><Building2 size={15}/> حفظ في أوامر الأداء</button></fieldset>}
     {ready('daily')&&<button type="button" className="btn" disabled={busy} onClick={()=>void run('رُتب في المسح اليومي.',async()=>{await fileToDaily(open,roots.daily!);setOpen(null)})}><CalendarDays size={15}/> ترتيبه في المسح اليومي فقط</button>}
    </div>}</>}</aside></div>}
 </>;
}
async function dayDir(daily:FileSystemDirectoryHandle,t:number){const {dayParts}=await import('@/lib/file-room');let d=daily;for(const p of dayParts(t))d=await d.getDirectoryHandle(p);return d}

/** «المسح اليومي»: each day's scans, day by day, and the files of a chosen day. */
function DailyTab({dir}:{dir:FileSystemDirectoryHandle}){
 const [days,setDays]=useState<Map<string,{count:number;handle:FileSystemDirectoryHandle}>|null>(null),[day,setDay]=useState(''),[files,setFiles]=useState<FileItem[]>([]),[now]=useState(()=>Date.now());
 useEffect(()=>{let live=true;dailyCounts(dir).then(d=>{if(live){setDays(d);const last=[...d.keys()].sort().at(-1);if(last)setDay(last)}}).catch(e=>toast.error((e as Error).message));return()=>{live=false}},[dir]);
 useEffect(()=>{const h=day&&days?.get(day)?.handle;if(!h){
  // eslint-disable-next-line react-hooks/set-state-in-effect -- no day chosen: nothing to list
  setFiles([]);return}let live=true;filesIn(h).then(f=>{if(live)setFiles(f)}).catch(()=>{if(live)setFiles([])});return()=>{live=false}},[day,days]);
 if(!days)return <p className="day-empty" role="status"><LoaderCircle className="spin" size={14}/> جارٍ قراءة المسح اليومي…</p>;
 const keys=[...days.keys()].sort(),total=keys.reduce((n,k)=>n+days.get(k)!.count,0),month=todayISO().slice(0,7);
 const last14=Array.from({length:14},(_,i)=>{const d=new Date(now-(13-i)*86400000).toISOString().slice(0,10);return {label:formatDate(d).slice(0,5),value:days.get(d)?.count||0,tone:(d===day?'amber':'brand') as 'amber'|'brand',on:d===day,onClick:()=>setDay(d)}});
 return <>
  <PulseStrip label="ملخص المسح اليومي">
   <PulseTile icon={<CalendarDays size={16} aria-hidden/>} title="المسح اليومي" value={total} sub={`في ${keys.length} يوماً`} parts={[{label:'هذا الشهر',value:keys.filter(k=>k.startsWith(month)).reduce((n,k)=>n+days.get(k)!.count,0),tone:'brand'},{label:'قبل ذلك',value:keys.filter(k=>!k.startsWith(month)).reduce((n,k)=>n+days.get(k)!.count,0),tone:'grey'}]}/>
   <DayBars title="آخر أسبوعين" sub="اضغط يوماً لعرض ملفاته" days={last14}/>
  </PulseStrip>
  <div className="file-day-pick"><label className="field"><span>اليوم</span><select aria-label="اليوم" value={day} onChange={e=>setDay(e.target.value)}>{[...keys].reverse().map(k=><option key={k} value={k}>{formatDate(k)} ({days.get(k)!.count})</option>)}</select></label></div>
  {!files.length?<Empty title="لا ملفات في هذا اليوم" text="اختر يوماً آخر."/>:<ul className="story-list file-lines" aria-label={'ملفات '+formatDate(day)}><li className="story-head" aria-hidden><span/><span>الملف</span><span>الوقت</span><span>الحجم</span></li>
   {files.map(f=><li key={f.name}><button type="button" className="story-row e-green" onClick={()=>openSafe(f)}><span/><span className="story-name"><FileText size={14} aria-hidden/><b><bdi>{f.name}</bdi></b></span><span className="story-num">{new Date(f.modified).toTimeString().slice(0,5)}</span><span className="muted">{size(f.size)}</span></button></li>)}</ul>}
 </>;
}

/** «ملفات القضايا»: a folder per case code; each line tells its case, how many files and whether their names end with the code. */
function CasesTab({dir,cases}:{dir:FileSystemDirectoryHandle;cases:CaseSummary[]}){
 const [folders,setFolders]=useState<Folder[]|null>(null),[progress,setProgress]=useState<[number,number]>([0,0]),[q,setQ]=useState(''),[show,setShow]=useState<''|'nocase'|'misnamed'|'empty'>(''),[open,setOpen]=useState('');
 useEffect(()=>{let live=true;folderSummaries(dir,(d,t)=>{if(live)setProgress([d,t])},true).then(f=>{if(live)setFolders(f.sort((a,b)=>b.latest-a.latest))}).catch(e=>toast.error((e as Error).message));return()=>{live=false}},[dir]);
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
    {open===f.name&&<ul className="file-sublist" aria-label={'ملفات '+f.name}>{(f.files||[]).map(x=><li key={x.name}><button type="button" className="text-link" onClick={()=>openSafe(x)}><FileText size={13} aria-hidden/> <bdi>{x.name}</bdi></button><small className={endsWithCode(x.name,f.name)?'muted':'file-misnamed'}>{endsWithCode(x.name,f.name)?formatDate(new Date(x.modified).toISOString().slice(0,10)):'لا ينتهي بالكود'}</small></li>)}</ul>}</li>)}</ul>}
  {rows.length>shown.length&&shown.length===300&&<p className="subtitle">تُعرض أول 300 مجلد؛ ابحث للوصول إلى غيرها.</p>}
 </>;
}

/** «أوامر الأداء»: a folder per company, each with how many orders it holds and when the newest came. */
function OrdersTab({dir}:{dir:FileSystemDirectoryHandle}){
 const [folders,setFolders]=useState<Folder[]|null>(null),[open,setOpen]=useState(''),[now]=useState(()=>Date.now());
 useEffect(()=>{let live=true;folderSummaries(dir,undefined,true).then(f=>{if(live)setFolders(f.sort((a,b)=>b.count-a.count))}).catch(e=>toast.error((e as Error).message));return()=>{live=false}},[dir]);
 if(!folders)return <p className="day-empty" role="status"><LoaderCircle className="spin" size={14}/> جارٍ قراءة أوامر الأداء…</p>;
 const total=folders.reduce((n,f)=>n+f.count,0),most=Math.max(1,...folders.map(f=>f.count)),tones=['brand','blue','amber','green'] as const,top=folders.slice(0,4),week=now-7*86400000;
 return <>
  <PulseStrip label="ملخص أوامر الأداء">
   <PulseTile icon={<Building2 size={16} aria-hidden/>} title="أوامر الأداء" value={total} sub={`من ${folders.length} شركة`} parts={[...top.map((f,i)=>({label:f.name,value:f.count,tone:tones[i]})),...(folders.length>4?[{label:'الباقي',value:total-top.reduce((n,f)=>n+f.count,0),tone:'grey' as const}]:[])]}/>
   <PulseTile title="الوارد حديثاً" sub="آخر سبعة أيام" value={folders.reduce((n,f)=>n+(f.files||[]).filter(x=>x.modified>=week).length,0)} parts={[{label:'هذا الأسبوع',value:folders.reduce((n,f)=>n+(f.files||[]).filter(x=>x.modified>=week).length,0),tone:'amber'},{label:'قبل ذلك',value:folders.reduce((n,f)=>n+(f.files||[]).filter(x=>x.modified<week).length,0),tone:'grey'}]}/>
  </PulseStrip>
  {!folders.length?<Empty title="لا شركات بعد" text="تُنشأ مجلدات الشركات عند حفظ أول أمر أداء لكل شركة من الوارد."/>:<ul className="story-list order-folders" aria-label="شركات أوامر الأداء"><li className="story-head" aria-hidden><span>الشركة</span><span>الملفات</span><span>آخر ملف</span><span>باختصار</span></li>
   {folders.map(f=><li key={f.name}><button type="button" className={'story-row e-'+(f.count?'green':'grey')+(open===f.name?' on':'')} onClick={()=>setOpen(open===f.name?'':f.name)} aria-expanded={open===f.name}>
    <span className="story-name"><Building2 size={14} aria-hidden/><b><bdi>{f.name}</bdi></b></span>
    <span className="line-meter m-grey"><i aria-hidden><s className="t-brand" style={{width:f.count/most*100+'%'}}/></i><b>{f.count}</b></span>
    <span className="story-num">{f.latest?formatDate(new Date(f.latest).toISOString().slice(0,10)):'—'}</span>
    <span className="line-story">{filesAr(f.count)}{(f.files||[]).filter(x=>x.modified>=week).length?' · هذا الأسبوع: '+(f.files||[]).filter(x=>x.modified>=week).length:''}</span></button>
    {open===f.name&&<ul className="file-sublist" aria-label={'ملفات '+f.name}>{(f.files||[]).map(x=><li key={x.name}><button type="button" className="text-link" onClick={()=>openSafe(x)}><FileText size={13} aria-hidden/> <bdi>{x.name}</bdi></button><small className="muted">{formatDate(new Date(x.modified).toISOString().slice(0,10))}</small></li>)}</ul>}</li>)}</ul>}
 </>;
}
