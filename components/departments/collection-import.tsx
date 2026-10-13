import {useState} from 'react';
import {Check,LoaderCircle,Upload} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {type CaseSummary,type CollectionRecord,newDepartmentRecord} from '@/lib/departments';
import {blankDocument,amountInWords} from '@/lib/document-fields';
import {mapCollectionSheet,type ImportedFile} from '@/lib/collections';
import {formatDate,todayISO} from '@/lib/domain';
import {EditorDialog} from './shared';

type Plan={file:ImportedFile;caseId:string}[];
const iso=(v:unknown)=>{
 if(v instanceof Date&&!isNaN(+v))return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
 const s=String(v??'').trim(),m=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
 return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):'';
};

/**
 * Imports collection files from an Excel sheet. Files already here (same file number) are skipped; a file whose court
 * number matches one case is linked to it; totals paid and spent become opening entries marked as carried over.
 */
export default function CollectionImport({files,cases,onDone}:{files:CollectionRecord[];cases:CaseSummary[];onDone:()=>void}) {
 const [plan,setPlan]=useState<Plan|null>(null),[name,setName]=useState(''),[skipped,setSkipped]=useState(0),[busy,setBusy]=useState(false),[done,setDone]=useState(0),[errors,setErrors]=useState<string[]>([]);
 async function read(f:File){
  try{
   const xlsx=await import('xlsx');const X=xlsx.default||xlsx;const w=X.read(await f.arrayBuffer(),{type:'array',cellDates:true});
   const rows=X.utils.sheet_to_json<unknown[]>(w.Sheets[w.SheetNames.includes('Files')?'Files':w.SheetNames[0]],{header:1,defval:''});
   const all=mapCollectionSheet(rows[0]||[],rows.slice(1),iso);if(!all.length)throw new Error('لا توجد ملفات في الملف.');
   const have=new Set(files.map(r=>String(r.payload.code||'').toLowerCase()));
   const fresh=all.filter(x=>!have.has(x.payload.code.toLowerCase()));
   const byAuto=(a:string)=>{const m=cases.filter(c=>c.autoNumber===a);return m.length===1?m[0].id:''};
   setSkipped(all.length-fresh.length);setPlan(fresh.map(file=>({file,caseId:file.autoNumber?byAuto(file.autoNumber):''})));setName(f.name);setErrors([]);setDone(0);
  }catch(e){toast.error((e as Error).message)}
 }
 async function apply(){
  if(!plan)return;setBusy(true);const failed:string[]=[];let n=0;
  const one=async({file,caseId}:Plan[number])=>{
   try{
    const rec=await departmentRequest<CollectionRecord>('save_record',{workspace:'collections',record:{...newDepartmentRecord('collections','file',{...blankDocument(),...file.payload,amountWords:file.payload.amount?amountInWords(file.payload.amount):'',evidence:[]}),caseId}});
    const date=file.payload.arrivalDate||todayISO();
    for(const [type,amount,label] of [['payment',file.paid,'إجمالي المدفوعات المنقول'],['expense',file.expenses,'إجمالي المصروفات المنقول']] as const)
     if(amount)await departmentRequest('save_record',{workspace:'collections',record:{...newDepartmentRecord('collections','payment',{type,date,amount,method:'',reference:'استيراد '+file.payload.code,notes:label}),caseId,subjectId:rec.id}});
   }catch(e){failed.push(`صف ${file.row} (${file.payload.code}): ${(e as Error).message}`)}
   setDone(++n);
  };
  // A few at a time keeps the page responsive without flooding the server.
  for(let i=0;i<plan.length;i+=4)await Promise.all(plan.slice(i,i+4).map(one));
  setBusy(false);setErrors(failed);
  if(plan.length-failed.length)toast.success(`استُورد ${plan.length-failed.length} ملف.`);
  if(!failed.length){setPlan(null);onDone()}
 }
 const linked=plan?.filter(p=>p.caseId).length||0,withMoney=plan?.filter(p=>p.file.paid||p.file.expenses).length||0;
 return <>
  <label className="btn"><Upload size={16}/> استيراد Excel<input type="file" accept=".xlsx,.xls" className="upload-input" aria-label="ملف Excel للتحصيل" onChange={e=>{const f=e.target.files?.[0];if(f)void read(f);e.target.value=''}}/></label>
  {plan&&<EditorDialog title="استيراد ملفات من Excel" description={`${name} · تُضاف الملفات الجديدة فقط؛ الملفات الموجودة بالرقم نفسه لا تتغير.`} busy={busy} onClose={()=>{setPlan(null);if(done)onDone()}}>
   <div className="import-summary" role="status">
    <div><b>{plan.length}</b><span>ملف جديد</span></div><div><b>{skipped}</b><span>موجود مسبقاً (يُتجاوز)</span></div>
    <div><b>{linked}</b><span>يُربط بقضية تلقائياً</span></div><div><b>{withMoney}</b><span>ملف له مدفوعات أو مصروفات منقولة</span></div>
   </div>
   <p className="subtitle">«سبب المديونية» يُحفظ كرقم العميل لدى الموكل، و«الرقم الآلى - ملف» كما ورد. الملفات غير المرتبطة تُربط بقضيتها لاحقاً من الملف أو من القضية.</p>
   <div className="table-wrap import-list"><table className="office-table"><thead><tr><th>رقم الملف</th><th>الموكل</th><th>الخصم</th><th>الحالة</th><th>المطالبة</th><th>الورود</th><th>القضية</th></tr></thead><tbody>{plan.slice(0,200).map(({file:f,caseId})=><tr key={f.payload.code}><td>{f.payload.code}</td><td>{f.payload.company}</td><td>{f.payload.defendant}<small>{f.payload.civilId}</small></td><td>{f.payload.fileStatus||'—'}</td><td>{f.payload.amount||'—'}</td><td className="nowrap">{f.payload.arrivalDate?formatDate(f.payload.arrivalDate):'—'}</td><td>{caseId?cases.find(c=>c.id===caseId)?.code||'مرتبطة':'—'}</td></tr>)}</tbody></table>{plan.length>200&&<p className="subtitle">و{plan.length-200} ملف آخر.</p>}</div>
   {errors.length>0&&<div className="notice" role="alert"><b>لم تُستورد {errors.length} ملفات:</b><ul className="import-issues">{errors.map(e=><li key={e}>{e}</li>)}</ul></div>}
   {busy&&<p role="status"><LoaderCircle className="spin" size={16}/> جارٍ الاستيراد… {done}/{plan.length}</p>}
   <div className="actions"><button className="btn primary" disabled={busy||!plan.length||!!errors.length} onClick={()=>void apply()}><Check size={16}/> استيراد {plan.length} ملف</button><button className="btn" disabled={busy} onClick={()=>{setPlan(null);if(done)onDone()}}>إغلاق</button></div>
  </EditorDialog>}
 </>;
}
