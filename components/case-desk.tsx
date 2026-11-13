import {createContext,lazy,Suspense,useContext,useMemo,useState} from 'react';
import {Printer,Plus,Save,ArrowUpLeft,AlertTriangle,FileSignature,CheckCircle2} from 'lucide-react';
import {toast} from 'sonner';
import {type CaseRecord,type Rules,DEFAULT_RULES,emptyCase,formatDate,todayISO,daysBetween,caseCode,caseState} from '@/lib/domain';
import {splitCircuit} from '@/lib/circuits';
import {currentLevel,LEVEL_TITLE} from '@/lib/case-stages';
const ClientSummary=lazy(()=>import('./client-summary'));
import {type ClientEntity,clientName,enrichCase} from '@/lib/clients';
import {DECISIONS,EXPERT_DECISIONS,sessionProcedure,type Venue} from '@/lib/sessions';
import {type DeskPage,CONSULTATION_STATUSES,CONSULTATION_TYPES,POSTING_ERRORS,dueForPosting,judgmentsBetween,lastSitting,nextSitting,postingErrors,renewalDeadline,shiftDays,sittingsBetween,stayOf,withoutContract,workflowOf,type ConsultationStatus} from '@/lib/case-desk';
import {ROLL_BLANK,judgmentRollHtml,printHtml,rollCardsHtml} from '@/lib/print';
import {Field,DateField,Empty,api} from './shared';
import {OfficeSelect} from './office-shared';
import {EditorDialog} from './departments/shared';
import {attendsCourt,type Member,type WorkItem} from '@/lib/office';
import {SelectList} from './filter-select';
import PageNavigation from './page-navigation';
import {NUMBER_FIELDS,ROLL_FIELDS,ROLL_SORTS,modesFor,passesRollRules,rollOptions,rollValue,ruleActive,sortRoll,splitValues,type RollField,type RollItem,type RollMode,type RollRule,type RollSort} from '@/lib/roll-filter';
import {normalizeSearch} from '@/lib/case-browse';
import {PulseStrip,PulseTile,type PulsePart} from './pulse';
import {ageOf,consultationLine,sinceAr,stayLine,type When} from '@/lib/desk-line';
import {daysAr} from '@/lib/case-line';

type Props={page:DeskPage;records:CaseRecord[];rules?:Rules;clients:ClientEntity[];work:WorkItem[];members:Member[];canEdit:boolean;canCreate:boolean;canExport:boolean;printedBy:string;
 onOpen:(c:CaseRecord)=>void;onSaved:(c:CaseRecord)=>void;onNew:(c:CaseRecord)=>void;
 /** Shown inside a window that already carries the title and description. */
 bare?:boolean};
const Bare=createContext(false);

async function saveCase(c:CaseRecord,clients:ClientEntity[]){const d=await api('/api/cases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({case:c})});return enrichCase(d.case,clients)}
const ref=(c:CaseRecord)=>caseCode(c)||c.autoNumber||'بلا كود';
const parties=(c:CaseRecord)=>`${clientName(c)||'—'} ضد ${c.opponent||'—'}`;
const lawyersOf=(rs:CaseRecord[])=>[...new Set(rs.map(c=>String(c.lawyer||'').trim()).filter(Boolean))].sort();
function CaseCell({c,onOpen}:{c:CaseRecord;onOpen:(c:CaseRecord)=>void}){return <button type="button" className="desk-case" onClick={()=>onOpen(c)}><b>{ref(c)}</b><small>{parties(c)}</small></button>}
function Panel({title,note,actions,children}:{title:string;note?:string;actions?:React.ReactNode;children:React.ReactNode}){if(useContext(Bare))return <div className="desk-bare">{actions&&<div className="actions desk-bare-actions">{actions}</div>}{children}</div>;return <section className="panel desk-panel"><div className="panel-head"><div><h2 className="sr-only">{title}</h2>{note&&<p className="panel-note">{note}</p>}</div>{actions&&<div className="actions">{actions}</div>}</div><div className="panel-body">{children}</div></section>}
/** Prints like «رول الأحكام»: landscape, numbered rows, and column widths in proportion to `widths`. */
function print(canExport:boolean,title:string,sub:string,headers:string[],rows:string[][],by:string,widths:number[]){if(!canExport)return;if(!printHtml(judgmentRollHtml(title,sub,headers,[['',rows.map(r=>r.map(c=>[c||'—',''] as [string,string]))]],formatDate(todayISO()),by,widths)))toast.error('اسمح بالنوافذ المنبثقة للطباعة.')}

export default function CaseDesk(p:Props){return <Bare.Provider value={!!p.bare}><DeskPageView {...p}/></Bare.Provider>}
function DeskPageView(p:Props){
 switch(p.page){
  case 'posting':return <Posting {...p}/>;
  case 'postingErrors':return <PostingErrors {...p}/>;
  case 'roll':return <Roll {...p}/>;
  case 'followup':return <Followup {...p}/>;
  case 'statements':return <Statements {...p}/>;
  case 'summary':return <Suspense fallback={<p role="status">جارٍ التحميل…</p>}><ClientSummary records={p.records.filter(c=>!workflowOf(c))} clients={p.clients} rules={p.rules||DEFAULT_RULES} printedBy={p.printedBy} canExport={p.canExport} onOpen={p.onOpen}/></Suspense>;
  case 'consultations':return <Consultations {...p}/>;
  case 'judgments':return <Judgments {...p}/>;
  case 'noContract':return <NoContract {...p}/>;
  case 'study':return <Study {...p}/>;
  case 'stayed':return <Stayed {...p}/>;
 }
}

/** One sitting to post: the decision taken and, for adjournments, the next date. Saved into the case's sessions log. */
function PostRow({c,date,p}:{c:CaseRecord;date:string;p:Props}){
 const last=lastSitting(c),venue=(String(last?.venue||'المحكمة') as Venue),list=venue==='إدارة الخبراء'?EXPERT_DECISIONS:DECISIONS;
 const [decision,setDecision]=useState(''),[next,setNext]=useState(''),[time,setTime]=useState(String(last?.nextTime||'')),[details,setDetails]=useState(''),[busy,setBusy]=useState(false);
 const needsNext=list.find(d=>d.label===decision)?.next!=='none';
 async function post(){
  if(!decision){toast.error('اختر قرار الجلسة.');return}
  if(needsNext&&!next){toast.error('أدخل موعد الجلسة التالية.');return}
  if(needsNext&&next<=date){toast.error('موعد الجلسة التالية يجب أن يكون بعد تاريخ الجلسة.');return}
  setBusy(true);try{const proc=sessionProcedure({date,venue,court:String(last?.court||c.court||''),decision,details,nextDate:needsNext?next:'',nextTime:needsNext?time:'',recordedBy:p.printedBy});
   p.onSaved(await saveCase({...c,procedures:[...c.procedures,proc]},p.clients));toast.success(`رُحّلت جلسة ${ref(c)}`)}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 return <tr><td><CaseCell c={c} onOpen={p.onOpen}/></td><td>{String(last?.court||c.court||'—')}<small>{last?`آخر قرار: ${String(last.decision||last.text||'')}`:''}</small></td>
  <td>{p.canEdit?<SelectList aria-label={'قرار جلسة '+ref(c)} value={decision} onChange={e=>setDecision(e.target.value)}><option value="">اختر القرار</option>{list.map(d=><option key={d.label}>{d.label}</option>)}</SelectList>:'—'}</td>
  <td>{p.canEdit&&needsNext&&decision?<div className="desk-next"><DateField label={'الجلسة التالية '+ref(c)} value={next} onChange={setNext}/><input type="time" aria-label={'ساعة الجلسة التالية '+ref(c)} value={time} onChange={e=>setTime(e.target.value)}/></div>:<span className="muted">{decision?'لا جلسة تالية':'—'}</span>}</td>
  <td>{p.canEdit&&<input aria-label={'تفاصيل القرار '+ref(c)} value={details} onChange={e=>setDetails(e.target.value)} placeholder="تفاصيل (اختياري)"/>}</td>
  <td>{p.canEdit&&<button type="button" className="btn primary" disabled={busy||!decision} onClick={()=>void post()}><Save size={15}/> ترحيل</button>}</td></tr>;
}
function PostTable({rows,p}:{rows:{c:CaseRecord;date:string}[];p:Props}){
 return <div className="table-wrap"><table className="office-table desk-table"><thead><tr><th>القضية</th><th>المحكمة</th><th>القرار</th><th>الجلسة التالية</th><th>تفاصيل</th><th/></tr></thead><tbody>{rows.map(r=><PostRow key={r.c.id+r.date} c={r.c} date={r.date} p={p}/>)}</tbody></table></div>;
}
function Posting(p:Props){
 const [date,setDate]=useState(todayISO());
 const rows=dueForPosting(p.records,date).map(c=>({c,date}));
 return <Panel title="ترحيل الجلسات" note="اختر يوم الجلسات، ثم سجّل قرار كل جلسة وموعد التالية. يُحفظ الترحيل في سجل جلسات القضية لدرجتها الحالية."
  actions={<><button className="btn" onClick={()=>setDate(shiftDays(date,-1))}>اليوم السابق</button><button className="btn" onClick={()=>setDate(todayISO())}>اليوم</button><button className="btn" onClick={()=>setDate(shiftDays(date,1))}>اليوم التالي</button></>}>
  <div className="desk-toolbar"><DateField label="يوم الجلسات" value={date} onChange={setDate}/><span className="tag">{rows.length} جلسة بانتظار الترحيل</span></div>
  {rows.length?<PostTable rows={rows} p={p}/>:<Empty title="لا جلسات بانتظار الترحيل في هذا اليوم" text="الجلسات التي رُحّلت تختفي من القائمة. راجع «أخطاء الترحيل» للجلسات الفائتة."/>}
 </Panel>;
}
function PostingErrors(p:Props){
 const today=todayISO();
 const rows=useMemo(()=>p.records.flatMap(c=>postingErrors(c,today).map(e=>({c,e}))).sort((a,b)=>a.e.date.localeCompare(b.e.date)),[p.records,today]);
 const [kind,setKind]=useState(''),[lawyer,setLawyer]=useState(''),[age,setAge]=useState('');
 const ageOfErr=(d:string)=>{const n=daysBetween(d,today)??0;return n<=7?'week':n<=30?'month':'older'};
 const shown=rows.filter(r=>(!kind||r.e.kind===kind)&&byLawyer(lawyer)(r.c)&&(!age||ageOfErr(r.e.date)===age)),missed=shown.filter(r=>r.e.kind==='notPosted'||r.e.kind==='judgmentPending');
 const kinds=Object.entries(POSTING_ERRORS).filter(([k])=>rows.some(r=>r.e.kind===k));
 return <Panel title="أخطاء الترحيل" note="تُكتشف تلقائياً من سجل الجلسات. الجلسات الفائتة تُرحّل هنا مباشرة؛ الأخطاء الأخرى تُصحح من ملف القضية.">
  {!!rows.length&&<PulseStrip label="ملخص أخطاء الترحيل">
   <PulseTile title="نوع الخطأ" value={rows.length} sub="خطأ في الترحيل" parts={kinds.map(([k,l],i)=>({label:l,value:rows.filter(r=>r.e.kind===k).length,tone:(['red','amber','blue','brand','grey'] as const)[i%5],on:kind===k,onClick:()=>setKind(kind===k?'':k)}))}/>
   <PulseTile title="منذ متى" parts={([['week','خلال أسبوع','amber'],['month','حتى شهر','red'],['older','أقدم','brand']] as const).map(([k,l,t])=>({label:l,value:rows.filter(r=>ageOfErr(r.e.date)===k).length,tone:t,on:age===k,onClick:()=>setAge(age===k?'':k)}))}/>
   <PulseTile title="المحامي" parts={lawyerParts(rows.map(r=>r.c),lawyer,setLawyer)}/>
  </PulseStrip>}
  {!shown.length?<Empty title={rows.length?'لا أخطاء بهذا التصنيف':'لا أخطاء في الترحيل'} text={rows.length?'اضغط التصنيف المختار مرة أخرى لإلغائه.':'كل الجلسات مرحّلة بمواعيد صحيحة.'}/>:<>
   {!!missed.length&&<><h3 className="desk-sub">جلسات فائتة لم تُرحَّل ({missed.length})</h3><PostTable rows={missed.map(r=>({c:r.c,date:r.e.date}))} p={p}/></>}
   {shown.length>missed.length&&<><h3 className="desk-sub">أخطاء تحتاج تصحيحاً في ملف القضية</h3><ul className="story-list fix-lines" aria-label="أخطاء تحتاج تصحيحاً">
    <li className="story-head" aria-hidden><span>القضية</span><span>الخطأ</span><span>التاريخ</span><span>باختصار</span><span/></li>
    {shown.filter(r=>!missed.includes(r)).map(r=>{const n=daysBetween(r.e.date,today)??0;return <li key={r.c.id+r.e.kind}><div className={'story-row e-'+(n>30?'red':'amber')}><CaseLineCell c={r.c}/>
     <span><span className="tag amber"><AlertTriangle size={13}/> {r.e.label}</span></span><span className="story-num">{formatDate(r.e.date)}</span>
     <span className="line-story">{[n>0?'منذ '+daysAr(n,true):'اليوم',String(r.c.lawyer||'').trim()||'بلا محامٍ',String(r.c.court||'')].filter(Boolean).join(' · ')}</span>
     <button className="btn" onClick={()=>p.onOpen(r.c)}><ArrowUpLeft size={15}/> فتح القضية</button></div></li>})}</ul></>}
  </>}
 </Panel>;
}
function useLawyerFilter(records:CaseRecord[]){const [lawyer,setLawyer]=useState('');const options=lawyersOf(records);return {lawyer,match:(c:CaseRecord)=>!lawyer||String(c.lawyer||'').trim()===lawyer,select:options.length>0&&<OfficeSelect label="المستشار" value={lawyer} onChange={setLawyer} options={[['','كل المستشارين'],...options.map(l=>[l,l] as [string,string])]}/>}}
/** «تصفية متقدمة» for the rolls: print only, or all except, chosen clients, opponents, lawyers, courts or roles. */
function useRollRules(items:RollItem[]){
 const [open,setOpen]=useState(false),[rules,setRules]=useState<RollRule[]>([]),[typed,setTyped]=useState<Record<string,string>>({});
 const active=rules.filter(ruleActive).length;
 const patch=(id:string,v:Partial<RollRule>)=>setRules(rs=>rs.map(r=>r.id===id?{...r,...v}:r));
 const add=()=>{setOpen(true);setRules(rs=>[...rs,{id:crypto.randomUUID(),field:'client',mode:'except',values:[]}])};
 const button=<button type="button" className={'btn roll-rules-toggle'+(active?' primary':'')} aria-expanded={open} onClick={()=>{if(!rules.length)add();else setOpen(o=>!o)}}>تصفية متقدمة{active?` (${active})`:''}</button>;
 const panel=open&&<div className="roll-rules-panel">
   {rules.map(r=>{const label=ROLL_FIELDS.find(f=>f[0]===r.field)?.[1]||'',num=NUMBER_FIELDS.includes(r.field),ranged=r.mode==='range'||r.mode==='outside';
    const opts=rollOptions(items,r.field).filter(v=>!r.values.includes(v)),q=typed[r.id]||'',hits=q?opts.filter(v=>v.includes(q)).slice(0,30):[];
    // Several values at once: typed with commas (numbers also with spaces) or pasted as a list.
    const take=(text:string)=>{const vs=splitValues(text,r.field).filter(v=>!r.values.includes(v));if(vs.length)patch(r.id,{values:[...r.values,...vs]});setTyped(t=>({...t,[r.id]:''}))};
    const changeField=(field:RollField)=>patch(r.id,{field,values:[],from:'',to:'',mode:!NUMBER_FIELDS.includes(field)&&(r.mode==='range'||r.mode==='outside')?'only':r.mode});
    return <div className="roll-rule" key={r.id}>
     <SelectList aria-label="الحقل" value={r.field} onChange={e=>changeField(e.target.value as RollField)}>{ROLL_FIELDS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</SelectList>
     <div className="roll-rule-mode" role="group" aria-label="طريقة التصفية">{modesFor(r.field).map(([m,l])=><button type="button" key={m} className={'chip-toggle'+(r.mode===m?' on':'')} aria-pressed={r.mode===m} onClick={()=>patch(r.id,{mode:m as RollMode})}>{l}</button>)}</div>
     {ranged?<div className="roll-rule-range">
       <label><span>من</span><input aria-label={label+' من'} inputMode="numeric" list={'roll-rule-'+r.id} value={r.from||''} placeholder={r.field==='code'?'مثال: 100':'من'} onChange={e=>patch(r.id,{from:e.target.value})}/></label>
       <label><span>إلى</span><input aria-label={label+' إلى'} inputMode="numeric" list={'roll-rule-'+r.id} value={r.to||''} placeholder={r.field==='code'?'مثال: 250':'إلى'} onChange={e=>patch(r.id,{to:e.target.value})}/></label>
       <datalist id={'roll-rule-'+r.id}>{rollOptions(items,r.field).slice(0,200).map(v=><option key={v} value={v}/>)}</datalist></div>
     :<div className="roll-rule-values">{r.values.map(v=><span className="tag" key={v}>{v}<button type="button" aria-label={'إزالة '+v} onClick={()=>patch(r.id,{values:r.values.filter(x=>x!==v)})}>×</button></span>)}
      <input aria-label={(r.mode==='contains'?'نص يحتويه ':'اختر ')+label} list={r.mode==='contains'?undefined:'roll-rule-'+r.id} value={q} placeholder={r.mode==='contains'?'اكتب جزءاً من القيمة…':num?'اكتب رقماً أو عدة أرقام…':'اكتب واختر…'}
       onChange={e=>{const v=e.target.value;if(r.mode!=='contains'&&opts.includes(v))take(v);else setTyped(t=>({...t,[r.id]:v}))}}
       onPaste={e=>{const text=e.clipboardData.getData('text');if(splitValues(text,r.field).length>1){e.preventDefault();take(text)}}}
       onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();take(r.mode==='contains'||num||!hits[0]?q:hits[0])}}}
       onBlur={()=>{if(q.trim()&&(num||r.mode==='contains'))take(q)}}/>
      {r.mode!=='contains'&&<datalist id={'roll-rule-'+r.id}>{hits.map(v=><option key={v} value={v}/>)}</datalist>}</div>}
     <button type="button" className="icon-btn" aria-label="حذف الشرط" onClick={()=>setRules(rs=>rs.filter(x=>x.id!==r.id))}>×</button>
    </div>})}
   <div className="roll-rules-actions"><button type="button" className="text-link" onClick={add}>+ إضافة شرط</button>{rules.length>0&&<button type="button" className="text-link" onClick={()=>{setRules([]);setOpen(false)}}>مسح التصفية</button>}<span className="roll-rules-hint">تُجمع الشروط معاً. للأرقام: افصل بينها بفاصلة أو مسافة، أو الصق قائمة.</span></div>
  </div>;
 return {button,panel,match:(i:RollItem)=>passesRollRules(i,rules)};
}
// The roll's own fields, each a drop-down of the values in the chosen period: the report title, the client, code,
// court, case status, assigned staff, last procedure and its type and date, completion state, category and order.
const ROLL_PICKS:RollField[]=['client','code','court','status','staff','decision','kind','progress','category'];
function useRollFields(items:RollItem[]){
 const [open,setOpen]=useState(false),[picked,setPicked]=useState<Partial<Record<RollField,string>>>({}),[procFrom,setProcFrom]=useState(''),[procTo,setProcTo]=useState(''),[sort,setSort]=useState<RollSort>('date'),[title,setTitle]=useState('');
 const set=Object.values(picked).filter(Boolean).length+(procFrom||procTo?1:0)+(sort!=='date'?1:0)+(title.trim()?1:0);
 const label=(f:RollField)=>ROLL_FIELDS.find(x=>x[0]===f)?.[1]||f;
 const match=(i:RollItem)=>ROLL_PICKS.every(f=>!picked[f]||normalizeSearch(rollValue(i,f).trim())===normalizeSearch(picked[f]!))
  &&(!procFrom&&!procTo||(()=>{const d=String(i.last?.date||'').slice(0,10);return !!d&&(!procFrom||d>=procFrom)&&(!procTo||d<=procTo)})());
 const button=<button type="button" className={'btn roll-fields-toggle'+(set?' primary':'')} aria-expanded={open} onClick={()=>setOpen(o=>!o)}>{open?'عرض حقول أقل':'عرض حقول أكثر'}{set?` (${set})`:''}</button>;
 const panel=open&&<div className="roll-fields" role="group" aria-label="حقول الرول">
  <label className="field roll-title-field"><span>عنوان التقرير</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="رول الجلسات"/></label>
  {ROLL_PICKS.map(f=><label key={f} className="field"><span>{label(f)}</span><SelectList aria-label={label(f)} value={picked[f]||''} onChange={e=>setPicked(v=>({...v,[f]:e.target.value}))}><option value="">الكل</option>{rollOptions(items,f).map(v=><option key={v} value={v}>{v}</option>)}</SelectList></label>)}
  <DateField label="تاريخ الإجراء (من)" value={procFrom} onChange={setProcFrom}/><DateField label="تاريخ الإجراء (إلى)" value={procTo} onChange={setProcTo}/>
  <label className="field"><span>ترتيب القضايا في الرول</span><SelectList aria-label="ترتيب القضايا في الرول" value={sort} onChange={e=>setSort(e.target.value as RollSort)}>{ROLL_SORTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</SelectList></label>
  {set>0&&<button type="button" className="text-link roll-fields-clear" onClick={()=>{setPicked({});setProcFrom('');setProcTo('');setSort('date');setTitle('')}}>مسح الحقول</button>}
 </div>;
 return {button,panel,match,sort,title:title.trim()};
}
/** The facts printed for one sitting on the sessions roll, laid out like the office's long-standing roll. */
function rollFacts(r:{c:CaseRecord;date:string;time:string;court:string;venue:string;last?:{date?:unknown;decision?:unknown};required:string;staff?:string}):[string,string,string?][]{
 const c=r.c,sameAsCase=!r.court||r.court===c.court,circuit=splitCircuit(sameAsCase?'':r.court);
 const courthouse=String(c.court||'')+(r.venue&&r.venue!=='المحكمة'?' · '+r.venue:'');
 return [
  ['المحكمة',courthouse||'—'],['الدائرة',circuit.kind||(sameAsCase?'':r.court)||'—'],['رقم الدائرة',circuit.number||'—'],['الغرفة',circuit.room||'—'],['الدور',circuit.floor||'—'],
  ['درجة القضية',LEVEL_TITLE[currentLevel(c)]],['الرقم الآلي',String(c.autoNumber||'')],['رقم القضية',String(c.caseNumber||'')],
  ['نوع القضية',circuit.kind.split(' ')[0]||'—'],['حالة القضية',caseState(c).status],['الموضوع',String(c.subject||'—')],
  ['الجلسة السابقة',r.last?.date?formatDate(String(r.last.date)):'—',String(r.last?.decision||'')],['تاريخ الجلسة',formatDate(r.date),r.time||''],['الجلسة القادمة',ROLL_BLANK],
  ['المطلوب',r.required],...(r.staff?[['المكلف بالحضور',r.staff] as [string,string]]:[]),
 ];
}
function Roll(p:Props){
 const [from,setFrom]=useState(todayISO()),[to,setTo]=useState(shiftDays(todayISO(),6)),law=useLawyerFilter(p.records);
 // Who attends each sitting, from the hearing assigned in «المهام والجلسات».
 const staffOf=(c:CaseRecord,date:string)=>{const w=p.work.find(x=>x.caseId===c.id&&x.kind==='hearing'&&x.dueDate===date&&x.status!=='cancelled'),m=w?.assigneeId?p.members.find(x=>x.id===w.assigneeId):undefined;return attendsCourt(m)?m!.displayName||m!.username:''};
 const today=todayISO();
 const inRange=sittingsBetween(p.records,from,to||from).filter(s=>law.match(s.c)).map(s=>({...s,staff:staffOf(s.c,s.date),today}));
 const fields=useRollFields(inRange),adv=useRollRules(inRange);
 const rows=sortRoll(inRange.filter(r=>fields.match(r)&&adv.match(r)),fields.sort);
 const days=[...new Set(rows.map(r=>r.date))].sort();
 // Laid out like «رول الأحكام»: what is previewed is what prints, each sitting a band with every value under its name.
 const html=rollCardsHtml(fields.title||'رول الجلسات',`من ${formatDate(from)} إلى ${formatDate(to||from)}`,days.map(d=>[formatDate(d),rows.filter(r=>r.date===d).map(r=>({code:ref(r.c),client:clientName(r.c)||'—',role:String(r.c.role||''),opponent:r.c.opponent||'—',lawyer:String(r.c.lawyer||''),
  // Every detail the office's printed roll has always carried: the courthouse, the circuit and its number, hall and
  // floor, the case's level, kind and status, its subject, and the previous sitting with the decision taken there.
  facts:rollFacts(r) as [string,string,string?][],
  writeIn:['قرار الجلسة','منطوق الحكم']}))]),formatDate(todayISO()),p.printedBy,true,'جلسة');
 return <Panel title="مواعيد الجلسات (رول)" note="الجلسات القادمة حسب آخر ترحيل لكل قضية، مجمعة باليوم.">
  <div className="roll-top desk-roll-top"><div className="desk-toolbar"><DateField label="تاريخ الجلسة (من)" value={from} onChange={setFrom}/><DateField label="تاريخ الجلسة (إلى)" value={to} onChange={setTo}/>{law.select}{fields.button}{adv.button}</div>
   <div className="roll-count" role="status"><b>{rows.length}</b><span>جلسة ستُطبع</span></div></div>
  {fields.panel}{adv.panel}
  {!rows.length?<Empty title="لا جلسات في هذه الفترة"/>:<iframe className="roll-preview" title="معاينة رول الجلسات" sandbox="" srcDoc={html}/>}
  <div className="actions roll-actions">{p.canExport?<button className="btn primary" disabled={!rows.length} onClick={()=>{if(!printHtml(html))toast.error('اسمح بالنوافذ المنبثقة للطباعة.')}}><Printer size={15}/> طباعة الرول ({rows.length})</button>:<p className="subtitle">الطباعة غير متاحة لحسابك؛ اطلبها من مسؤول المكتب.</p>}</div>
 </Panel>;
}
function Followup(p:Props){
 const today=todayISO(),[span,setSpan]=useState('14'),law=useLawyerFilter(p.records);
 const rows=sittingsBetween(p.records,today,shiftDays(today,Number(span))).filter(s=>law.match(s.c));
 const assigned=(c:CaseRecord,date:string)=>p.work.find(w=>w.caseId===c.id&&w.kind==='hearing'&&w.dueDate===date&&w.status!=='cancelled');
 const who=(w?:WorkItem)=>{const m=w?.assigneeId?p.members.find(x=>x.id===w.assigneeId):undefined;return attendsCourt(m)?m!.displayName||m!.username:''};
 const unassigned=rows.filter(r=>!who(assigned(r.c,r.date))).length;
 return <Panel title="متابعة الجلسات" note="ما طلبته المحكمة في الجلسة السابقة ومن يحضر كل جلسة. يُسند الحضور من «المهام والجلسات».">
  <div className="desk-toolbar"><OfficeSelect label="الفترة" value={span} onChange={setSpan} options={[['7','الأسبوع القادم'],['14','أسبوعان'],['30','شهر']]}/>{law.select}<span className="tag">{rows.length} جلسة</span>{unassigned>0&&<span className="tag amber">{unassigned} دون مكلف بالحضور</span>}</div>
  {!rows.length?<Empty title="لا جلسات قادمة في هذه الفترة"/>:<div className="table-wrap"><table className="office-table"><thead><tr><th>الموعد</th><th>القضية</th><th>المحكمة</th><th>المطلوب للجلسة</th><th>المحامي</th><th>المكلف بالحضور</th><th>متبقٍ</th></tr></thead><tbody>{rows.map(r=>{const w=assigned(r.c,r.date),left=daysBetween(today,r.date);return <tr key={r.c.id}><td className="nowrap">{formatDate(r.date)}{r.time&&<small>{r.time}</small>}</td><td><CaseCell c={r.c} onOpen={p.onOpen}/></td><td>{r.court||'—'}</td><td><b>{r.required}</b>{r.last?.text&&<small>{String(r.last.text)}</small>}</td><td>{String(r.c.lawyer||'—')}</td><td>{who(w)||<span className="tag amber">غير مُسند</span>}</td><td><span className={'tag '+(left!==null&&left<=1?'red':left!==null&&left<=3?'amber':'')}>{left===0?'اليوم':left===1?'غداً':`${left} يوم`}</span></td></tr>})}</tbody></table></div>}
 </Panel>;
}
function Statements(p:Props){
 const [by,setBy]=useState<'client'|'lawyer'|'court'>('client'),[value,setValue]=useState(''),[open,setOpen]=useState(true);
 const keyOf=(c:CaseRecord)=>by==='client'?clientName(c)||'':by==='lawyer'?String(c.lawyer||''):String(c.court||'');
 const values=[...new Set(p.records.map(keyOf).map(s=>s.trim()).filter(Boolean))].sort();
 const rows=value?p.records.filter(c=>keyOf(c).trim()===value&&(!open||!c.archived)):[];
 const line=(c:CaseRecord)=>{const l=lastSitting(c);return [ref(c),String(c.caseNumber||''),parties(c),String(c.court||''),String(l?.decision||l?.text||''),formatDate(nextSitting(c)),c.date?`${c.type} ${formatDate(c.date)} — ${c.outcome}`:'لم يصدر']};
 const headers=['القضية','رقم القضية','الأطراف','المحكمة','آخر قرار','الجلسة القادمة','الحكم'];
 const label={client:'الموكل',lawyer:'المحامي',court:'المحكمة'}[by];
 return <Panel title="كشوف القضايا" note="كشف بقضايا موكل أو محامٍ أو محكمة: آخر قرار، الجلسة القادمة والحكم. يصلح للإرسال إلى الموكل."
  actions={p.canExport&&!!rows.length&&<button className="btn" onClick={()=>print(p.canExport,`كشف قضايا ${label}: ${value}`,`${rows.length} قضية${open?' مفتوحة':''}`,headers,rows.map(line),p.printedBy,[8,9,24,12,16,9,18])}><Printer size={15}/> طباعة الكشف</button>}>
  <div className="desk-toolbar"><OfficeSelect label="الكشف حسب" value={by} onChange={v=>{setBy(v as typeof by);setValue('')}} options={[['client','الموكل'],['lawyer','المحامي'],['court','المحكمة']]}/><OfficeSelect label={label} value={value} onChange={setValue} options={[['','اختر'],...values.map(v=>[v,v] as [string,string])]}/><label className="checkbox-line"><input type="checkbox" checked={open} onChange={e=>setOpen(e.target.checked)}/> القضايا المفتوحة فقط</label></div>
  {!value?<Empty title={`اختر ${label}`} text="يظهر الكشف هنا ويمكن طباعته."/>:!rows.length?<Empty/>:<div className="table-wrap"><table className="office-table"><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(c=><tr key={c.id}>{line(c).map((v,i)=><td key={i}>{i===0?<CaseCell c={c} onOpen={p.onOpen}/>:v||'—'}</td>)}</tr>)}</tbody></table></div>}
 </Panel>;
}

type Consultation={type:string;subject:string;requester:string;status:ConsultationStatus;receivedDate:string;dueDate:string;answer:string;fee:string};
const consultationOf=(c:CaseRecord):Consultation=>({type:'',subject:'',requester:'',status:'new',receivedDate:'',dueDate:'',answer:'',fee:'',...(c.consultation as Partial<Consultation>||{})});
/** The lawyers of a list as a tile's parts (the four with most cases, then those without one), each picking out its cases. */
function lawyerParts(rs:CaseRecord[],on:string,set:(v:string)=>void):PulsePart[]{
 const l=(c:CaseRecord)=>String(c.lawyer||'').trim(),counts=[...new Set(rs.map(l).filter(Boolean))].map(n=>[n,rs.filter(c=>l(c)===n).length] as const).sort((a,b)=>b[1]-a[1]),tones=['brand','blue','amber','green'] as const,none=rs.filter(c=>!l(c)).length;
 return [...counts.slice(0,4).map(([n,v],k)=>({label:n,value:v,tone:tones[k],on:on===n,onClick:()=>set(on===n?'':n)})),...(none?[{label:'بلا محامٍ',value:none,tone:'red' as const,on:on==='-',onClick:()=>set(on==='-'?'':'-')}]:[])];
}
const byLawyer=(on:string)=>(c:CaseRecord)=>!on||(on==='-'?!String(c.lawyer||'').trim():String(c.lawyer||'').trim()===on);
const WHEN_PARTS:[When,string,PulsePart['tone']][]=[['late','فات موعده','red'],['today','اليوم','amber'],['week','خلال أسبوع','blue'],['later','لاحقاً','green'],['none','بلا موعد','grey']];
function CaseLineCell({c}:{c:CaseRecord}){return <span><b className="nowrap">{ref(c)}</b> <small className="muted">{parties(c)}</small></span>}

function Consultations(p:Props){
 const [editing,setEditing]=useState<CaseRecord|null>(null),[status,setStatus]=useState('open'),[when,setWhen]=useState(''),[lawyer,setLawyer]=useState('');
 const today=todayISO(),label=(s:string)=>CONSULTATION_STATUSES.find(x=>x[0]===s)?.[1]||s;
 const live=p.records.filter(c=>workflowOf(c)==='consultation'&&!c.archived),isOpen=(c:CaseRecord)=>!['answered','closed'].includes(consultationOf(c).status);
 const base=live.filter(c=>status==='all'||(status==='open'?isOpen(c):consultationOf(c).status===status));
 const line=(c:CaseRecord)=>consultationLine(consultationOf(c),String(c.lawyer||'').trim(),today);
 const list=base.filter(c=>(!when||line(c).when===when)&&byLawyer(lawyer)(c));
 return <Panel title="الاستشارات" note="كل استشارة مرتبطة بملف الموكل، ولها موعد رد ومحامٍ مسؤول. الاستشارة التي تتحول إلى دعوى تنتقل إلى «قضايا تحت الدراسة»."
  actions={p.canCreate&&<button className="btn primary" onClick={()=>setEditing({...emptyCase(),workflow:'consultation',type:'',consultation:{status:'new',receivedDate:today}})}><Plus size={16}/> استشارة جديدة</button>}>
  {!!live.length&&<PulseStrip label="ملخص الاستشارات">
   <PulseTile title={status==='all'?'كل الاستشارات':'المفتوحة'} value={status==='all'?live.length:live.filter(isOpen).length} sub={status==='all'?'اضغط للمفتوحة فقط':'اضغط لعرض الكل'} on={status==='all'} onClick={()=>{setStatus(status==='all'?'open':'all');setWhen('')}}
    parts={CONSULTATION_STATUSES.map(([k,l],i)=>({label:l,value:live.filter(c=>consultationOf(c).status===k).length,tone:(['amber','blue','green','grey'] as const)[i],on:status===k,onClick:()=>{setStatus(status===k?'open':k);setWhen('')}}))}/>
   <PulseTile title="موعد الرد" parts={WHEN_PARTS.map(([k,l,t])=>({label:l,value:base.filter(c=>line(c).when===k).length,tone:t,on:when===k,onClick:()=>setWhen(when===k?'':k)}))}/>
   <PulseTile title="المحامي" parts={lawyerParts(base,lawyer,setLawyer)}/>
  </PulseStrip>}
  {!list.length?<Empty title="لا توجد استشارات" text={live.length?'لا استشارات بهذا التصنيف.':p.canCreate?'أضف استشارة جديدة من الزر أعلاه.':'لا توجد استشارات ضمن صلاحيتك.'}/>:<ul className="story-list consult-lines" aria-label="الاستشارات"><li className="story-head" aria-hidden><span>الموكل</span><span>الموضوع</span><span>المحامي</span><span>موعد الرد</span><span>الحالة</span><span>باختصار</span><span/></li>
   {list.map(c=>{const k=consultationOf(c),l=line(c);return <li key={c.id}><div className={'story-row e-'+l.edge}>
    <span><b>{clientName(c)||'—'}</b>{k.requester&&<small className="muted"> · {k.requester}</small>}</span>
    <span>{k.subject||'—'}{k.type&&<small className="muted"> · {k.type}</small>}</span>
    <span>{String(c.lawyer||'—')}</span>
    <span className="story-num">{formatDate(k.dueDate)||'—'}</span>
    <span><span className={'tag '+(k.status==='answered'||k.status==='closed'?'green':l.edge==='red'?'red':'amber')}>{label(k.status)}</span></span>
    <span className="line-story">{l.story}</span>
    <button className="btn" onClick={()=>setEditing(c)}>فتح</button></div></li>})}</ul>}
  {editing&&<ConsultationEditor c={editing} p={p} onClose={()=>setEditing(null)}/>}
 </Panel>;
}
function ConsultationEditor({c,p,onClose}:{c:CaseRecord;p:Props;onClose:()=>void}){
 const [draft,setDraft]=useState(c),[k,setK]=useState(consultationOf(c)),[busy,setBusy]=useState(false);
 const editable=p.canEdit&&(!!c.revision||p.canCreate);
 const setC=(key:string,v:unknown)=>setDraft(d=>({...d,[key]:v}));
 async function save(extra:Partial<CaseRecord>={},message='حُفظت الاستشارة'){
  if(!draft.clientEntityId&&!String(draft.client||'').trim()){toast.error('اختر الموكل.');return}
  if(!k.subject.trim()){toast.error('أدخل موضوع الاستشارة.');return}
  setBusy(true);try{p.onSaved(await saveCase({...draft,code:draft.code||'است-'+draft.id.slice(0,6),opponent:draft.opponent||'',consultation:k,...extra},p.clients));toast.success(message);onClose()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 const pickClient=(id:string)=>{const e=p.clients.find(x=>x.id===id);setDraft(d=>({...d,clientEntityId:id,clientContactId:'',client:e?.name||'',clientGroup:e?.name||''}))};
 return <EditorDialog title={c.revision?'الاستشارة':'استشارة جديدة'} description="بيانات الطلب والرد عليه. تبقى الاستشارات خارج سجل الأحكام والتحليلات." busy={busy} onClose={onClose}>
  <fieldset className="readonly-fields" disabled={!editable||busy}><div className="form-grid">
   <OfficeSelect label="الموكل" value={String(draft.clientEntityId||'')} onChange={pickClient} options={[['','اختر الموكل'],...p.clients.map(e=>[e.id,e.name] as [string,string])]}/>
   <Field label="مقدم الطلب لدى الموكل" value={k.requester} onChange={v=>setK({...k,requester:v})}/>
   <Field label="موضوع الاستشارة" value={k.subject} onChange={v=>setK({...k,subject:v})} wide/>
   <OfficeSelect label="نوع الاستشارة" value={k.type} onChange={v=>setK({...k,type:v})} options={[['','اختر'],...CONSULTATION_TYPES.map(t=>[t,t] as [string,string])]}/>
   <Field label="المحامي المسؤول" value={String(draft.lawyer||'')} onChange={v=>setC('lawyer',v)} suggestions={lawyersOf(p.records)}/>
   <DateField label="تاريخ الورود" value={k.receivedDate} onChange={v=>setK({...k,receivedDate:v})}/>
   <DateField label="موعد الرد" value={k.dueDate} onChange={v=>setK({...k,dueDate:v})}/>
   <OfficeSelect label="الحالة" value={k.status} onChange={v=>setK({...k,status:v as ConsultationStatus})} options={CONSULTATION_STATUSES}/>
   <Field label="الأتعاب (د.ك)" value={k.fee} onChange={v=>setK({...k,fee:v})}/>
   <Field label="خلاصة الرد / الرأي" value={k.answer} onChange={v=>setK({...k,answer:v})} multiline wide/>
  </div></fieldset>
  <div className="actions">{editable&&<button className="btn primary" disabled={busy} onClick={()=>void save()}><Save size={15}/> حفظ</button>}
   {editable&&!!c.revision&&<button className="btn" disabled={busy} onClick={()=>{if(window.confirm('تحويل الاستشارة إلى قضية تحت الدراسة؟ تنتقل إلى «قضايا تحت الدراسة» تمهيداً لرفع الدعوى.'))void save({workflow:'study'},'نُقلت إلى قضايا تحت الدراسة')}}><FileSignature size={15}/> تحويل إلى قضية</button>}
   <button className="btn" disabled={busy} onClick={onClose}>إغلاق</button></div>
 </EditorDialog>;
}
function Judgments(p:Props){
 const month=todayISO().slice(0,8),[from,setFrom]=useState(month+'01'),[to,setTo]=useState(todayISO()),[outcome,setOutcome]=useState('');
 const rows=judgmentsBetween(p.records,from,to).filter(j=>!outcome||j.outcome.startsWith(outcome));
 const headers=['تاريخ الحكم','الدرجة','القضية','رقم القضية','الأطراف','المحكمة','النتيجة','المنطوق'];
 const line=(j:typeof rows[number])=>[formatDate(j.date),j.level||'—',ref(j.c),j.caseNumber,parties(j.c),j.court,j.outcome,j.ruling];
 return <Panel title="الأحكام" note="كل حكم صدر في الفترة، بما فيها أحكام الدرجات السابقة المحفوظة في ملف القضية."
  actions={p.canExport&&!!rows.length&&<button className="btn" onClick={()=>print(p.canExport,'الأحكام الصادرة',`من ${formatDate(from)} إلى ${formatDate(to)}`,headers,rows.map(line),p.printedBy,[8,7,7,9,22,12,8,27])}><Printer size={15}/> طباعة</button>}>
  <div className="desk-toolbar"><DateField label="من" value={from} onChange={setFrom}/><DateField label="إلى" value={to} onChange={setTo}/><OfficeSelect label="النتيجة" value={outcome} onChange={setOutcome} options={[['','الكل'],['لصالحنا','لصالحنا'],['غير صالحنا','غير صالحنا']]}/><span className="tag">{rows.length} حكم</span></div>
  {!rows.length?<Empty title="لا أحكام في هذه الفترة"/>:<div className="table-wrap"><table className="office-table"><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(j=><tr key={j.c.id+j.date+j.level}><td className="nowrap">{formatDate(j.date)}</td><td>{j.level||'—'}{!j.current&&<small>درجة سابقة</small>}</td><td><CaseCell c={j.c} onOpen={p.onOpen}/></td><td>{j.caseNumber||'—'}</td><td>{parties(j.c)}</td><td>{j.court||'—'}</td><td><span className={'tag '+(j.outcome.startsWith('لصالحنا')?'green':j.outcome.startsWith('غير')?'red':'')}>{j.outcome||'—'}</span></td><td>{j.ruling||'—'}</td></tr>)}</tbody></table></div>}
 </Panel>;
}
function ContractRow({c,p,today}:{c:CaseRecord;p:Props;today:string}){
 const [number,setNumber]=useState(''),[date,setDate]=useState(''),[busy,setBusy]=useState(false);
 async function save(extra:Partial<CaseRecord>){setBusy(true);try{p.onSaved(await saveCase({...c,...extra},p.clients));toast.success('حُفظ في ملف القضية')}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 const age=ageOf(String(c.date||''),today);
 return <li><div className={'story-row e-'+(age==='older'?'red':age==='quarter'?'amber':'grey')}><CaseLineCell c={c}/><span>{String(c.lawyer||'—')}</span>
  <span className="line-story">{[String(c.court||''),c.date?'الحكم '+sinceAr(String(c.date),today):'بلا تاريخ'].filter(Boolean).join(' · ')}</span>
  {p.canEdit?<span className="contract-form"><input aria-label={'رقم العقد '+ref(c)} value={number} onChange={e=>setNumber(e.target.value)} placeholder="رقم العقد"/><DateField label={'تاريخ العقد '+ref(c)} value={date} onChange={setDate}/>
   <button className="btn primary" disabled={busy||!number.trim()} onClick={()=>void save({contractNumber:number.trim(),contractDate:date})}><CheckCircle2 size={15}/> حفظ العقد</button><button className="btn" disabled={busy} onClick={()=>{if(window.confirm(`القضية ${ref(c)} لا تحتاج عقد أتعاب (مثلاً قضايا مجانية أو ضمن عقد عام)؟`))void save({contractWaived:true})}}>لا يلزم عقد</button></span>
   :<button className="btn" onClick={()=>p.onOpen(c)}>فتح</button>}</div></li>;
}
function NoContract(p:Props){
 const rows=withoutContract(p.records),groups=[...new Set(rows.map(c=>clientName(c)||'بلا موكل'))].sort(),today=todayISO();
 const [client,setClient]=useState(''),[lawyer,setLawyer]=useState(''),[age,setAge]=useState(''),[page,setPage]=useState(1);
 const ofClient=rows.filter(c=>!client||(clientName(c)||'بلا موكل')===client),shown=ofClient.filter(c=>byLawyer(lawyer)(c)&&(!age||ageOf(String(c.date||''),today)===age));
 const top=groups.map(g=>[g,rows.filter(c=>(clientName(c)||'بلا موكل')===g).length] as const).sort((a,b)=>b[1]-a[1]),tones=['brand','blue','amber','green'] as const;
 return <Panel title="القضايا بدون عقود" note="قضايا مفتوحة لم يُسجل لها عقد أتعاب. سجّل رقم العقد هنا أو من ملف القضية، أو علّمها «لا يلزم عقد»."
  actions={p.canExport&&!!shown.length&&<button className="btn" onClick={()=>print(p.canExport,'القضايا بدون عقود',client||'كل الموكلين',['القضية','الأطراف','المحكمة','المحامي'],shown.map(c=>[ref(c),parties(c),String(c.court||''),String(c.lawyer||'')]),p.printedBy,[12,42,26,18])}><Printer size={15}/> طباعة</button>}>
  {!!rows.length&&<PulseStrip label="ملخص القضايا بلا عقود">
   <PulseTile title="الموكلون" value={rows.length} sub="قضية بلا عقد" parts={[...top.slice(0,4).map(([g,n],k)=>({label:g,value:n,tone:tones[k],on:client===g,onClick:()=>setClient(client===g?'':g)})),...(top.length>4?[{label:`${top.length-4} غيرهم`,value:top.slice(4).reduce((a,[,n])=>a+n,0),tone:'grey' as const}]:[])]}/>
   <PulseTile title="منذ الحكم" parts={([['month','خلال شهر','grey'],['quarter','حتى 3 أشهر','amber'],['older','أقدم','red'],['none','بلا تاريخ','grey']] as const).map(([k,l,t])=>({label:l,value:ofClient.filter(c=>ageOf(String(c.date||''),today)===k).length,tone:t,on:age===k,onClick:()=>setAge(age===k?'':k)}))}/>
   <PulseTile title="المحامي" parts={lawyerParts(ofClient,lawyer,setLawyer)}/>
  </PulseStrip>}
  <div className="desk-toolbar"><OfficeSelect label="الموكل" value={client} onChange={setClient} options={[['',`كل الموكلين (${groups.length})`],...groups.map(g=>[g,`${g} (${rows.filter(c=>(clientName(c)||'بلا موكل')===g).length})`] as [string,string])]}/><span className="tag amber">{shown.length} قضية بلا عقد</span></div>
  {!shown.length?<Empty title={rows.length?'لا قضايا بهذا التصنيف':'كل القضايا لها عقود'} text={rows.length?'اضغط التصنيف المختار مرة أخرى لإلغائه.':'لا توجد قضايا مفتوحة بلا عقد أتعاب.'}/>:<><ul className={'story-list contract-lines'+(p.canEdit?' can-edit':'')} aria-label="القضايا بدون عقود"><li className="story-head" aria-hidden><span>القضية</span><span>المحامي</span><span>باختصار</span><span>{p.canEdit?'العقد':''}</span></li>{shown.slice((Math.min(page,Math.ceil(shown.length/25))-1)*25,Math.min(page,Math.ceil(shown.length/25))*25).map(c=><ContractRow key={c.id} c={c} p={p} today={today}/>)}</ul><PageNavigation page={Math.min(page,Math.ceil(shown.length/25))} pages={Math.ceil(shown.length/25)} total={shown.length} onChange={setPage}/></>}
 </Panel>;
}
function FileDialog({c,p,onClose}:{c:CaseRecord;p:Props;onClose:()=>void}){
 const [caseNumber,setCaseNumber]=useState(String(c.caseNumber||'')),[autoNumber,setAutoNumber]=useState(String(c.autoNumber||'')),[court,setCourt]=useState(String(c.court||'')),[filed,setFiled]=useState(todayISO()),[first,setFirst]=useState(''),[busy,setBusy]=useState(false);
 async function file(){
  if(!first){toast.error('أدخل موعد الجلسة الأولى.');return}
  setBusy(true);try{const proc={id:crypto.randomUUID(),date:filed,kind:'قيد الدعوى',court,text:'قيد الدعوى'+(caseNumber?' رقم '+caseNumber:''),followup:first,recordedBy:p.printedBy,source:'إدخال يدوي'};
   p.onSaved(await saveCase({...c,workflow:'',caseNumber,autoNumber,court,procedures:[...c.procedures,proc]},p.clients));toast.success(`قُيدت الدعوى ${ref(c)} وأُضيفت الجلسة الأولى إلى الرول`);onClose()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 return <EditorDialog title={'قيد الدعوى '+ref(c)} description="بعد القيد تنتقل القضية إلى سجل القضايا، وتظهر جلستها الأولى في الرول وترحيل الجلسات." busy={busy} onClose={onClose}>
  <div className="form-grid"><Field label="رقم القضية" value={caseNumber} onChange={setCaseNumber}/><Field label="الرقم الآلي" value={autoNumber} onChange={setAutoNumber}/><Field label="المحكمة" value={court} onChange={setCourt}/><DateField label="تاريخ القيد" value={filed} onChange={setFiled}/><DateField label="موعد الجلسة الأولى" value={first} onChange={setFirst}/></div>
  <div className="actions"><button className="btn primary" disabled={busy} onClick={()=>void file()}><FileSignature size={15}/> قيد الدعوى</button><button className="btn" disabled={busy} onClick={onClose}>إلغاء</button></div>
 </EditorDialog>;
}
function Study(p:Props){
 const list=p.records.filter(c=>workflowOf(c)==='study'&&!c.archived),[filing,setFiling]=useState<CaseRecord|null>(null),[lawyer,setLawyer]=useState(''),[age,setAge]=useState(''),today=todayISO();
 const since=(c:CaseRecord)=>consultationOf(c).receivedDate||'',shown=list.filter(c=>byLawyer(lawyer)(c)&&(!age||ageOf(since(c),today)===age));
 return <Panel title="قضايا تحت الدراسة" note="قضايا يدرسها المكتب قبل رفعها: الوقائع والمستندات والرأي. عند القيد تنتقل إلى سجل القضايا بجلستها الأولى."
  actions={p.canCreate&&<button className="btn primary" onClick={()=>p.onNew({...emptyCase(),workflow:'study',type:'',outcome:''})}><Plus size={16}/> قضية تحت الدراسة</button>}>
  {!!list.length&&<PulseStrip label="ملخص القضايا تحت الدراسة">
   <PulseTile title="منذ متى تُدرس" value={list.length} sub="قضية تحت الدراسة" parts={([['month','خلال شهر','green'],['quarter','حتى 3 أشهر','amber'],['older','أقدم','red'],['none','بلا تاريخ','grey']] as const).map(([k,l,t])=>({label:l,value:list.filter(c=>ageOf(since(c),today)===k).length,tone:t,on:age===k,onClick:()=>setAge(age===k?'':k)}))}/>
   <PulseTile title="المحامي" parts={lawyerParts(list,lawyer,setLawyer)}/>
  </PulseStrip>}
  {!shown.length?<Empty title={list.length?'لا قضايا بهذا التصنيف':'لا توجد قضايا تحت الدراسة'} text={list.length?'اضغط التصنيف المختار مرة أخرى لإلغائه.':'أضف قضية للدراسة، أو حوّل استشارة إلى قضية.'}/>:<ul className="story-list study-lines" aria-label="قضايا تحت الدراسة"><li className="story-head" aria-hidden><span>القضية</span><span>الموضوع</span><span>المحامي</span><span>باختصار</span><span/></li>
   {shown.map(c=>{const k=consultationOf(c),a=ageOf(since(c),today);return <li key={c.id}><div className={'story-row e-'+(a==='older'?'red':a==='quarter'?'amber':a==='month'?'green':'grey')}><CaseLineCell c={c}/>
    <span>{String(c.subject||k.subject||'—')}</span><span>{String(c.lawyer||'—')}</span>
    <span className="line-story">{[since(c)?'تُدرس '+sinceAr(since(c),today):'بلا تاريخ ورود',String(c.lawyer||'').trim()?'':'بلا محامٍ مسؤول'].filter(Boolean).join(' · ')}</span>
    <span className="row-actions"><button className="btn" onClick={()=>p.onOpen(c)}>فتح</button>{p.canEdit&&<button className="btn primary" onClick={()=>setFiling(c)}><FileSignature size={15}/> قيد الدعوى</button>}</span></div></li>})}</ul>}
  {filing&&<FileDialog c={filing} p={p} onClose={()=>setFiling(null)}/>}
 </Panel>;
}
function Stayed(p:Props){
 const today=todayISO(),[reason,setReason]=useState(''),[when,setWhen]=useState(''),[lawyer,setLawyer]=useState('');
 const rows=p.records.map(c=>({c,s:stayOf(c)})).filter((r):r is {c:CaseRecord;s:NonNullable<ReturnType<typeof stayOf>>}=>!!r.s).sort((a,b)=>(a.s.since||'').localeCompare(b.s.since||''));
 const kind=(s:{reason:string;manual:boolean})=>s.manual?'إيقاف يدوي':s.reason.startsWith('شطب')?'شطب':s.reason.startsWith('وقف')?'وقف':'انقطاع سير الخصومة';
 const line=(r:{s:NonNullable<ReturnType<typeof stayOf>>})=>stayLine(r.s,renewalDeadline(r.s),today);
 const shown=rows.filter(r=>(!reason||kind(r.s)===reason)&&(!when||line(r).when===when)&&byLawyer(lawyer)(r.c));
 const kinds=[...new Set(rows.map(r=>kind(r.s)))];
 return <Panel title="القضايا الموقوفة" note="قضايا موقوفة أو مشطوبة حسب آخر جلسة، أو موقوفة يدوياً من ملف القضية. المشطوبة تُجدَّد عادة خلال 60 يوماً من الشطب؛ التاريخ أدناه للتذكير ويؤكده المحامي."
  actions={p.canExport&&!!shown.length&&<button className="btn" onClick={()=>print(p.canExport,'القضايا الموقوفة',formatDate(today),['القضية','الأطراف','السبب','منذ','موعد التجديد','المحامي'],shown.map(r=>[ref(r.c),parties(r.c),r.s.reason,formatDate(r.s.since),formatDate(renewalDeadline(r.s)),String(r.c.lawyer||'')]),p.printedBy,[9,30,18,9,10,14])}><Printer size={15}/> طباعة</button>}>
  {!!rows.length&&<PulseStrip label="ملخص القضايا الموقوفة">
   <PulseTile title="السبب" value={rows.length} sub="قضية موقوفة أو مشطوبة" parts={kinds.map((k,i)=>({label:k,value:rows.filter(r=>kind(r.s)===k).length,tone:(['red','amber','blue','grey'] as const)[i%4],on:reason===k,onClick:()=>setReason(reason===k?'':k)}))}/>
   <PulseTile title="موعد التجديد" parts={WHEN_PARTS.map(([k,l,t])=>({label:k==='none'?'لا يلزم موعد':l,value:rows.filter(r=>line(r).when===k).length,tone:t,on:when===k,onClick:()=>setWhen(when===k?'':k)}))}/>
   <PulseTile title="المحامي" parts={lawyerParts(rows.map(r=>r.c),lawyer,setLawyer)}/>
  </PulseStrip>}
  {!shown.length?<Empty title={rows.length?'لا قضايا بهذا التصنيف':'لا توجد قضايا موقوفة'}/>:<ul className="story-list stayed-lines" aria-label="القضايا الموقوفة"><li className="story-head" aria-hidden><span>القضية</span><span>السبب</span><span>التجديد قبل</span><span>المحامي</span><span>باختصار</span><span/></li>
   {shown.map(r=>{const {c,s}=r,l=line(r),due=renewalDeadline(s);return <li key={c.id}><div className={'story-row e-'+l.edge}><CaseLineCell c={c}/>
    <span>{s.reason}</span><span className="story-num">{due?formatDate(due):'—'}</span><span>{String(c.lawyer||'—')}</span>
    <span className="line-story">{l.story}</span>
    <button className="btn" onClick={()=>p.onOpen(c)}><ArrowUpLeft size={15}/> فتح</button></div></li>})}</ul>}
 </Panel>;
}
