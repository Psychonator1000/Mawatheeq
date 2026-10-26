import {createContext,useContext,useMemo,useState} from 'react';
import {Printer,Plus,Save,ArrowUpLeft,AlertTriangle,FileSignature,CheckCircle2} from 'lucide-react';
import {toast} from 'sonner';
import {type CaseRecord,emptyCase,formatDate,todayISO,daysBetween} from '@/lib/domain';
import {type ClientEntity,clientName,enrichCase} from '@/lib/clients';
import {DECISIONS,EXPERT_DECISIONS,sessionProcedure,type Venue} from '@/lib/sessions';
import {type DeskPage,CONSULTATION_STATUSES,CONSULTATION_TYPES,POSTING_ERRORS,dueForPosting,judgmentsBetween,lastSitting,nextSitting,postingErrors,renewalDeadline,shiftDays,sittingsBetween,stayOf,withoutContract,workflowOf,type ConsultationStatus} from '@/lib/case-desk';
import {judgmentRollHtml,printHtml,rollCardsHtml} from '@/lib/print';
import {Field,DateField,Empty,api} from './shared';
import {OfficeSelect} from './office-shared';
import {EditorDialog} from './departments/shared';
import type {Member,WorkItem} from '@/lib/office';
import {SelectList} from './filter-select';

type Props={page:DeskPage;records:CaseRecord[];clients:ClientEntity[];work:WorkItem[];members:Member[];canEdit:boolean;canCreate:boolean;canExport:boolean;printedBy:string;
 onOpen:(c:CaseRecord)=>void;onSaved:(c:CaseRecord)=>void;onNew:(c:CaseRecord)=>void;
 /** Shown inside a window that already carries the title and description. */
 bare?:boolean};
const Bare=createContext(false);

async function saveCase(c:CaseRecord,clients:ClientEntity[]){const d=await api('/api/cases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({case:c})});return enrichCase(d.case,clients)}
const ref=(c:CaseRecord)=>c.code||c.autoNumber||'بلا كود';
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
 const [kind,setKind]=useState('');
 const shown=rows.filter(r=>!kind||r.e.kind===kind),missed=shown.filter(r=>r.e.kind==='notPosted'||r.e.kind==='judgmentPending');
 return <Panel title="أخطاء الترحيل" note="تُكتشف تلقائياً من سجل الجلسات. الجلسات الفائتة تُرحّل هنا مباشرة؛ الأخطاء الأخرى تُصحح من ملف القضية.">
  <div className="status-chips">{[['','الكل'] as [string,string],...Object.entries(POSTING_ERRORS)].map(([k,l])=>{const n=rows.filter(r=>!k||r.e.kind===k).length;return (n||!k)&&<button type="button" key={k||'all'} className={'chip'+(kind===k?' on':'')} onClick={()=>setKind(k)}>{l} <b>{n}</b></button>})}</div>
  {!shown.length?<Empty title="لا أخطاء في الترحيل" text="كل الجلسات مرحّلة بمواعيد صحيحة."/>:<>
   {!!missed.length&&<><h3 className="desk-sub">جلسات فائتة لم تُرحَّل ({missed.length})</h3><PostTable rows={missed.map(r=>({c:r.c,date:r.e.date}))} p={p}/></>}
   {shown.length>missed.length&&<><h3 className="desk-sub">أخطاء تحتاج تصحيحاً في ملف القضية</h3><div className="table-wrap"><table className="office-table"><thead><tr><th>القضية</th><th>الخطأ</th><th>التاريخ</th><th/></tr></thead><tbody>{shown.filter(r=>!missed.includes(r)).map(r=><tr key={r.c.id+r.e.kind}><td><CaseCell c={r.c} onOpen={p.onOpen}/></td><td><span className="tag amber"><AlertTriangle size={13}/> {r.e.label}</span></td><td className="nowrap">{formatDate(r.e.date)}</td><td><button className="btn" onClick={()=>p.onOpen(r.c)}><ArrowUpLeft size={15}/> فتح القضية</button></td></tr>)}</tbody></table></div></>}
  </>}
 </Panel>;
}
function useLawyerFilter(records:CaseRecord[]){const [lawyer,setLawyer]=useState('');const options=lawyersOf(records);return {lawyer,match:(c:CaseRecord)=>!lawyer||String(c.lawyer||'').trim()===lawyer,select:options.length>0&&<OfficeSelect label="المستشار" value={lawyer} onChange={setLawyer} options={[['','كل المستشارين'],...options.map(l=>[l,l] as [string,string])]}/>}}
function Roll(p:Props){
 const [from,setFrom]=useState(todayISO()),[to,setTo]=useState(shiftDays(todayISO(),6)),law=useLawyerFilter(p.records);
 const rows=sittingsBetween(p.records,from,to||from).filter(s=>law.match(s.c));
 const days=[...new Set(rows.map(r=>r.date))];
 // Laid out like «رول الأحكام»: what is previewed is what prints, each sitting a band with every value under its name.
 const html=rollCardsHtml('رول الجلسات',`من ${formatDate(from)} إلى ${formatDate(to||from)}`,days.map(d=>[formatDate(d),rows.filter(r=>r.date===d).map(r=>({code:ref(r.c),client:clientName(r.c)||'—',role:String(r.c.role||''),opponent:r.c.opponent||'—',lawyer:String(r.c.lawyer||''),
  facts:[['الساعة',r.time||'—'],['المحكمة',r.court||'—',r.venue!=='المحكمة'?r.venue:''],['الرقم الآلي',String(r.c.autoNumber||'')],['رقم القضية',String(r.c.caseNumber||'')],['آخر قرار',String(r.last?.decision||'')],['المطلوب',r.required]] as [string,string,string?][],
  writeIn:['قرار الجلسة','الجلسة القادمة']}))]),formatDate(todayISO()),p.printedBy,true,'جلسة');
 return <Panel title="مواعيد الجلسات (رول)" note="الجلسات القادمة حسب آخر ترحيل لكل قضية، مجمعة باليوم.">
  <div className="roll-top desk-roll-top"><div className="desk-toolbar"><DateField label="من" value={from} onChange={setFrom}/><DateField label="إلى" value={to} onChange={setTo}/>{law.select}</div>
   <div className="roll-count" role="status"><b>{rows.length}</b><span>جلسة ستُطبع</span></div></div>
  {!rows.length?<Empty title="لا جلسات في هذه الفترة"/>:<iframe className="roll-preview" title="معاينة رول الجلسات" sandbox="" srcDoc={html}/>}
  <div className="actions roll-actions">{p.canExport?<button className="btn primary" disabled={!rows.length} onClick={()=>{if(!printHtml(html))toast.error('اسمح بالنوافذ المنبثقة للطباعة.')}}><Printer size={15}/> طباعة الرول ({rows.length})</button>:<p className="subtitle">الطباعة غير متاحة لحسابك؛ اطلبها من مسؤول المكتب.</p>}</div>
 </Panel>;
}
function Followup(p:Props){
 const today=todayISO(),[span,setSpan]=useState('14'),law=useLawyerFilter(p.records);
 const rows=sittingsBetween(p.records,today,shiftDays(today,Number(span))).filter(s=>law.match(s.c));
 const assigned=(c:CaseRecord,date:string)=>p.work.find(w=>w.caseId===c.id&&w.kind==='hearing'&&w.dueDate===date&&w.status!=='cancelled');
 const who=(w?:WorkItem)=>{const m=w?.assigneeId?p.members.find(x=>x.id===w.assigneeId):undefined;return m?m.displayName||m.username:''};
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
function Consultations(p:Props){
 const [editing,setEditing]=useState<CaseRecord|null>(null),[status,setStatus]=useState('open');
 const list=p.records.filter(c=>workflowOf(c)==='consultation'&&!c.archived&&(status==='all'||(status==='open'?!['answered','closed'].includes(consultationOf(c).status):consultationOf(c).status===status)));
 const today=todayISO(),label=(s:string)=>CONSULTATION_STATUSES.find(x=>x[0]===s)?.[1]||s;
 return <Panel title="الاستشارات" note="كل استشارة مرتبطة بملف الموكل، ولها موعد رد ومحامٍ مسؤول. الاستشارة التي تتحول إلى دعوى تنتقل إلى «قضايا تحت الدراسة»."
  actions={p.canCreate&&<button className="btn primary" onClick={()=>setEditing({...emptyCase(),workflow:'consultation',type:'',consultation:{status:'new',receivedDate:today}})}><Plus size={16}/> استشارة جديدة</button>}>
  <div className="desk-toolbar"><OfficeSelect label="الحالة" value={status} onChange={setStatus} options={[['open','المفتوحة'],...CONSULTATION_STATUSES,['all','الكل']] as [string,string][]}/><span className="tag">{list.length} استشارة</span></div>
  {!list.length?<Empty title="لا توجد استشارات" text={p.canCreate?'أضف استشارة جديدة من الزر أعلاه.':'لا توجد استشارات ضمن صلاحيتك.'}/>:<div className="table-wrap"><table className="office-table"><thead><tr><th>الموكل</th><th>الموضوع</th><th>النوع</th><th>المحامي</th><th>الورود</th><th>موعد الرد</th><th>الحالة</th><th/></tr></thead><tbody>{list.map(c=>{const k=consultationOf(c),late=k.dueDate&&k.dueDate<today&&!['answered','closed'].includes(k.status);return <tr key={c.id}><td><b>{clientName(c)||'—'}</b>{k.requester&&<small>{k.requester}</small>}</td><td>{k.subject||'—'}</td><td>{k.type||'—'}</td><td>{String(c.lawyer||'—')}</td><td className="nowrap">{formatDate(k.receivedDate)}</td><td className="nowrap">{formatDate(k.dueDate)}{late&&<small className="office-alert">متأخرة</small>}</td><td><span className={'tag '+(k.status==='answered'||k.status==='closed'?'green':late?'red':'amber')}>{label(k.status)}</span></td><td><button className="btn" onClick={()=>setEditing(c)}>فتح</button></td></tr>})}</tbody></table></div>}
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
function ContractRow({c,p}:{c:CaseRecord;p:Props}){
 const [number,setNumber]=useState(''),[date,setDate]=useState(''),[busy,setBusy]=useState(false);
 async function save(extra:Partial<CaseRecord>){setBusy(true);try{p.onSaved(await saveCase({...c,...extra},p.clients));toast.success('حُفظ في ملف القضية')}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <tr><td><CaseCell c={c} onOpen={p.onOpen}/></td><td>{String(c.lawyer||'—')}</td><td>{p.canEdit?<input aria-label={'رقم العقد '+ref(c)} value={number} onChange={e=>setNumber(e.target.value)} placeholder="رقم العقد"/>:'—'}</td><td>{p.canEdit&&<DateField label={'تاريخ العقد '+ref(c)} value={date} onChange={setDate}/>}</td>
  <td>{p.canEdit&&<div className="actions"><button className="btn primary" disabled={busy||!number.trim()} onClick={()=>void save({contractNumber:number.trim(),contractDate:date})}><CheckCircle2 size={15}/> حفظ العقد</button><button className="btn" disabled={busy} onClick={()=>{if(window.confirm(`القضية ${ref(c)} لا تحتاج عقد أتعاب (مثلاً قضايا مجانية أو ضمن عقد عام)؟`))void save({contractWaived:true})}}>لا يلزم عقد</button></div>}</td></tr>;
}
function NoContract(p:Props){
 const rows=withoutContract(p.records),groups=[...new Set(rows.map(c=>clientName(c)||'بلا موكل'))].sort();
 const [client,setClient]=useState('');
 const shown=rows.filter(c=>!client||(clientName(c)||'بلا موكل')===client);
 return <Panel title="القضايا بدون عقود" note="قضايا مفتوحة لم يُسجل لها عقد أتعاب. سجّل رقم العقد هنا أو من ملف القضية، أو علّمها «لا يلزم عقد»."
  actions={p.canExport&&!!shown.length&&<button className="btn" onClick={()=>print(p.canExport,'القضايا بدون عقود',client||'كل الموكلين',['القضية','الأطراف','المحكمة','المحامي'],shown.map(c=>[ref(c),parties(c),String(c.court||''),String(c.lawyer||'')]),p.printedBy,[12,42,26,18])}><Printer size={15}/> طباعة</button>}>
  <div className="desk-toolbar"><OfficeSelect label="الموكل" value={client} onChange={setClient} options={[['',`كل الموكلين (${groups.length})`],...groups.map(g=>[g,`${g} (${rows.filter(c=>(clientName(c)||'بلا موكل')===g).length})`] as [string,string])]}/><span className="tag amber">{shown.length} قضية بلا عقد</span></div>
  {!shown.length?<Empty title="كل القضايا لها عقود" text="لا توجد قضايا مفتوحة بلا عقد أتعاب."/>:<div className="table-wrap"><table className="office-table desk-table"><thead><tr><th>القضية</th><th>المحامي</th><th>رقم العقد</th><th>تاريخ العقد</th><th/></tr></thead><tbody>{shown.slice(0,100).map(c=><ContractRow key={c.id} c={c} p={p}/>)}</tbody></table>{shown.length>100&&<p className="subtitle">تُعرض أول 100 قضية؛ اختر موكلاً لتضييق القائمة.</p>}</div>}
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
 const list=p.records.filter(c=>workflowOf(c)==='study'&&!c.archived),[filing,setFiling]=useState<CaseRecord|null>(null);
 return <Panel title="قضايا تحت الدراسة" note="قضايا يدرسها المكتب قبل رفعها: الوقائع والمستندات والرأي. عند القيد تنتقل إلى سجل القضايا بجلستها الأولى."
  actions={p.canCreate&&<button className="btn primary" onClick={()=>p.onNew({...emptyCase(),workflow:'study',type:'',outcome:''})}><Plus size={16}/> قضية تحت الدراسة</button>}>
  {!list.length?<Empty title="لا توجد قضايا تحت الدراسة" text="أضف قضية للدراسة، أو حوّل استشارة إلى قضية."/>:<div className="table-wrap"><table className="office-table"><thead><tr><th>القضية</th><th>الموضوع</th><th>المحامي</th><th>منذ</th><th/></tr></thead><tbody>{list.map(c=>{const k=consultationOf(c);return <tr key={c.id}><td><CaseCell c={c} onOpen={p.onOpen}/></td><td>{String(c.subject||k.subject||'—')}</td><td>{String(c.lawyer||'—')}</td><td className="nowrap">{formatDate(k.receivedDate||'')}</td><td><div className="actions"><button className="btn" onClick={()=>p.onOpen(c)}>فتح</button>{p.canEdit&&<button className="btn primary" onClick={()=>setFiling(c)}><FileSignature size={15}/> قيد الدعوى</button>}</div></td></tr>})}</tbody></table></div>}
  {filing&&<FileDialog c={filing} p={p} onClose={()=>setFiling(null)}/>}
 </Panel>;
}
function Stayed(p:Props){
 const today=todayISO();
 const rows=p.records.map(c=>({c,s:stayOf(c)})).filter((r):r is {c:CaseRecord;s:NonNullable<ReturnType<typeof stayOf>>}=>!!r.s).sort((a,b)=>(a.s.since||'').localeCompare(b.s.since||''));
 return <Panel title="القضايا الموقوفة" note="قضايا موقوفة أو مشطوبة حسب آخر جلسة، أو موقوفة يدوياً من ملف القضية. المشطوبة تُجدَّد عادة خلال 60 يوماً من الشطب؛ التاريخ أدناه للتذكير ويؤكده المحامي."
  actions={p.canExport&&!!rows.length&&<button className="btn" onClick={()=>print(p.canExport,'القضايا الموقوفة',formatDate(today),['القضية','الأطراف','السبب','منذ','موعد التجديد','المحامي'],rows.map(r=>[ref(r.c),parties(r.c),r.s.reason,formatDate(r.s.since),formatDate(renewalDeadline(r.s)),String(r.c.lawyer||'')]),p.printedBy,[9,30,18,9,10,14])}><Printer size={15}/> طباعة</button>}>
  {!rows.length?<Empty title="لا توجد قضايا موقوفة"/>:<div className="table-wrap"><table className="office-table"><thead><tr><th>القضية</th><th>السبب</th><th>منذ</th><th>التجديد قبل</th><th>المحامي</th><th/></tr></thead><tbody>{rows.map(({c,s})=>{const due=renewalDeadline(s),left=due?daysBetween(today,due):null;return <tr key={c.id}><td><CaseCell c={c} onOpen={p.onOpen}/></td><td>{s.reason}{s.manual&&<small>إيقاف يدوي</small>}</td><td className="nowrap">{formatDate(s.since)}</td><td className="nowrap">{due?<>{formatDate(due)} <span className={'tag '+(left!==null&&left<0?'red':left!==null&&left<=14?'amber':'')}>{left!==null&&left<0?`فات منذ ${-left} يوم`:`${left} يوم`}</span></>:'—'}</td><td>{String(c.lawyer||'—')}</td><td><button className="btn" onClick={()=>p.onOpen(c)}><ArrowUpLeft size={15}/> فتح</button></td></tr>})}</tbody></table></div>}
 </Panel>;
}
