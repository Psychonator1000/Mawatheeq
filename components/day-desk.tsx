import {useEffect,useMemo,useRef,useState} from 'react';
import {titled} from '@/lib/staff-accounts';
import {ChevronRight,ChevronLeft,Check,Save,Send,Printer,Copy,Plus,X,ArrowUpLeft,LoaderCircle,Gavel,ListChecks,CalendarClock,Hourglass,CalendarCheck,Info,UsersRound} from 'lucide-react';
import {openWorkspace} from '@/lib/open-record';
import {toast} from 'sonner';
import {type CaseRecord,type Rules,caseCode,formatDate,todayISO} from '@/lib/domain';
import {type ClientEntity,clientName,enrichCase} from '@/lib/clients';
import {DECISIONS,EXPERT_DECISIONS,sessionProcedure,type Venue} from '@/lib/sessions';
import {lastSitting,shiftDays} from '@/lib/case-desk';
import {type Member,type WorkItem,monthGrid,shiftMonth} from '@/lib/office';
import {dailyRequest,officeRequest} from '@/lib/local-auth';
import {printHtml} from '@/lib/print';
import {MISSION_FILTERS,MISSION_KINDS,REPORT_PARTS,STATUS_LABELS,cleanReport,emptyReport,memberLabel,missionsFor,namesPerson,performance,periods,performanceHtml,type PersonStats,daySummary,lineText,ORDINALS,NOTES,type ReportPart,datesAhead,DATES_FILTERS,passesDates,agendaBetween,type DatesFilter,type AgendaDay,passesFilter,readReport,lineCase,ref as caseRef,type LineField,reportCount,reportText,reportsHtml,teamDay,type TeamDayRow,withDone,
 type DailyPayload,type Mission,type MissionFilter,type Person,type ReportLine,type StoredReport} from '@/lib/daily-report';
import {DateField,api} from './shared';
import {FilterBox,SelectList} from './filter-select';
import {normalizeSearch} from '@/lib/case-browse';
import type {TeamInfo} from '@/lib/team';
import {courtChoices} from '@/lib/court-names';
import {COURTS} from '@/lib/choices';

type Props={records:CaseRecord[];rules?:Rules;clients:ClientEntity[];work:WorkItem[];members:Member[];user:{id:string;username:string};
 /** Missions come from cases and work this account can see; an account holding only the report section has none. */
 missionsOn:boolean;canManageTeam?:boolean;canPost:boolean;canWork:boolean;canReport:boolean;reviewer:boolean;ownCasesOnly:boolean;printedBy:string;
 onOpen:(c:CaseRecord)=>void;onSaved:(c:CaseRecord)=>void;onWorkChanged:()=>void};
const ICONS={hearing:Gavel,task:ListChecks,deadline:Hourglass,followup:CalendarClock};
type TeamList={reports:StoredReport[];expected:{userId:string;username:string;displayName:string}[]};
type Mode='day'|'posting'|'dates'|'calendar'|'perf';
// The quick-add buttons of «ما عملته»: each kind of work in a word or two.
const QUICK_ADD:Record<ReportPart,string>={hearings:'جلسة حضرتها',tasks:'مهمة أنجزتها',admin:'عمل إداري في المحكمة (المطلوب متابعتها)',external:'مراجعة خارجية',other:'عمل آخر',pending:'متابعة مطلوبة'};
const TAB_HINTS:Record<Mode,string>={day:'قائمة اليوم والتقرير عنه',posting:'كل جلسات المكتب في اليوم: سجّل ما تم فيها وحدد القادمة',dates:'مواعيد الطعن والمتابعات',calendar:'الشهر كاملاً بجلساته ومهامه',perf:'عمل كل محامٍ في الأسبوع أو الشهر'};
const monthName=(d:string)=>new Intl.DateTimeFormat('ar-KW-u-nu-latn',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d.slice(0,7)+'-01T12:00:00Z'));
const WEEKDAYS=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const weekday=(d:string)=>new Intl.DateTimeFormat('ar-KW',{weekday:'long',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const clock=(iso?:string|null)=>iso?new Intl.DateTimeFormat('ar-KW-u-nu-latn',{hour:'numeric',minute:'2-digit'}).format(new Date(iso)):'';

/**
 * «مهام اليوم والتقرير»: one screen for the day. The missions of the day each with its one action (post a sitting,
 * close a task, open the case of a deadline), and beside them the day's report, which takes in what was done and
 * the rest by hand. The owner and admins reading reports pick a colleague, or the whole team to see who has sent.
 */
export default function DayDesk(p:Props){
 const today=todayISO(),[date,setDate]=useState(today),[who,setWho]=useState<string>(p.reviewer?'team':'me'),[filter,setFilter]=useState<MissionFilter>('all');
 // «الهيكل الوظيفي»: an account with people under it does its own day and also reads their reports and performance, and
 // those of everyone under them (the owner and admins read everyone's). The server sends a lead nobody else's report.
 const [scope,setScope]=useState<TeamInfo|null>(null);
 useEffect(()=>{if(p.reviewer)return;let on=true;dailyRequest<TeamInfo>('team').then(t=>{if(!on)return;setScope(t);if(t.leads)setWho(w=>w==='me'?'team':w)}).catch(()=>{});return()=>{on=false}},[p.reviewer]);
 const lead=!p.reviewer&&!!scope?.leads,reviewer=p.reviewer||lead;
 const teamIds=useMemo(()=>lead?new Set([...(scope?.below||[]),p.user.id]):null,[lead,scope,p.user.id]);
 const me=p.members.find(m=>m.id===p.user.id)||{...p.user,displayName:''},team=who==='team',self=who==='me'||who===p.user.id;
 const person:Person=team?'all':self?me:p.members.find(m=>m.id===who)||me;
 const everyMission=useMemo(()=>p.missionsOn?missionsFor({records:p.records,work:p.work,members:p.members,rules:p.rules,date,today,person,ownCasesOnly:p.ownCasesOnly&&self,viewerId:p.user.id}):[],
  // eslint-disable-next-line react-hooks/exhaustive-deps -- person follows `who`
  [p.missionsOn,p.records,p.work,p.members,p.rules,date,today,who,p.ownCasesOnly,p.user.id]);
 // A lead's team view lists the sittings and tasks of his team only.
 const missions=useMemo(()=>{if(!team||!teamIds)return everyMission;const names=new Set(p.members.filter(m=>teamIds.has(m.id)).map(m=>memberLabel(m)));return everyMission.filter(m=>names.has(m.who))},[everyMission,team,teamIds,p.members]);
 // The cases of the day's hearings come first when a hearing is added to the report by hand.
 const dayCases=useMemo(()=>[...new Set(missions.filter(m=>m.kind==='hearing'&&m.c).map(m=>m.c!.id))],[missions]);
 const [lateOpen,setLateOpen]=useState(false),[mode,setMode]=useState<Mode>('day'),[datesFilter,setDatesFilter]=useState<DatesFilter>('all');
 const range={records:p.records,work:p.work,members:p.members,rules:p.rules,today,person,ownCasesOnly:p.ownCasesOnly&&self,viewerId:p.user.id};
 // «ترحيل الجلسات»: every sitting of the chosen day in the office, to post one after another.
 const posting=useMemo(()=>mode==='posting'?missionsFor({...range,person:'all',ownCasesOnly:false,date}).filter(m=>m.kind==='hearing'&&m.date===date):[],
  // eslint-disable-next-line react-hooks/exhaustive-deps -- range follows its parts
  [mode,p.records,p.work,p.members,p.rules,date,today]);
 const dates=useMemo(()=>mode==='dates'?datesAhead(range):[],
  // eslint-disable-next-line react-hooks/exhaustive-deps -- range follows its parts
  [mode,p.records,p.work,p.members,p.rules,today,who,p.ownCasesOnly,p.user.id]);
 const grid=useMemo(()=>monthGrid(date.slice(0,7)),[date]);
 // An account that opens neither cases nor tasks still has its own calendar (owner, 12 November 2026: «for all
 // employees but each employee only sees his schedules»): the work assigned to it, from the server, a month at a time.
 const [mine,setMine]=useState<Map<string,AgendaDay>|null>(null);
 useEffect(()=>{
  if(mode!=='calendar'||p.missionsOn)return;let live=true;
  officeRequest<{kind:string;title:string;dueDate:string;status:string;caseRef:string}[]>('my_schedule',{from:grid[0],to:grid[grid.length-1]}).then(list=>{
   if(!live)return;const m=new Map<string,AgendaDay>();
   for(const w of list){let v=m.get(w.dueDate);if(!v)m.set(w.dueDate,v={hearings:0,tasks:0,done:0,items:[]});const done=w.status==='done',kind=w.kind==='hearing'?'hearing':'task';
    if(kind==='hearing')v.hearings++;else v.tasks++;if(done)v.done++;v.items.push({kind,title:w.title+(w.caseRef?' · '+w.caseRef:''),done})}
   setMine(m)}).catch(()=>{if(live)setMine(new Map())});
  return()=>{live=false};
 },[mode,p.missionsOn,grid]);
 const shared=useMemo(()=>mode==='calendar'&&p.missionsOn?agendaBetween(range,grid[0],grid[grid.length-1]):new Map<string,AgendaDay>(),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- range follows its parts
  [mode,grid,p.records,p.work,p.members,who,p.ownCasesOnly,p.user.id,p.missionsOn]);
 const agenda=p.missionsOn?shared:(mine||new Map<string,AgendaDay>());
 // An account that sees every case but is named on none of them gets no sittings: say so, rather than an empty day.
 const unnamed=useMemo(()=>p.missionsOn&&self&&!p.ownCasesOnly&&!p.records.some(c=>namesPerson(String(c.lawyer||''),me)),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- me follows the members list
  [p.missionsOn,self,p.ownCasesOnly,p.records,p.members]);
 const shown=missions.filter(m=>passesFilter(m,filter));
 const report=useOwnReport(p.canReport&&self,date,today,missions);
 const [list,setList]=useState<{reports:StoredReport[];expected:{userId:string;username:string;displayName:string}[]}|null>(null),[reading,setReading]=useState('');
 // eslint-disable-next-line react-hooks/set-state-in-effect -- the loader resets its state before fetching
 useEffect(()=>{if(!reviewer||self){setList(null);return}let on=true;setList(null);dailyRequest<typeof list>('list',{from:date,to:date}).then(d=>{if(on)setList(d)}).catch(e=>{if(on)toast.error((e as Error).message)});return()=>{on=false}},[reviewer,self,date]);
 const go=(d:string)=>{void report.flush();setDate(d);setReading('')};
 const pick=(v:string)=>{void report.flush();setWho(v);setReading('')};
 const added=(part:'hearings'|'tasks',line:ReportLine)=>{if(self&&p.canReport)report.add(part,line)};
 const people=p.members.filter(m=>m.enabled&&m.id!==p.user.id&&(!teamIds||teamIds.has(m.id))).sort((a,b)=>memberLabel(a).localeCompare(memberLabel(b),'ar'));
 const colleague=!self&&!team?list?.reports.find(r=>r.userId===who&&r.date===date):undefined;
 // The day's list as a numbered section of the page's single column (see «DayPath»).
 const missionsTitle=team?'جلسات ومهام المكتب':self?'جلساتي ومهامي':`جلسات ${memberLabel(person==='all'?undefined:person)} ومهامه`;
 const missionsCol=p.missionsOn&&<section className="day-sec day-missions" aria-label="المهام">
  <div className="day-sec-head"><h2><span className="day-sec-n" aria-hidden>{team?'٢':'١'}</span>{missionsTitle}</h2>{missions.length>0&&<div className="work-chips day-chips" role="group" aria-label="تصفية المهام">{MISSION_FILTERS.map(([k,l])=>{const n=missions.filter(m=>passesFilter(m,k)).length;return <button key={k} className={'work-chip'+(filter===k?' on':'')+(k==='late'?' late':'')} aria-pressed={filter===k} onClick={()=>setFilter(k)}>{l}<b>{n}</b></button>})}</div>}
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
 const rows=(list:Mission[],empty:string)=>list.length?list.map(m=><MissionRow key={m.key} m={m} p={p} showWho={team||mode==='posting'} onDone={added}/>):<p className="day-empty">{empty}</p>;
 const postingCol=<section className="panel day-missions" aria-label="ترحيل الجلسات"><div className="day-col-head"><h2>ترحيل الجلسات</h2>
   <span className="tag">{posting.length} جلسة</span>{posting.some(m=>m.state==='done')&&<span className="tag green">{posting.filter(m=>m.state==='done').length} مرحّلة</span>}{posting.some(m=>m.state!=='done')&&<span className="tag amber">{posting.filter(m=>m.state!=='done').length} بانتظار الترحيل</span>}</div>
  <div className="day-list">{rows(posting,'لا جلسات في هذا اليوم.')}</div></section>;
 const datesCol=<section className="panel day-missions" aria-label="المواعيد"><div className="day-col-head"><h2>المواعيد</h2>
   {dates.length>0&&<div className="work-chips day-chips" role="group" aria-label="تصفية المواعيد">{DATES_FILTERS.map(([k,l])=><button key={k} className={'work-chip'+(datesFilter===k?' on':'')+(k==='late'?' late':'')} aria-pressed={datesFilter===k} onClick={()=>setDatesFilter(k)}>{l}<b>{dates.filter(m=>passesDates(m,k,today)).length}</b></button>)}</div>}</div>
  <div className="day-list">{rows(dates.filter(m=>passesDates(m,datesFilter,today)),dates.length?'لا مواعيد بهذا التصنيف.':'لا مواعيد طعن ولا متابعات من أسبوع مضى إلى ثلاثين يوماً قادمة.')}</div></section>;
 const calendarCol=<section className="panel day-missions" aria-label="التقويم"><div className="day-col-head"><h2>{p.missionsOn?'التقويم':'تقويمي'}</h2><span className="tag">{monthName(date)}</span>
   <div className="actions"><button className="icon-btn" aria-label="الشهر السابق" onClick={()=>setDate(shiftMonth(date.slice(0,7),-1)+'-01')}><ChevronRight size={16}/></button><button className="icon-btn" aria-label="الشهر التالي" onClick={()=>setDate(shiftMonth(date.slice(0,7),1)+'-01')}><ChevronLeft size={16}/></button></div></div>
  <div className="day-cal" role="grid" aria-label={'تقويم '+monthName(date)}>{WEEKDAYS.map(d=><div key={d} className="day-cal-head" role="columnheader">{d}</div>)}
   {grid.map(d=>{const a=agenda.get(d);return <button key={d} type="button" role="gridcell" className={'day-cal-cell'+(d.slice(0,7)!==date.slice(0,7)?' out':'')+(d===today?' today':'')+(d===date?' picked':'')} onClick={()=>{setMode('day');go(d)}} aria-label={formatDate(d)+(a?` · ${a.hearings} جلسة · ${a.tasks} مهمة`:'')}>
    <span className="mono">{Number(d.slice(8))}</span>{a&&<span className="day-cal-counts">{a.hearings>0&&<b className="k-hearing">{a.hearings}<span> جلسة</span></b>}{a.tasks>0&&<b className="k-task">{a.tasks}<span> مهمة</span></b>}</span>}
    {a&&a.items.slice(0,2).map((x,i)=><small key={i} className={x.done?'done':''}>{x.title}</small>)}{a&&a.items.length>2&&<small className="more">+{a.items.length-2}</small>}</button>})}</div></section>;
 const board=useMemo(()=>team&&list?teamDay({expected:list.expected,reports:list.reports,date,today,records:p.records,work:p.work,members:p.members,rules:p.rules}):null,
  [team,list,date,today,p.records,p.work,p.members,p.rules]);
 const name=memberLabel(person==='all'?undefined:person);
 // The day is one column read from the top: numbered sections, and for one's own report a bar fixed at the bottom
 // with what the report holds and the buttons to save and send it.
 const sections=team?<>{reviewer&&<TeamBoard rows={board} date={date} today={today} reading={reading} onRead={setReading} onDay={id=>pick(id===p.user.id?'me':id)} printedBy={p.printedBy} canManage={p.canManageTeam}/>}{missionsCol}</>
  :self?<>{missionsCol}{p.canReport?<ReportEditor r={report} date={date} today={today} n={p.missionsOn?'٢':'١'} others={p.missionsOn} records={p.records} first={dayCases}/>
   // Without the report section the page says so, and how to turn it on, rather than leaving the report out silently.
   :<section className="day-sec" aria-label="التقرير اليومي غير مفعّل"><div className="day-sec-head"><h2><span className="day-sec-n" aria-hidden>٢</span>ما عملته اليوم</h2></div>
    <div className="day-empty day-empty-action"><p>التقرير اليومي غير مفعّل لهذا الحساب، لذلك لا يظهر هنا ما يُكتب ويُرسل. يفعّله المسؤول من «فريق المكتب» ← «تعديل الصلاحيات» على الحساب ← الضغط على «مهام اليوم والتقرير» في المعاينة حتى يصبح «ظاهر»، ثم الحفظ. ولترحيل الجلسات وإتمام المهام يُفعَّل معه «السماح بالتعديل».</p></div></section>}</>
  :<>{missionsCol}<section className="day-sec" aria-label="تقرير الزميل"><div className="day-sec-head"><h2><span className="day-sec-n" aria-hidden>{p.missionsOn?'٢':'١'}</span>تقرير {name}</h2>{colleague&&<span className={'tag '+(colleague.submittedAt?'green':'amber')}>{colleague.submittedAt?'أُرسل '+clock(colleague.submittedAt):'مسودة'}</span>}</div>
   {!list?<p role="status" className="day-empty"><LoaderCircle className="spin" size={14}/> جارٍ التحميل…</p>:colleague?<ReportReader r={colleague} printedBy={p.printedBy}/>:<p className="day-empty">لم يكتب تقريراً لهذا اليوم.</p>}</section></>;
 const dayPath=<section className={'panel day-path'+(team?' team-day':'')} aria-label={team?'يوم الفريق':self?(p.canReport?'تقريري اليومي':'يومي'):'يوم '+name}>
  <div className="day-path-body">{sections}</div>
  {self&&p.canReport&&<ReportBar r={report} date={date} today={today} name={memberLabel(me)} printedBy={p.printedBy}/>}</section>;
 const mainCol=mode==='perf'?<Performance p={p} onPick={id=>{setWho(id===p.user.id?'me':id);setMode('day')}}/>:mode==='posting'?postingCol:mode==='dates'?datesCol:mode==='calendar'?calendarCol:dayPath;
 // Under the head of every view, one line that says what the view is for and what to press.
 const PURPOSE:Record<Mode,string>={
  day:team?'لكل محامٍ سطر يحكي يومه باختصار: تقريره وما فيه، وجلساته ومهامه، وما تأخر عليه، والتالي عليه.'+(p.missionsOn?' وبجانب الفريق جلسات ومهام المكتب.':'')+' اضغط السطر لقراءة التقرير، والسهم لفتح يومه.'
   :self?(p.missionsOn&&p.canReport?'أنجز جلساتك ومهامك من القائمة، وأضف ما عملته خارجها، ثم أرسل التقرير من الشريط في الأسفل.':p.canReport?'أضف ما عملته اليوم بالأزرار، ثم أرسل التقرير من الشريط في الأسفل.':'جلساتك ومهامك في هذا اليوم. التقرير اليومي غير مفعّل لهذا الحساب (التفاصيل في القسم الثاني).')
   :`يوم ${name}: جلساته ومهامه، وتقريره.`,
  posting:`كل جلسات المكتب في هذا اليوم (${posting.length}). اضغط «ترحيل» في كل جلسة لتسجيل ما تم فيها وتحديد الجلسة القادمة.`,
  dates:'مواعيد الطعن والمتابعات من أسبوع مضى إلى ثلاثين يوماً قادمة. اختر تصنيفاً، ثم «فتح القضية» للعمل عليها.',
  calendar:'الشهر كاملاً: عدد الجلسات والمهام في كل يوم. اضغط أي يوم لفتح قائمته.',
  perf:'لكل محامٍ في الفترة: التقارير المرسلة، والجلسات التي حضرها ورحّلها، والأعمال، وما تأخر. اضغط صفاً لفتح يومه.',
 };
 const purpose=<p className="day-purpose"><Info size={15} aria-hidden/><span>{PURPOSE[mode]}</span>
  {mode==='day'&&!self&&!team&&reviewer&&<button type="button" className="btn day-purpose-act" onClick={()=>pick('team')}><ChevronRight size={15}/> رجوع إلى الفريق</button>}</p>;
 const sub=mode==='perf'?'أداء الفريق':mode==='calendar'?monthName(date):mode==='dates'?'المواعيد القادمة والفائتة':`${weekday(date)} ${formatDate(date)} · ${mode==='posting'?'ترحيل جلسات المكتب':team?'الفريق':self?(p.missionsOn?'قائمتك وتقريرك':'تقريرك'):name}`;
 return <div className="day-desk">
  <div className="page-head day-head"><h1>مهام اليوم والتقرير</h1><p className="subtitle" title={sub}>{sub}</p>
   {<div className="day-modes" role="tablist" aria-label="العرض">{((p.missionsOn?[['day','اليوم'],...(p.canPost?[['posting','ترحيل الجلسات']]:[]),['dates','المواعيد'],['calendar','التقويم'],...(reviewer?[['perf','الأداء']]:[])]:[['day','اليوم'],['calendar','تقويمي']]) as [Mode,string][]).map(([k,l])=><button key={k} role="tab" aria-selected={mode===k} title={TAB_HINTS[k]} className={'work-chip'+(mode===k?' on':'')} onClick={()=>{void report.flush();setMode(k)}}>{l}</button>)}</div>}
   <div className={'day-controls'+(reviewer?'':' solo')}>
    {(mode==='day'||mode==='posting')&&<div className="day-nav" role="group" aria-label="اليوم">{date!==today&&<button className="btn day-back" aria-label="العودة لليوم" title="العودة لليوم" onClick={()=>go(today)}><CalendarCheck size={15}/><span>العودة لليوم</span></button>}<button className="icon-btn" aria-label="اليوم السابق" onClick={()=>go(shiftDays(date,-1))}><ChevronRight size={16}/></button>
     <DateField label="اختر يوماً" value={date} onChange={v=>v&&go(v)}/><button className="icon-btn" aria-label="اليوم التالي" onClick={()=>go(shiftDays(date,1))}><ChevronLeft size={16}/></button></div>}
    {reviewer&&mode!=='posting'&&mode!=='perf'&&(p.missionsOn||mode!=='calendar')&&<SelectList className="day-who" aria-label="تقرير من" value={self?'me':who} onChange={e=>pick(e.target.value)}><option value="me">أنا</option><option value="team">{lead?'فريقي':'الفريق (كل التقارير)'}</option>{people.map(m=><option key={m.id} value={m.id}>{memberLabel(m)}</option>)}</SelectList>}
   </div></div>
  {purpose}
  <div className="day-grid solo">{mainCol}</div>
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
   <span className="mission-place">{m.place}{showWho&&m.who&&<small className={m.place?'after':undefined}>{m.who}</small>}</span>
   {m.state==='done'?<span className="mission-result" title={m.result}><Check size={14}/> {m.result||'تم'}</span>:action}</div>
  {open&&m.kind==='hearing'&&m.c&&<PostForm c={m.c} date={m.date} p={p} onClose={()=>setOpen(false)} onPosted={(decision,next)=>onDone('hearings',{key:m.key,text:m.title,court:m.place,result:decision,next})}/>}
  {open&&m.kind==='task'&&m.work&&<DoneForm w={m.work} onClose={()=>setOpen(false)} onSaved={note=>{onDone('tasks',{key:m.key,text:m.title,result:note});p.onWorkChanged()}}/>}
 </article>;
}

function PostForm({c,date,p,onClose,onPosted}:{c:CaseRecord;date:string;p:Props;onClose:()=>void;onPosted:(decision:string,next:string)=>void}){
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
   p.onSaved(enrichCase(d.case,p.clients));onPosted([decision,details.trim()].filter(Boolean).join(' — '),needsNext?'الجلسة القادمة '+formatDate(next):'');toast.success('رُحّلت جلسة '+ref);onClose()}
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
 // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the assignee passed in
 useEffect(()=>setTo(assignee),[assignee]);
 async function save(){if(!title.trim())return;setBusy(true);
  try{await officeRequest('save_work',{item:{id:crypto.randomUUID(),revision:0,caseId:'',title:title.trim(),kind:'task',dueDate:date,dueTime:'',assigneeId:to,priority:'normal',status:'open',location:'',notes:'',completionNote:''}});
   toast.success('أُضيفت المهمة');setTitle('');setOpen(false);onSaved()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 if(!open)return <button className="btn day-add" aria-label="إضافة مهمة" title="إضافة مهمة" onClick={()=>setOpen(true)}><Plus size={15}/><span> مهمة جديدة</span></button>;
 return <form className="mission-form day-add-form" onSubmit={e=>{e.preventDefault();void save()}}><input autoFocus aria-label="عنوان المهمة" value={title} onChange={e=>setTitle(e.target.value)} placeholder="عنوان المهمة"/>
  {reviewer&&<SelectList aria-label="المسؤول عن المهمة" value={to} onChange={e=>setTo(e.target.value)}>{members.filter(m=>m.enabled).map(m=><option key={m.id} value={m.id}>{memberLabel(m)}</option>)}</SelectList>}
  <button className="btn primary" disabled={busy||!title.trim()}>{busy?<LoaderCircle className="spin" size={15}/>:<Plus size={15}/>} إضافة</button><button type="button" className="icon-btn" aria-label="إلغاء" onClick={()=>setOpen(false)}><X size={15}/></button></form>;
}

type OwnReport=ReturnType<typeof useOwnReport>;
/** The signed-in person's report of `date`: loaded, kept with what was done, saved and sent. */
function useOwnReport(on:boolean,date:string,today:string,missions:Mission[]){
 const [state,setState]=useState<{date:string;payload:DailyPayload;saved:string;revision:number;submittedAt:string|null;loading:boolean;busy:boolean;error:string}>({date,payload:emptyReport(),saved:'',revision:0,submittedAt:null,loading:on,busy:false,error:''});
 const cur=useRef(state);useEffect(()=>{cur.current=state});
 // eslint-disable-next-line react-hooks/set-state-in-effect -- the loader resets its state before fetching
 useEffect(()=>{if(!on)return;let live=true;setState(s=>({...s,date,loading:true,error:''}));
  dailyRequest<{report:StoredReport|null}>('mine',{date}).then(d=>{if(!live)return;const payload=readReport(d.report?.payload);setState({date,payload,saved:JSON.stringify(cleanReport(payload)),revision:d.report?.revision||0,submittedAt:d.report?.submittedAt||null,loading:false,busy:false,error:''})})
   .catch(e=>{if(live)setState(s=>({...s,loading:false,error:(e as Error).message}))});return()=>{live=false}},[on,date]);
 // What was done that day (sittings posted, tasks closed) comes into the report by itself.
 // eslint-disable-next-line react-hooks/set-state-in-effect -- lines are marked done as the missions change
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

/** «الأداء»: each person's work over a period, for the owner and the admins who read reports. A row opens that person's day. */
function Performance({p,onPick}:{p:Props;onPick:(userId:string)=>void}){
 const today=todayISO(),options=periods(today),[period,setPeriod]=useState(options[0][0]);
 // «فترة مخصصة»: any from–to range (from the first of this month to today until changed).
 const [customFrom,setCustomFrom]=useState(today.slice(0,8)+'01'),[customTo,setCustomTo]=useState(today);
 const custom=period==='custom',chosen=options.find(o=>o[0]===period)||options[0];
 const from=custom?(customFrom<=customTo?customFrom:customTo):chosen[2],to=custom?(customFrom<=customTo?customTo:customFrom):chosen[3],range={name:custom?'فترة مخصصة':chosen[1]};
 // The figures for the period asked, worked out once when its reports arrive (a slower answer for an earlier period never shows).
 const [got,setGot]=useState<{key:string;rows?:PersonStats[];reports?:StoredReport[];error?:string}>({key:''});
 const {records,work,members,rules}=p;
 useEffect(()=>{let on=true;const key=from+'|'+to;
  dailyRequest<TeamList>('list',{from,to}).then(d=>{if(on)setGot({key,reports:d.reports,rows:performance({people:d.expected,reports:d.reports,from,to,today:todayISO(),records,work,members,rules})})}).catch(e=>{if(on)setGot({key,error:(e as Error).message})});
  return()=>{on=false}},[from,to,records,work,members,rules]);
 const current=got.key===from+'|'+to?got:{key:''},error=current.error||'',rows=current.rows||[],data=current.rows;
 const label=`${range.name} · ${formatDate(from)} – ${formatDate(to)}`;
 const total=rows.reduce((t,r)=>({sent:t.sent+r.sent,due:t.due+r.workDays,hearings:t.hearings+r.hearings,posted:t.posted+r.posted,late:t.late+r.lateNow}),{sent:0,due:0,hearings:0,posted:0,late:0});
 const print=()=>{if(!printHtml(performanceHtml(rows,label,p.printedBy,formatDate(today))))toast.error('تعذر فتح الطباعة.')};
 // One person's reports over the period, one report a page, oldest first.
 const printPerson=(r:PersonStats)=>{const list=(current.reports||[]).filter(x=>x.userId===r.userId&&x.date>=from&&x.date<=to).sort((a,b)=>a.date.localeCompare(b.date));
  if(!list.length){toast.error('لا تقارير لهذا الشخص في هذه الفترة.');return}
  if(!printHtml(reportsHtml(list.map(x=>({name:r.name,date:formatDate(x.date),payload:cleanReport(readReport(x.payload)),sent:x.submittedAt?'أُرسل '+clock(x.submittedAt):'مسودة لم تُرسل'})),p.printedBy,formatDate(today))))toast.error('تعذر فتح الطباعة.')};
 return <section className="panel day-missions" aria-label="الأداء"><div className="day-col-head"><h2>الأداء</h2>
   <div className="work-chips day-chips" role="group" aria-label="الفترة">{options.map(([k,l])=><button key={k} className={'work-chip'+(period===k?' on':'')} aria-pressed={period===k} onClick={()=>setPeriod(k)}>{l}</button>)}<button className={'work-chip'+(custom?' on':'')} aria-pressed={custom} onClick={()=>setPeriod('custom')}>فترة مخصصة</button></div>
   {custom&&<div className="perf-range"><DateField label="من" value={customFrom} onChange={v=>v&&setCustomFrom(v)}/><DateField label="إلى" value={customTo} onChange={v=>v&&setCustomTo(v)}/></div>}
   <div className="actions"><button className="btn" disabled={!rows.length} onClick={print}><Printer size={15}/> طباعة</button></div></div>
  {error?<p className="day-empty" role="alert">{error}</p>:!data?<p className="day-empty" role="status"><LoaderCircle className="spin" size={14}/> جارٍ الحساب…</p>:!rows.length?<NoReporters canManage={p.canManageTeam}/>:<>
  <div className="perf-totals"><span><strong>{total.due?Math.round(100*total.sent/total.due):0}%</strong> من التقارير المطلوبة أُرسلت</span><span><strong>{total.hearings}</strong> جلسة في التقارير</span><span><strong>{total.posted}</strong> جلسة رُحّلت في القضايا</span><span className={total.late?'late':''}><strong>{total.late}</strong> متأخر الآن</span></div>
  <div className="day-list"><table className="office-table perf-table"><thead><tr><th>المحامي</th><th>التقارير المرسلة</th><th>في اليوم نفسه</th><th>جلسات حضرها</th><th>جلسات رحّلها</th><th>أعمال إدارية</th><th>مراجعات خارجية</th><th>مهام منجزة</th><th>متأخر الآن</th><th>آخر تقرير</th><th aria-label="تقارير الفترة"/></tr></thead>
   <tbody>{rows.map(r=>{const pct=r.workDays?Math.min(100,Math.round(100*r.sent/r.workDays)):0;return <tr key={r.userId} tabIndex={0} onClick={()=>onPick(r.userId)} onKeyDown={e=>{if(e.key==='Enter')onPick(r.userId)}} title="فتح يومه وتقريره">
    <td><b>{r.name}</b>{r.drafts>0&&<small>{r.drafts} مسودة لم تُرسل</small>}</td>
    <td><span className="perf-rate"><i style={{width:pct+'%'}} className={pct>=90?'good':pct>=60?'mid':'low'}/></span><span>{r.sent} من {r.workDays}</span></td>
    <td className="mono">{r.sameDay}</td><td className="mono">{r.hearings}</td><td className="mono">{r.posted}</td><td className="mono">{r.admin}</td><td className="mono">{r.external}</td><td className="mono">{r.tasks}</td>
    <td className={'mono'+(r.lateNow?' late':'')}>{r.lateNow}</td><td>{r.lastSent?formatDate(r.lastSent.slice(0,10))+' '+clock(r.lastSent):'—'}</td>
    <td><button type="button" className="btn" disabled={!r.sent&&!r.drafts} title="طباعة كل تقاريره في هذه الفترة" onClick={e=>{e.stopPropagation();printPerson(r)}} onKeyDown={e=>e.stopPropagation()}><Printer size={14}/> تقاريره</button></td></tr>})}</tbody></table></div></>}
 </section>;
}

/** «ملخص اليوم»: the report's counts at a glance. */
function DaySummary({payload}:{payload:DailyPayload}){
 const sum=daySummary(cleanReport(payload));
 return <div className="day-summary" aria-label="ملخص اليوم"><b>ملخص اليوم</b>{([['جلسات',sum.hearings],['أعمال إدارية',sum.admin],['مراجعات خارجية',sum.external],['مهام منجزة',sum.tasks]] as [string,number][]).map(([l,v])=><span key={l}><strong>{v}</strong>{l}</span>)}</div>;
}

/** «ما عملته»: the person's own report as one section — a button for each kind of work, and what it holds so far. */
function ReportEditor({r,date,today,n,others,records,first}:{r:OwnReport;date:string;today:string;n:string;others:boolean;records:CaseRecord[];first:string[]}){
 const future=date>today,ro=future||r.busy,[notes,setNotes]=useState(false);
 // A hearing line names its case by picking it (by code, automatic number, case number or a party), never by free text,
 // so it links to the actual case; its court is picked from the courts the office's cases use, filled from the case.
 const byId=useMemo(()=>new Map(records.map(c=>[c.id,c])),[records]);
 const caseOptions=useMemo(()=>{const head=new Set(first);return [...first.map(id=>byId.get(id)).filter((c):c is CaseRecord=>!!c),...records.filter(c=>!head.has(c.id))]
  .map(c=>({value:c.id,label:caseRef(c),hint:`${clientName(c)||'—'} ضد ${c.opponent||'—'}${c.court?' · '+c.court:''}`,terms:[c.autoNumber,c.caseNumber].filter(Boolean).join(' ')}))},[records,first,byId]);
 // Cases this account does not open are found on the server by their code (or automatic number): only the code and the
 // court come back, enough to name the hearing and its circuit.
 const [found,setFound]=useState<Map<string,{id:string;code:string;autoNumber:string;court:string;insurance:boolean}>>(()=>new Map());
 const lookup=useRef<ReturnType<typeof setTimeout>>(undefined);
 const search=(q:string)=>{clearTimeout(lookup.current);const t=q.trim();if(!t)return;
  const n=normalizeSearch(t);if(caseOptions.some(o=>normalizeSearch(o.label+' '+o.terms).includes(n)))return;
  lookup.current=setTimeout(()=>{dailyRequest<{id:string;code:string;autoNumber:string;court:string;insurance:boolean}[]>('find_case',{q:t}).then(list=>{if(list.length)setFound(old=>{const m=new Map(old);for(const c of list)if(!byId.has(c.id))m.set(c.id,c);return m})}).catch(()=>{})},250)};
 const foundRef=(c:{code:string;autoNumber:string;insurance:boolean})=>caseCode({code:c.code,insurance:c.insurance})||c.autoNumber||'بلا كود';
 const allCases=useMemo(()=>[...caseOptions,...[...found.values()].map(c=>({value:c.id,label:foundRef(c),hint:c.court||'',terms:c.autoNumber}))],[caseOptions,found]);
 // The case's code and court: from the cases this account opens, or from the search.
 const caseInfo=(id:string)=>{const c=byId.get(id);if(c)return {label:caseRef(c),court:String(c.court||'')};const f=found.get(id);return f?{label:foundRef(f),court:f.court}:undefined};
 const courts=useMemo(()=>{const n=new Map<string,number>();for(const c of records){const v=String(c.court||'').trim();if(v)n.set(v,(n.get(v)||0)+1)}
  for(const v of courtChoices([...n.keys()],COURTS))if(!n.has(v))n.set(v,0);return [...n].sort((a,b)=>b[1]-a[1]).map(([v])=>({value:v,label:v}))},[records]);
 const lineField=(k:ReportPart,j:number,l:ReportLine,f:LineField,label:string)=>{
  if(k==='hearings'&&f==='text'){const id=lineCase(l);return <FilterBox key={f} label={label} placeholder={label+' (اكتب للبحث)'} value={caseInfo(id)?id:l.text} disabled={ro} options={allCases} onQuery={search}
   // Picking the case fills its court and circuit from it (still free to change after).
   onChange={v=>{const c=caseInfo(v);if(c)setLine(k,j,{caseId:v,text:c.label,court:c.court||l.court||''})}}/>}
  if(k==='hearings'&&f==='court'){const own=caseInfo(lineCase(l))?.court;return <FilterBox key={f} label={label} placeholder={label} value={l.court||''} disabled={ro}
   options={own&&!courts.some(o=>o.value===own)?[{value:own,label:own},...courts]:courts} onChange={v=>setLine(k,j,{court:v})}/>}
  return <input key={f} aria-label={label} placeholder={label} value={l[f]||''} disabled={ro} onChange={e=>setLine(k,j,{[f]:e.target.value})}/>};
 const setLine=(k:ReportPart,i:number,v:Partial<ReportLine>)=>r.set({...r.payload,[k]:r.payload[k].map((l,j)=>j===i?{...l,...v}:l)});
 const addLine=(k:ReportPart)=>{r.set({...r.payload,[k]:[...r.payload[k],{text:'',result:''}]});setTimeout(()=>document.querySelector<HTMLInputElement>(`[data-part="${k}"] .report-line:last-of-type input`)?.focus(),30)};
 const showNotes=notes||!!r.payload.notes;
 return <section className="day-sec day-report-sec" aria-label="ما عملته">
  <div className="day-sec-head"><h2><span className="day-sec-n" aria-hidden>{n}</span>{others?'ما عملته أيضاً':'ما عملته اليوم'}</h2></div>
  {r.error?<p className="day-empty" role="alert">{r.error}</p>:future?<p className="day-empty">لا يُكتب تقرير ليوم لم يأتِ بعد.</p>:<>
  <p className="report-hint">{others?'ما ترحّله وتُتمّه من القائمة يُضاف إلى تقريرك بنفسه. أضف هنا كل عمل آخر:':'أضف كل عمل قمت به اليوم:'}</p>
  <div className="part-adds" role="group" aria-label="إضافة إلى التقرير">{REPORT_PARTS.map(({key,title})=><button key={key} type="button" className="part-add" aria-label={'إضافة سطر: '+title} title={title} disabled={ro} onClick={()=>addLine(key)}><Plus size={13}/> {QUICK_ADD[key]}</button>)}
   {!showNotes&&<button type="button" className="part-add" disabled={ro} onClick={()=>setNotes(true)}><Plus size={13}/> ملاحظة أو معوق</button>}</div>
  <div className="day-report-body">{REPORT_PARTS.map(({key,title,fields},i)=>r.payload[key].length?<div key={key} className="report-part" data-part={key}>
   <div className="report-part-head"><b>{ORDINALS[i]}: {title}</b><span className="report-count">{r.payload[key].length}</span></div>
   {r.payload[key].map((l,j)=><div key={j} className="report-line" style={{'--n':fields.length} as React.CSSProperties}>
    {fields.map(([f,label])=>lineField(key,j,l,f,label))}
    <button className="icon-btn" aria-label="حذف السطر" disabled={ro} onClick={()=>r.set({...r.payload,[key]:r.payload[key].filter((_,x)=>x!==j)})}><X size={14}/></button></div>)}</div>:null)}
   {showNotes&&<label className="report-part report-notes"><b>{ORDINALS[REPORT_PARTS.length]}: {NOTES.title}</b><textarea rows={2} autoFocus={notes&&!r.payload.notes} value={r.payload.notes} disabled={ro} onChange={e=>r.set({...r.payload,notes:e.target.value})} placeholder={NOTES.hint}/></label>}
   {!reportCount(r.payload)&&!showNotes&&<p className="day-empty">لا شيء في التقرير بعد.</p>}</div></>}
 </section>;
}
/** The bar at the bottom of one's own day: where the report stands, what it holds, and save, send, copy, print. */
function ReportBar({r,date,today,name,printedBy}:{r:OwnReport;date:string;today:string;name:string;printedBy:string}){
 if(date>today||r.error)return null;
 const status=r.loading?'جارٍ التحميل…':r.dirty?'تعديلات غير محفوظة':r.submittedAt?'أُرسل '+clock(r.submittedAt):r.revision?'مسودة محفوظة':'لم يُحفظ بعد';
 const full=reportCount(cleanReport(r.payload))>0;
 const copy=()=>{void navigator.clipboard?.writeText(reportText(cleanReport(r.payload),name,formatDate(date))).then(()=>toast.success('نُسخ التقرير المكتمل'),()=>toast.error('تعذر النسخ.'))};
 const print=()=>{if(!printHtml(reportsHtml([{name,date:formatDate(date),payload:cleanReport(r.payload),sent:r.submittedAt?'أُرسل '+clock(r.submittedAt):'مسودة'}],printedBy,formatDate(today))))toast.error('تعذر فتح الطباعة.')};
 return <div className="day-bar" role="group" aria-label="التقرير">
  <span className={'tag '+(r.dirty?'amber':r.submittedAt?'green':'')} role="status">{status}</span><DaySummary payload={r.payload}/>
  <div className="actions"><button className="icon-btn" aria-label="طباعة التقرير" title="طباعة" disabled={!full} onClick={print}><Printer size={15}/></button>
   <button className="icon-btn" aria-label="نسخ التقرير المكتمل" title="نسخ التقرير المكتمل" disabled={!full} onClick={copy}><Copy size={15}/></button>
   <button className="btn" disabled={r.busy||r.loading||!r.dirty} onClick={()=>void r.save(false)}><Save size={15}/> حفظ</button>
   <button className="btn primary" disabled={r.busy||r.loading||!full} onClick={()=>void r.save(true)}>{r.busy?<LoaderCircle className="spin" size={15}/>:<Send size={15}/>} {r.submittedAt?'إعادة الإرسال':'إرسال التقرير'}</button></div></div>;
}

function ReportReader({r,printedBy}:{r:StoredReport;printedBy:string}){
 const payload=cleanReport(readReport(r.payload)),name=r.displayName?titled(r.displayName):r.username;
 const print=()=>{if(!printHtml(reportsHtml([{name,date:formatDate(r.date),payload,sent:r.submittedAt?'أُرسل '+clock(r.submittedAt):'مسودة'}],printedBy,formatDate(todayISO()))))toast.error('تعذر فتح الطباعة.')};
 return <div className="day-report-body report-read">{REPORT_PARTS.map(({key,title},n)=>payload[key].length?<div key={key} className="report-part"><div className="report-part-head"><b>{ORDINALS[n]}: {title}</b><span className="report-count">{payload[key].length}</span></div>
  <ol>{payload[key].map((l,i)=><li key={i}>{lineText(l,key)}</li>)}</ol></div>:null)}
  {payload.notes&&<div className="report-part"><div className="report-part-head"><b>{ORDINALS[REPORT_PARTS.length]}: {NOTES.title}</b></div><p className="report-notes-text">{payload.notes}</p></div>}
  {!reportCount(payload)&&<p className="day-empty">التقرير فارغ.</p>}
  <DaySummary payload={payload}/>
  <div className="actions"><button className="btn" onClick={print}><Printer size={15}/> طباعة</button><button className="btn" onClick={()=>void navigator.clipboard?.writeText(reportText(payload,name,formatDate(r.date))).then(()=>toast.success('نُسخ التقرير'))}><Copy size={15}/> نسخ</button></div></div>;
}

/** Nobody holds the daily report yet: what to do about it, with the way there for those who can. */
function NoReporters({canManage}:{canManage?:boolean}){
 return <div className="day-empty day-empty-action"><p>لا أحد مكلف بالتقرير اليومي بعد. ليظهر محامٍ هنا: «فريق المكتب» ← «تعديل الصلاحيات» على حسابه ← اضغط «مهام اليوم والتقرير» في المعاينة لمنحه.</p>
  {canManage&&<button type="button" className="btn primary" onClick={()=>openWorkspace('team')}><UsersRound size={15}/> فتح فريق المكتب</button>}</div>;
}
/** The short name of each part of the report, for a person's line on «الفريق اليوم». */
const PART_SHORT:Record<ReportPart,string>={hearings:'جلسات',tasks:'مهام',admin:'إداري',external:'خارجي',other:'أخرى',pending:'متابعة'};
/**
 * A person's day in one line (owner, 11 November 2026: «each person briefly tell the whole story»): what their report
 * holds when they wrote one, and the next thing still open on the day.
 */
function story(r:TeamDayRow){
 const parts=r.summary?REPORT_PARTS.filter(({key})=>r.summary![key]).map(({key})=>`${PART_SHORT[key]} ${r.summary![key]}`):[];
 if(r.notes)parts.push('ملاحظات');
 const said=r.summary?(parts.length?'التقرير: '+parts.join(' · '):'التقرير فارغ'):'';
 const next=r.next?`التالي: ${r.next.time?r.next.time+' ':''}${r.next.text}`:'';
 if(said)return next?said+' — '+next:said;
 return next||(r.hearings+r.tasks?'أنجز ما عليه اليوم ولم يكتب التقرير':'لا جلسات ولا مهام عليه في هذا اليوم');
}
/** Done of all, as a short bar and its numbers. */
function Meter({icon,label,done,all}:{icon:React.ReactNode;label:string;done:number;all:number}){
 return <span className={'team-meter'+(all&&done===all?' full':'')+(all?'':' none')} title={all?`${label}: ${done} من ${all}`:`${label}: لا شيء في هذا اليوم`}>
  {icon}<span className="team-meter-label">{label}</span><i aria-hidden><s style={{width:all?Math.round(done/all*100)+'%':'0'}}/></i><b>{all?`${done}/${all}`:'—'}</b></span>;
}
/**
 * «الفريق اليوم»: a card a person telling their day at a glance (their report and what is in it, the day's sittings and
 * tasks as bars, what is late, the next thing open), as many to a row as the screen holds; chips pick out who has not
 * written, drafts, sent or has late work, and a search finds a name. A card opens that person's report (or their day).
 */
type TeamFilter='all'|'none'|'draft'|'sent'|'late';
function TeamBoard({rows,date,today,reading,onRead,onDay,printedBy,canManage}:{rows:TeamDayRow[]|null;date:string;today:string;reading:string;onRead:(id:string)=>void;onDay:(id:string)=>void;printedBy:string;canManage?:boolean}){
 const [filter,setFilter]=useState<TeamFilter>('all'),[q,setQ]=useState('');
 const sent=rows?.filter(r=>r.status==='sent')||[],open=rows?.find(r=>r.userId===reading)?.report;
 const printAll=()=>{if(!sent.length)return;if(!printHtml(reportsHtml(sent.map(r=>({name:r.name,date:formatDate(date),payload:cleanReport(readReport(r.report!.payload)),sent:'أُرسل '+clock(r.report!.submittedAt)})),printedBy,formatDate(todayISO()))))toast.error('تعذر فتح الطباعة.')};
 const pass=(r:TeamDayRow,f:TeamFilter)=>f==='all'||(f==='late'?r.late>0:r.status===f);
 const count=(f:TeamFilter)=>rows?.filter(r=>pass(r,f)).length||0;
 const shown=(rows||[]).filter(r=>pass(r,filter)&&(!q.trim()||normalizeSearch(r.name+' '+r.username).includes(normalizeSearch(q))));
 const chips:[TeamFilter,string][]=[['all','الكل'],['none','لم يكتب'],['draft','مسودة'],['sent','أُرسل'],['late','متأخر عليه']];
 return <section className="day-sec day-board" aria-label="تقارير الفريق">
  <div className="day-sec-head"><h2><span className="day-sec-n" aria-hidden>١</span>الفريق {date===today?'اليوم':'في هذا اليوم'}</h2>
   {rows&&rows.length>0&&!open&&<div className="work-chips day-chips team-chips" role="group" aria-label="تصفية الفريق">{chips.map(([k,l])=><button key={k} type="button" className={'work-chip'+(filter===k?' on':'')+(k==='late'?' late':'')} aria-pressed={filter===k} onClick={()=>setFilter(k)}>{l}<b>{count(k)}</b></button>)}</div>}
   <div className="actions">{rows&&rows.length>8&&!open&&<input className="team-search" type="search" aria-label="بحث عن شخص في الفريق" placeholder="ابحث عن اسم…" value={q} onChange={e=>setQ(e.target.value)}/>}
    <button className="btn" disabled={!sent.length} onClick={printAll}><Printer size={15}/> طباعة المرسلة</button></div></div>
  {!rows?<p role="status" className="day-empty"><LoaderCircle className="spin" size={14}/> جارٍ تحميل التقارير…</p>
  :open?<><button className="btn day-back" onClick={()=>onRead('')}><ChevronRight size={15}/> كل الفريق · {open.displayName?titled(open.displayName):open.username}</button><ReportReader r={open} printedBy={printedBy}/></>
  :!rows.length?<NoReporters canManage={canManage}/>
  :!shown.length?<p className="day-empty">لا أحد بهذا التصنيف.</p>
  :<ul className="team-stories">{(shown.length>1?[0,1]:[0]).map(n=><li key={'cols'+n} className="team-story-cols" aria-hidden><span>الاسم</span><span>التقرير</span><span>الجلسات</span><span>المهام</span><span>يومه باختصار</span></li>)}
   {shown.map(r=>{const say=story(r);return <li key={r.userId} className={'team-story s-'+r.status+(r.late?' has-late':'')}>
    <button type="button" className="team-story-main" onClick={()=>r.report?onRead(r.userId):onDay(r.userId)} title={r.name+' — '+say+(r.report?'\nاقرأ التقرير':'\nافتح يومه')}>
     <span className="team-story-head"><span className="team-story-name">{r.name}</span>
      <span className={'tag team-story-status '+(r.status==='sent'?'green':r.status==='draft'?'amber':'red')}>{STATUS_LABELS[r.status]}{r.status==='sent'&&' '+clock(r.report!.submittedAt)}</span></span>
     <span className="team-story-meters"><Meter icon={<Gavel size={12} aria-hidden/>} label="الجلسات" done={r.hearingsDone} all={r.hearings}/><Meter icon={<ListChecks size={12} aria-hidden/>} label="المهام" done={r.tasksDone} all={r.tasks}/>
      {r.late>0&&<span className="team-story-late" title="متأخر عليه الآن"><Hourglass size={12} aria-hidden/>متأخر <b>{r.late}</b></span>}</span>
     <span className="team-story-line">{say}</span></button>
    <button type="button" className="icon-btn team-story-day" aria-label={'يوم '+r.name} title="يومه: قائمته وتقريره" onClick={()=>onDay(r.userId)}><ArrowUpLeft size={14}/></button></li>})}</ul>}
 </section>;
}
