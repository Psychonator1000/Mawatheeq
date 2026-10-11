import {Clock3} from 'lucide-react';
import {myWork} from '@/lib/notifications';
import {addDays,formatDate,todayISO,type CaseRecord} from '@/lib/domain';
import type {WorkItem} from '@/lib/office';
import {clientName} from '@/lib/clients';

const groups=[['overdue','متأخرة'],['today','اليوم'],['upcoming','خلال 7 أيام']] as const;
/** The signed-in user's open tasks and hearings, shown on the overview. */
export default function MyWork({work,userId,records,onOpenWork,onOpenAll}:{work:WorkItem[];userId:string;records:CaseRecord[];onOpenWork:(id:string)=>void;onOpenAll:()=>void}) {
 const today=todayISO(),mine=myWork(work,userId,today,addDays(today,7)),cases=new Map(records.map(c=>[c.id,c]));
 const total=mine.overdue.length+mine.today.length+mine.upcoming.length;
 return <section className="panel my-work" aria-labelledby="my-work-title"><div className="panel-head"><div><h2 id="my-work-title">عملي</h2><p className="subtitle">المهام والجلسات المسندة إليك.</p></div><button className="btn" onClick={onOpenAll}>كل المهام والجلسات</button></div>
 {!total?<p className="muted my-work-empty">لا توجد أعمال مفتوحة مسندة إليك خلال الأيام السبعة القادمة.</p>:<div className="my-work-grid">{groups.map(([key,label])=><div key={key} className={'my-work-col '+key}><h3>{label} <span className="mono">{mine[key].length}</span></h3>{mine[key].length?<ul>{mine[key].slice(0,6).map(w=>{const c=cases.get(w.caseId);return <li key={w.id}><button className="my-work-item" onClick={()=>onOpenWork(w.id)}><b>{w.title}</b><small><Clock3 size={12}/> <span dir="ltr">{formatDate(w.dueDate)}{w.dueTime?' '+w.dueTime:''}</span> · {w.kind==='hearing'?'جلسة':'مهمة'}{w.priority==='urgent'?' · عاجلة':''}{c?' · '+(c.code||c.autoNumber||clientName(c)):''}</small></button></li>})}{mine[key].length>6&&<li className="muted">و{mine[key].length-6} أخرى</li>}</ul>:<p className="muted">لا شيء</p>}</div>)}</div>}</section>;
}
