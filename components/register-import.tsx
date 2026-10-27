'use client';
import {useRef,useState} from 'react';
import {BookOpenCheck,Check,LoaderCircle} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import {localRequest} from '@/lib/local-auth';
import {todayISO} from '@/lib/domain';
import type {ClientEntity} from '@/lib/clients';
import {parseRegister,detectRegister,cleanName,nameKey,caseFromRegister,type LegacyCase,type Register} from '@/lib/legacy-register';

type Summary={matched:number;updated:number;created:number;entriesAdded:number;several:number;invalid:number;clientMoves:number;
 codeChanges:{autoNumber:string;from:string;to:string;client:string}[];newClients:string[]};
type Item=ReturnType<typeof caseFromRegister>;
const NUMBERS=['matched','updated','created','entriesAdded','several','invalid','clientMoves'] as const;
// Small batches keep each request well inside the server's time limit; a failed batch is tried once more.
const BATCH=25;
const REGISTER_NAMES:Record<string,string>={'':'السجل الرئيسي للمكتب',بوبيان:'سجل بوبيان للتأمين',عنايه:'سجل عناية للتأمين',وثاق:'سجل وثاق للتأمين'};

/**
 * Which client a register name is: an existing client file when the name (cleaned by the office's rules) matches its name
 * or a former spelling, the telecom companies by their English names, an insurance register's own company for all its
 * cases; otherwise the cleaned name, the same for every spelling of it in the registers.
 */
function clientResolver(clients:ClientEntity[],all:{c:LegacyCase;r:Register}[]){
 const byKey=new Map<string,string>();
 for(const e of clients)for(const n of [e.name,...e.aliases])if(n&&!byKey.has(nameKey(n)))byKey.set(nameKey(n),e.name);
 const named=(word:string)=>clients.find(e=>e.name.toLowerCase().includes(word))?.name;
 const telecom=(k:string)=>/زين|zain/.test(k)&&/اتصالات|zain/.test(k)?named('zain'):/stc/.test(k)?named('stc'):/اوريدو|ooredoo/.test(k)?named('ooredoo'):undefined;
 const company=(word:string)=>clients.find(e=>nameKey(e.name).includes(word))?.name;
 // Spellings of a name the app does not know yet share the most common cleaned form.
 const counts=new Map<string,Map<string,number>>();
 for(const {c} of all){const n=cleanName(c.client),k=nameKey(n),m=counts.get(k)||new Map();m.set(n,(m.get(n)||0)+1);counts.set(k,m)}
 const usual=(k:string,n:string)=>{const m=counts.get(k);return m?[...m].sort((a,b)=>b[1]-a[1])[0][0]:n};
 return (c:LegacyCase,r:Register)=>{
  if(r.kind==='insurance'){const co=company(r.company);if(co)return co}
  const n=cleanName(c.client),k=nameKey(n),plain=nameKey(n.replace(/\([^)]*\)/g,' '));
  return byKey.get(k)||byKey.get(plain)||telecom(k)||usual(k,n);
 };
}

async function run(items:Item[],dryRun:boolean,onProgress:(done:number)=>void):Promise<Summary>{
 const total:Summary={matched:0,updated:0,created:0,entriesAdded:0,several:0,invalid:0,clientMoves:0,codeChanges:[],newClients:[]};
 for(let i=0;i<items.length;i+=BATCH){
  const data={dryRun,items:items.slice(i,i+BATCH)};
  const s=await localRequest<Summary>('import_register',data).catch(()=>new Promise(r=>setTimeout(r,2000)).then(()=>localRequest<Summary>('import_register',data)))
   .catch(e=>{throw new Error(`توقف ${dryRun?'التحقق':'الحفظ'} عند القضية ${i+1} من ${items.length}: ${(e as Error).message}. ما حُفظ قبلها يبقى، وإعادة التشغيل تكمل الباقي دون تكرار.`)});
  for(const k of NUMBERS)total[k]+=s[k];
  total.codeChanges.push(...s.codeChanges);total.newClients=[...new Set([...total.newClients,...s.newClients])];
  onProgress(Math.min(items.length,i+BATCH));
 }
 return total;
}

/**
 * «استيراد السجل القديم» (one time, the office owner): the old system's case registers, copied from its PDFs as text.
 * Shows what would change, then applies it; the registers win on codes and case details and every missing session and
 * judgment is added. To be removed once the import is done.
 */
export default function RegisterImport({clients,onImported}:{clients:ClientEntity[];onImported:()=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(''),[files,setFiles]=useState<{name:string;register:string;cases:number;problems:number}[]>([]);
 const [items,setItems]=useState<Item[]>([]),[renames,setRenames]=useState<[string,string,number][]>([]);
 const [preview,setPreview]=useState<Summary|null>(null),[done,setDone]=useState<Summary|null>(null),[progress,setProgress]=useState(0),[error,setError]=useState('');
 const input=useRef<HTMLInputElement>(null);
 function reset(){setFiles([]);setItems([]);setRenames([]);setPreview(null);setDone(null);setProgress(0);setError('');if(input.current)input.current.value=''}
 async function choose(picked:FileList){reset();setBusy('read');
  try{
   const all:{c:LegacyCase;r:Register}[]=[],read=[];
   for(const f of [...picked]){const {cases,problems}=parseRegister(await f.text()),r=detectRegister(cases);all.push(...cases.map(c=>({c,r})));read.push({name:f.name,register:REGISTER_NAMES[r.company]||r.company,cases:cases.length,problems:problems.length})}
   if(!all.length)throw new Error('لم يُعثر على قضايا في الملفات. اختر تقارير السجل كنص منسوخ من البرنامج القديم.');
   const resolve=clientResolver(clients,all),today=todayISO(),changed=new Map<string,[string,string,number]>();
   const list=all.map(({c,r})=>{const client=resolve(c,r);if(client!==c.client.trim()){const k=c.client.trim()+'→'+client;const x=changed.get(k);changed.set(k,[c.client.trim(),client,(x?.[2]||0)+1])}
    return caseFromRegister(c,r,client,cleanName(c.opponent),today)});
   setFiles(read);setItems(list);setRenames([...changed.values()].sort((a,b)=>b[2]-a[2]));
   setBusy('preview');setPreview(await run(list,true,setProgress));
  }catch(e){setError((e as Error).message)}finally{setBusy('')}}
 async function apply(){if(!preview||busy)return;setBusy('apply');setProgress(0);
  try{const s=await run(items,false,setProgress);setDone(s);toast.success(`اكتمل استيراد السجل: ${s.updated} قضية صُححت، ${s.created} قضية جديدة، ${s.entriesAdded} جلسة وحكم`);onImported()}
  catch(e){setError((e as Error).message)}finally{setBusy('')}}
 const s=done||preview;
 return <>
  <button type="button" className="btn" title="استيراد لمرة واحدة: سجل القضايا من البرنامج القديم" onClick={()=>{reset();setOpen(true)}}><BookOpenCheck size={16}/> استيراد السجل القديم</button>
  <Dialog open={open} onOpenChange={o=>{if(!busy)setOpen(o)}}><DialogContent className="roll-import register-import" dir="rtl">
   <DialogHeader><DialogTitle>استيراد السجل القديم</DialogTitle>
    <DialogDescription>اختر ملفات السجل (نص منسوخ من تقارير البرنامج القديم): السجل الرئيسي وسجلات شركات التأمين معاً. تُطابق القضايا بالرقم الآلي، والسجل هو المرجع: يُصحح الكود والموكل والخصم والموضوع والمحكمة ورقم الدعوى، وتُضاف كل جلسة وحكم ناقص، وتُنشأ القضايا غير الموجودة. لا يُكتب شيء قبل «تطبيق الاستيراد».</DialogDescription></DialogHeader>
   <label className="field"><span>ملفات السجل</span><input ref={input} type="file" accept=".txt,text/plain" multiple aria-label="ملفات السجل القديم" disabled={!!busy} onChange={e=>{if(e.target.files?.length)void choose(e.target.files)}}/></label>
   {busy&&<p role="status" className="muted"><LoaderCircle className="spin" size={15}/> {busy==='read'?'جارٍ قراءة الملفات…':`${busy==='apply'?'جارٍ الحفظ':'جارٍ المطابقة'}… ${progress} / ${items.length} قضية`}</p>}
   {error&&<p className="notice">{error}</p>}
   {files.length>0&&<ul className="register-files">{files.map(f=><li key={f.name}><b>{f.register}</b>: {f.cases} قضية{f.problems?` · ${f.problems} سطر لم يُقرأ`:''} <small>({f.name})</small></li>)}</ul>}
   {s&&<div className="roll-summary">
    <dl className="roll-stats">
     <div><dt>قضايا موجودة طابقت السجل</dt><dd>{s.matched}</dd></div>
     <div><dt>قضايا {done?'صُححت':'ستُصحح'} من السجل</dt><dd>{s.updated}</dd></div>
     <div><dt>قضايا جديدة {done?'أضيفت':'ستُضاف'}</dt><dd>{s.created}</dd></div>
     <div><dt>جلسات وأحكام {done?'أضيفت':'ستُضاف'}</dt><dd>{s.entriesAdded}</dd></div>
     <div><dt>أكواد {done?'صُححت':'ستُصحح'}</dt><dd>{s.codeChanges.length}</dd></div>
     <div><dt>قضايا تنتقل لموكل آخر</dt><dd>{s.clientMoves}</dd></div>
    </dl>
    {s.newClients.length>0&&<details><summary>ملفات موكلين جديدة ({s.newClients.length}) تُعلَّم للمراجعة</summary><p className="muted">{s.newClients.join('، ')}</p></details>}
    {s.codeChanges.length>0&&<details><summary>الأكواد التي تُصحح ({s.codeChanges.length})</summary><div className="table-wrap"><table className="office-table"><thead><tr><th>الرقم الآلي</th><th>الكود في البرنامج</th><th>الكود في السجل</th><th>الموكل</th></tr></thead>
     <tbody>{s.codeChanges.slice(0,500).map((r,i)=><tr key={i}><td className="mono">{r.autoNumber||'—'}</td><td className="mono">{r.from||'—'}</td><td className="mono">{r.to}</td><td>{r.client}</td></tr>)}</tbody></table></div></details>}
    {renames.length>0&&<details><summary>أسماء الموكلين كما تُكتب ({renames.length} صيغة)</summary><div className="table-wrap"><table className="office-table"><thead><tr><th>في السجل</th><th>تُكتب</th><th>قضايا</th></tr></thead>
     <tbody>{renames.slice(0,800).map(([a,b,n])=><tr key={a+b}><td>{a}</td><td>{b}</td><td>{n}</td></tr>)}</tbody></table></div></details>}
    {s.several>0&&<p className="muted">{s.several} رقم آلي مسجل لأكثر من سجل (درجات التقاضي): تُصحح بياناتها كلها وتُضاف الجلسات إلى سجل الدرجة الأعلى المفتوح.</p>}
    {s.invalid>0&&<p className="notice">{s.invalid} قضية بلا رقم آلي ولا كود لم تُستورد.</p>}
   </div>}
   <div className="actions">{done?<button type="button" className="btn primary" onClick={()=>setOpen(false)}><Check size={15}/> تم</button>
    :<button type="button" className="btn primary" disabled={!preview||!!busy} onClick={()=>void apply()}>{busy==='apply'?'جارٍ الحفظ…':'تطبيق الاستيراد'}</button>}
    {!done&&<button type="button" className="btn" disabled={!!busy} onClick={()=>setOpen(false)}>إلغاء</button>}</div>
  </DialogContent></Dialog>
 </>;
}
