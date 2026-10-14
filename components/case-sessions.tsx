'use client';
import {useState} from 'react';
import {suggestions} from '@/lib/choices';
import CircuitField from './circuit-field';
import {CalendarPlus,Gavel,Pencil,Scale,Trash2} from 'lucide-react';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle} from '@/components/ui/alert-dialog';
import {toast} from 'sonner';
import {type CaseRecord,type Procedure,formatDate,todayISO} from '@/lib/domain';
import {DECISIONS,EXPERT_DECISIONS,VENUES,decisionOf,isSession,nextSessionTitle,nextVenue,sessionInput,sessionProcedure,type SessionInput,type Venue} from '@/lib/sessions';
import {LEVEL_TITLE,currentLevel} from '@/lib/case-stages';
import {officeRequest} from '@/lib/local-auth';
import type {WorkItem} from '@/lib/office';
import {Field,DateField,Choice} from './shared';
import Needs from './needs';

/** Sessions of the current court level, newest first. */
export function SessionTable({sessions,onEdit,onDelete,editingId}:{sessions:Procedure[];onEdit?:(p:Procedure)=>void;onDelete?:(p:Procedure)=>void;editingId?:string}){
 if(!sessions.length)return <p className="muted">لا توجد جلسات مسجلة في هذه الدرجة بعد.</p>;
 return <div className="table-wrap"><table className="office-table session-table"><thead><tr><th>تاريخ الجلسة</th><th>الجهة</th><th>الدائرة / القاعة</th><th>القرار</th><th>الجلسة القادمة</th><th>سجّلها</th>{onEdit&&<th><span className="sr-only">إجراءات</span></th>}</tr></thead>
  <tbody>{[...sessions].sort((a,b)=>b.date.localeCompare(a.date)).map(s=><tr key={s.id} className={s.id===editingId?'editing':''}><td className="mono">{formatDate(s.date)}</td><td>{s.kind==='جلسة خبراء'?'إدارة الخبراء':'المحكمة'}</td><td>{s.court||'—'}</td><td><b>{s.decision||s.text}</b>{s.decision&&s.text!==s.decision&&<small>{s.text.replace(s.decision+' — ','')}</small>}</td><td className="mono">{s.followup?formatDate(s.followup)+(s.nextTime?' '+s.nextTime:''):'—'}</td><td>{s.recordedBy||s.lawyer||'—'}</td>
   {onEdit&&<td className="row-actions"><button type="button" className="icon-btn" title="تعديل الجلسة" aria-label={'تعديل جلسة '+formatDate(s.date)} onClick={()=>onEdit(s)}><Pencil size={15}/></button>
    {onDelete&&<button type="button" className="icon-btn danger" title="حذف الجلسة" aria-label={'حذف جلسة '+formatDate(s.date)} onClick={()=>onDelete(s)}><Trash2 size={15}/></button>}</td>}</tr>)}</tbody></table></div>;
}

/**
 * Record what happened at a session. The session is saved in the case at once; an adjournment or reserved
 * judgment also schedules the next session in «المهام والجلسات», and the hearing held that day is closed with the decision.
 */
export default function CaseSessions({c,canEdit,canSchedule,canManage=false,busy,username,assigneeId,work,onRecord,onUpdate,onDone,onJudgment}:{onDone:()=>void;c:CaseRecord;canEdit:boolean;canSchedule:boolean;canManage?:boolean;busy:boolean;username:string;assigneeId:string;work:WorkItem[];onRecord:(p:Procedure)=>Promise<boolean>;onUpdate?:(id:string,p:Procedure|null)=>Promise<boolean>;onJudgment:(date:string)=>void}){
 const level=LEVEL_TITLE[currentLevel(c)],sessions=(c.procedures||[]).filter(isSession);
 const last=[...sessions].sort((a,b)=>b.date.localeCompare(a.date))[0];
 const blank=():SessionInput=>({date:last?.followup&&last.followup<=todayISO()?last.followup:todayISO(),venue:(last?nextVenue({date:'',venue:(last.venue as Venue)||'المحكمة',court:'',decision:last.decision||'',details:'',nextDate:'',nextTime:'',recordedBy:''}):'المحكمة'),court:last?.court||String(c.court||''),decision:'',details:'',nextDate:'',nextTime:'',recordedBy:username});
 const [s,setS]=useState<SessionInput>(blank),[schedule,setSchedule]=useState(true),[saving,setSaving]=useState(false);
 const [editing,setEditing]=useState<Procedure|null>(null),[removing,setRemoving]=useState<Procedure|null>(null),[cancelNext,setCancelNext]=useState(true);
 const manage=canManage&&canEdit&&!!onUpdate;
 /** The open hearing in «المهام والجلسات» that a recorded session scheduled. */
 const scheduledBy=(p:Procedure)=>p.followup?work.find(w=>w.caseId===c.id&&w.kind==='hearing'&&w.dueDate===p.followup&&w.status!=='done'&&w.status!=='cancelled'):undefined;
 function startEdit(p:Procedure){setEditing(p);setS(sessionInput(p));document.querySelector('.session-form')?.scrollIntoView({behavior:'smooth',block:'start'})}
 function stopEdit(){setEditing(null);setS(blank())}
 async function saveEdit(){
  if(!editing||!onUpdate||!ready||saving)return;setSaving(true);
  try{
   const proc=sessionProcedure({...s,recordedBy:editing.recordedBy||username},editing.id);
   const next=canSchedule?scheduledBy(editing):undefined;
   if(!await onUpdate(editing.id,proc))return;
   // Keep the next hearing it scheduled in step: move it to the new date, or cancel it when there is no next session now.
   if(next&&(next.dueDate!==proc.followup||next.dueTime!==(proc.nextTime||'')))
    await officeRequest('save_work',{item:proc.followup?{...next,dueDate:proc.followup,dueTime:proc.nextTime||''}:{...next,status:'cancelled',completionNote:'أُلغيت بعد تعديل الجلسة التي جدولتها'}}).catch(()=>toast.error('عُدلت الجلسة، لكن تعذر تحديث الجلسة القادمة في «المهام والجلسات».'));
   toast.success('عُدلت الجلسة');setEditing(null);setS(blank());onDone();
  }finally{setSaving(false)}
 }
 async function remove(){
  if(!removing||!onUpdate||saving)return;const p=removing;setSaving(true);
  try{
   const next=canSchedule&&cancelNext?scheduledBy(p):undefined;
   if(!await onUpdate(p.id,null))return;
   if(next)await officeRequest('save_work',{item:{...next,status:'cancelled',completionNote:'أُلغيت بعد حذف الجلسة التي جدولتها'}}).catch(()=>toast.error('حُذفت الجلسة، لكن تعذر إلغاء الجلسة القادمة في «المهام والجلسات».'));
   toast.success('حُذفت الجلسة');if(editing?.id===p.id)stopEdit();onDone();
  }finally{setSaving(false);setRemoving(null)}
 }
 const set=<K extends keyof SessionInput>(k:K,v:SessionInput[K])=>setS(x=>({...x,[k]:v}));
 const d=decisionOf(s.venue,s.decision),needsNext=d?.next!=='none';
 const ready=!!s.date&&!!s.decision&&(!needsNext||!!s.nextDate)&&(!s.nextDate||s.nextDate>=s.date);
 async function record(){
  if(editing)return saveEdit();
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
  {canEdit&&<form className="session-form" onSubmit={e=>{e.preventDefault();void record()}}><h3 className="section-title">{editing?<><Pencil size={17}/> تعديل جلسة {formatDate(editing.date)} · {level}</>:<><Gavel size={17}/> تسجيل جلسة · {level}</>}</h3>
   <fieldset disabled={busy||saving}><div className="form-grid">
    <DateField label="تاريخ الجلسة" value={s.date} onChange={v=>set('date',v)}/>
    <div className="field" role="radiogroup" aria-label="جهة الجلسة"><span>الجهة</span><div className="venue-choice">{VENUES.map(v=><label key={v} className="checkbox-line"><input type="radio" name="session-venue" checked={s.venue===v} onChange={()=>{set('venue',v);set('decision','')}}/>{v}</label>)}</div></div>
    {s.venue==='إدارة الخبراء'?<Field label="مكتب الخبير / الخبير" value={s.court} onChange={v=>set('court',v)} suggestions={suggestions(c.procedures,p=>p.venue===s.venue?p.court:'')}/>:<CircuitField value={s.court} onChange={v=>set('court',v)}/>}
    <label className="field"><span>قرار الجلسة</span><Choice label="قرار الجلسة" empty="اختر القرار" value={s.decision} onChange={v=>set('decision',v)} options={options}/></label>
    <Field label="تفاصيل القرار (اختياري)" value={s.details} onChange={v=>set('details',v)} wide/>
    {needsNext&&<><DateField label={d?.next==='judgment'?'موعد النطق بالحكم':'موعد الجلسة القادمة'} value={s.nextDate} onChange={v=>set('nextDate',v)}/><Field label="الوقت (اختياري)" type="time" value={s.nextTime} onChange={v=>set('nextTime',v)}/></>}
   </div>
   {needsNext&&canSchedule&&!editing&&<label className="checkbox-line"><input type="checkbox" checked={schedule} onChange={e=>setSchedule(e.target.checked)}/> <CalendarPlus size={15}/> أضف الجلسة القادمة إلى «المهام والجلسات» مع تنبيه في موعدها</label>}
   {d?.judgment&&!editing&&<p className="subtitle"><Scale size={14}/> بعد التسجيل يُفتح «بيانات الحكم» لتسجيل الحكم ومنطوقه.</p>}
   {s.nextDate&&s.nextDate<s.date&&<p className="notice">موعد الجلسة القادمة قبل تاريخ هذه الجلسة.</p>}
   <Needs items={[!s.date&&'اختر «تاريخ الجلسة»',!s.decision&&'اختر «قرار الجلسة»',needsNext&&!s.nextDate&&`اختر «${d?.next==='judgment'?'موعد النطق بالحكم':'موعد الجلسة القادمة'}»`]}/>
   <div className="form-actions"><button type="submit" className="btn primary" disabled={!ready||busy||saving}>{saving?'جارٍ الحفظ…':editing?'حفظ التعديل':'تسجيل الجلسة'}</button>
    {editing&&<button type="button" className="btn" onClick={stopEdit}>إلغاء التعديل</button>}</div></fieldset></form>}
  <h3 className="section-title">جلسات {level} ({sessions.length})</h3>
  <SessionTable sessions={sessions} editingId={editing?.id} onEdit={manage?startEdit:undefined} onDelete={manage?p=>{setCancelNext(true);setRemoving(p)}:undefined}/>
  <AlertDialog open={!!removing} onOpenChange={o=>{if(!o&&!saving)setRemoving(null)}}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>حذف جلسة {removing&&formatDate(removing.date)}؟</AlertDialogTitle>
   <AlertDialogDescription>تُحذف الجلسة وقرارها «{removing?.decision||removing?.text}» من ملف القضية. لا يمكن التراجع عن الحذف.</AlertDialogDescription></AlertDialogHeader>
   {removing&&canSchedule&&scheduledBy(removing)&&<label className="checkbox-line"><input type="checkbox" checked={cancelNext} onChange={e=>setCancelNext(e.target.checked)}/> ألغِ الجلسة القادمة ({formatDate(removing.followup||'')}) التي جدولتها في «المهام والجلسات»</label>}
   <AlertDialogFooter><AlertDialogCancel disabled={saving}>إلغاء</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={e=>{e.preventDefault();void remove()}}>حذف الجلسة</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}

