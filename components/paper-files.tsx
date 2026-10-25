'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {FolderOpen,CheckCircle2,Undo2,X} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {PAPER_FILES_EVENT,REQUEST_STATUSES,daysBetween,type DeskFile,type HeldFile,type MyPaperFiles,type MyRequest} from '@/lib/archive';
import {formatDate,todayISO} from '@/lib/domain';
import {usePaperSlot} from './chat-slot';
import {Popover,PopoverContent,PopoverTrigger} from './ui/popover';

const desk=<T,>(action:string,data:Record<string,unknown>={})=>departmentRequest<T>(action,{...data,workspace:'archive'});
const FAST=30000,HIDDEN=90000;
// Before the handover update is installed the server refuses these actions; the button then stays away.
const missing=(e:unknown)=>{const err=e as {code?:string;message?:string};return err?.code==='42501'||/غير متاحة|Could not find the function|PGRST202/.test(String(err?.message||e))};
const caseLine=(f:DeskFile)=>[f.caseCode&&'كود '+f.caseCode,[f.client,f.opponent].filter(Boolean).join(' ضد ')].filter(Boolean).join(' · ');

/**
 * «ملفاتي الورقية»: the paper files the archive sent this person, each waiting for «استلمت» when the papers are
 * handed over, the files they hold with «أرجعت الملف», and their own requests. New files arrive as a notice with «استلمت».
 */
export default function PaperFiles({userId}:{userId:string}){
 const [data,setData]=useState<MyPaperFiles|null>(null),[available,setAvailable]=useState(true),[open,setOpen]=useState(false),[busy,setBusy]=useState('');
 const seen=useRef<Set<string>|null>(null),statuses=useRef(new Map<string,string>());
 const refresh=useCallback(async()=>{
  try{const d=await desk<MyPaperFiles>('desk_mine');setData(d);
   const pending=d.holding.filter(h=>h.receipt==='pending');
   // Newly sent files announce themselves: the list opens, with a browser notice when the app is in the background.
   const fresh=pending.filter(h=>!seen.current?.has(h.movementId));
   seen.current=new Set([...(seen.current||[]),...pending.map(h=>h.movementId)]);
   if(fresh.length){const one=fresh.length===1?fresh[0]:null,text=one?`وصلك الملف ${one.number} من الأرشيف`:`وصلك ${fresh.length} ملفات من الأرشيف`;
    // The notice carries the receipt itself: «استلمت» for one file, the list for several.
    toast.message(text,{id:'paper-'+fresh.map(h=>h.movementId).join('-'),duration:60000,description:one?`${one.title} · أرسله ${one.sentBy}. اضغط «استلمت» عند تسلّم الأوراق.`:'اضغط «استلمت» عند تسلّم الأوراق.',
     action:one?{label:'استلمت',onClick:()=>{void desk('desk_receive',{movementId:one.movementId}).then(()=>{toast.success('أكدت استلام '+one.number);dispatchEvent(new Event(PAPER_FILES_EVENT))}).catch(e=>toast.error((e as Error).message))}}:{label:'عرض الملفات',onClick:()=>setOpen(true)}});
    if(document.hidden&&'Notification' in window&&Notification.permission==='granted')new Notification(text,{body:'اضغط «استلمت» عند تسلّم الأوراق.',tag:'mawatheeq-paper'})}
   // A request the archive prepared or declined is announced once.
   for(const r of d.requests){const before=statuses.current.get(r.id);statuses.current.set(r.id,r.status);
    if(before&&before!==r.status&&(r.status==='ready'||r.status==='declined'))toast.message(`طلب الملف ${r.number}: ${REQUEST_STATUSES[r.status]}`,{description:r.decisionNote||undefined})}
  }catch(e){if(missing(e))setAvailable(false)}
 },[]);
 useEffect(()=>{let timer=0;const tick=()=>{void refresh();timer=window.setTimeout(tick,document.hidden?HIDDEN:FAST)};tick();
  const wake=()=>{clearTimeout(timer);tick()};addEventListener('focus',wake);addEventListener(PAPER_FILES_EVENT,wake);
  return()=>{clearTimeout(timer);removeEventListener('focus',wake);removeEventListener(PAPER_FILES_EVENT,wake)}},[refresh,userId]);
 const slot=usePaperSlot();
 async function act(key:string,run:()=>Promise<unknown>,done:string){setBusy(key);try{await run();toast.success(done);dispatchEvent(new Event(PAPER_FILES_EVENT))}catch(e){toast.error((e as Error).message)}finally{setBusy('')}}
 if(!available||!data||!slot)return null;
 const pending=data.holding.filter(h=>h.receipt==='pending'),withMe=data.holding.filter(h=>h.receipt!=='pending'),openRequests=data.requests.filter(r=>r.status==='pending'||r.status==='ready');
 if(!data.holding.length&&!openRequests.length)return null;
 const label=pending.length?`ملفاتي الورقية: ${pending.length} بانتظار تأكيد استلامك`:`ملفاتي الورقية: ${data.holding.length} معي`;
 const count=pending.length||data.holding.length,today=todayISO();
 const receiveAll=()=>act('all',async()=>{for(const h of pending)await desk('desk_receive',{movementId:h.movementId})},'أكدت استلام الملفات');
 return createPortal(<Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
  <button type="button" className="icon-btn notice-trigger paper-trigger" aria-label={label} title="ملفاتي الورقية"><FolderOpen/>{count>0&&<span key={'paper-'+count+pending.length} className={'notice-count'+(pending.length?' urgent':'')} aria-hidden="true">{count}</span>}</button></PopoverTrigger>
  <PopoverContent align="end" dir="rtl" className="notice-panel paper-panel" aria-label="ملفاتي الورقية">
   <div className="notice-head"><b>ملفاتي الورقية</b><small>الملفات التي سلّمها لك الأرشيف وطلباتك</small></div>
   {pending.length>0&&<section className="paper-group alert" aria-label="بانتظار تأكيد استلامك"><div className="paper-group-head"><h3>وصلتك من الأرشيف</h3>{pending.length>1&&<button type="button" className="btn primary" disabled={!!busy} onClick={()=>void receiveAll()}><CheckCircle2 size={15}/> استلمت الكل ({pending.length})</button>}</div>
    <p className="paper-hint">لا تُسلَّم الأوراق إلا بعد ضغط «استلمت».</p>
    <ul>{pending.map(h=><Held key={h.movementId} file={h} today={today} action={<button type="button" className="btn primary" disabled={!!busy} onClick={()=>void act(h.movementId,()=>desk('desk_receive',{movementId:h.movementId}),'أكدت استلام '+h.number)}><CheckCircle2 size={15}/> استلمت</button>}/>)}</ul></section>}
   {withMe.length>0&&<section className="paper-group" aria-label="معي الآن"><div className="paper-group-head"><h3>معي الآن ({withMe.length})</h3></div>
    <ul>{withMe.map(h=><Held key={h.movementId} file={h} today={today} action={h.returnClaimedAt?<span className="tag amber">بانتظار تأكيد الأرشيف</span>
     :<button type="button" className="btn" disabled={!!busy} onClick={()=>void act(h.movementId,()=>desk('desk_return',{movementId:h.movementId}),'أبلغت الأرشيف بإرجاع '+h.number)}><Undo2 size={15}/> أرجعت الملف</button>}/>)}</ul></section>}
   {openRequests.length>0&&<section className="paper-group" aria-label="طلباتي"><div className="paper-group-head"><h3>طلباتي ({openRequests.length})</h3></div>
    <ul>{openRequests.map(r=><Requested key={r.id} request={r} action={r.status==='pending'?<button type="button" className="icon-btn" aria-label={'إلغاء طلب '+r.number} title="إلغاء الطلب" disabled={!!busy} onClick={()=>void act(r.id,()=>desk('desk_cancel',{id:r.id}),'أُلغي طلب '+r.number)}><X size={15}/></button>:undefined}/>)}</ul></section>}
  </PopoverContent></Popover>,slot);
}

function Held({file,today,action}:{file:HeldFile;today:string;action:React.ReactNode}){
 const late=!!file.dueDate&&file.dueDate<today;
 return <li className="paper-item"><span className="paper-item-main"><b><span dir="ltr">{file.number}</span> · {file.title}</b><small>{caseLine(file)}</small>
  <small>{[file.receipt==='pending'?'أرسله '+file.sentBy:'منذ '+formatDate(file.date),file.purpose,file.dueDate&&(late?`متأخر ${daysBetween(file.dueDate,today)} يوم`:'الإعادة '+formatDate(file.dueDate))].filter(Boolean).join(' · ')}</small></span>{action}</li>;
}

function Requested({request,action}:{request:MyRequest;action?:React.ReactNode}){
 return <li className="paper-item"><span className="paper-item-main"><b><span dir="ltr">{request.number}</span> · {request.title}</b><small>{caseLine(request)}</small>
  <small>{[request.neededBy&&'مطلوب '+formatDate(request.neededBy),request.purpose].filter(Boolean).join(' · ')}</small></span><span className={'tag '+(request.status==='ready'?'green':'amber')}>{REQUEST_STATUSES[request.status]}</span>{action}</li>;
}
