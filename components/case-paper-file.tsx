'use client';
import {useCallback,useEffect,useState} from 'react';
import {Archive,CheckCircle2,Inbox,Undo2,X} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {PAPER_FILES_EVENT,PURPOSES,REQUEST_STATUSES,type CasePaperFile} from '@/lib/archive';
import {formatDate} from '@/lib/domain';
import {DateField,PickOrType} from './shared';

const desk=<T,>(action:string,data:Record<string,unknown>={})=>departmentRequest<T>(action,{...data,workspace:'archive'});

/**
 * The case's paper file in the archive: where it is and with whom, and a request for it that the archive sees in its
 * requests. Files sent to you are confirmed here too. Nothing shows while the case has no paper file.
 */
export default function CasePaperFileStrip({caseId}:{caseId:string}){
 const [files,setFiles]=useState<CasePaperFile[]|null>(null),[asking,setAsking]=useState(''),[busy,setBusy]=useState(false);
 const [neededBy,setNeededBy]=useState(''),[purpose,setPurpose]=useState('');
 const load=useCallback(()=>desk<CasePaperFile[]>('desk_case',{caseId}).then(setFiles).catch(()=>setFiles([])),[caseId]);
 useEffect(()=>{void load();addEventListener(PAPER_FILES_EVENT,load);return()=>removeEventListener(PAPER_FILES_EVENT,load)},[load]);
 async function act(run:()=>Promise<unknown>,done:string){setBusy(true);try{await run();toast.success(done);setAsking('');await load();dispatchEvent(new Event(PAPER_FILES_EVENT))}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 if(!files?.length)return null;
 return <section className="case-paper" aria-label="الملف الورقي">{files.map(f=>{
  const where=f.state==='in'?'في الأرشيف':f.mine?(f.receipt==='pending'?'أُرسل إليك':'معك'):f.state==='staff'?'مع '+(f.holder||'موظف'):f.state==='court'?'لدى '+(f.holder||'جهة خارجية'):'سُلّم للموكل';
  return <div key={f.fileId} className="case-paper-row">
   <p className="case-paper-line"><Archive size={15} aria-hidden/><span>الملف الورقي <b dir="ltr">{f.number}</b>{f.volume?' · مجلد '+f.volume:''}: <b>{where}</b>{f.state!=='in'&&f.dueDate?' · الإعادة '+formatDate(f.dueDate):''}</span>
    {f.mine&&f.receipt==='pending'&&f.movementId&&<button type="button" className="btn primary" disabled={busy} onClick={()=>void act(()=>desk('desk_receive',{movementId:f.movementId}),'أكدت استلام '+f.number)}><CheckCircle2 size={15}/> استلمت</button>}
    {f.mine&&f.receipt!=='pending'&&f.movementId&&(f.returnClaimedAt?<span className="tag amber">بانتظار تأكيد الأرشيف</span>
     :<button type="button" className="btn" disabled={busy} onClick={()=>void act(()=>desk('desk_return',{movementId:f.movementId}),'أبلغت الأرشيف بإرجاع '+f.number)}><Undo2 size={15}/> أرجعت الملف</button>)}
    {!f.mine&&(f.request?<><span className={'tag '+(f.request.status==='ready'?'green':'amber')}>طلبته · {REQUEST_STATUSES[f.request.status]}</span>
      {f.request.status==='pending'&&<button type="button" className="icon-btn" aria-label={'إلغاء طلب '+f.number} title="إلغاء الطلب" disabled={busy} onClick={()=>void act(()=>desk('desk_cancel',{id:f.request!.id}),'أُلغي طلبك')}><X size={15}/></button>}</>
     :asking!==f.fileId&&<button type="button" className="btn" onClick={()=>{setAsking(f.fileId);setNeededBy('');setPurpose('')}}><Inbox size={15}/> طلب الملف</button>)}</p>
   {asking===f.fileId&&<div className="case-paper-ask"><DateField label="مطلوب بتاريخ" value={neededBy} onChange={setNeededBy}/><PickOrType label="الغرض" value={purpose} onChange={setPurpose} options={PURPOSES} empty="دون تحديد"/>
    <div className="actions"><button type="button" className="btn primary" disabled={busy} onClick={()=>void act(()=>desk('desk_request',{fileId:f.fileId,neededBy,purpose}),'أُرسل طلب الملف إلى الأرشيف')}>إرسال الطلب</button><button type="button" className="btn" onClick={()=>setAsking('')}>إلغاء</button></div></div>}
  </div>})}</section>;
}
