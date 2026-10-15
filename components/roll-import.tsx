'use client';
import {useRef,useState} from 'react';
import {CalendarPlus,Check,FileSpreadsheet,LoaderCircle} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import {localRequest} from '@/lib/local-auth';
import {formatDate,todayISO} from '@/lib/domain';
import {readRoll,rollPayload,type RollParse,type RollPayload} from '@/lib/roll-import';

type Summary={matched:number;created:number;ambiguous:number;invalid:number;filled:number;sessionsAdded:number;sessionsKnown:number;hearingsAdded:number;hearingsKnown:number;hearingsClosed:number;
 ambiguousRows:{autoNumber:string;client:string}[];createdRows:{autoNumber:string;code:string;client:string;opponent:string;caseNumber:string}[];takenCodes:{code:string;autoNumber:string}[];unknownLawyers:string[];newClients:string[]};
const NUMBERS=['matched','created','ambiguous','invalid','filled','sessionsAdded','sessionsKnown','hearingsAdded','hearingsKnown','hearingsClosed'] as const;
const BATCH=100;

/** Sends the roll in batches; a dry run first shows what would change, then the same cases are applied. */
async function run(cases:RollPayload[],file:string,dryRun:boolean,onProgress:(done:number)=>void):Promise<Summary>{
 const total:Summary={matched:0,created:0,ambiguous:0,invalid:0,filled:0,sessionsAdded:0,sessionsKnown:0,hearingsAdded:0,hearingsKnown:0,hearingsClosed:0,ambiguousRows:[],createdRows:[],takenCodes:[],unknownLawyers:[],newClients:[]};
 for(let i=0;i<cases.length;i+=BATCH){
  const s=await localRequest<Summary>('import_roll',{file,dryRun,cases:cases.slice(i,i+BATCH)});
  for(const k of NUMBERS)total[k]+=s[k];
  total.ambiguousRows.push(...s.ambiguousRows);total.createdRows.push(...s.createdRows);total.takenCodes.push(...s.takenCodes);
  total.unknownLawyers=[...new Set([...total.unknownLawyers,...s.unknownLawyers])];total.newClients=[...new Set([...total.newClients,...s.newClients])];
  onProgress(Math.min(cases.length,i+BATCH));
 }
 return total;
}

/**
 * «استيراد رول الجلسات»: reads the court roll report, shows what it would add (cases matched by automatic number, new
 * ongoing cases, held sessions, coming hearings), and applies it on confirmation. Importing the same roll again adds nothing.
 */
export default function RollImport({onImported}:{onImported:()=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(''),[file,setFile]=useState(''),[parsed,setParsed]=useState<RollParse|null>(null),[cases,setCases]=useState<RollPayload[]>([]);
 const [preview,setPreview]=useState<Summary|null>(null),[done,setDone]=useState<Summary|null>(null),[progress,setProgress]=useState(0),[error,setError]=useState('');
 const input=useRef<HTMLInputElement>(null);
 function reset(clearInput=true){setFile('');setParsed(null);setCases([]);setPreview(null);setDone(null);setProgress(0);setError('');if(clearInput&&input.current)input.current.value=''}
 async function choose(f:File){reset(false);setFile(f.name);setBusy('read');
  try{const r=await readRoll(f),today=todayISO(),list=r.cases.map(c=>rollPayload(c,today,f.name));setParsed(r);setCases(list);
   setBusy('preview');setPreview(await run(list,f.name,true,setProgress))}
  catch(e){setError((e as Error).message)}finally{setBusy('')}}
 async function apply(){if(!preview||busy)return;setBusy('apply');setProgress(0);
  try{const s=await run(cases,file,false,setProgress);setDone(s);toast.success(`استُورد الرول: ${s.created} قضية جديدة، ${s.sessionsAdded} جلسة في السجلات، ${s.hearingsAdded} موعد جلسة`);onImported()}
  catch(e){setError((e as Error).message)}finally{setBusy('')}}
 const s=done||preview;
 const dates=parsed?parsed.cases.flatMap(c=>c.hearings.map(h=>h.date)).sort():[];
 return <>
  <button type="button" className="btn" onClick={()=>{reset();setOpen(true)}}><CalendarPlus size={16}/> استيراد رول الجلسات</button>
  <Dialog open={open} onOpenChange={o=>{if(!busy)setOpen(o)}}><DialogContent className="roll-import" dir="rtl">
   <DialogHeader><DialogTitle>استيراد رول الجلسات</DialogTitle>
    <DialogDescription>اختر تقرير «رول الجلسات» (‎.xls) كما يُصدر من البرنامج. تُطابق القضايا بالرقم الآلي، وتُضاف القضايا غير الموجودة كقضايا متداولة، وتُسجل الجلسات المنعقدة بقراراتها، وتُضاف الجلسات القادمة إلى «المهام والجلسات». تُعرض النتيجة أولاً قبل الحفظ، واستيراد الرول نفسه مرة ثانية لا يكرر شيئاً.</DialogDescription></DialogHeader>
   <label className="field"><span>ملف الرول</span><input ref={input} type="file" accept=".xls,.xlsx" aria-label="ملف رول الجلسات" disabled={!!busy} onChange={e=>{const f=e.target.files?.[0];if(f)void choose(f)}}/></label>
   {busy&&<p role="status" className="muted"><LoaderCircle className="spin" size={15}/> {busy==='read'?'جارٍ قراءة الملف…':`${busy==='apply'?'جارٍ الحفظ':'جارٍ المطابقة'}… ${progress} / ${cases.length} قضية`}</p>}
   {error&&<p className="notice">{error}</p>}
   {parsed&&s&&<div className="roll-summary">
    <p><FileSpreadsheet size={15}/> <b>{file}</b>: {parsed.hearings} جلسة لـ {parsed.cases.length} قضية{dates.length?` من ${formatDate(dates[0])} إلى ${formatDate(dates[dates.length-1])}`:''}.</p>
    <dl className="roll-stats">
     <div><dt>قضايا موجودة في السجل</dt><dd>{s.matched}</dd></div>
     <div><dt>قضايا جديدة {done?'أضيفت':'ستُضاف'}</dt><dd>{s.created}</dd></div>
     <div><dt>جلسات منعقدة {done?'سُجلت':'ستُسجل'} بقراراتها</dt><dd>{s.sessionsAdded}</dd></div>
     <div><dt>جلسات قادمة {done?'أضيفت':'ستُضاف'} للمهام</dt><dd>{s.hearingsAdded}</dd></div>
     <div><dt>مواعيد مفتوحة {done?'أُغلقت':'ستُغلق'} بقرارها</dt><dd>{s.hearingsClosed}</dd></div>
     <div><dt>بيانات فارغة {done?'اكتملت':'ستكتمل'}</dt><dd>{s.filled}</dd></div>
    </dl>
    {(s.sessionsKnown>0||s.hearingsKnown>0)&&<p className="muted">موجود من قبل ولن يتكرر: {s.sessionsKnown} جلسة مسجلة و{s.hearingsKnown} موعد.</p>}
    {s.newClients.length>0&&<p className="muted">سيُنشأ ملف موكل لكل اسم غير موجود في سجل الموكلين ({s.newClients.length}) ويُعلَّم للمراجعة؛ يمكن دمج المكرر لاحقاً.</p>}
    {s.unknownLawyers.length>0&&<p className="muted">لا يوجد حساب باسم هؤلاء المحامين، فتُسند جلساتهم إليك: {s.unknownLawyers.join('، ')}.</p>}
    {s.takenCodes.length>0&&<p className="muted">{s.takenCodes.length} قضية جديدة يحمل «ترقيمها الخاص» كود قضية أخرى، فتُضاف بلا كود: {s.takenCodes.slice(0,8).map(t=>t.code+' (آلي '+t.autoNumber+')').join('، ')}{s.takenCodes.length>8?'…':''}</p>}
    {s.ambiguous>0&&<p className="notice">{s.ambiguous} رقم آلي مسجل لأكثر من قضية في الدرجة نفسها، فتُرك دون تغيير: {s.ambiguousRows.slice(0,8).map(r=>r.autoNumber).join('، ')}</p>}
    {parsed.withoutNumber.length>0&&<p className="notice">{parsed.withoutNumber.length} جلسة بلا رقم آلي لا يمكن ربطها: {parsed.withoutNumber.map(w=>`${w.client||'—'} (${formatDate(w.date)})`).join('، ')}</p>}
    {s.invalid>0&&<p className="notice">{s.invalid} سجل غير صالح لم يُستورد.</p>}
    {s.createdRows.length>0&&<details><summary>القضايا الجديدة ({s.created})</summary><div className="table-wrap"><table className="office-table"><thead><tr><th>الرقم الآلي</th><th>الكود</th><th>رقم القضية</th><th>الموكل</th><th>الخصم</th></tr></thead>
     <tbody>{s.createdRows.slice(0,200).map(r=><tr key={r.autoNumber}><td className="mono">{r.autoNumber}</td><td className="mono">{r.code||'—'}</td><td className="mono">{r.caseNumber||'—'}</td><td>{r.client}</td><td>{r.opponent||'—'}</td></tr>)}</tbody></table></div></details>}
   </div>}
   <div className="actions">{done?<button type="button" className="btn primary" onClick={()=>setOpen(false)}><Check size={15}/> تم</button>
    :<button type="button" className="btn primary" disabled={!preview||!!busy||(!preview.created&&!preview.sessionsAdded&&!preview.hearingsAdded&&!preview.hearingsClosed&&!preview.filled)} onClick={()=>void apply()}>{busy==='apply'?'جارٍ الحفظ…':'تطبيق الاستيراد'}</button>}
    {!done&&<button type="button" className="btn" disabled={!!busy} onClick={()=>setOpen(false)}>إلغاء</button>}</div>
  </DialogContent></Dialog>
 </>;
}
