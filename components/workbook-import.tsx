'use client';
import {useEffect,useState} from 'react';
import {Check,LoaderCircle,FileSpreadsheet} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import {localRequest} from '@/lib/local-auth';
import {formatDate,type CaseRecord} from '@/lib/domain';

type Row=CaseRecord&{_row?:number;_issues?:string[]};
type NewRow={row:number;code:string;autoNumber:string;date:string;client:string;opponent:string;type:string};
type Summary={added:number;updated:number;filled:number;flagged:number;conflicts:number;unchanged:number;ambiguous:number;closedLevel:number;newRows:NewRow[];ambiguousRows:{row:number;autoNumber:string;date:string;ids:string[]}[]};
const EMPTY:Summary={added:0,updated:0,filled:0,flagged:0,conflicts:0,unchanged:0,ambiguous:0,closedLevel:0,newRows:[],ambiguousRows:[]};
const BATCH=400;

/** Runs the workbook through the server in batches; a dry run first shows what would change, then the same rows are applied. */
async function run(rows:Row[],file:string,dryRun:boolean,onProgress:(done:number)=>void):Promise<Summary> {
 const total:Summary={...EMPTY,newRows:[],ambiguousRows:[]};
 for(let i=0;i<rows.length;i+=BATCH){
  const s=await localRequest<Summary>('import_workbook',{file,dryRun,cases:rows.slice(i,i+BATCH)});
  for(const k of ['added','updated','filled','flagged','conflicts','unchanged','ambiguous','closedLevel'] as const)total[k]+=s[k];
  total.newRows.push(...s.newRows);total.ambiguousRows.push(...s.ambiguousRows);onProgress(Math.min(rows.length,i+BATCH));
 }
 return total;
}

/**
 * «استيراد القضايا من Excel» for a newer office workbook: new judgments are added, empty fields are filled, and differing values
 * are listed in each judgment's review box without replacing the website's. Nothing is written before confirmation.
 */
export default function WorkbookImport({rows,file,onClose,onDone}:{rows:Row[];file:string;onClose:()=>void;onDone:()=>void}) {
 const [preview,setPreview]=useState<Summary|null>(null),[busy,setBusy]=useState(true),[progress,setProgress]=useState(0),[error,setError]=useState('');
 const issues=rows.filter(r=>r._issues?.length);
 useEffect(()=>{let active=true;run(rows,file,true,n=>active&&setProgress(n)).then(s=>{if(active)setPreview(s)}).catch(e=>{if(active)setError((e as Error).message)}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[rows,file]);
 async function apply(){setBusy(true);setError('');setProgress(0);try{const s=await run(rows,file,false,setProgress);toast.success(`أُضيف ${s.added} حكم، واستُكمل ${s.filled} حقل في ${s.updated} قضية، وأُدرجت ${s.conflicts} قيمة مختلفة للمراجعة.`);onDone()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const p=preview;
 return <Dialog open onOpenChange={v=>{if(!v&&!busy)onClose()}}><DialogContent dir="rtl" className="office-dialog workbook-import">
  <DialogHeader><DialogTitle><FileSpreadsheet size={20} aria-hidden/> استيراد ملف الأحكام</DialogTitle><DialogDescription>{file} · {rows.length} صف من جدول الأحكام. تُضاف الأحكام الجديدة وتُستكمل الحقول الفارغة فقط؛ القيم المختلفة لا تُستبدل بل تُدرج في «معلومات من Excel» داخل القضية لمراجعتها.</DialogDescription></DialogHeader>
  {busy&&!p&&<p role="status"><LoaderCircle className="spin" size={16}/> جارٍ فحص الملف ومطابقته مع الموقع… {progress}/{rows.length}</p>}
  {error&&<p className="notice" role="alert">{error}</p>}
  {p&&<>
   <div className="import-summary" role="status">
    <div><b>{p.added}</b><span>حكم جديد يُضاف</span></div>
    <div><b>{p.filled}</b><span>حقل فارغ يُستكمل</span></div>
    <div><b>{p.updated}</b><span>قضية تُحدَّث (استكمال أو مراجعة)</span></div>
    <div><b>{p.conflicts}</b><span>قيمة مختلفة للمراجعة في {p.flagged} قضية</span></div>
    <div><b>{p.unchanged}</b><span>قضية مطابقة دون تغيير</span></div>
    {p.ambiguous>0&&<div className="warn"><b>{p.ambiguous}</b><span>صف يطابق أكثر من حكم (لن يُستورد)</span></div>}
    {issues.length>0&&<div className="warn"><b>{issues.length}</b><span>صف فيه تاريخ غير صالح</span></div>}
   </div>
   {p.newRows.length>0&&<details open><summary>الأحكام الجديدة ({p.added})</summary><div className="table-wrap import-list"><table className="office-table"><thead><tr><th>الصف</th><th>الكود</th><th>الرقم الآلي</th><th>الموكل / الخصم</th><th>تاريخ الحكم</th><th>النوع</th></tr></thead><tbody>{p.newRows.map((r,i)=><tr key={i}><td>{r.row}</td><td>{r.code}</td><td className="mono">{r.autoNumber||'—'}</td><td>{r.client}<small>{r.opponent}</small></td><td className="nowrap">{formatDate(r.date)}</td><td>{r.type}</td></tr>)}</tbody></table></div></details>}
   {issues.length>0&&<details open><summary>تواريخ غير صالحة في الملف (تُسجل للمراجعة ولا تُحفظ)</summary><ul className="import-issues">{issues.map(r=><li key={r._row}>صف {r._row} · {r.code||r.autoNumber}: {r._issues!.join('، ')}</li>)}</ul></details>}
   {p.ambiguousRows.length>0&&<details><summary>صفوف تطابق أكثر من حكم</summary><ul className="import-issues">{p.ambiguousRows.map((r,i)=><li key={i}>صف {r.row} · {r.autoNumber} · {formatDate(r.date)}: {r.ids.join('، ')}</li>)}</ul></details>}
   {busy&&<p role="status"><LoaderCircle className="spin" size={16}/> جارٍ الحفظ… {progress}/{rows.length}</p>}
   <div className="actions"><button className="btn primary" disabled={busy||!(p.added||p.updated)} onClick={()=>void apply()}><Check size={16}/> تطبيق الاستيراد</button><button className="btn" disabled={busy} onClick={onClose}>إلغاء</button></div>
  </>}
 </DialogContent></Dialog>;
}
