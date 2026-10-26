import {useState} from 'react';
import {CheckCircle2,AlertTriangle,XCircle} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {PAPER_FILES_EVENT,contentItems,daysSince,type ArchiveFile,type ArchiveMovement,type Custody} from '@/lib/archive';
import {formatDate} from '@/lib/domain';
import {officeTime} from '../office-shared';
import {Field} from '../shared';
import {EditorDialog} from './shared';

/**
 * The return check at the desk: the file comes back from its holder and the archive ticks off what it was sent with.
 * «عاد كاملاً» closes the hand-out; «عاد ناقصاً» records what is missing against the holder. A reported return that
 * never arrived is rejected with a reason, and the file stays with the holder.
 */
export default function ReturnCheck({file,custody,onClose,onDone}:{file:ArchiveFile;custody:Custody;onClose:()=>void;onDone:(m?:ArchiveMovement)=>void}){
 const out=custody.last?.payload;
 const items=contentItems(out?.contents??file.payload.contents),expected=out?.pages||file.payload.pages;
 const [present,setPresent]=useState<Set<string>>(()=>new Set(items)),[extra,setExtra]=useState(''),[pages,setPages]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [rejecting,setRejecting]=useState(false),[reason,setReason]=useState('');
 const absent=items.filter(i=>!present.has(i)),missing=[...absent,...(extra.trim()?[extra.trim()]:[])].join('، '),short=!!missing||(!!pages&&!!expected&&Number(pages)<Number(expected));
 const claimed=out?.type==='checkout'?out.returnClaimedAt||'':'',late=claimed?daysSince(claimed):0;
 async function run(fn:()=>Promise<ArchiveMovement>,done:string){setBusy(true);setError('');try{const m=await fn();toast.success(done);dispatchEvent(new Event(PAPER_FILES_EVENT));onDone(m)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const confirm=(check:'complete'|'missing')=>run(()=>departmentRequest<ArchiveMovement>('approve_return',{workspace:'archive',fileId:file.id,check,missing:check==='missing'?(missing||`عدد الأوراق ${pages} من ${expected}`):'',pages}),
  check==='complete'?'عاد الملف كاملاً إلى الأرشيف':'عاد الملف ناقصاً؛ سُجّلت النواقص على '+(custody.holder||'آخر مستلم'));
 return <EditorDialog title={'استلام الملف '+file.payload.number+(custody.holder?' من '+custody.holder:'')} description="طابق الأوراق مع ما خرج به الملف قبل تأكيد عودته." busy={false} onClose={onClose}>
  <div className="return-check">
   <p className="return-who">{custody.holder?<>مع <b>{custody.holder}</b> منذ {formatDate(custody.since)}</>:'خارج الأرشيف'}{claimed&&<> · أبلغ بإرجاعه {officeTime(claimed)}{late>=2&&<span className="tag red">منذ {late} يوم</span>}</>}</p>
   {out?.receivedMissing&&<p className="notice">عند استلامه أفاد بنقص: {out.receivedMissing}</p>}
   {items.length>0?<fieldset className="return-items"><legend>ما خرج به الملف</legend>{items.map(i=><label key={i} className={'checkbox-line'+(present.has(i)?'':' off')}><input type="checkbox" checked={present.has(i)} onChange={e=>setPresent(s=>{const n=new Set(s);if(e.target.checked)n.add(i);else n.delete(i);return n})}/> {i}</label>)}</fieldset>
    :<p className="subtitle">لم تُسجَّل للملف قائمة محتويات؛ أضفها في «بيانات الملف» ليُطابَق عليها في المرات القادمة.</p>}
   <div className="form-grid"><Field label={expected?`عدد الأوراق عند العودة (خرج بـ ${expected})`:'عدد الأوراق عند العودة'} value={pages} onChange={v=>setPages(v.replace(/\D/g,''))}/><Field label="ناقص غير ما سبق" value={extra} onChange={setExtra} placeholder="مثل: صورة الحكم"/></div>
   {short&&<p className="notice return-short"><AlertTriangle size={15} aria-hidden/> سيُسجَّل الملف «عاد ناقصاً»{missing?': '+missing:''}، وتبقى النواقص على {custody.holder||'آخر مستلم'} حتى تُسوّى.</p>}
   {error&&<p className="notice" role="alert">{error}</p>}
   {rejecting?<div className="return-reject"><Field label="سبب رفض الإرجاع" value={reason} onChange={setReason} placeholder="مثل: لم يُسلَّم الملف في الأرشيف"/>
     <div className="actions"><button type="button" className="btn primary" disabled={busy||!reason.trim()} onClick={()=>void run(()=>departmentRequest<ArchiveMovement>('reject_return',{workspace:'archive',fileId:file.id,reason}),'رُفض الإرجاع؛ يبقى الملف مع '+custody.holder)}>تأكيد الرفض</button><button type="button" className="btn" onClick={()=>setRejecting(false)}>رجوع</button></div></div>
   :<div className="actions">{!short&&<button type="button" className="btn primary" disabled={busy} onClick={()=>void confirm('complete')}><CheckCircle2 size={16}/> عاد كاملاً</button>}
     {short&&<button type="button" className="btn primary" disabled={busy} onClick={()=>void confirm('missing')}><AlertTriangle size={16}/> عاد ناقصاً</button>}
     {claimed&&<button type="button" className="btn" disabled={busy} onClick={()=>setRejecting(true)}><XCircle size={16}/> لم يصل الملف</button>}
     <button type="button" className="btn" onClick={onClose}>إلغاء</button></div>}
  </div>
 </EditorDialog>;
}
