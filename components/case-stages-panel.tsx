'use client';
import {useEffect,useState} from 'react';
import {COURTS} from '@/lib/choices';
import {ArrowUpLeft,Lock,RotateCcw,Scale} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {type CaseRecord,formatDate,todayISO} from '@/lib/domain';
import {LEVEL_TITLE,currentLevel,nextLevel,stagesOf,canUndoMove,type MoveDetails} from '@/lib/case-stages';
import {Field,DateField} from './shared';
import {OfficeSelect} from './office-shared';

/** Close the current level and open the next one: the new level gets its own case number and court. */
export function MoveStageDialog({c,busy,onClose,onMove}:{c:CaseRecord;busy:boolean;onClose:()=>void;onMove:(d:MoveDetails)=>void}){
 const from=currentLevel(c),to=nextLevel(c);
 const [d,setD]=useState<MoveDetails>({caseNumber:'',autoNumber:String(c.autoNumber||''),court:'',appealedBy:'',movedOn:todayISO(),note:''});
 const set=(k:keyof MoveDetails,v:string)=>setD(x=>({...x,[k]:v}));
 if(!to)return null;
 return <Dialog open onOpenChange={v=>{if(!v&&!busy)onClose()}}><DialogContent dir="rtl" className="office-dialog move-stage-dialog"><DialogHeader><DialogTitle>نقل القضية إلى {LEVEL_TITLE[to]}</DialogTitle>
  <DialogDescription>يُغلق ملف {LEVEL_TITLE[from]} ويُحفظ بكل بياناته وإجراءاته كما هو الآن، ولا يمكن تعديله بعد ذلك إلا من مسؤول المكتب. تبدأ {LEVEL_TITLE[to]} بسجل إجراءات جديد.</DialogDescription></DialogHeader>
  <form onSubmit={e=>{e.preventDefault();if(d.appealedBy)onMove(d)}}><fieldset disabled={busy}><div className="form-grid">
   <OfficeSelect label="من طعن في الحكم؟" value={d.appealedBy} onChange={v=>set('appealedBy',v)} empty="اختر" options={[['الخصم','الخصم'],['نحن','نحن (الموكل)'],['الطرفان','الطرفان']]}/>
   <DateField label="تاريخ الطعن / النقل" value={d.movedOn} onChange={v=>set('movedOn',v)}/>
   <Field label={'رقم القضية في '+LEVEL_TITLE[to]} value={d.caseNumber} onChange={v=>set('caseNumber',v)} placeholder="يمكن إضافته لاحقاً"/>
   <Field label="الرقم الآلي" value={d.autoNumber} onChange={v=>set('autoNumber',v)}/>
   <Field label="المحكمة / الدائرة" suggestions={COURTS} value={d.court} onChange={v=>set('court',v)} wide/>
   <Field label="ملاحظة النقل (اختياري)" value={d.note} onChange={v=>set('note',v)} multiline wide/>
  </div>{c.date?null:<p className="notice">لم يُسجل تاريخ حكم {LEVEL_TITLE[from]}. يمكنك النقل الآن، لكن يُفضل تسجيل الحكم أولاً ليبقى في سجل الدرجة.</p>}
  <div className="actions"><button type="submit" className="btn primary" disabled={busy||!d.appealedBy}>نقل إلى {LEVEL_TITLE[to]} وحفظ الملف</button><button type="button" className="btn" onClick={onClose}>إلغاء</button></div></fieldset></form>
 </DialogContent></Dialog>;
}

/** Every level the case has been through, newest first; closed levels are read-only records. */
export function CaseStagesTab({c,focus,canEdit,canUndo,busy,onMove,onUndo,onOpenCurrent}:{c:CaseRecord;focus?:string;canEdit:boolean;canUndo:boolean;busy:boolean;onMove:()=>void;onUndo:()=>void;onOpenCurrent:()=>void}){
 const stages=stagesOf(c),level=currentLevel(c),next=nextLevel(c);
 useEffect(()=>{if(focus)document.getElementById('stage-'+focus)?.scrollIntoView({block:'start',behavior:'smooth'})},[focus]);
 return <div className="stage-list">
  <article className="stage-card current"><header><span className="stage-level"><Scale size={16}/> {LEVEL_TITLE[level]} <small>الدرجة الحالية</small></span>{c.caseNumber&&<b className="mono">{String(c.caseNumber)}</b>}</header>
   <dl className="stage-facts"><div><dt>المحكمة</dt><dd>{String(c.court||'')||'—'}</dd></div><div><dt>تاريخ الحكم</dt><dd>{c.date?formatDate(c.date):'لم يصدر بعد'}</dd></div><div><dt>النتيجة</dt><dd>{c.outcome||'—'}</dd></div><div><dt>الإجراءات</dt><dd>{(c.procedures||[]).length}</dd></div></dl>
   <div className="actions"><button type="button" className="btn" onClick={onOpenCurrent}><ArrowUpLeft size={15}/> بيانات الحكم الحالي</button>{canEdit&&next&&<button type="button" className="btn primary" disabled={busy} onClick={onMove}>نقل إلى {LEVEL_TITLE[next]}</button>}</div></article>
  {!stages.length&&<p className="muted">لم تنتقل القضية إلى درجة أعلى بعد. عند الطعن في الحكم، انقلها من هنا ليُحفظ ملف هذه الدرجة كاملاً.</p>}
  {[...stages].reverse().map((s,i)=><details key={s.id} id={'stage-'+s.id} className="stage-card closed" open={focus?focus===s.id:i===0}>
   <summary><span className="stage-level"><Lock size={14}/> {LEVEL_TITLE[s.level]}</span>{s.caseNumber&&<b className="mono">{s.caseNumber}</b>}<span className="muted">{s.date?formatDate(s.date):'دون تاريخ حكم'}{s.outcome&&s.outcome!=='غير محدد'?' · '+s.outcome:''}</span></summary>
   <dl className="stage-facts">{([['المحكمة',s.court],['الرقم الآلي',s.autoNumber],['نوع الحكم',s.type],['تاريخ الحكم',s.date&&formatDate(s.date)],['النتيجة',s.outcome],['صفة الموكل',s.role],['المحامي',s.lawyer],['حكم غيابي',s.absent],['الطاعن',s.appealedBy],['تاريخ الطعن',s.movedOn&&formatDate(s.movedOn)],['أغلقه',s.closedBy],['وقت الإغلاق',s.closedAt?formatDate(s.closedAt.slice(0,10))+' '+s.closedAt.slice(11,16):'']] as const).filter(([,v])=>v).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
   {s.ruling&&<p className="stage-ruling"><b>منطوق الحكم:</b> {s.ruling}</p>}{s.note&&<p className="stage-ruling"><b>ملاحظة النقل:</b> {s.note}</p>}
   <h4>إجراءات {LEVEL_TITLE[s.level]} ({s.procedures.length})</h4>
   <div className="timeline">{[...s.procedures].reverse().map(p=><div className="timeline-item" key={p.id}><small>{formatDate(p.date)}{p.lawyer&&' · '+p.lawyer}</small><p>{p.text}</p>{p.followup&&<small style={{display:'block'}}>موعد المتابعة: {formatDate(p.followup)}</small>}</div>)}{!s.procedures.length&&<p className="muted">لا توجد إجراءات مسجلة في هذه الدرجة.</p>}</div>
   {canUndo&&i===0&&canUndoMove(c)&&<button type="button" className="btn" disabled={busy} onClick={onUndo}><RotateCcw size={15}/> التراجع عن النقل وإعادة فتح هذه الدرجة</button>}
  </details>)}
 </div>;
}
