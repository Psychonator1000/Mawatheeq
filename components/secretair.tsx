import {useState} from 'react';
import {CalendarDays,Clock3} from 'lucide-react';
import type {CaseSummary} from '@/lib/departments';
import type {OfficeContext,WorkItem} from '@/lib/office';
import {todayISO,formatDate} from '@/lib/domain';
import {DateField} from './shared';
import OfficeWork from './office-work';
export default function Secretary(props:{items:WorkItem[];context:OfficeContext;records:CaseSummary[];onChanged:()=>void;onOpenCase:(c:CaseSummary)=>void}) {
 const [day,setDay]=useState(todayISO());
 const agenda=props.items.filter(w=>w.dueDate===day&&w.status!=='cancelled').sort((a,b)=>a.dueTime.localeCompare(b.dueTime));
 return <><section className="department-hero"><div><div className="eyebrow">أجندة المكتب</div><h1>كل موعد في مكانه.</h1><p>تابع جلسات اليوم، نسّق المهام، وسجّل النتائج للفريق.</p></div><CalendarDays size={62}/></section>
 <section className="agenda-panel"><div className="agenda-heading"><h2>جدول {formatDate(day)}</h2><DateField label="يوم الأجندة" value={day} onChange={setDay}/><button className="btn" onClick={()=>setDay(todayISO())}>اليوم</button></div>
 <div className="agenda-list">{agenda.length?agenda.map(w=><article className={'agenda-item '+(w.status==='done'?'done':'')} key={w.id}><span className="agenda-time"><Clock3 size={16}/>{w.dueTime||'دون وقت'}</span><div><b>{w.title}</b><p>{w.kind==='hearing'?'جلسة':'مهمة'} · {props.context.members.find(m=>m.id===w.assigneeId)?.username||'غير متاح'}{w.location?' · '+w.location:''}</p></div><span className="tag">{w.status==='done'?'مكتملة':w.priority==='urgent'?'عاجلة':'مجدولة'}</span></article>):<p className="muted">لا توجد مواعيد في هذا اليوم. يمكنك إضافة موعد من سجل العمل أدناه.</p>}</div></section>
 <OfficeWork {...props}/></>;
}
