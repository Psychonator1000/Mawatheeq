import {useEffect,useMemo,useState} from 'react';
import {Printer,CheckSquare,Square,FileStack} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {departmentPages,type CollectionData,type CollectionRecord} from '@/lib/departments';
import {missingDocumentFields} from '@/lib/collection-documents';
import {generateWord} from '@/lib/document-tools';
import {formatDate} from '@/lib/domain';
import CollectionImport from './collection-import';
import WordPreview,{paperName,type WordItem} from './word-preview';
import {normalizeSearch} from '@/lib/case-browse';
import {Field,DateField,Empty} from '../shared';
import {OfficeSelect} from '../office-shared';
import {StatusMessage} from './shared';
import {PulseStrip,PulseTile} from '../pulse';
import {tidyName} from '@/lib/clients';
import {addDays,todayISO} from '@/lib/domain';

type Kind='claim'|'bundle';
const KINDS:Record<Kind,{label:string}>={bundle:{label:'حافظة مستندات'},claim:{label:'صحيفة الدعوى'}};
type Row={record:CollectionRecord;missing:Record<Kind,string[]>};

/**
 * «طباعة الحافظة والدعوى»: choose any number of collection files (or make them from a client's Excel list of payment
 * orders) and each paper opens as it will print, to be corrected on the page and downloaded as its own Word file, named
 * after the opposite party. Each paper is generated on the server from the file's current data (revision-checked and
 * kept as an immutable snapshot), exactly as when generated one at a time.
 */
export default function BatchPrint({canExport,canImport=false,clients=[],onImported}:{canExport:boolean;canImport?:boolean;clients?:{id:string;name:string}[];onImported?:()=>void}){
 const [records,setRecords]=useState<CollectionRecord[]|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0);
 const [kinds,setKinds]=useState<'bundle'|'claim'|'both'>('bundle'),[search,setSearch]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[show,setShow]=useState<'ready'|'all'>('ready');
 const [preview,setPreview]=useState<WordItem[]|null>(null);
 const [selected,setSelected]=useState<Set<string>>(new Set()),[progress,setProgress]=useState<{done:number;total:number}|null>(null),[skipped,setSkipped]=useState<{name:string;reason:string}[]>([]);
 useEffect(()=>{let active=true;departmentPages<CollectionRecord>('collections','records_page').then(r=>{if(active){setRecords(r.filter(x=>x.kind==='file'));setError('')}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[version]);
 const wanted:Kind[]=kinds==='both'?['bundle','claim']:[kinds];
 const rows=useMemo<Row[]>(()=>(records||[]).filter(r=>!r.archived).map(r=>({record:r,missing:{claim:missingDocumentFields(r.payload,'claim'),bundle:missingDocumentFields(r.payload,'bundle')}})),[records]);
 const ready=(row:Row)=>wanted.every(k=>!row.missing[k].length);
 const visible=rows.filter(row=>(show==='all'||ready(row))&&(!from||row.record.payload.hearingDate>=from)&&(!to||row.record.payload.hearingDate<=to)&&normalizeSearch([row.record.payload.code,row.record.payload.company,row.record.payload.defendant,row.record.payload.lawsuitNumber].join(' ')).includes(normalizeSearch(search)))
  .sort((a,b)=>(a.record.payload.hearingDate||'9999').localeCompare(b.record.payload.hearingDate||'9999')||(a.record.payload.code||'').localeCompare(b.record.payload.code||''));
 const chosen=visible.filter(row=>selected.has(row.record.id)&&ready(row));
 const allChosen=visible.filter(ready).length>0&&visible.filter(ready).every(row=>selected.has(row.record.id));
 const toggle=(id:string)=>setSelected(s=>{const n=new Set(s);if(n.has(id))n.delete(id);else n.add(id);return n});
 const toggleAll=()=>setSelected(allChosen?new Set():new Set(visible.filter(ready).map(row=>row.record.id)));
 // Everything each paper still needs at once, so the file is completed in one visit.
 const reason=(row:Row)=>[...wanted.map(k=>row.missing[k].length?`${KINDS[k].label}: ينقص ${row.missing[k].slice(0,4).join('، ')}${row.missing[k].length>4?` و${row.missing[k].length-4} غيرها`:''}`:'')].filter(Boolean).join(' · ');

 async function run(list:Row[]=chosen){
  if(!list.length)return;
  const total=list.length*wanted.length;let done=0;const failed:{name:string;reason:string}[]=[],made:WordItem[]=[];
  setSkipped([]);setProgress({done,total});
  try{
   for(const row of list)for(const kind of wanted){
    const p=row.record.payload,who=(p.defendant||'').trim()||p.code||'مستند';
    try{
     const output=await departmentRequest<{id:string;data:CollectionData;templateVersion:string}>('generate',{workspace:'collections',id:row.record.id,revision:row.record.revision,kind,outputId:crypto.randomUUID()});
     if(output.templateVersion!=='office-word-v1')throw new Error('إصدار القالب غير مدعوم.');
     // Named after the opposite party, then the paper («- حافظة»), so the files tell themselves apart.
     made.push({id:row.record.id+':'+kind,kind,name:paperName(who,kind),blob:await generateWord(kind,output.data)});
    }catch(e){failed.push({name:`${who} (${KINDS[kind].label})`,reason:(e as Error).message})}
    setProgress({done:++done,total});
   }
   setSkipped(failed);
   if(failed.length)toast.error(`تعذر إنشاء ${failed.length} مستند. التفاصيل أسفل القائمة.`);
   if(made.length)setPreview(made);
  }finally{setProgress(null)}
 }

 return <section className="panel batch-print"><div className="department-toolbar"><h2><FileStack size={20}/> طباعة الحافظة والدعوى</h2>{canImport&&records&&<CollectionImport files={records} clients={clients} label="إنشاء ملفات من Excel" onImported={ids=>{setSelected(new Set(ids));setVersion(v=>v+1);onImported?.()}} onDone={()=>setVersion(v=>v+1)}/>}</div>
  <p className="subtitle">اختر الملفات الجاهزة ونوع المستند (أو أنشئ الملفات من كشف Excel)، فيظهر كل مستند كما سيُطبع لتعدله في الصفحة، ثم يُنزَّل كل مستند في ملف Word باسم المدعى عليه.</p>
  <div className="batch-kinds" role="group" aria-label="نوع المستند">{([['bundle','حافظة مستندات'],['claim','صحيفة الدعوى'],['both','الاثنان معاً']] as const).map(([k,label])=><button key={k} className={'btn '+(kinds===k?'primary':'')} aria-pressed={kinds===k} onClick={()=>setKinds(k)}>{label}</button>)}</div>
  <div className="department-filters"><Field label="بحث في ملفات الطباعة" value={search} onChange={setSearch}/><DateField label="جلسة من" value={from} onChange={setFrom}/><DateField label="جلسة إلى" value={to} onChange={setTo}/><OfficeSelect label="عرض" value={show} onChange={v=>setShow(v as 'ready'|'all')} options={[['ready','الجاهزة للطباعة فقط'],['all','كل الملفات النشطة']]}/></div>
  <StatusMessage loading={!records&&!error} error={error}/>
  {records&&<>
   <div className="batch-bar"><button className="btn" onClick={toggleAll} disabled={!visible.some(ready)}>{allChosen?<CheckSquare size={16}/>:<Square size={16}/>} {allChosen?'إلغاء تحديد الكل':'تحديد كل الجاهز'}</button><span className="subtitle">محدد {chosen.length} من {visible.filter(ready).length} جاهز</span>
    {canExport?<button className="btn primary" disabled={!chosen.length||!!progress} onClick={()=>void run()}><Printer size={16}/> {progress?`جارٍ الإنشاء ${progress.done} من ${progress.total}…`:`معاينة وطباعة (${chosen.length})`}</button>:<span className="notice">يحتاج الإنشاء إلى صلاحية التصدير.</span>}</div>
   {progress&&<div className="batch-progress" aria-hidden><i style={{width:`${Math.round(progress.done/Math.max(1,progress.total)*100)}%`}}/></div>}
   <BatchPulse rows={rows}/>
   <div className="table-wrap"><table className="office-table batch-table"><thead><tr><th aria-label="تحديد"/><th>الملف</th><th>الأطراف</th><th>المبلغ</th><th>الجلسة</th><th>الأوراق</th><th>الحالة</th></tr></thead>
    <tbody>{visible.map(row=>{const ok=ready(row),p=row.record.payload,paper=(k:Kind)=><span className={'batch-paper '+(row.missing[k].length?'no':'ok')} title={row.missing[k].length?'ينقص: '+row.missing[k].join('، '):'جاهزة للطباعة'}>{row.missing[k].length?'✗':'✓'} {k==='bundle'?'حافظة':'صحيفة'}</span>;
     return <tr key={row.record.id} className={'batch-row '+(ok?'edge-green':'edge-amber ledger-void')}><td><input type="checkbox" aria-label={'تحديد '+(p.code||p.defendant)} disabled={!ok} checked={ok&&selected.has(row.record.id)} onChange={()=>toggle(row.record.id)}/></td>
      <td><b>{p.code||'—'}</b>{p.orderNumber&&<small>أمر {p.orderNumber}</small>}</td>
      <td title={`${tidyName(p.company)} ضد ${tidyName(p.defendant)}`}><b>{tidyName(p.company)}</b> <small>ضد {tidyName(p.defendant)||'—'}</small></td>
      <td className="mono">{p.amount?`${p.amount} د.ك`:<span className="muted">—</span>}</td>
      <td>{p.hearingDate?formatDate(p.hearingDate):<span className="muted">بلا موعد</span>}{(p.hearingCourt||p.hearingCircuit)&&<small>{[p.hearingCourt,p.hearingCircuit].filter(Boolean).join(' · ')}</small>}</td>
      <td className="batch-papers">{paper('bundle')}{paper('claim')}</td>
      <td className="batch-state">{ok?<span className="tag green">جاهز</span>:<span className="line-story" title={reason(row)}>{reason(row)}</span>}</td></tr>})}</tbody></table></div>
   {!visible.length&&<Empty title="لا توجد ملفات" text={show==='ready'?'لا توجد ملفات جاهزة بهذه التصفية. الملف الجاهز حقوله المطلوبة مكتملة.':'لا توجد ملفات تحصيل نشطة.'}/>}
   {skipped.length>0&&<div className="notice" role="alert"><b>لم تُنشأ هذه المستندات:</b><ul>{skipped.map(s=><li key={s.name}>{s.name}: {s.reason}</li>)}</ul></div>}
  </>}
 {preview&&<WordPreview items={preview} onClose={()=>setPreview(null)}/>}</section>;
}

/** The print page's summary tiles: how many files each paper can print now, what is missing most, and when their hearings are. */
function BatchPulse({rows}:{rows:Row[]}){
 const today=todayISO(),week=addDays(today,7);
 const both=rows.filter(r=>!r.missing.bundle.length&&!r.missing.claim.length).length,bundle=rows.filter(r=>!r.missing.bundle.length&&r.missing.claim.length).length,claim=rows.filter(r=>r.missing.bundle.length&&!r.missing.claim.length).length;
 const counts=new Map<string,number>();for(const r of rows)for(const f of new Set([...r.missing.bundle,...r.missing.claim]))counts.set(f,(counts.get(f)||0)+1);
 const top=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4),tones=['red','amber','blue','grey'] as const;
 const h=(r:Row)=>r.record.payload.hearingDate||'';
 return <PulseStrip label="ملخص الطباعة">
  <PulseTile title="الجاهزة للطباعة" value={both+bundle+claim} sub={'من '+rows.length+' ملف'} parts={[{label:'الحافظة والصحيفة',value:both,tone:'green'},{label:'الحافظة فقط',value:bundle,tone:'blue'},{label:'الصحيفة فقط',value:claim,tone:'brand'},{label:'غير جاهزة',value:rows.length-both-bundle-claim,tone:'amber'}]}/>
  <PulseTile title="أكثر ما ينقص" sub="عدد الملفات" parts={top.length?top.map(([f,n],i)=>({label:f,value:n,tone:tones[i]})):[{label:'لا شيء ينقص',value:rows.length,tone:'green'}]}/>
  <PulseTile title="الجلسات" parts={[{label:'هذا الأسبوع',value:rows.filter(r=>h(r)>=today&&h(r)<=week).length,tone:'red'},{label:'لاحقاً',value:rows.filter(r=>h(r)>week).length,tone:'brand'},{label:'فائتة',value:rows.filter(r=>h(r)&&h(r)<today).length,tone:'grey'},{label:'بلا موعد',value:rows.filter(r=>!h(r)).length,tone:'amber'}]}/>
 </PulseStrip>;
}
