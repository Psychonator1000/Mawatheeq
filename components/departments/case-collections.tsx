import {useEffect,useState} from 'react';
import {Link2,Search} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import type {CollectionRecord} from '@/lib/departments';
import {kwd,fils} from '@/lib/collections';

/**
 * The collection files a case grew out of, shown in the case window to staff who hold the collections section.
 * A file can be attached here when a lawsuit is entered after its collection file; detaching is done from the file.
 */
export default function CaseCollections({caseId,canEdit,caseLabel=()=>''}:{caseId:string;canEdit:boolean;caseLabel?:(id:string)=>string}) {
 const [files,setFiles]=useState<CollectionRecord[]|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0);
 const [q,setQ]=useState(''),[found,setFound]=useState<CollectionRecord[]>([]),[busy,setBusy]=useState(false),[open,setOpen]=useState(false);
 useEffect(()=>{let active=true;departmentRequest<CollectionRecord[]>('case_files',{workspace:'collections',caseId}).then(r=>{if(active)setFiles(r)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[caseId,version]);
 useEffect(()=>{if(!open||q.trim().length<2)return;let active=true;const t=setTimeout(()=>{departmentRequest<CollectionRecord[]>('find_files',{workspace:'collections',q}).then(r=>{if(active)setFound(r)}).catch(()=>{if(active)setFound([])})},250);return()=>{active=false;clearTimeout(t)}},[q,open]);
 async function link(f:CollectionRecord){
  if(f.caseId&&f.caseId!==caseId&&!window.confirm(`الملف ${f.payload.code} مرتبط بالقضية ${caseLabel(f.caseId)||'أخرى'}. نقله إلى هذه القضية؟`))return;
  setBusy(true);try{await departmentRequest('link_case',{workspace:'collections',id:f.id,revision:f.revision,caseId});toast.success('رُبط ملف التحصيل بالقضية');setOpen(false);setQ('');setFound([]);setVersion(v=>v+1)}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 if(error)return <p className="subtitle">{error}</p>;
 return <div className="case-collections wide">
  {files===null?<p role="status">جارٍ تحميل ملفات التحصيل…</p>:files.length?<ul className="linked-files">{files.map(f=><li key={f.id}><b>ملف {f.payload.code||'بلا رقم'}</b><span>{f.payload.company} ضد {f.payload.defendant}</span><small>{[f.payload.fileStatus,f.payload.amount&&kwd(fils(f.payload.amount))+' د.ك',f.payload.customerId&&'رقم العميل '+f.payload.customerId,f.archived&&'مؤرشف'].filter(Boolean).join(' · ')}</small></li>)}</ul>:<p className="subtitle">لا يوجد ملف تحصيل مرتبط بهذه القضية.</p>}
  {canEdit&&!open&&<button type="button" className="btn" onClick={()=>setOpen(true)}><Link2 size={15}/> ربط ملف تحصيل</button>}
  {open&&<div className="link-search"><label className="field"><span><Search size={14}/> ابحث برقم الملف أو اسم الخصم أو الرقم المدني أو رقم العميل</span><input value={q} onChange={e=>setQ(e.target.value)} autoFocus/></label>
   <ul className="linked-files">{found.filter(f=>f.caseId!==caseId).map(f=><li key={f.id}><b>ملف {f.payload.code}</b><span>{f.payload.company} ضد {f.payload.defendant}</span><small className={f.caseId?'linked-elsewhere':''}>{f.caseId?'مرتبط بالقضية '+(caseLabel(f.caseId)||'أخرى (لا تملك صلاحية عرضها)'):'غير مرتبط بقضية'}{f.payload.civilId&&' · '+f.payload.civilId}</small><button type="button" className="btn" disabled={busy} onClick={()=>void link(f)}>ربط بهذه القضية</button></li>)}{q.trim().length>=2&&!found.length&&<li className="muted">لا توجد نتائج.</li>}</ul>
   <button type="button" className="btn" onClick={()=>{setOpen(false);setQ('');setFound([])}}>إلغاء</button></div>}
 </div>;
}
