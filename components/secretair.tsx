import {useState} from 'react';
import {ChevronRight,ChevronLeft,Clock3,Plus,Printer} from 'lucide-react';
import type {CaseSummary} from '@/lib/departments';
import type {OfficeContext,WorkItem} from '@/lib/office';
import {todayISO,formatDate,addDays} from '@/lib/domain';
import {DateField} from './shared';
import OfficeWork from './office-work';

const dayName=(iso:string)=>new Intl.DateTimeFormat('ar-KW',{weekday:'long',timeZone:'UTC'}).format(new Date(iso+'T00:00:00Z'));

/** The secretary's desk on one screen: the day's agenda beside the office's tasks and hearings. */
export default function Secretary(props:{items:WorkItem[];context:OfficeContext;records:CaseSummary[];onChanged:()=>void;onOpenCase:(c:CaseSummary)=>void}) {
 const [day,setDay]=useState(todayISO());
 const agenda=props.items.filter(w=>w.dueDate===day&&w.status!=='cancelled').sort((a,b)=>(a.dueTime||'99').localeCompare(b.dueTime||'99'));
 const hearings=agenda.filter(w=>w.kind==='hearing').length;
 const who=(id:string)=>{const m=props.context.members.find(x=>x.id===id);return m?.displayName||m?.username||'غير متاح'};
 return <OfficeWork {...props} compact aside={(open,add,roll)=><section className="panel sec-agenda" aria-label="أجندة اليوم">
  <div className="sec-agenda-head"><div><h2>{day===todayISO()?'أجندة اليوم':'أجندة '+dayName(day)}</h2><small>{dayName(day)} {formatDate(day)} · {agenda.length} موعد</small></div>
   {props.context.permissions.canEdit&&<button className="icon-btn" aria-label={'إضافة مهمة في '+formatDate(day)} title="إضافة مهمة في هذا اليوم" onClick={()=>add('task',day)}><Plus size={18}/></button>}</div>
  <div className="sec-day-nav"><button className="icon-btn" aria-label="اليوم السابق" onClick={()=>setDay(d=>addDays(d,-1))}><ChevronRight size={18}/></button>
   <DateField label="يوم الأجندة" value={day} onChange={v=>setDay(v||todayISO())}/>
   <button className="icon-btn" aria-label="اليوم التالي" onClick={()=>setDay(d=>addDays(d,1))}><ChevronLeft size={18}/></button>
   {day!==todayISO()&&<button className="btn sec-today" onClick={()=>setDay(todayISO())}>اليوم</button>}</div>
  <div className="sec-agenda-list">{agenda.length?agenda.map(w=><button key={w.id} className={'agenda-item '+(w.status==='done'?'done':'')} onClick={()=>open(w)}>
   <span className="agenda-time"><Clock3 size={14}/>{w.dueTime||'دون وقت'}</span>
   <span className="agenda-body"><b>{w.title}</b><small>{w.kind==='hearing'?'جلسة':'مهمة'} · {who(w.assigneeId)}{w.location?' · '+w.location:''}</small></span>
   <span className={'tag '+(w.status==='done'?'green':w.priority==='urgent'?'red':'')}>{w.status==='done'?'مكتملة':w.priority==='urgent'?'عاجلة':'مجدولة'}</span></button>)
   :<p className="muted sec-empty">لا توجد مواعيد في هذا اليوم.</p>}</div>
  <button className="btn sec-roll" disabled={!hearings} title={hearings?undefined:'لا توجد جلسات في هذا اليوم'} onClick={()=>roll(day)}><Printer size={16}/> طباعة رول جلسات هذا اليوم ({hearings})</button>
 </section>}/>;
}
