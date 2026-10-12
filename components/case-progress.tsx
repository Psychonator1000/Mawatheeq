import {Check} from 'lucide-react';
import {type CaseRecord,type Rules,caseState,formatDate,elapsedDaysLabel} from '@/lib/domain';
import {LEVELS,LEVEL_TYPE,currentLevel,stagesOf,type CaseStage} from '@/lib/case-stages';
import {Badge} from './shared';

type Step={label:string;value:string;note?:string;state:'done'|'current'|'next'|'todo'|'late';stage?:CaseStage};
const LEVEL_TYPES=[...Object.values(LEVEL_TYPE),'حكم ابتدائي'];
/** Where the case stands at a glance: first instance → appeal → cassation, the appeal deadline, and the latest procedure. Closed levels open their record. */
export default function CaseProgress({c,rules,asOf,onStage}:{c:CaseRecord;rules:Rules;asOf:string;onStage?:(id:string)=>void}){
 const st=caseState(c,rules,asOf),stages=stagesOf(c);
 // Objections and records needing review sit outside the three levels until the case has been moved through them.
 const other=!c.stage&&!stages.length&&!LEVEL_TYPES.includes(c.type);
 const level=LEVELS.indexOf(currentLevel(c));
 const appealed=st.appeal==='تم',final=st.days===0&&!!c.date,late=!appealed&&!final&&st.remaining!==null&&st.remaining<0;
 const deadline=st.awaiting?'بانتظار حكم هذه الدرجة':appealed?'تم الطعن':final?'حكم نهائي':st.remaining===null?'مهلة الطعن غير معروفة':st.remaining<0?'انتهت مهلة الطعن':`متبقٍ للطعن ${st.remaining} يوم`;
 const steps:Step[]=LEVELS.map((l,i)=>{const done=[...stages].reverse().find(s=>s.level===l);
  return i<level?{label:l,value:done?.date?formatDate(done.date)+(done.outcome&&done.outcome!=='غير محدد'?' · '+done.outcome:''):'صدر الحكم',note:done?.caseNumber||undefined,state:'done',stage:done}
  :i===level?{label:l,value:c.date?formatDate(c.date):st.awaiting?'بانتظار الحكم':'تاريخ الحكم غير مسجل',note:st.awaiting?undefined:deadline,state:late?'late':final?'done':'current'}
  :i===level+1&&appealed?{label:l,value:'تم الطعن — انقل الملف',state:'next'}
  :{label:l,value:'—',state:'todo'}});
 // How much of the appeal window has gone (0–100), while it is running.
 const window=!other&&st.days&&st.remaining!==null&&!appealed?Math.min(100,Math.max(0,Math.round((st.days-st.remaining)/st.days*100))):null;
 const latest=[...(c.procedures||[])].filter(p=>p.text).sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
 return <section className="case-progress" aria-label="تقدم القضية">
  {other?<p className="progress-other"><b>{c.type||'نوع الحكم غير محدد'}</b>{c.date&&<> · {formatDate(c.date)}</>} · {deadline}</p>
  :<ol className="progress-steps">{steps.map((s,i)=>{const body=<><span className="step-dot" aria-hidden>{s.state==='done'?<Check size={13}/>:i+1}</span><span className="step-text"><small>{s.label}</small><b>{s.value}</b>{s.note&&<em>{s.note}</em>}</span></>;
   return <li key={s.label} className={'step '+s.state}>{s.stage&&onStage?<button type="button" className="step-open" onClick={()=>onStage(s.stage!.id)} aria-label={'فتح سجل '+s.label}>{body}</button>:body}</li>})}</ol>}
  {window!==null&&<div className={'appeal-window'+(st.remaining!==null&&st.remaining<=rules.warning?' urgent':'')} role="meter" aria-label="مهلة الطعن المنقضية" aria-valuenow={window} aria-valuemin={0} aria-valuemax={100}><i style={{width:window+'%'}}/></div>}
  <div className="progress-foot"><Badge value={st.outcome}/><Badge value={st.status}/>{c.date&&<span className="tag">منذ الحكم {elapsedDaysLabel(st.elapsed)}{st.executionRemaining!==null&&st.executionRemaining>=0?` · للتنفيذ ${st.executionRemaining} يوم`:''}</span>}
   {latest?<span className="latest-step" title={latest.text}><small>آخر إجراء{latest.date?' · '+formatDate(latest.date):''}</small>{latest.text}</span>:<span className="latest-step muted">لا توجد إجراءات مسجلة في هذه الدرجة</span>}</div>
 </section>;
}
