import {Check} from 'lucide-react';
import {type CaseRecord,type Rules,caseState,formatDate,elapsedDaysLabel} from '@/lib/domain';
import {Badge} from './shared';

/** The court levels a case moves through. «حكم ابتدائي» is the older spelling of first instance. */
const LEVELS=[{type:'حكم أول درجة',label:'ابتدائي'},{type:'حكم استئناف',label:'استئناف'},{type:'حكم تمييز',label:'تمييز'}];
type Step={label:string;value:string;note?:string;state:'done'|'current'|'next'|'todo'|'late'};
/** Where the case stands at a glance: first instance → appeal → cassation, the appeal deadline, and the latest procedure. */
export default function CaseProgress({c,rules,asOf}:{c:CaseRecord;rules:Rules;asOf:string}){
 const st=caseState(c,rules,asOf);
 const type=c.type==='حكم ابتدائي'?'حكم أول درجة':c.type,level=LEVELS.findIndex(l=>l.type===type);
 const appealed=st.appeal==='تم',final=st.days===0,late=!appealed&&!final&&st.remaining!==null&&st.remaining<0;
 const deadline=appealed?'تم الطعن':final?'حكم نهائي':st.remaining===null?'مهلة الطعن غير معروفة':st.remaining<0?'انتهت مهلة الطعن':`متبقٍ للطعن ${st.remaining} يوم`;
 const steps:Step[]=LEVELS.map((l,i)=>i<level?{label:l.label,value:'صدر الحكم',state:'done'}
  :i===level?{label:l.label,value:c.date?formatDate(c.date):'تاريخ الحكم غير مسجل',note:deadline,state:late?'late':final?'done':'current'}
  :i===level+1&&appealed?{label:l.label,value:'بانتظار الحكم',state:'next'}
  :{label:l.label,value:'—',state:'todo'});
 // How much of the appeal window has gone (0–100), while it is running.
 const window=level>=0&&st.days&&st.remaining!==null&&!appealed?Math.min(100,Math.max(0,Math.round((st.days-st.remaining)/st.days*100))):null;
 const latest=[...(c.procedures||[])].filter(p=>p.text).sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
 return <section className="case-progress" aria-label="تقدم القضية">
  {level<0?<p className="progress-other"><b>{c.type||'نوع الحكم غير محدد'}</b>{c.date&&<> · {formatDate(c.date)}</>} · {deadline}</p>
  :<ol className="progress-steps">{steps.map((s,i)=><li key={s.label} className={'step '+s.state}><span className="step-dot" aria-hidden>{s.state==='done'?<Check size={13}/>:i+1}</span><span className="step-text"><small>{s.label}</small><b>{s.value}</b>{s.note&&<em>{s.note}</em>}</span></li>)}</ol>}
  {window!==null&&<div className={'appeal-window'+(st.remaining!==null&&st.remaining<=rules.warning?' urgent':'')} role="meter" aria-label="مهلة الطعن المنقضية" aria-valuenow={window} aria-valuemin={0} aria-valuemax={100}><i style={{width:window+'%'}}/></div>}
  <div className="progress-foot"><Badge value={st.outcome}/><Badge value={st.status}/>{c.date&&<span className="tag">منذ الحكم {elapsedDaysLabel(st.elapsed)}{st.executionRemaining!==null&&st.executionRemaining>=0?` · للتنفيذ ${st.executionRemaining} يوم`:''}</span>}
   {latest?<span className="latest-step" title={latest.text}><small>آخر إجراء{latest.date?' · '+formatDate(latest.date):''}</small>{latest.text}</span>:<span className="latest-step muted">لا توجد إجراءات مسجلة بعد</span>}</div>
 </section>;
}
