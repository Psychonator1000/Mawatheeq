'use client';
import {useState} from 'react';
import {toast} from 'sonner';
import {Users} from 'lucide-react';
import {officeRequest} from '@/lib/local-auth';
import type {Member} from '@/lib/office';
import type {Permissions} from '@/lib/permissions';
import {VIEW_ITEMS,withItemMode,type ViewItem,type ViewMode} from '@/lib/view-map';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';

type Pick3='keep'|'show'|'hide';type Flag='keep'|'yes'|'no';
const pages=VIEW_ITEMS.filter(i=>i.kind==='page'),groups=[...new Set(pages.map(p=>p.group||''))];
const spaces=VIEW_ITEMS.filter(i=>i.kind==='workspace'&&i.section),tools=VIEW_ITEMS.filter(i=>i.kind==='workspace'&&!i.section);
const name=(m:Member)=>m.displayName||m.username;

/**
 * «تطبيق على عدة حسابات»: one change for many accounts at once. Each page, workspace, mail and chat is left as each
 * account has it, shown, or hidden; editing and export likewise. The change is made the same way as in each account's
 * own editor (a page granted shows alone in its section; hiding the last page of a section takes the section away),
 * to every ticked account; everyone is ticked to begin with, so «everyone except» is a few unticks.
 */
export default function BulkAccess({members,onClose,onDone}:{members:Member[];onClose:()=>void;onDone:()=>void}){
 const [items,setItems]=useState<Record<string,Pick3>>({}),[edit,setEdit]=useState<Flag>('keep'),[exp,setExp]=useState<Flag>('keep');
 const [chosen,setChosen]=useState<Set<string>>(()=>new Set(members.map(m=>m.id))),[busy,setBusy]=useState(false);
 const changes=Object.entries(items).filter(([,v])=>v!=='keep');
 const any=changes.length>0||edit!=='keep'||exp!=='keep';
 const row=(i:ViewItem)=>{const v=items[i.id]||'keep';return <div key={i.id} className="bulk-row"><span>{i.label}</span>
  <div className="seg" role="radiogroup" aria-label={i.label}>{([['keep','دون تغيير'],['show','ظاهر'],['hide','مخفي']] as [Pick3,string][]).map(([k,l])=>
   <button key={k} type="button" role="radio" aria-checked={v===k} className={'seg-opt'+(v===k?' on '+k:'')} onClick={()=>setItems(s=>({...s,[i.id]:k}))}>{l}</button>)}</div></div>};
 const flag=(label:string,v:Flag,set:(f:Flag)=>void)=><div className="bulk-row"><span>{label}</span><div className="seg" role="radiogroup" aria-label={label}>
  {([['keep','دون تغيير'],['yes','مسموح'],['no','غير مسموح']] as [Flag,string][]).map(([k,l])=><button key={k} type="button" role="radio" aria-checked={v===k} className={'seg-opt'+(v===k?' on '+(k==='yes'?'show':k==='no'?'hide':'keep'):'')} onClick={()=>set(k)}>{l}</button>)}</div></div>;
 const toggle=(id:string)=>setChosen(s=>{const n=new Set(s);if(n.has(id))n.delete(id);else n.add(id);return n});
 async function apply(){
  const targets=members.filter(m=>chosen.has(m.id));
  const summary=[...changes.map(([id,v])=>`${VIEW_ITEMS.find(x=>x.id===id)?.label}: ${v==='show'?'ظاهر':'مخفي'}`),...(edit!=='keep'?[`التعديل: ${edit==='yes'?'مسموح':'غير مسموح'}`]:[]),...(exp!=='keep'?[`التصدير: ${exp==='yes'?'مسموح':'غير مسموح'}`]:[])];
  if(!window.confirm(`سيُطبَّق على ${targets.length} من الحسابات:\n\n${summary.join('\n')}\n\nالحسابات: ${targets.map(name).join('، ')}\n\nتنتهي جلساتهم الحالية ليأخذ التغيير مكانه. متابعة؟`))return;
  setBusy(true);let done=0;const failed:string[]=[];
  // Shown pages first (they may grant a section), then hidden ones.
  const order=[...changes.filter(([,v])=>v==='show'),...changes.filter(([,v])=>v==='hide')];
  for(const m of targets){const p=m.permissions!;let next:Permissions={...p};
   for(const [id,v] of order){const it=VIEW_ITEMS.find(x=>x.id===id);if(it)next=withItemMode(next,it,v as ViewMode)}
   if(edit!=='keep')next={...next,canEdit:edit==='yes'};if(exp!=='keep')next={...next,canExport:exp==='yes'};
   try{await officeRequest('set_member_access',{id:m.id,revision:p.revision,permissions:next});done++}catch(e){failed.push(`${name(m)}: ${(e as Error).message}`)}}
  setBusy(false);onDone();
  if(done)toast.success(`طُبّق التغيير على ${done} من الحسابات.`);if(failed.length)toast.error(failed.join('\n'));else onClose();
 }
 return <Dialog open onOpenChange={v=>{if(!v&&!busy)onClose()}}><DialogContent dir="rtl" className="office-dialog bulk-dialog">
  <DialogHeader><DialogTitle>تطبيق على عدة حسابات</DialogTitle><DialogDescription>اختر ما تريد تغييره، ثم الحسابات التي يُطبَّق عليها (الكل محدد؛ ألغِ من تستثنيه). ما يبقى «دون تغيير» يبقى لكل حساب كما هو.</DialogDescription></DialogHeader>
  <div className="bulk-body">
   <div className="bulk-col"><h3>الصفحات</h3>{groups.map(g=><div key={g||'top'} className="bulk-group">{g&&<small>{g}</small>}{pages.filter(p=>(p.group||'')===g).map(row)}</div>)}
    <div className="bulk-group"><small>مساحات العمل الأخرى</small>{spaces.map(row)}</div>
    <div className="bulk-group"><small>التواصل</small>{tools.map(row)}</div>
    <div className="bulk-group"><small>العمليات</small>{flag('التعديل في الأقسام المتاحة',edit,setEdit)}{flag('التصدير والطباعة',exp,setExp)}</div></div>
   <div className="bulk-col bulk-people"><h3>الحسابات <span className="tag">{chosen.size} من {members.length}</span></h3>
    <div className="actions"><button type="button" className="btn" onClick={()=>setChosen(new Set(members.map(m=>m.id)))}>تحديد الكل</button><button type="button" className="btn" onClick={()=>setChosen(new Set())}>إلغاء الكل</button></div>
    <div className="bulk-list">{members.map(m=><label key={m.id} className={'checkbox-line'+(chosen.has(m.id)?' on':'')}><input type="checkbox" checked={chosen.has(m.id)} onChange={()=>toggle(m.id)}/> <b>{name(m)}</b> <small dir="ltr">{m.username}</small></label>)}</div></div>
  </div>
  <div className="bulk-foot"><button type="button" className="btn" disabled={busy} onClick={onClose}>إلغاء</button>
   <button type="button" className="btn primary" disabled={busy||!any||!chosen.size} onClick={()=>void apply()}><Users size={15}/> {busy?'جارٍ التطبيق…':`تطبيق على الحسابات المحددة (${chosen.size})`}</button></div>
 </DialogContent></Dialog>;
}
