import {useEffect,useMemo,useState} from 'react';
import {Printer,CheckSquare,Square,FileStack} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {departmentPages,type CaseSummary,type CollectionData,type CollectionRecord} from '@/lib/departments';
import {missingDocumentFields} from '@/lib/collection-documents';
import {generateWord} from '@/lib/document-tools';
import {mergeWord} from '@/lib/word-merge';
import {formatDate,todayISO} from '@/lib/domain';
import {normalizeSearch} from '@/lib/case-browse';
import {Field,DateField,Empty,saveBlob} from '../shared';
import {OfficeSelect} from '../office-shared';
import {StatusMessage} from './shared';

type Kind='claim'|'bundle';
const KINDS:Record<Kind,{label:string;plural:string}>={bundle:{label:'حافظة مستندات',plural:'Mawatheeq-bundles'},claim:{label:'صحيفة الدعوى',plural:'Mawatheeq-claims'}};
type Row={record:CollectionRecord;reviewed:boolean;missing:Record<Kind,string[]>};

/**
 * Batch printing for the secretary: choose any number of reviewed collection files and get one Word file
 * per paper type, ready to print in one go. Each paper is generated on the server from the reviewed data
 * (revision-checked and kept as an immutable snapshot), exactly as when generated one at a time.
 */
export default function BatchPrint({canExport}:{canExport:boolean}){
 const [records,setRecords]=useState<CollectionRecord[]|null>(null),[cases,setCases]=useState<CaseSummary[]>([]),[error,setError]=useState(''),[version,setVersion]=useState(0);
 const [kinds,setKinds]=useState<'bundle'|'claim'|'both'>('bundle'),[search,setSearch]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[show,setShow]=useState<'ready'|'all'>('ready');
 const [selected,setSelected]=useState<Set<string>>(new Set()),[progress,setProgress]=useState<{done:number;total:number}|null>(null),[skipped,setSkipped]=useState<{name:string;reason:string}[]>([]);
 useEffect(()=>{let active=true;Promise.all([departmentPages<CollectionRecord>('collections','records_page'),departmentPages<CaseSummary>('collections','cases_page')]).then(([r,c])=>{if(active){setRecords(r.filter(x=>x.kind==='file'));setCases(c);setError('')}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[version]);
 const wanted:Kind[]=kinds==='both'?['bundle','claim']:[kinds];
 const rows=useMemo<Row[]>(()=>(records||[]).filter(r=>!r.archived).map(r=>{const c=cases.find(x=>x.id===r.caseId);return {record:r,reviewed:!!r.review&&r.review.recordRevision===r.revision&&r.review.caseRevision===c?.revision,missing:{claim:missingDocumentFields(r.payload,'claim'),bundle:missingDocumentFields(r.payload,'bundle')}}}),[records,cases]);
 const ready=(row:Row)=>row.reviewed&&wanted.every(k=>!row.missing[k].length);
 const visible=rows.filter(row=>(show==='all'||ready(row))&&(!from||row.record.payload.hearingDate>=from)&&(!to||row.record.payload.hearingDate<=to)&&normalizeSearch([row.record.payload.code,row.record.payload.company,row.record.payload.defendant,row.record.payload.lawsuitNumber].join(' ')).includes(normalizeSearch(search)))
  .sort((a,b)=>(a.record.payload.hearingDate||'9999').localeCompare(b.record.payload.hearingDate||'9999')||(a.record.payload.code||'').localeCompare(b.record.payload.code||''));
 const chosen=visible.filter(row=>selected.has(row.record.id)&&ready(row));
 const allChosen=visible.filter(ready).length>0&&visible.filter(ready).every(row=>selected.has(row.record.id));
 const toggle=(id:string)=>setSelected(s=>{const n=new Set(s);if(n.has(id))n.delete(id);else n.add(id);return n});
 const toggleAll=()=>setSelected(allChosen?new Set():new Set(visible.filter(ready).map(row=>row.record.id)));
 const reason=(row:Row)=>!row.reviewed?'يحتاج مراجعة المصدر':wanted.map(k=>row.missing[k].length?`${KINDS[k].label}: ينقص ${row.missing[k].slice(0,3).join('، ')}${row.missing[k].length>3?'…':''}`:'').filter(Boolean).join(' · ');

 async function run(){
  if(!chosen.length)return;
  const PizZip=(await import('pizzip')).default;
  const total=chosen.length*wanted.length;let done=0;const failed:{name:string;reason:string}[]=[];
  setSkipped([]);setProgress({done,total});
  try{
   for(const kind of wanted){
    const files:ArrayBuffer[]=[];
    for(const row of chosen){
     const name=row.record.payload.code||row.record.payload.defendant||'ملف';
     try{
      const output=await departmentRequest<{id:string;data:CollectionData;templateVersion:string}>('generate',{workspace:'collections',id:row.record.id,revision:row.record.revision,kind,outputId:crypto.randomUUID()});
      if(output.templateVersion!=='office-word-v1')throw new Error('إصدار القالب غير مدعوم.');
      files.push(await (await generateWord(kind,output.data)).arrayBuffer());
     }catch(e){failed.push({name:`${name} (${KINDS[kind].label})`,reason:(e as Error).message})}
     setProgress({done:++done,total});
    }
    if(files.length){
     const merged=mergeWord(PizZip,files);
     saveBlob(new Blob([merged as BlobPart],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),`${KINDS[kind].plural}-${todayISO()}-${files.length}.docx`);
    }
   }
   setSkipped(failed);
   const made=total-failed.length;
   if(made)toast.success(`جُهّز ${made} مستنداً للطباعة في ${wanted.length===2?'ملفين':'ملف واحد'}.`);
   if(failed.length)toast.error(`تعذر إنشاء ${failed.length} مستند. التفاصيل أسفل القائمة.`);
   setVersion(v=>v+1);
  }finally{setProgress(null)}
 }

 return <section className="panel batch-print"><div className="department-toolbar"><h2><FileStack size={20}/> طباعة مستندات التحصيل</h2></div>
  <p className="subtitle">تُدخل بيانات أمر الأداء مرة واحدة في ملف التحصيل، ومنها تُنشأ صحيفة الدعوى وحافظة المستندات. اختر الملفات الجاهزة ونوع المستند، فتحصل على ملف Word واحد يضم الجميع لطباعته مرة واحدة. كل مستند يُنشأ من بيانات الملف المراجَعة ويُحفظ في سجل الإنشاء.</p>
  <div className="batch-kinds" role="group" aria-label="نوع المستند">{([['bundle','حافظة مستندات'],['claim','صحيفة الدعوى'],['both','الاثنان معاً']] as const).map(([k,label])=><button key={k} className={'btn '+(kinds===k?'primary':'')} aria-pressed={kinds===k} onClick={()=>setKinds(k)}>{label}</button>)}</div>
  <div className="department-filters"><Field label="بحث في ملفات الطباعة" value={search} onChange={setSearch}/><DateField label="جلسة من" value={from} onChange={setFrom}/><DateField label="جلسة إلى" value={to} onChange={setTo}/><OfficeSelect label="عرض" value={show} onChange={v=>setShow(v as 'ready'|'all')} options={[['ready','الجاهزة للطباعة فقط'],['all','كل الملفات النشطة']]}/></div>
  <StatusMessage loading={!records&&!error} error={error}/>
  {records&&<>
   <div className="batch-bar"><button className="btn" onClick={toggleAll} disabled={!visible.some(ready)}>{allChosen?<CheckSquare size={16}/>:<Square size={16}/>} {allChosen?'إلغاء تحديد الكل':'تحديد كل الجاهز'}</button><span className="subtitle">محدد {chosen.length} من {visible.filter(ready).length} جاهز</span>
    {canExport?<button className="btn primary" disabled={!chosen.length||!!progress} onClick={()=>void run()}><Printer size={16}/> {progress?`جارٍ الإنشاء ${progress.done} من ${progress.total}…`:`إنشاء ملف الطباعة (${chosen.length})`}</button>:<span className="notice">يحتاج الإنشاء إلى صلاحية التصدير.</span>}</div>
   {progress&&<div className="batch-progress" aria-hidden><i style={{width:`${Math.round(progress.done/Math.max(1,progress.total)*100)}%`}}/></div>}
   <div className="table-wrap"><table className="office-table batch-table"><thead><tr><th aria-label="تحديد"/><th>الكود</th><th>الشركة / المدعى عليه</th><th>الجلسة</th><th>الحالة</th></tr></thead>
    <tbody>{visible.map(row=>{const ok=ready(row),p=row.record.payload;return <tr key={row.record.id} className={ok?'':'ledger-void'}><td><input type="checkbox" aria-label={'تحديد '+(p.code||p.defendant)} disabled={!ok} checked={ok&&selected.has(row.record.id)} onChange={()=>toggle(row.record.id)}/></td><td>{p.code||'—'}</td><td>{p.company}<small>{p.defendant}</small></td><td>{p.hearingDate?formatDate(p.hearingDate):'—'}<small>{[p.hearingCourt,p.hearingCircuit].filter(Boolean).join(' · ')}</small></td><td>{ok?<span className="tag green">جاهز</span>:<span className="tag amber">{reason(row)}</span>}</td></tr>})}</tbody></table></div>
   {!visible.length&&<Empty title="لا توجد ملفات" text={show==='ready'?'لا توجد ملفات جاهزة بهذه التصفية. الملف الجاهز راجعه المحامي وحقوله مكتملة.':'لا توجد ملفات تحصيل نشطة.'}/>}
   {skipped.length>0&&<div className="notice" role="alert"><b>لم تُنشأ هذه المستندات:</b><ul>{skipped.map(s=><li key={s.name}>{s.name}: {s.reason}</li>)}</ul></div>}
  </>}
 </section>;
}
