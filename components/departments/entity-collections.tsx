import {useEffect,useState} from 'react';
import {departmentRequest} from '@/lib/local-auth';
import type {CollectionRecord} from '@/lib/departments';
import {kwd,fils} from '@/lib/collections';

/**
 * The collection files linked to a client profile, shown in the client window to staff who hold the collections
 * section. The server returns only files within the viewer's case scope.
 */
export default function EntityCollections({entityId}:{entityId:string}) {
 const [files,setFiles]=useState<CollectionRecord[]|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let active=true;departmentRequest<CollectionRecord[]>('entity_files',{workspace:'collections',entityId}).then(r=>{if(active)setFiles(r)}).catch(()=>{if(active)setError(true)});return()=>{active=false}},[entityId]);
 // Before the database update (or without access) the section stays hidden.
 if(error)return null;
 if(files===null)return <p role="status">جارٍ تحميل ملفات التحصيل…</p>;
 const live=files.filter(f=>!f.archived),total=live.reduce((n,f)=>n+fils(f.payload.amount||''),0);
 const byStatus=new Map<string,number>();for(const f of live)byStatus.set(f.payload.fileStatus||'بلا حالة',(byStatus.get(f.payload.fileStatus||'بلا حالة')||0)+1);
 return <div className="entity-collections">
  <div className="client-section-heading"><h3>ملفات التحصيل ({live.length})</h3></div>
  {!live.length?<p className="subtitle">لا توجد ملفات تحصيل مربوطة بهذا الموكل. اربطها من ملف التحصيل («ملف الموكل») أو بالتحديد الجماعي في التحصيل.</p>:<>
   <p className="subtitle">إجمالي المطالبات {kwd(total)} د.ك · {[...byStatus].map(([s,n])=>`${s} ${n}`).join(' · ')}</p>
   <ul className="linked-files">{live.slice(0,30).map(f=><li key={f.id}><b>ملف {f.payload.code||'بلا رقم'}</b><span>{f.payload.defendant}</span><small>{[f.payload.fileStatus,f.payload.amount&&kwd(fils(f.payload.amount))+' د.ك',f.payload.assignedTo&&'المسؤول '+f.payload.assignedTo,f.caseId?'مرتبط بقضية':'بلا قضية'].filter(Boolean).join(' · ')}</small></li>)}</ul>
   {live.length>30&&<p className="subtitle">و{live.length-30} ملف آخر في مساحة التحصيل.</p>}
  </>}
 </div>;
}
