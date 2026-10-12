'use client';
import {useMemo,useState} from 'react';
import {ArrowUpFromLine,CalendarClock,CheckSquare,Gavel,ListChecks,Scale} from 'lucide-react';
import {type CaseRecord,formatDate,todayISO} from '@/lib/domain';
import type {WorkItem} from '@/lib/office';
import {buildTimeline,type TimelineKind} from '@/lib/case-timeline';
import {levelLabel} from '@/lib/case-stages';

const ICONS:Record<TimelineKind,typeof Gavel>={session:Gavel,procedure:ListChecks,judgment:Scale,level:ArrowUpFromLine,hearing:CalendarClock,task:CheckSquare};
const LABELS:Record<TimelineKind,string>={session:'جلسة',procedure:'إجراء',judgment:'حكم',level:'انتقال درجة',hearing:'موعد جلسة',task:'مهمة'};
const FILTERS:[string,string,TimelineKind[]][]=[['all','الكل',[]],['sessions','الجلسات',['session','hearing']],['judgments','الأحكام والدرجات',['judgment','level']],['work','الإجراءات والمهام',['procedure','task']]];
const STATES={done:'تم',upcoming:'قادم',overdue:'متأخر'};

/** The case's whole story, newest first: every level's sessions, procedures and judgments, level moves, and hearings and tasks. */
export default function CaseTimeline({c,work}:{c:CaseRecord;work:WorkItem[]}){
 const [filter,setFilter]=useState('all');
 const events=useMemo(()=>buildTimeline(c,work,todayISO()),[c,work]);
 const kinds=FILTERS.find(f=>f[0]===filter)![2],shown=kinds.length?events.filter(e=>kinds.includes(e.kind)):events;
 return <div className="case-timeline">
  <div className="department-tabs" role="group" aria-label="تصفية السير الزمني">{FILTERS.map(([id,label,ks])=><button type="button" key={id} className={'btn '+(filter===id?'primary':'')} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label} ({ks.length?events.filter(e=>ks.includes(e.kind)).length:events.length})</button>)}</div>
  {!shown.length&&<p className="muted">لا توجد أحداث مسجلة بعد.</p>}
  <ol className="timeline-list">{shown.map((e,i)=>{const Icon=ICONS[e.kind],m=e.date.slice(0,7),head=i===0||shown[i-1].date.slice(0,7)!==m?m:'';
   return <li key={e.id} className={'tl-item '+e.kind+(e.state?' '+e.state:'')}>{head&&<div className="tl-month">{new Intl.DateTimeFormat('ar-KW',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-01T00:00:00Z'))}</div>}
    <span className="tl-dot" aria-hidden><Icon size={14}/></span>
    <div className="tl-body"><div className="tl-head"><span className="mono">{formatDate(e.date)}{e.time?' '+e.time:''}</span><span className="tag">{LABELS[e.kind]}</span><span className="tag">{levelLabel(e.level)}</span>{e.state&&<span className={'tag '+(e.state==='overdue'?'amber':e.state==='done'?'green':'')}>{STATES[e.state]}</span>}</div>
     <b>{e.title}</b>{e.detail&&<p>{e.detail}</p>}{e.who&&<small>{e.who}</small>}</div></li>})}</ol>
 </div>;
}
