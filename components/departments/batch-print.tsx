import {useEffect,useMemo,useState} from 'react';
import {Printer,CheckSquare,Square,FileStack} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {departmentPages,departmentCases,type CaseSummary,type CollectionData,type CollectionRecord} from '@/lib/departments';
import {COLLECTION_FIELDS,missingDocumentFields} from '@/lib/collection-documents';
import {EditorDialog} from './shared';
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
export default function BatchPrint({canExport,canEdit=false}:{canExport:boolean;canEdit?:boolean}){
 const [records,setRecords]=useState<CollectionRecord[]|null>(null),[cases,setCases]=useState<CaseSummary[]>([]),[error,setError]=useState(''),[version,setVersion]=useState(0);
 const [kinds,setKinds]=useState<'bundle'|'claim'|'both'>('bundle'),[search,setSearch]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[show,setShow]=useState<'ready'|'all'>('ready');
 const [checking,setChecking]=useState<Row[]|null>(null);
 const [selected,setSelected]=useState<Set<string>>(new Set()),[progress,setProgress]=useState<{done:number;total:number}|null>(null),[skipped,setSkipped]=useState<{name:string;reason:string}[]>([]);
 useEffect(()=>{let active=true;Promise.all([departmentPages<CollectionRecord>('collections','records_page'),departmentCases('collections')]).then(([r,c])=>{if(active){setRecords(r.filter(x=>x.kind==='file'));setCases(c);setError('')}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[version]);
 const wanted:Kind[]=kinds==='both'?['bundle','claim']:[kinds];
 const rows=useMemo<Row[]>(()=>(records||[]).filter(r=>!r.archived).map(r=>{const c=cases.find(x=>x.id===r.caseId);return {record:r,reviewed:!!r.review&&r.review.recordRevision===r.revision&&(r.review.caseRevision??null)===(c?.revision??null),missing:{claim:missingDocumentFields(r.payload,'claim'),bundle:missingDocumentFields(r.payload,'bundle')}}}),[records,cases]);
 const ready=(row:Row)=>row.reviewed&&wanted.every(k=>!row.missing[k].length);
 const visible=rows.filter(row=>(show==='all'||ready(row))&&(!from||row.record.payload.hearingDate>=from)&&(!to||row.record.payload.hearingDate<=to)&&normalizeSearch([row.record.payload.code,row.record.payload.company,row.record.payload.defendant,row.record.payload.lawsuitNumber].join(' ')).includes(normalizeSearch(search)))
  .sort((a,b)=>(a.record.payload.hearingDate||'9999').localeCompare(b.record.payload.hearingDate||'9999')||(a.record.payload.code||'').localeCompare(b.record.payload.code||''));
 const chosen=visible.filter(row=>selected.has(row.record.id)&&ready(row));
 const allChosen=visible.filter(ready).length>0&&visible.filter(ready).every(row=>selected.has(row.record.id));
 const toggle=(id:string)=>setSelected(s=>{const n=new Set(s);if(n.has(id))n.delete(id);else n.add(id);return n});
 const toggleAll=()=>setSelected(allChosen?new Set():new Set(visible.filter(ready).map(row=>row.record.id)));
 // Everything still needed at once (the review and each paper's missing fields), so the file is completed in one visit.
 const reason=(row:Row)=>[!row.reviewed?'يحتاج مراجعة المصدر':'',...wanted.map(k=>row.missing[k].length?`${KINDS[k].label}: ينقص ${row.missing[k].slice(0,4).join('، ')}${row.missing[k].length>4?` و${row.missing[k].length-4} غيرها`:''}`:'')].filter(Boolean).join(' · ');

 async function run(list:Row[]=chosen){
  const chosen=list;if(!chosen.length)return;
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
    {canExport?<button className="btn primary" disabled={!chosen.length||!!progress} onClick={()=>setChecking(chosen)}><Printer size={16}/> {progress?`جارٍ الإنشاء ${progress.done} من ${progress.total}…`:`إنشاء ملف الطباعة (${chosen.length})`}</button>:<span className="notice">يحتاج الإنشاء إلى صلاحية التصدير.</span>}</div>
   {progress&&<div className="batch-progress" aria-hidden><i style={{width:`${Math.round(progress.done/Math.max(1,progress.total)*100)}%`}}/></div>}
   <div className="table-wrap"><table className="office-table batch-table"><thead><tr><th aria-label="تحديد"/><th>الكود</th><th>الشركة / المدعى عليه</th><th>الجلسة</th><th>الحالة</th></tr></thead>
    <tbody>{visible.map(row=>{const ok=ready(row),p=row.record.payload;return <tr key={row.record.id} className={ok?'':'ledger-void'}><td><input type="checkbox" aria-label={'تحديد '+(p.code||p.defendant)} disabled={!ok} checked={ok&&selected.has(row.record.id)} onChange={()=>toggle(row.record.id)}/></td><td>{p.code||'—'}</td><td>{p.company}<small>{p.defendant}</small></td><td>{p.hearingDate?formatDate(p.hearingDate):'—'}<small>{[p.hearingCourt,p.hearingCircuit].filter(Boolean).join(' · ')}</small></td><td>{ok?<span className="tag green">جاهز</span>:<span className="tag amber">{reason(row)}</span>}</td></tr>})}</tbody></table></div>
   {!visible.length&&<Empty title="لا توجد ملفات" text={show==='ready'?'لا توجد ملفات جاهزة بهذه التصفية. الملف الجاهز راجعه المحامي وحقوله مكتملة.':'لا توجد ملفات تحصيل نشطة.'}/>}
   {skipped.length>0&&<div className="notice" role="alert"><b>لم تُنشأ هذه المستندات:</b><ul>{skipped.map(s=><li key={s.name}>{s.name}: {s.reason}</li>)}</ul></div>}
  </>}
 {checking&&<PrintCheck rows={checking} kinds={wanted} cases={cases} canEdit={canEdit} onClose={()=>setChecking(null)} onPrint={rows=>{setChecking(null);void run(rows)}} onSaved={()=>setVersion(v=>v+1)}/>}</section>;
}

/**
 * A last look before the papers are made: each chosen file opens to show what will print (the papers' fields and the
 * bundle's documents) and can be corrected here. A correction is saved to the file and the file is reviewed again by
 * the person printing, who confirms they checked it against the source, so what prints is always a reviewed file.
 */
function PrintCheck({rows,kinds,cases,canEdit,onClose,onPrint,onSaved}:{rows:Row[];kinds:Kind[];cases:CaseSummary[];canEdit:boolean;onClose:()=>void;onPrint:(rows:Row[])=>void;onSaved:()=>void}){
 const [drafts,setDrafts]=useState<Record<string,CollectionData>>(()=>Object.fromEntries(rows.map(r=>[r.record.id,r.record.payload]))),[open,setOpen]=useState<string>(rows.length===1?rows[0].record.id:''),[attested,setAttested]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const changed=rows.filter(r=>JSON.stringify(drafts[r.record.id])!==JSON.stringify(r.record.payload));
 const set=(id:string,key:string,value:unknown)=>setDrafts(d=>({...d,[id]:{...d[id],[key]:value}}));
 const bundle=kinds.includes('bundle');
 async function go(){
  setBusy(true);setError('');
  try{
   const out:Row[]=[];
   for(const r of rows){
    if(!changed.includes(r)){out.push(r);continue}
    const c=cases.find(x=>x.id===r.record.caseId);
    const saved=await departmentRequest<CollectionRecord>('save_record',{workspace:'collections',record:{...r.record,payload:drafts[r.record.id]}});
    const reviewed=await departmentRequest<CollectionRecord>('review_file',{workspace:'collections',id:saved.id,revision:saved.revision,caseRevision:c?.revision??null,attested:true});
    out.push({...r,record:reviewed,reviewed:true,missing:{claim:missingDocumentFields(reviewed.payload,'claim'),bundle:missingDocumentFields(reviewed.payload,'bundle')}});
   }
   if(changed.length){toast.success(`حُفظت التعديلات وروجع ${changed.length} ملف.`);onSaved()}
   onPrint(out);
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 const blocked=rows.some(r=>kinds.some(k=>missingDocumentFields(drafts[r.record.id],k).length));
 return <EditorDialog title="مراجعة قبل الطباعة" description={`${rows.length} ملف · ${kinds.map(k=>KINDS[k].label).join(' و')}. افتح أي ملف لتصحيح ما سيُطبع؛ الحقول الفارغة تُطبع نقاطاً لتُكتب باليد.`} busy={busy} onClose={onClose}>
  <div className="print-check">
   {rows.map(r=>{const id=r.record.id,d=drafts[id],isOpen=open===id,dirty=changed.includes(r),miss=kinds.flatMap(k=>missingDocumentFields(d,k));
    return <section key={id} className={'print-check-file'+(isOpen?' open':'')}>
     <button type="button" className="print-check-head" aria-expanded={isOpen} onClick={()=>setOpen(isOpen?'':id)}>
      <b>{d.code||'بلا رقم ملف'}</b><span>{d.company||'—'} <em>ضد</em> {d.defendant||'—'}</span>
      {dirty&&<span className="tag amber">معدّل</span>}{miss.length>0&&<span className="tag red">ينقص {miss.length}</span>}<span className="print-check-toggle">{isOpen?'إغلاق':'فتح وتعديل'}</span>
     </button>
     {isOpen&&<div className="print-check-body">
      {COLLECTION_FIELDS.map(([title,fields])=><fieldset key={title}><legend>{title}</legend><div className="print-check-grid">{fields.map(([key,label])=>
       <label key={key} className={'field'+(miss.includes(label)?' needs-check':'')}><span>{label}</span><input value={String((d as Record<string,unknown>)[key]??'')} readOnly={!canEdit} onChange={e=>set(id,key,e.target.value)}/></label>)}</div></fieldset>)}
      {bundle&&<fieldset><legend>مستندات الحافظة</legend><div className="print-check-evidence">{d.evidence.map((e,i)=><div key={e.id} className="evidence-row">
       <label className="checkbox-line"><input type="checkbox" checked={e.included} disabled={!canEdit} onChange={x=>set(id,'evidence',d.evidence.map((y,j)=>j===i?{...y,included:x.target.checked}:y))}/> </label>
       <input aria-label="وصف المستند" value={e.description} readOnly={!canEdit} onChange={x=>set(id,'evidence',d.evidence.map((y,j)=>j===i?{...y,description:x.target.value}:y))}/>
       <input aria-label="تاريخ المستند" type="date" value={e.date} readOnly={!canEdit} onChange={x=>set(id,'evidence',d.evidence.map((y,j)=>j===i?{...y,date:x.target.value}:y))}/>
       <input aria-label="عدد الأوراق" type="number" min={1} value={e.pages} readOnly={!canEdit} onChange={x=>set(id,'evidence',d.evidence.map((y,j)=>j===i?{...y,pages:Number(x.target.value)||1}:y))}/>
      </div>)}{!d.evidence.length&&<p className="subtitle">لا مستندات في هذا الملف بعد.</p>}</div></fieldset>}
     </div>}
    </section>})}
  </div>
  {!canEdit&&<p className="subtitle">التعديل غير متاح لحسابك؛ يمكنك المراجعة والطباعة فقط.</p>}
  {changed.length>0&&<label className="checkbox-line print-check-attest"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/> راجعتُ تعديلات {changed.length} ملف مع المصدر (تُحفظ في الملف ويُعاد اعتماد مراجعته باسمي)</label>}
  {blocked&&<p className="notice" role="alert">بعض الحقول المطلوبة فارغة (مظللة بالأحمر)؛ أكملها أو أزل الملف من التحديد.</p>}
  {error&&<p className="notice" role="alert">{error}</p>}
  <div className="actions"><button className="btn primary" disabled={busy||blocked||(changed.length>0&&!attested)} onClick={()=>void go()}><Printer size={16}/> {changed.length?'حفظ وإنشاء ملف الطباعة':'إنشاء ملف الطباعة'}</button><button className="btn" disabled={busy} onClick={onClose}>إلغاء</button></div>
 </EditorDialog>;
}
