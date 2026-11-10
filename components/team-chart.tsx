'use client';
import {useEffect,useMemo,useState} from 'react';
import {toast} from 'sonner';
import {dailyRequest} from '@/lib/local-auth';
import type {Member} from '@/lib/office';
import {FilterBox} from './filter-select';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';

export type TeamLine={userId:string;managerId:string};
/** What an account oversees (`below`, at any depth), and the whole chart for whoever may change it or reads every report. */
export type TeamInfo={all:boolean;leads:boolean;canManage:boolean;below:string[];lines:TeamLine[]};
const name=(m?:Pick<Member,'username'|'displayName'>)=>m?m.displayName||m.username:'';
/** «شخص واحد، شخصين، 3 أشخاص، 11 شخصاً». */
const people_=(n:number)=>n===1?'شخص واحد':n===2?'شخصين':n%100>=3&&n%100<=10?`${n} أشخاص`:`${n} شخصاً`;

/**
 * «الهيكل الوظيفي»: who reports to whom, drawn as a tree. Everyone does their own work and writes their own report; an
 * account with people under it also reads their reports and performance, and those of everyone under them. Each row
 * picks the person it reports to; nobody can report to someone under them. The owner is always at the top.
 */
export default function TeamChart({members,onClose}:{members:Member[];onClose:()=>void}){
 const [lines,setLines]=useState<TeamLine[]|null>(null),[busy,setBusy]=useState('');
 useEffect(()=>{let on=true;dailyRequest<TeamInfo>('team').then(t=>{if(on)setLines(t.lines)}).catch(e=>{if(on){toast.error((e as Error).message);setLines([])}});return()=>{on=false}},[]);
 const people=useMemo(()=>members.filter(m=>m.role==='owner'||(m.enabled&&m.permissions?.accountKind!=='client')),[members]);
 const boss=useMemo(()=>new Map((lines||[]).filter(l=>people.some(p=>p.id===l.managerId)).map(l=>[l.userId,l.managerId])),[lines,people]);
 const under=(id:string)=>people.filter(m=>boss.get(m.id)===id).sort((a,b)=>name(a).localeCompare(name(b),'ar'));
 const below=(id:string)=>{const out=new Set<string>();const walk=(x:string)=>{for(const m of under(x))if(!out.has(m.id)){out.add(m.id);walk(m.id)}};walk(id);return out};
 // The top: the owner first, then whoever leads a team, then everyone not yet placed.
 const roots=people.filter(m=>!boss.has(m.id)).sort((a,b)=>Number(b.role==='owner')-Number(a.role==='owner')||under(b.id).length-under(a.id).length||name(a).localeCompare(name(b),'ar'));
 async function change(m:Member,managerId:string){
  setBusy(m.id);try{setLines(await dailyRequest<TeamLine[]>('set_manager',{userId:m.id,managerId:managerId||null}))}catch(e){toast.error((e as Error).message)}finally{setBusy('')}
 }
 const node=(m:Member):React.ReactNode=>{const kids=under(m.id),all=kids.length?below(m.id):new Set<string>();
  return <li key={m.id}><div className={'tc-row'+(kids.length?' lead':'')}>
   <div className="tc-who"><b>{name(m)}</b><small dir="ltr">{m.username}</small>{m.role==='owner'?<span className="tag">المالك</span>:kids.length>0&&<span className="tag" title="يرى تقاريرهم وأداءهم">يشرف على {people_(all.size)}</span>}</div>
   {m.role!=='owner'&&<label className="tc-boss"><span>يتبع</span><FilterBox label={'المسؤول عن '+name(m)} value={boss.get(m.id)||''} empty="لا أحد (أعلى الهيكل)" disabled={busy===m.id}
    options={people.filter(p=>p.id!==m.id&&!all.has(p.id)).map(p=>({value:p.id,label:name(p),hint:p.username}))} onChange={v=>void change(m,v)}/></label>}</div>
   {kids.length>0&&<ul>{kids.map(node)}</ul>}</li>};
 return <Dialog open onOpenChange={v=>{if(!v&&!busy)onClose()}}><DialogContent dir="rtl" className="office-dialog team-chart-dialog">
  <DialogHeader><DialogTitle>الهيكل الوظيفي</DialogTitle><DialogDescription>اختر لكل شخص من يتبع له. كل شخص يؤدي عمله ويكتب تقريره، ومن تحته أحد يرى أيضاً في «مهام اليوم والتقرير» تقارير فريقه وأداءهم، ومن تحتهم كذلك حتى آخر الهيكل. المالك ومن له «إدارة الموظفين» أو «الاعتماد» يرون الجميع.</DialogDescription></DialogHeader>
  {lines===null?<p role="status">جارٍ التحميل…</p>:<ul className="team-chart" aria-label="الهيكل الوظيفي">{roots.map(node)}</ul>}
 </DialogContent></Dialog>;
}
