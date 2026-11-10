'use client';
import {useMemo,useState} from 'react';
import {Crown,FolderTree,GripVertical,UsersRound} from 'lucide-react';
import type {Member} from '@/lib/office';
import {rolesLabel,type JobRole} from '@/lib/permissions';
import {inferRoles,ROLE_ICONS} from './permission-editor';
import {normalizeSearch} from '@/lib/case-browse';
import {nodesBelow,parents,peopleBelow,peopleCount,type TeamArea,type TeamChart} from '@/lib/team';

const name=(m:Member)=>m.displayName||m.username;
type Node={key:string;member?:Member;area?:TeamArea};

/**
 * «فريق المكتب» as a tree, read from the top: the owner, then whoever sits at the top, then each person's team and each
 * section's people under them. Sections («الأقسام») are boxes for a kind of work (المحامون، المحاسبة…) that hold people
 * and other sections. Any box is dragged onto a person or a section to go under it (with everything under it), or onto
 * the owner to go back to the top. People with nobody under them sit side by side in one block under their head, so a
 * large team wraps instead of running off the page. A click on a box opens what can be changed for it.
 */
export default function OrgTree({members,chart,search,selected,onPick,onPickArea,onMove,canMove}:{members:Member[];chart:TeamChart;search:string;selected:string;
 onPick:(m:Member)=>void;onPickArea:(a:TeamArea)=>void;onMove:(node:string,target:string|null)=>void;canMove:(m:Member)=>boolean}){
 const [drag,setDrag]=useState(''),[over,setOver]=useState('');
 const owners=members.filter(m=>m.role==='owner'),staff=members.filter(m=>m.role!=='owner');
 const parent=useMemo(()=>parents(chart),[chart]);
 // Children of each node; a node whose parent is unknown (a person since removed) sits at the top ('').
 const kids=useMemo(()=>{const known=new Set([...staff.map(m=>'u:'+m.id),...chart.areas.map(a=>'a:'+a.id)]),k=new Map<string,Node[]>();
  const put=(n:Node)=>{const up=parent.get(n.key),at=up&&known.has(up)?up:'';k.set(at,[...(k.get(at)||[]),n])};
  for(const a of chart.areas)put({key:'a:'+a.id,area:a});for(const m of staff)put({key:'u:'+m.id,member:m});
  const label=(n:Node)=>n.area?n.area.name:name(n.member!);
  for(const list of k.values())list.sort((a,b)=>Number(!!b.area)-Number(!!a.area)||(k.get(b.key)?.length||0)-(k.get(a.key)?.length||0)||label(a).localeCompare(label(b),'ar'));
  return k},[staff,chart.areas,parent]);
 const blocked=useMemo(()=>drag?new Set([drag,...nodesBelow(parent,drag)]):new Set<string>(),[drag,parent]);
 const q=normalizeSearch(search.trim());
 const hit=(m:Member)=>!q||normalizeSearch([m.username,m.displayName||''].join(' ')).includes(q);
 // Dragging and dropping, shared by people's and sections' boxes. The owner's box stands for the top.
 const dnd=(key:string,target:string|null,movable:boolean)=>{const droppable=!!drag&&!blocked.has(key)&&(parent.get(drag)||null)!==target;
  return {draggable:movable,droppable,props:{draggable:movable,
   onDragStart:(e:React.DragEvent)=>{e.dataTransfer.setData('text/plain',key);e.dataTransfer.effectAllowed='move';setDrag(key)},onDragEnd:()=>{setDrag('');setOver('')},
   onDragOver:(e:React.DragEvent)=>{if(droppable){e.preventDefault();e.dataTransfer.dropEffect='move';if(over!==key)setOver(key)}},onDragLeave:()=>{if(over===key)setOver('')},
   onDrop:(e:React.DragEvent)=>{e.preventDefault();const from=e.dataTransfer.getData('text/plain')||drag;setDrag('');setOver('');if(from&&droppable)onMove(from,target)}}}};
 const personBox=(m:Member)=>{const key=m.role==='owner'?'owner':'u:'+m.id,team=m.role==='owner'?staff.length:peopleBelow(parent,key).size,roles=m.permissions?inferRoles(m.permissions):[];
  const d=dnd(key,m.role==='owner'?null:key,m.role!=='owner'&&canMove(m));
  return <button type="button" key={m.id} data-person={m.username} aria-pressed={selected===m.id} {...d.props}
   className={'org-box'+(m.role==='owner'?' owner':'')+(team&&m.role!=='owner'?' lead':'')+(m.enabled?'':' off')+(selected===m.id?' on':'')+(q&&!hit(m)?' dim':'')+(over===key&&d.droppable?' drop':'')+(drag===key?' dragging':'')}
   title={d.draggable?'اضغط لعرض خياراته، أو اسحبه إلى من يتبع له أو إلى قسم':'اضغط لعرض خياراته'} onClick={()=>onPick(m)}>
   {d.draggable&&<GripVertical size={13} aria-hidden className="org-grip"/>}
   {m.role==='owner'?<Crown size={15} aria-hidden className="org-icon"/>:team>0&&<UsersRound size={14} aria-hidden className="org-icon"/>}
   <b>{name(m)}</b><small dir="ltr">{m.username}</small>
   <span className="org-meta">{m.role==='owner'?'المالك':roles.length?rolesLabel(roles):'بلا دور'}{!m.enabled&&' · موقوف'}</span>
   {team>0&&m.role!=='owner'&&<span className="org-team">يشرف على {peopleCount(team)}</span>}</button>};
 const areaBox=(a:TeamArea)=>{const key='a:'+a.id,count=peopleBelow(parent,key).size,d=dnd(key,key,true),Icon=a.role&&ROLE_ICONS[a.role as JobRole]||FolderTree;
  return <button type="button" key={a.id} data-area={a.name} aria-pressed={selected===key} {...d.props}
   className={'org-box org-area'+(selected===key?' on':'')+(over===key&&d.droppable?' drop':'')+(drag===key?' dragging':'')}
   title="قسم: اضغط لتسميته أو نقله أو حذفه، أو اسحبه إلى مكان آخر، أو أفلت فيه موظفين" onClick={()=>onPickArea(a)}>
   <GripVertical size={13} aria-hidden className="org-grip"/><Icon size={15} aria-hidden className="org-icon"/><b>{a.name}</b>
   <span className="org-meta">{count?peopleCount(count):'فارغ — أفلت فيه موظفين'}</span></button>};
 // A head's branches (sections and people with their own team) each get a column; the rest sit together in one wrapping block.
 const branch=(n:Node):React.ReactNode=>{const under=kids.get(n.member?.role==='owner'?'':n.key)||[];
  const heads=under.filter(x=>x.area||kids.get(x.key)?.length),rest=under.filter(x=>!x.area&&!kids.get(x.key)?.length);
  const cols=[...heads.map(h=><li key={h.key}>{branch(h)}</li>),...(rest.length?[<li key="rest"><div className="org-leaves">{rest.map(x=>personBox(x.member!))}</div></li>]:[])];
  return <>{n.area?areaBox(n.area):personBox(n.member!)}{cols.length>0&&<ul>{cols.reverse()}</ul>}</>};
 return <div className="org-tree" aria-label="الهيكل الوظيفي">
  <ul className="org-root">{owners.map(o=><li key={o.id}>{branch({key:'u:'+o.id,member:o})}</li>)}</ul>
  {drag&&<p className="org-tip" role="status">أفلته على من سيتبع له أو على قسم، أو على المالك ليعود إلى أعلى الهيكل.</p>}
 </div>;
}
