import {useEffect,useMemo,useRef,useState} from 'react';
import {ChevronRight,ChevronLeft,Check,Save,Send,Printer,Copy,Plus,X,ArrowUpLeft,LoaderCircle,Gavel,ListChecks,CalendarClock,Hourglass} from 'lucide-react';
import {toast} from 'sonner';
import {type CaseRecord,type Rules,caseCode,formatDate,todayISO} from '@/lib/domain';
import {type ClientEntity,enrichCase} from '@/lib/clients';
import {DECISIONS,EXPERT_DECISIONS,sessionProcedure,type Venue} from '@/lib/sessions';
import {lastSitting,shiftDays} from '@/lib/case-desk';
import {type Member,type WorkItem} from '@/lib/office';
import {dailyRequest,officeRequest} from '@/lib/local-auth';
import {printHtml} from '@/lib/print';
import {MISSION_FILTERS,MISSION_KINDS,REPORT_PARTS,STATUS_LABELS,cleanReport,emptyReport,memberLabel,missionsFor,namesPerson,passesFilter,readReport,reportCount,reportText,reportsHtml,teamStatus,withDone,
 type DailyPayload,type Mission,type MissionFilter,type Person,type ReportLine,type StoredReport} from '@/lib/daily-report';
import {DateField,api} from './shared';
import {SelectList} from './filter-select';

type Props={records:CaseRecord[];rules?:Rules;clients:ClientEntity[];work:WorkItem[];members:Member[];user:{id:string;username:string};
 /** Missions come from cases and work this account can see; an account holding only the report section has none. */
 missionsOn:boolean;canPost:boolean;canWork:boolean;canReport:boolean;reviewer:boolean;ownCasesOnly:boolean;printedBy:string;
 onOpen:(c:CaseRecord)=>void;onSaved:(c:CaseRecord)=>void;onWorkChanged:()=>void;
 /** Links to the full pages (all tasks and the calendar, the deadlines table), kept out of the way. */
 links?:React.ReactNode};
const ICONS={hearing:Gavel,task:ListChecks,deadline:Hourglass,followup:CalendarClock};
const weekday=(d:string)=>new Intl.DateTimeFormat('ar-KW',{weekday:'long',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const clock=(iso?:string|null)=>iso?new Intl.DateTimeFormat('ar-KW',{hour:'numeric',minute:'2-digit'}).format(new Date(iso)):'';

/**
 * «مهام اليوم والتقرير»: one screen for the day. The missions of the day each with its one action (post a sitting,
 * close a task, open the case of a deadline), and beside them the day's report, which takes in what was done and
 * the rest by hand. The owner and admins reading reports pick a colleague, or the whole team to see who has sent.
 */
export default function DayDesk(p:Props){
 const today=todayISO(),[date,setDate]=useState(today),[who,setWho]=useState<string>(p.reviewer?'team':'me'),[filter,setFilter]=useState<MissionFilter>('all');
 const me=p.members.find(m=>m.id===p.user.id)||{...p.user,displayName:''},team=who==='team',self=who==='me'||who===p.user.id;
 const person:Person=team?'all':self?me:p.members.find(m=>m.id===who)||me;
 const missions=useMemo(()=>p.missionsOn?missionsFor({records:p.records,work:p.work,members:p.members,rules:p.rules,date,today,person,ownCasesOnly:p.ownCasesOnly&&self,viewerId:p.user.id}):[],
  // eslint-disable-next-line react-hooks/exhaustive-deps -- person follows `who`
  [p.missionsOn,p.records,p.work,p.members,p.rules,date,today,who,p.ownCasesOnly,p.user.id]);
 const [lateOpen,setLateOpen]=useState(false);
 // An account that sees every case but is named on none of them gets no sittings: say so, rather than an empty day.
 const unnamed=useMemo(()=>p.missionsOn&&self&&!p.ownCasesOnly&&!p.records.some(c=>namesPerson(String(c.lawyer||''),me)),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- me follows the members list
  [p.missionsOn,self,p.ownCasesOnly,p.records,p.members]);
 const shown=missions.filter(m=>passesFilter(m,filter)),late=missions.filter(m=>m.state==='late').length,done=missions.filter(m=>m.state==='done').length;
 const report=useOwnReport(p.canReport&&self,date,today,missions);
 const [list,setList]=useState<{reports:StoredReport[];expected:{userId:string;username:string;displayName:string}[]}|null>(null),[reading,setReading]=useState('');
 useEffect(()=>{if(!p.reviewer||self){setList(null);return}let on=true;setList(null);dailyRequest<typeof list>('list',{from:date,to:date}).then(d=>{if(on)setList(d)}).catch(e=>{if(on)toast.error((e as Error).message)});return()=>{on=false}},[p.reviewer,self,date]);
 const go=(d:string)=>{void report.flush();setDate(d);setReading('')};
 const pick=(v:string)=>{void report.flush();setWho(v);setReading('')};
 const added=(part:'hearings'|'tasks',line:ReportLine)=>{if(self&&p.canReport)report.add(part,line)};
 const people=p.members.filter(m=>m.enabled&&m.id!==p.user.id).sort((a,b)=>memberLabel(a).localeCompare(memberLabel(b),'ar'));
 const colleague=!self&&!team?list?.reports.find(r=>r.userId===who&&r.date===date):undefined;
 const missionsCol=p.missionsOn&&<section className="panel day-missions" aria-label="المهام">
  <div className="day-col-head"><h2>المهام</h2>{missions.length>0&&<div className="work-chips day-chips" role="group" aria-label="تصفية المهام">{MISSION_FILTERS.map(([k,l])=>{const n=missions.filter(m=>passesFilter(m,k)).length;return <button key={k} className={'work-chip'+(filter===k?' on':'')+(k==='late'?' late':'')} aria-pressed={filter===k} onClick={()=>setFilter(k)}>{l}<b>{n}</b></button>})}</div>}
   {p.canWork&&<AddTask date={date} members={p.members} assignee={team||self?p.user.id:who} reviewer={p.reviewer} onSaved={p.onWorkChanged}/>}</div>
  <div className="day-list">{shown.length?<>{(()=>{
   // A backlog of overdue items folds into one line so the day's own work stays in view; «متأخرة» lists them all.
   const lateRows=shown.filter(m=>m.state==='late'),fold=filter!=='late'&&lateRows.length>3,row=(m:Mission)=><MissionRow key={m.key} m={m} p={p} showWho={team} onDone={added}/>;
   if(!fold)return shown.map(row);
   return <><button type="button" className="late-fold" aria-expanded={lateOpen} onClick={()=>setLateOpen(!lateOpen)}><ChevronLeft size={15} className={lateOpen?'open':''}/> <b>{lateRows.length}</b> متأخرة من الأيام السابقة <span className="muted">{lateOpen?'إخفاء':'عرض'}</span></button>
    {lateOpen&&lateRows.map(row)}{shown.filter(m=>m.state!=='late').map(row)}</>})()}</>
   :<p className="day-empty">{missions.length?'لا مهام بهذا التصنيف.':date===today?'لا جلسات ولا مهام لهذا اليوم.':'لا جلسات ولا مهام في هذا اليوم.'}</p>}
   {unnamed&&<p className="day-hint" role="note">الجلسات تُنسب إلى المحامي المسجل على القضية، ولا توجد قضية باسم «{memberLabel(me)}». ليظهر ما يخصك هنا، يضبط المسؤول «الاسم المعروض» لحسابك كما هو مكتوب في القضايا، أو يكلّفك بحضور الجلسة من «المهام والجلسات».</p>}</div>
 </section>;
 const reportCol=team?<TeamPanel list={list} date={date} reading={reading} onRead={setReading} printedBy={p.printedBy}/>
  :self?(p.canReport?<ReportPanel r={report} date={date} today={today} name={memberLabel(me)} printedBy={p.printedBy}/>:null)
  :<section className="panel day-report" aria-label="تقرير الزميل"><div className="day-col-head"><h2>تقرير {memberLabel(person==='all'?undefined:person)}</h2>{colleague&&<span className={'tag '+(colleague.submittedAt?'green':'amber')}>{colleague.submittedAt?'أُرسل '+clock(colleague.submittedAt):'مسودة'}</span>}</div>
   {!list?<p role="status" className="day-empty"><LoaderCircle className="spin" size={14}/> جارٍ التحميل…</p>:colleague?<ReportReader r={colleague} printedBy={p.printedBy}/>:<p className="day-empty">لم يكتب تقريراً لهذا اليوم.</p>}</section>;
 // The same head as every other page: the title, one line on the day, and the controls beside it.
 const summary=p.missionsOn?[missions.length?`${missions.length} مهمة`:'لا مهام',done?`${done} منجزة`:'',late?`${late} متأخرة`:''].filter(Boolean).join(' · '):'اكتب ما أنجزته في هذا اليوم';
 return <div className="day-desk">
  <div className="page-head"><div><h1>مهام اليوم والتقرير</h1><p className="subtitle">{weekday(date)} {formatDate(date)} · {summary}</p></div>
   <div className="actions day-actions">
    <div className="day-nav" role="group" aria-label="اليوم"><button className="icon-btn" aria-label="اليوم السابق" onClick={()=>go(shiftDays(date,-1))}><ChevronRight size={16}/></button>
     <DateField label="اختر يوماً" value={date} onChange={v=>v&&go(v)}/><button className="icon-btn" aria-label="اليوم التالي" onClick={()=>go(shiftDays(date,1))}><ChevronLeft size={16}/></button>
     {date!==today&&<button className="btn" onClick={()=>go(today)}>اليوم</button>}</div>
    {p.reviewer&&<SelectList className="day-who" aria-label="تقرير من" value={self?'me':who} onChange={e=>pick(e.target.value)}><option value="me">أنا</option><option value="team">الفريق (كل التقارير)</option>{people.map(m=><option key={m.id} value={m.id}>{memberLabel(m)}</option>)}</SelectList>}
    {p.links}
   </div></div>
  <div className={'day-grid'+(missionsCol&&reportCol?'':' solo')}>{missionsCol}{reportCol}</div>
 </div>;
}

/** One mission and its single action. */
function MissionRow({m,p,showWho,onDone}:{m:Mission;p:Props;showWho:boolean;onDone:(part:'hearings'|'tasks',l:ReportLine)=>void}){
 const [open,setOpen]=useState(false),Icon=ICONS[m.kind];
 const action=m.state==='done'?null:m.kind==='hearing'&&p.canPost?<button className="btn primary" aria-expanded={open} onClick={()=>setOpen(!open)}>ترحيل</button>
  :m.kind==='task'&&p.canWork?<button className="btn primary" aria-expanded={open} onClick={()=>setOpen(!open)}><Check size={15}/> تم</button>
  :m.c?<button className="btn" onClick={()=>p.onOpen(m.c!)}><ArrowUpLeft size={15}/> فتح القضية</button>:null;
 return <article className={'mission '+m.state}>
  <div className="mission-line"><span className={'mission-kind k-'+m.kind} title={MISSION_KINDS[m.kind]}><Icon size={14}/>{MISSION_KINDS[m.kind]}</span>
   <span className="mission-time mono">{m.state==='late'||m.kind==='deadline'?formatDate(m.date):m.time||''}</span>
   <button type="button" className="mission-main" disabled={!m.c} onClick={()=>m.c&&p.onOpen(m.c)}><b>{m.title}</b><small>{m.sub}</small></button>
   <span className="mission-place">{m.place}{showWho&&m.who&&<small>{m.who}</small>}</span>
   {m.state==='done'?<span className="mission-result" title={m.result}><Check size={14}/> {m.result||'تم'}</span>:action}</div>
  {open&&m.kind==='hearing'&&m.c&&<PostForm c={m.c} date={m.date} p={p} onClose={()=>setOpen(false)} onPosted={l=>onDone('hearings',{key:m.key,text:[m.title,m.place].filter(Boolean).join(' · '),result:l})}/>}
  {open&&m.kind==='task'&&m.work&&<DoneForm w={m.work} onClose={()=>setOpen(false)} onSaved={note=>{onDone('tasks',{key:m.key,text:m.title,result:note});p.onWorkChanged()}}/>}
 </article>;
}

function PostForm({c,date,p,onClose,onPosted}:{c:CaseRecord;date:string;p:Props;onClose:()=>void;onPosted:(result:string)=>void}){
 const last=lastSitting(c),venue=(String(last?.venue||'المحكمة') as Venue),options=venue==='إدارة الخبراء'?EXPERT_DECISIONS:DECISIONS;
 const [decision,setDecision]=useState(''),[next,setNext]=useState(''),[time,setTime]=useState(String(last?.nextTime||'')),[details,setDetails]=useState(''),[busy,setBusy]=useState(false);
 const needsNext=!!decision&&options.find(d=>d.label===decision)?.next!=='none',ref=caseCode(c)||c.autoNumber||'';
 async function post(){
  if(!decision){toast.error('اختر قرار الجلسة.');return}
  if(needsNext&&!next){toast.error('أدخل موعد الجلسة التالية.');return}
  if(needsNext&&next<=date){toast.error('موعد الجلسة التالية يجب أن يكون بعد تاريخ الجلسة.');return}
  setBusy(true);
  try{const proc=sessionProcedure({date,venue,court:String(last?.court||c.court||''),decision,details,nextDate:needsNext?next:'',nextTime:needsNext?time:'',recordedBy:p.printedBy});
   const d=await api('/api/cases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({case:{...c,procedures:[...c.procedures,proc]}})});
   p.onSaved(enrichCase(d.case,p.clients));onPosted([decision,details.trim(),needsNext?'الجلسة التالية '+formatDate(next):''].filter(Boolean).join(' · '));toast.success('رُحّلت جلسة '+ref);onClose()}
  catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 return <div className="mission-form"><SelectList aria-label={'قرار جلسة '+ref} value={decision} onChange={e=>setDecision(e.target.value)}><option value="">قرار الجلسة</option>{options.map(d=><option key={d.label}>{d.label}</option>)}</SelectList>
  {needsNext&&<><DateField label={'الجلسة التالية '+ref} value={next} onChange={setNext}/><input type="time" aria-label="ساعة الجلسة التالية" value={time} onChange={e=>setTime(e.target.value)}/></>}
  <input aria-label="تفاصيل القرار" value={details} onChange={e=>setDetails(e.target.value)} placeholder="تفاصيل (اختياري)"/>
  <button className="btn primary" disabled={busy||!decision} onClick={()=>void post()}>{busy?<LoaderCircle className="spin" size={15}/>:<Save size={15}/>} حفظ في القضية</button><button className="icon-btn" aria-label="إلغاء" onClick={onClose}><X size={15}/></button></div>;
}

function DoneForm({w,onClose,onSaved}:{w:WorkItem;onClose:()=>void;onSaved:(note:string)=>void}){
 const [note,setNote]=useState(''),[busy,setBusy]=useState(false);
 async function save(){if(!note.trim()){toast.error('اكتب نتيجة المهمة.');return}setBusy(true);
  try{await officeRequest('save_work',{item:{...w,status:'done',completionNote:note.trim()}});toast.success('أُغلقت المهمة');onSaved(note.trim());onClose()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <form className="mission-form" onSubmit={e=>{e.preventDefault();void save()}}><input autoFocus aria-label={'نتيجة '+w.title} value={note} onChange={e=>setNote(e.target.value)} placeholder="النتيجة (مطلوبة)"/>
  <button className="btn primary" disabled={busy||!note.trim()}>{busy?<LoaderCircle className="spin" size={15}/>:<Check size={15}/>} إتمام</button><button type="button" className="icon-btn" aria-label="إلغاء" onClick={onClose}><X size={15}/></button></form>;
}

function AddTask({date,members,assignee,reviewer,onSaved}:{date:string;members:Member[];assignee:string;reviewer:boolean;onSaved:()=>void}){
 const [open,setOpen]=useState(false),[title,setTitle]=useState(''),[to,setTo]=useState(assignee),[busy,setBusy]=useState(false);
 useEffect(()=>setTo(assignee),[assignee]);
 async function save(){if(!title.trim())return;setBusy(true);
  try{await officeRequest('save_work',{item:{id:crypto.randomUUID(),revision:0,caseId:'',title:title.trim(),kind:'task',dueDate:date,dueTime:'',assigneeId:to,priority:'normal',status:'open',location:'',notes:'',completionNote:''}});
   toast.success('أُضيفت المهمة');setTitle('');setOpen(false);onSaved()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 if(!open)return <button className="btn day-add" aria-label="إضافة مهمة" title="إضافة مهمة" onClick={()=>setOpen(true)}><Plus size={15}/><span> مهمة</span></button>;
 return <form className="mission-form day-add-form" onSubmit={e=>{e.preventDefault();void save()}}><input autoFocus aria-label="عنوان المهمة" value={title} onChange={e=>setTitle(e.target.value)} placeholder="عنوان المهمة"/>
  {reviewer&&<SelectList aria-label="المسؤول عن المهمة" value={to} onChange={e=>setTo(e.target.value)}>{members.filter(m=>m.enabled).map(m=><option key={m.id} value={m.id}>{memberLabel(m)}</option>)}</SelectList>}
  <button className="btn primary" disabled={busy||!title.trim()}>{busy?<LoaderCircle className="spin" size={15}/>:<Plus size={15}/>} إضافة</button><button type="button" className="icon-btn" aria-label="إلغاء" onClick={()=>setOpen(false)}><X size={15}/></button></form>;
}

type OwnReport=ReturnType<typeof useOwnReport>;
/** The signed-in person's report of `date`: loaded, kept with what was done, saved and sent. */
function useOwnReport(on:boolean,date:string,today:string,missions:Mission[]){
 const [state,setState]=useState<{date:string;payload:DailyPayload;saved:string;revision:number;submittedAt:string|null;loading:boolean;busy:boolean;error:string}>({date,payload:emptyReport(),saved:'',revision:0,submittedAt:null,loading:on,busy:false,error:''});
 const cur=useRef(state);useEffect(()=>{cur.current=state});
 useEffect(()=>{if(!on)return;let live=true;setState(s=>({...s,date,loading:true,error:''}));
  dailyRequest<{report:StoredReport|null}>('mine',{date}).then(d=>{if(!live)return;const payload=readReport(d.report?.payload);setState({date,payload,saved:JSON.stringify(cleanReport(payload)),revision:d.report?.revision||0,submittedAt:d.report?.submittedAt||null,loading:false,busy:false,error:''})})
   .catch(e=>{if(live)setState(s=>({...s,loading:false,error:(e as Error).message}))});return()=>{live=false}},[on,date]);
 // What was done that day (sittings posted, tasks closed) comes into the report by itself.
 useEffect(()=>{if(on&&!state.loading&&state.date===date)setState(s=>{const next=withDone(s.payload,missions);return next===s.payload?s:{...s,payload:next}})},[on,missions,state.loading,state.date,date]);
 const dirty=JSON.stringify(cleanReport(state.payload))!==state.saved;
 async function save(submit=false,payload=cur.current.payload){
  const s=cur.current;if(!on||s.loading||s.date>today)return;
  setState(x=>({...x,busy:true}));
  try{const r=await dailyRequest<StoredReport>('save',{date:s.date,payload:cleanReport(payload),revision:s.revision,submit});
   setState(x=>x.date!==s.date?x:{...x,busy:false,revision:r.revision,submittedAt:r.submittedAt,saved:JSON.stringify(cleanReport(payload))});if(submit)toast.success('أُرسل التقرير');}
  catch(e){setState(x=>({...x,busy:false}));toast.error((e as Error).message)}
 }
 return {...state,on,dirty,today,
  set:(payload:DailyPayload)=>setState(s=>({...s,payload})),
  save,flush:async()=>{if(cur.current.loading)return;const c=cleanReport(cur.current.payload);if(JSON.stringify(c)!==cur.current.saved&&reportCount(c))await save(false)},
  /** A line from a mission just done, saved at once so it is not lost. */
  add:(part:'hearings'|'tasks',line:ReportLine)=>{const s=cur.current;if(s.payload[part].some(l=>l.key===line.key))return;const payload={...s.payload,[part]:[...s.payload[part],line]};setState(x=>({...x,payload}));cur.current={...s,payload};void save(false,payload)}};
}

function ReportPanel({r,date,today,name,printedBy}:{r:OwnReport;date:string;today:string;name:string;printedBy:string}){
 const future=date>today,ro=future||r.busy;
 const setLine=(k:(typeof REPORT_PARTS)[number][0],i:number,v:Partial<ReportLine>)=>r.set({...r.payload,[k]:r.payload[k].map((l,j)=>j===i?{...l,...v}:l)});
 const addLine=(k:(typeof REPORT_PARTS)[number][0])=>{r.set({...r.payload,[k]:[...r.payload[k],{text:'',result:''}]});setTimeout(()=>document.querySelector<HTMLInputElement>(`[data-part="${k}"] .report-line:last-child input`)?.focus(),30)};
 const status=r.loading?'جارٍ التحميل…':r.dirty?'تعديلات غير محفوظة':r.submittedAt?'أُرسل '+clock(r.submittedAt):r.revision?'مسودة محفوظة':'لم يُحفظ بعد';
 const copy=()=>{void navigator.clipboard?.writeText(reportText(cleanReport(r.payload),name,formatDate(date))).then(()=>toast.success('نُسخ التقرير'),()=>toast.error('تعذر النسخ.'))};
 const print=()=>{if(!printHtml(reportsHtml([{name,date:formatDate(date),payload:cleanReport(r.payload),sent:r.submittedAt?'أُرسل '+clock(r.submittedAt):'مسودة'}],printedBy,formatDate(today))))toast.error('تعذر فتح الطباعة.')};
 return <section className="panel day-report" aria-label="تقريري اليومي">
  <div className="day-col-head"><h2>تقريري اليومي</h2><span className={'tag '+(r.dirty?'amber':r.submittedAt?'green':'')} role="status">{status}</span>
   <div className="actions"><button className="icon-btn" aria-label="نسخ التقرير نصاً" title="نسخ" onClick={copy}><Copy size={15}/></button><button className="icon-btn" aria-label="طباعة التقرير" title="طباعة" onClick={print}><Printer size={15}/></button></div></div>
  {r.error?<p className="day-empty" role="alert">{r.error}</p>:future?<p className="day-empty">لا يُكتب تقرير ليوم لم يأتِ بعد.</p>:<>
  <div className="day-report-body">{REPORT_PARTS.map(([k,title,a,b])=><div key={k} className="report-part" data-part={k}>
   <div className="report-part-head"><b>{title}</b>{r.payload[k].length>0&&<span className="report-count">{r.payload[k].length}</span>}<button className="part-add" aria-label={'إضافة سطر: '+title} disabled={ro} onClick={()=>addLine(k)}><Plus size={13}/> سطر</button></div>
   {r.payload[k].map((l,i)=><div key={i} className="report-line"><input aria-label={a} placeholder={a} value={l.text} disabled={ro} onChange={e=>setLine(k,i,{text:e.target.value})}/><input aria-label={b} placeholder={b} value={l.result} disabled={ro} onChange={e=>setLine(k,i,{result:e.target.value})}/>
    <button className="icon-btn" aria-label="حذف السطر" disabled={ro} onClick={()=>r.set({...r.payload,[k]:r.payload[k].filter((_,j)=>j!==i)})}><X size={14}/></button></div>)}</div>)}
   <label className="report-part report-notes"><b>ملاحظات</b><textarea rows={2} value={r.payload.notes} disabled={ro} onChange={e=>r.set({...r.payload,notes:e.target.value})} placeholder="ما يجب أن يعرفه المسؤول"/></label></div>
  <div className="day-report-foot"><span className="muted">{reportCount(cleanReport(r.payload))} بند</span>
   <button className="btn" disabled={r.busy||r.loading||!r.dirty} onClick={()=>void r.save(false)}><Save size={15}/> حفظ</button>
   <button className="btn primary" disabled={r.busy||r.loading||!reportCount(cleanReport(r.payload))} onClick={()=>void r.save(true)}>{r.busy?<LoaderCircle className="spin" size={15}/>:<Send size={15}/>} {r.submittedAt?'إعادة الإرسال':'إرسال التقرير'}</button></div></>}
 </section>;
}

function ReportReader({r,printedBy}:{r:StoredReport;printedBy:string}){
 const payload=cleanReport(readReport(r.payload)),name=r.displayName||r.username;
 const print=()=>{if(!printHtml(reportsHtml([{name,date:formatDate(r.date),payload,sent:r.submittedAt?'أُرسل '+clock(r.submittedAt):'مسودة'}],printedBy,formatDate(todayISO()))))toast.error('تعذر فتح الطباعة.')};
 return <div className="day-report-body report-read">{REPORT_PARTS.map(([k,title])=>payload[k].length?<div key={k} className="report-part"><div className="report-part-head"><b>{title}</b><span className="report-count">{payload[k].length}</span></div>
  <ol>{payload[k].map((l,i)=><li key={i}>{l.text}{l.result&&<span className="muted"> — {l.result}</span>}</li>)}</ol></div>:null)}
  {payload.notes&&<div className="report-part"><div className="report-part-head"><b>ملاحظات</b></div><p className="report-notes-text">{payload.notes}</p></div>}
  {!reportCount(payload)&&<p className="day-empty">التقرير فارغ.</p>}
  <div className="actions"><button className="btn" onClick={print}><Printer size={15}/> طباعة</button><button className="btn" onClick={()=>void navigator.clipboard?.writeText(reportText(payload,name,formatDate(r.date))).then(()=>toast.success('نُسخ التقرير'))}><Copy size={15}/> نسخ</button></div></div>;
}

function TeamPanel({list,date,reading,onRead,printedBy}:{list:{reports:StoredReport[];expected:{userId:string;username:string;displayName:string}[]}|null;date:string;reading:string;onRead:(id:string)=>void;printedBy:string}){
 if(!list)return <section className="panel day-report"><p role="status" className="day-empty"><LoaderCircle className="spin" size={14}/> جارٍ تحميل التقارير…</p></section>;
 const rows=teamStatus(list.expected,list.reports,date),sent=rows.filter(r=>r.status==='sent'),open=rows.find(r=>r.userId===reading)?.report;
 const printAll=()=>{if(!sent.length)return;if(!printHtml(reportsHtml(sent.map(r=>({name:r.displayName||r.username,date:formatDate(date),payload:cleanReport(readReport(r.report!.payload)),sent:'أُرسل '+clock(r.report!.submittedAt)})),printedBy,formatDate(todayISO()))))toast.error('تعذر فتح الطباعة.')};
 return <section className="panel day-report" aria-label="تقارير الفريق">
  <div className="day-col-head"><h2>تقارير الفريق</h2><span className="tag green">{sent.length} أُرسل</span><span className="tag">{rows.length-sent.length} لم يُرسل</span><div className="actions"><button className="btn" disabled={!sent.length} onClick={printAll}><Printer size={15}/> طباعة المرسلة</button></div></div>
  {open?<><button className="btn day-back" onClick={()=>onRead('')}><ChevronRight size={15}/> كل التقارير · {open.displayName||open.username}</button><ReportReader r={open} printedBy={printedBy}/></>
  :!rows.length?<p className="day-empty">لا أحد مكلف بالتقرير اليومي. امنح قسم «التقرير اليومي» من صلاحيات الفريق.</p>
  :<ul className="team-list">{rows.map(r=>{const n=r.report?reportCount(readReport(r.report.payload)):0;return <li key={r.userId}><button type="button" disabled={!r.report} onClick={()=>onRead(r.userId)}>
   <b>{r.displayName||r.username}</b><span className={'tag '+(r.status==='sent'?'green':r.status==='draft'?'amber':'red')}>{STATUS_LABELS[r.status]}{r.status==='sent'&&' '+clock(r.report!.submittedAt)}</span><small>{r.report?`${n} بند`:''}</small></button></li>})}</ul>}
 </section>;
}
