'use client';
import {useState} from 'react';
import {CIRCUITS,suggestions} from '@/lib/choices';
import {CalendarPlus,Gavel,Scale} from 'lucide-react';
import {toast} from 'sonner';
import {type CaseRecord,type Procedure,formatDate,todayISO} from '@/lib/domain';
import {DECISIONS,EXPERT_DECISIONS,VENUES,decisionOf,isSession,nextSessionTitle,nextVenue,sessionProcedure,type SessionInput,type Venue} from '@/lib/sessions';
import {LEVEL_TITLE,currentLevel} from '@/lib/case-stages';
import {officeRequest} from '@/lib/local-auth';
import type {WorkItem} from '@/lib/office';
import {Field,DateField,Choice,PickOrType} from './shared';
import Needs from './needs';

/** Sessions of the current court level, newest first. */
export function SessionTable({sessions}:{sessions:Procedure[]}){
 if(!sessions.length)return <p className="muted">لا توجد جلسات مسجلة في هذه الدرجة بعد.</p>;
 return <div className="table-wrap"><table className="office-table session-table"><thead><tr><th>تاريخ الجلسة</th><th>الجهة</th><th>الدائرة / القاعة</th><th>القرار</th><th>الجلسة القادمة</th><th>سجّلها</th></tr></thead>
  <tbody>{[...sessions].sort((a,b)=>b.date.localeCompare(a.date)).map(s=><tr key={s.id}><td className="mono">{formatDate(s.date)}</td><td>{s.kind==='جلسة خبراء'?'إدارة الخبراء':'المحكمة'}</td><td>{s.court||'—'}</td><td><b>{s.decision||s.text}</b>{s.decision&&s.text!==s.decision&&<small>{s.text.replace(s.decision+' — ','')}</small>}</td><td className="mono">{s.followup?formatDate(s.followup)+(s.nextTime?' '+s.nextTime:''):'—'}</td><td>{s.recordedBy||s.lawyer||'—'}</td></tr>)}</tbody></table></div>;
}

/**
 * Record what happened at a session. The session is saved in the case at once; an adjournment or reserved
 * judgment also schedules the next session in «المهام والجلسات», and the hearing held that day is closed with the decision.
 */
export default function CaseSessions({c,canEdit,canSchedule,busy,username,assigneeId,work,onRecord,onDone,onJudgment}:{onDone:()=>void;c:CaseRecord;canEdit:boolean;canSchedule:boolean;busy:boolean;username:string;assigneeId:string;work:WorkItem[];onRecord:(p:Procedure)=>Promise<boolean>;onJudgment:(date:string)=>void}){
 const level=LEVEL_TITLE[currentLevel(c)],sessions=(c.procedures||[]).filter(isSession);
 const last=[...sessions].sort((a,b)=>b.date.localeCompare(a.date))[0];
 const blank=():SessionInput=>({date:last?.followup&&last.followup<=todayISO()?last.followup:todayISO(),venue:(last?nextVenue({date:'',venue:(last.venue as Venue)||'المحكمة',court:'',decision:last.decision||'',details:'',nextDate:'',nextTime:'',recordedBy:''}):'المحكمة'),court:last?.court||String(c.court||''),decision:'',details:'',nextDate:'',nextTime:'',recordedBy:username});
 const [s,setS]=useState<SessionInput>(blank),[schedule,setSchedule]=useState(true),[saving,setSaving]=useState(false);
 const set=<K extends keyof SessionInput>(k:K,v:SessionInput[K])=>setS(x=>({...x,[k]:v}));
 const d=decisionOf(s.venue,s.decision),needsNext=d?.next!=='none';
 const ready=!!s.date&&!!s.decision&&(!needsNext||!!s.nextDate)&&(!s.nextDate||s.nextDate>=s.date);
 async function record(){
  if(!ready||saving)return;setSaving(true);
  try{
   const proc=sessionProcedure({...s,recordedBy:username});
   if(!await onRecord(proc))return;
   if(canSchedule){
    // Close the hearing held on this date, and schedule the next one.
    const held=work.filter(w=>w.caseId===c.id&&w.kind==='hearing'&&w.dueDate===s.date&&w.status!=='done'&&w.status!=='cancelled');
    for(const w of held)await officeRequest('save_work',{item:{...w,status:'done',completionNote:proc.text}}).catch(()=>undefined);
    if(proc.followup&&schedule){
     const next=nextVenue(s);
     try{await officeRequest('save_work',{item:{id:crypto.randomUUID(),revision:0,caseId:c.id,title:nextSessionTitle(s,level,c),kind:'hearing',dueDate:proc.followup,dueTime:proc.nextTime||'',assigneeId,priority:d?.next==='judgment'?'urgent':'normal',status:'open',location:next==='إدارة الخبراء'?'إدارة الخبراء':s.court,notes:'القرار السابق: '+proc.text,completionNote:''}});toast.success('سُجلت الجلسة وأُضيفت الجلسة القادمة إلى المهام والجلسات')}
     catch(e){toast.error('سُجلت الجلسة، لكن تعذر إضافة الجلسة القادمة: '+(e as Error).message)}
    }else toast.success('سُجلت الجلسة');
   }else toast.success('سُجلت الجلسة');
   onDone();
   if(d?.judgment)onJudgment(s.date);
   setS({...blank(),date:proc.followup&&proc.followup<=todayISO()?proc.followup:todayISO(),venue:nextVenue(s),court:s.court});
  }finally{setSaving(false)}
 }
 const options=(s.venue==='إدارة الخبراء'?EXPERT_DECISIONS:DECISIONS).map(x=>x.label);
 return <div className="case-sessions">
  {canEdit&&<form className="session-form" onSubmit={e=>{e.preventDefault();void record()}}><h3 className="section-title"><Gavel size={17}/> تسجيل جلسة · {level}</h3>
   <fieldset disabled={busy||saving}><div className="form-grid">
    <DateField label="تاريخ الجلسة" value={s.date} onChange={v=>set('date',v)}/>
    <div className="field" role="radiogroup" aria-label="جهة الجلسة"><span>الجهة</span><div className="venue-choice">{VENUES.map(v=><label key={v} className="checkbox-line"><input type="radio" name="session-venue" checked={s.venue===v} onChange={()=>{set('venue',v);set('decision','')}}/>{v}</label>)}</div></div>
    {s.venue==='إدارة الخبراء'?<Field label="مكتب الخبير / الخبير" value={s.court} onChange={v=>set('court',v)} suggestions={suggestions(c.procedures,p=>p.venue===s.venue?p.court:'')}/>:<CircuitField value={s.court} onChange={v=>set('court',v)}/>}
    <label className="field"><span>قرار الجلسة</span><Choice label="قرار الجلسة" empty="اختر القرار" value={s.decision} onChange={v=>set('decision',v)} options={options}/></label>
    <Field label="تفاصيل القرار (اختياري)" value={s.details} onChange={v=>set('details',v)} wide/>
    {needsNext&&<><DateField label={d?.next==='judgment'?'موعد النطق بالحكم':'موعد الجلسة القادمة'} value={s.nextDate} onChange={v=>set('nextDate',v)}/><Field label="الوقت (اختياري)" type="time" value={s.nextTime} onChange={v=>set('nextTime',v)}/></>}
   </div>
   {needsNext&&canSchedule&&<label className="checkbox-line"><input type="checkbox" checked={schedule} onChange={e=>setSchedule(e.target.checked)}/> <CalendarPlus size={15}/> أضف الجلسة القادمة إلى «المهام والجلسات» مع تنبيه في موعدها</label>}
   {d?.judgment&&<p className="subtitle"><Scale size={14}/> بعد التسجيل يُفتح «بيانات الحكم» لتسجيل الحكم ومنطوقه.</p>}
   {s.nextDate&&s.nextDate<s.date&&<p className="notice">موعد الجلسة القادمة قبل تاريخ هذه الجلسة.</p>}
   <Needs items={[!s.date&&'اختر «تاريخ الجلسة»',!s.decision&&'اختر «قرار الجلسة»',needsNext&&!s.nextDate&&`اختر «${d?.next==='judgment'?'موعد النطق بالحكم':'موعد الجلسة القادمة'}»`]}/>
   <button type="submit" className="btn primary" disabled={!ready||busy||saving}>{saving?'جارٍ التسجيل…':'تسجيل الجلسة'}</button></fieldset></form>}
  <h3 className="section-title">جلسات {level} ({sessions.length})</h3>
  <SessionTable sessions={sessions}/>
 </div>;
}

/** The circuit as «النوع / الرقم», e.g. «تجاري كلي / 5»: the kind from a list (or typed via «أخرى…») and the circuit or hall number. */
function CircuitField({value,onChange}:{value:string;onChange:(v:string)=>void}){
 const m=/^(.*?)\s*\/\s*([^/]+)$/.exec(value),kind=(m?m[1]:value).trim(),num=(m?m[2]:'').trim();
 const join=(k:string,n:string)=>[k.trim(),n.trim()].filter(Boolean).join(' / ');
 return <><PickOrType label="الدائرة" value={kind} onChange={k=>onChange(join(k,num))} options={CIRCUITS} empty="اختر الدائرة"/>
  <Field label="رقم الدائرة / القاعة" value={num} onChange={n=>onChange(join(kind,n))} placeholder="مثل 5"/></>;
}
