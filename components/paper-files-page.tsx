'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Undo2,X,FolderOpen} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {PAPER_FILES_EVENT,REQUEST_STATUSES,daysBetween,type HeldFile,type MyPaperFiles} from '@/lib/archive';
import {normalizeSearch} from '@/lib/case-browse';
import {formatDate,todayISO} from '@/lib/domain';
import {officeTime} from './office-shared';
import {Field,Empty} from './shared';

type PastFile=HeldFile&{current:boolean;next:{type:string;date:string;holder:string}|null};
type Filter='all'|'pending'|'with'|'back';
const desk=<T,>(action:string,data:Record<string,unknown>={})=>departmentRequest<T>(action,{...data,workspace:'archive'});
const caseLine=(f:HeldFile)=>[f.caseCode&&'كود '+f.caseCode,[f.client,f.opponent].filter(Boolean).join(' ضد ')].filter(Boolean).join(' · ');

/** Every paper file the archive handed you: what waits for «استلمت», what you hold, and what went back, with your requests. */
export default function PaperFilesPage(){
 const [files,setFiles]=useState<PastFile[]|null>(null),[mine,setMine]=useState<MyPaperFiles|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [filter,setFilter]=useState<Filter>('all'),[search,setSearch]=useState('');
 // Before the history update is installed, the page still lists the files held now.
 const load=useCallback(()=>Promise.all([desk<MyPaperFiles>('desk_mine'),desk<PastFile[]>('desk_history').catch(()=>null)])
  .then(([m,h])=>{setMine(m);setError('');setFiles(h??m.holding.map(x=>({...x,current:true,next:null})))}).catch(e=>setError((e as Error).message)),[]);
 useEffect(()=>{void load();addEventListener(PAPER_FILES_EVENT,load);addEventListener('focus',load);return()=>{removeEventListener(PAPER_FILES_EVENT,load);removeEventListener('focus',load)}},[load]);
 async function act(key:string,run:()=>Promise<unknown>,done:string){setBusy(key);try{await run();toast.success(done);dispatchEvent(new Event(PAPER_FILES_EVENT))}catch(e){toast.error((e as Error).message)}finally{setBusy('')}}
 const today=todayISO();
 const stateOf=(f:PastFile):Filter=>!f.current?'back':f.receipt==='pending'?'pending':'with';
 const counts=useMemo(()=>{const c={all:0,pending:0,with:0,back:0};for(const f of files||[]){c.all++;c[stateOf(f)]++}return c},[files]);
 const list=(files||[]).filter(f=>(filter==='all'||stateOf(f)===filter)&&normalizeSearch([f.number,f.title,f.caseCode,f.client,f.opponent,f.purpose,f.sentBy].join(' ')).includes(normalizeSearch(search)));
 const openRequests=(mine?.requests||[]).filter(r=>r.status==='pending'||r.status==='ready');
 const chips:[Filter,string][]=[['all','الكل'],['pending','بانتظار استلامي'],['with','معي الآن'],['back','أعدتها']];
 return <section className="panel paper-page"><div className="panel-head"><div><h2>ملفاتي الورقية</h2><p className="panel-note">كل ملف ورقي سلّمه لك الأرشيف. اضغط «استلمت» عند تسلّم الأوراق، و«أرجعت الملف» عند إعادتها؛ يؤكد الأرشيف عودتها.</p></div></div>
  {error&&<p className="notice" role="alert">{error}</p>}
  {files===null&&!error?<p role="status">جارٍ التحميل…</p>:<>
  <div className="status-chips" role="group" aria-label="حالة الملف">{chips.map(([id,label])=><button key={id} type="button" className={'chip'+(filter===id?' on':'')+(id==='pending'&&counts.pending?' warn':'')} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label} <b>{counts[id]}</b></button>)}</div>
  <div className="work-desk-filters"><Field label="بحث" value={search} onChange={setSearch} placeholder="رقم الأرشيف، الكود، الموكل، الخصم أو الغرض"/></div>
  {!list.length?<Empty title={files?.length?'لا توجد ملفات بهذا التصنيف':'لم يصلك ملف ورقي بعد'} text={files?.length?'جرّب تصنيفاً آخر أو امسح البحث.':'تظهر هنا الملفات التي يرسلها لك الأرشيف، ويمكنك طلب ملف القضية من نافذة القضية.'}/>
  :<div className="table-wrap"><table className="office-table paper-table"><thead><tr><th>رقم الأرشيف</th><th>الملف والقضية</th><th>أُرسل</th><th>الحالة</th><th><span className="sr-only">الإجراء</span></th></tr></thead><tbody>
   {list.map(f=>{const s=stateOf(f),late=s!=='back'&&!!f.dueDate&&f.dueDate<today;return <tr key={f.movementId} className={late?'late':''}>
    <td className="nowrap"><b dir="ltr">{f.number}</b>{f.volume&&<small>مجلد {f.volume}</small>}</td>
    <td><b>{f.title}</b><small>{caseLine(f)}</small>{f.purpose&&<small>الغرض: {f.purpose}</small>}</td>
    <td className="nowrap">{formatDate(f.date)}<small>من {f.sentBy}</small></td>
    <td>{s==='pending'?<span className="tag amber">بانتظار استلامك</span>:s==='with'?(f.returnClaimedAt?<span className="tag amber">أبلغت بإرجاعه · بانتظار تأكيد الأرشيف</span>:<span className="tag green">معك</span>)
      :f.next?.type==='return'?<span className="tag">أُعيد للأرشيف {formatDate(f.next.date)}</span>:<span className="tag">انتقل{f.next?.holder?' إلى '+f.next.holder:''}{f.next?' '+formatDate(f.next.date):''}</span>}
     {f.receivedAt&&<small>استلمته {officeTime(f.receivedAt)}</small>}{s!=='back'&&f.dueDate&&<small className={late?'late-note':''}>{late?`متأخر ${daysBetween(f.dueDate,today)} يوم عن موعد الإعادة`:'الإعادة '+formatDate(f.dueDate)}</small>}</td>
    <td className="nowrap">{s==='pending'&&<button type="button" className="btn primary" disabled={!!busy} onClick={()=>void act(f.movementId,()=>desk('desk_receive',{movementId:f.movementId}),'أكدت استلام '+f.number)}><CheckCircle2 size={15}/> استلمت</button>}
     {s==='with'&&!f.returnClaimedAt&&<button type="button" className="btn" disabled={!!busy} onClick={()=>void act(f.movementId,()=>desk('desk_return',{movementId:f.movementId}),'أبلغت الأرشيف بإرجاع '+f.number)}><Undo2 size={15}/> أرجعت الملف</button>}</td></tr>})}</tbody></table></div>}
  {openRequests.length>0&&<><h3 className="archive-subhead"><FolderOpen size={16} aria-hidden/> طلباتي المفتوحة ({openRequests.length})</h3><div className="table-wrap"><table className="office-table"><thead><tr><th>رقم الأرشيف</th><th>الملف والقضية</th><th>مطلوب بتاريخ</th><th>الحالة</th><th><span className="sr-only">إلغاء</span></th></tr></thead><tbody>
   {openRequests.map(r=><tr key={r.id}><td className="nowrap"><b dir="ltr">{r.number}</b></td><td><b>{r.title}</b><small>{[r.caseCode&&'كود '+r.caseCode,r.purpose].filter(Boolean).join(' · ')}</small></td><td className="nowrap">{r.neededBy?formatDate(r.neededBy):'—'}</td>
    <td><span className={'tag '+(r.status==='ready'?'green':'amber')}>{REQUEST_STATUSES[r.status]}</span></td>
    <td>{r.status==='pending'&&<button type="button" className="icon-btn" aria-label={'إلغاء طلب '+r.number} title="إلغاء الطلب" disabled={!!busy} onClick={()=>void act(r.id,()=>desk('desk_cancel',{id:r.id}),'أُلغي طلب '+r.number)}><X size={15}/></button>}</td></tr>)}</tbody></table></div></>}
  </>}
 </section>;
}
