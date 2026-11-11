'use client';
import {useState} from 'react';
import {Building2,FolderTree,Trash2} from 'lucide-react';
import {JOB_ROLES,WORKSPACE_LABELS,type JobRole} from '@/lib/permissions';
import type {Member} from '@/lib/office';
import {AREA_NAMES,nodesBelow,parents,type TeamArea,type TeamChart,type Workspace} from '@/lib/team';
import {ROLE_ICONS} from './permission-editor';
import {FilterBox} from './filter-select';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';

export type AreaDraft={id?:string;name:string;role:string|null;workspace:Workspace|null;parent:string|null};

/**
 * A section of the tree («قسم»): what kind of work it is for (one of the job roles, or none), its name (filled in from
 * the work, and free to change), and where it sits (at the top, under a person or inside another section). Removing it
 * moves whoever was in it up to where it was.
 */
export default function AreaEditor({area,preset,chart,members,busy,flow,onSave,onDelete,onClose}:{area:TeamArea|'new';preset?:'branch';chart:TeamChart;members:Member[];busy:boolean;flow?:React.ReactNode;
 onSave:(d:AreaDraft)=>void;onDelete:(a:TeamArea)=>void;onClose:()=>void}){
 const old=area==='new'?null:area;
 const [role,setRole]=useState<string|null>(old?.role||preset||null),[name,setName]=useState(old?.name||(preset?AREA_NAMES[preset]:''));
 const [parent,setParent]=useState<string>(old?(old.parentUser?'u:'+old.parentUser:old.parentArea?'a:'+old.parentArea:''):'');
 // The name follows the kind of work until it is typed by hand.
 const [typed,setTyped]=useState(!!old),[workspace,setWorkspace]=useState<string>(old?.workspace||'');
 const pickRole=(r:string|null)=>{setRole(r);if(!typed||!name.trim())setName(r?AREA_NAMES[r]||JOB_ROLES.find(x=>x.id===r)?.label.split(' — ')[0]||'':'')};
 const inside=old?new Set(['a:'+old.id,...nodesBelow(parents(chart),'a:'+old.id)]):new Set<string>();
 const places=[...chart.areas.filter(a=>!inside.has('a:'+a.id)).map(a=>({value:'a:'+a.id,label:'قسم '+a.name})),
  ...members.filter(m=>m.role!=='owner'&&m.enabled&&m.permissions?.accountKind!=='client'&&!inside.has('u:'+m.id)).map(m=>({value:'u:'+m.id,label:m.displayName||m.username,hint:m.username}))];
 return <Dialog open onOpenChange={v=>{if(!v&&!busy)onClose()}}><DialogContent dir="rtl" className="office-dialog area-dialog" onOpenAutoFocus={e=>e.preventDefault()}>
  <DialogHeader><DialogTitle>{role==='branch'?<Building2 size={18} aria-hidden/>:<FolderTree size={18} aria-hidden/>} {old?`${old.role==='branch'?'فرع':'قسم'} «${old.name}»`:role==='branch'?'فرع جديد':'قسم جديد'}</DialogTitle>
   <DialogDescription>اختر نوع العمل الذي يجمعه القسم، ثم اسحب الموظفين إليه في الهيكل. من يقع القسم تحته يرى تقارير كل من فيه وأداءهم.</DialogDescription></DialogHeader>
  <form className="area-form" onSubmit={e=>{e.preventDefault();if(name.trim())onSave({id:old?.id,name:name.trim(),role,workspace:(workspace||null) as Workspace|null,parent:parent||null})}}><fieldset disabled={busy}>
   <div className="area-roles" role="radiogroup" aria-label="نوع العمل">
    <button type="button" role="radio" aria-checked={role==='branch'} title="صندوق فارغ باسم تختاره، يجمع الأقسام والموظفين (فرع شركة أو مكتب)" className={'role-card'+(role==='branch'?' on':'')} onClick={()=>pickRole('branch')}><Building2 size={18} aria-hidden/><b>فرع</b></button>
    <button type="button" role="radio" aria-checked={!role} className={'role-card'+(!role?' on':'')} onClick={()=>pickRole(null)}><FolderTree size={18} aria-hidden/><b>بلا نوع</b></button>
    {JOB_ROLES.filter(r=>r.id!=='custom').map(r=>{const Icon=ROLE_ICONS[r.id as JobRole];return <button type="button" role="radio" aria-checked={role===r.id} key={r.id} title={r.hint}
     className={'role-card'+(role===r.id?' on':'')} onClick={()=>pickRole(r.id)}><Icon size={18} aria-hidden/><b>{r.label.split(' — ')[0]}</b></button>})}</div>
   <div className="area-fields">
    <label className="field"><span>{role==='branch'?'اسم الفرع':'اسم القسم'}</span><input value={name} maxLength={60} required onChange={e=>{setName(e.target.value);setTyped(true)}} placeholder="مثل: المحامون، قسم التنفيذ"/></label>
    <label className="field"><span>مساحة العمل التي يفتحها من فيه</span><FilterBox label="مساحة عمل القسم" value={workspace} empty="لا تتغير صفحاتهم"
     options={(Object.keys(WORKSPACE_LABELS) as Workspace[]).map(w=>({value:w,label:WORKSPACE_LABELS[w]+' فقط'}))} onChange={setWorkspace}/>
     <small>{workspace?'من يُسحب إلى هذا القسم يفتح هذه المساحة وحدها، ومن يخرج منه تُزال عنه.':'تجميع فقط: تبقى صفحات من فيه كما هي.'}</small></label>
    <label className="field"><span>مكانه في الهيكل</span><FilterBox label="مكان القسم" value={parent} empty="أعلى الهيكل (تحت المالك)" options={places} onChange={setParent}/></label></div>
   {flow&&<div className="field"><span>اتجاه من فيه في الهيكل</span>{flow}</div>}
   <div className="area-foot">{old&&<button type="button" className="btn danger" onClick={()=>onDelete(old)}><Trash2 size={15}/> {old.role==='branch'?'حذف الفرع':'حذف القسم'}</button>}
    <button type="button" className="btn" onClick={onClose}>إلغاء</button><button type="submit" className="btn primary" disabled={!name.trim()}>{old?(role==='branch'?'حفظ الفرع':'حفظ القسم'):(role==='branch'?'إضافة الفرع':'إضافة القسم')}</button></div>
  </fieldset></form>
 </DialogContent></Dialog>;
}
