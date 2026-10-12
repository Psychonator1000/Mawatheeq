'use client';
import {useMemo,useState} from 'react';
import {Printer} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import {ROLL_GROUPS,groupRoll,judgmentRollHtml,printHtml,type JudgmentRollRow,type RollGroupKey} from '@/lib/print';
import {formatDate,todayISO,type CaseRecord} from '@/lib/domain';

type Scope='shown'|'selected'|'all';
/** «رول الأحكام»: preview and print the shown, selected or all cases, optionally grouped. */
export default function JudgmentRoll({shown,selected,all,shownLabel,toRow,printedBy,canPrint,onClose}:{shown:CaseRecord[];selected:CaseRecord[];all:CaseRecord[];shownLabel:string;toRow:(c:CaseRecord)=>JudgmentRollRow;printedBy:string;canPrint:boolean;onClose:()=>void}) {
 const [scope,setScope]=useState<Scope>(selected.length?'selected':'shown'),[group,setGroup]=useState<RollGroupKey>(''),[title,setTitle]=useState('رول الأحكام');
 const scopes:[Scope,string,number][]=[['shown',shownLabel,shown.length],['selected','القضايا المحددة',selected.length],['all','كل القضايا غير المؤرشفة',all.length]];
 const html=useMemo(()=>{const list=scope==='selected'?selected:scope==='all'?all:shown;const label=scopes.find(s=>s[0]===scope)![1]+(group?' · مجمّعة حسب '+ROLL_GROUPS.find(g=>g[0]===group)![1]:'');
  return judgmentRollHtml(title.trim()||'رول الأحكام',label,groupRoll(list.map(toRow),group),formatDate(todayISO()),printedBy)},[scope,group,title,shown,selected,all]);// eslint-disable-line react-hooks/exhaustive-deps
 return <Dialog open onOpenChange={v=>{if(!v)onClose()}}><DialogContent dir="rtl" className="office-dialog roll-dialog"><DialogHeader><DialogTitle>رول الأحكام</DialogTitle><DialogDescription>اختر القضايا وطريقة التجميع، وراجع الرول قبل الطباعة. يُطبع أفقياً دون عنوان الموقع.</DialogDescription></DialogHeader>
  <div className="roll-options">
   <fieldset className="roll-scope"><legend>القضايا</legend>{scopes.map(([id,label,n])=><label key={id} className={'roll-choice'+(scope===id?' on':'')}><input type="radio" name="roll-scope" checked={scope===id} disabled={!n} onChange={()=>setScope(id)}/><span>{label}</span><b>{n}</b></label>)}</fieldset>
   <label className="field"><span>التجميع</span><select value={group} onChange={e=>setGroup(e.target.value as RollGroupKey)}>{ROLL_GROUPS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   <label className="field"><span>عنوان الرول</span><input value={title} maxLength={80} onChange={e=>setTitle(e.target.value)}/></label>
  </div>
  <iframe className="roll-preview" title="معاينة رول الأحكام" sandbox="" srcDoc={html}/>
  <div className="actions">{canPrint?<button className="btn primary" onClick={()=>{if(!printHtml(html))toast.error('تعذر فتح نافذة الطباعة.')}}><Printer/> طباعة الرول</button>:<p className="subtitle">الطباعة غير متاحة لحسابك؛ اطلبها من مسؤول المكتب.</p>}<button className="btn" onClick={onClose}>إغلاق</button></div>
 </DialogContent></Dialog>;
}
