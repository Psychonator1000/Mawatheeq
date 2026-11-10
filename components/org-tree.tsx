'use client';
import {useMemo,useState} from 'react';
import {FolderTree,GripVertical,UsersRound} from 'lucide-react';
import type {Member} from '@/lib/office';
import {WORKSPACE_LABELS,rolesLabel,type JobRole} from '@/lib/permissions';
import {inferRoles,ROLE_ICONS} from './permission-editor';
import {normalizeSearch} from '@/lib/case-browse';
import {nodesBelow,parents,peopleBelow,peopleCount,type TeamArea,type TeamChart} from '@/lib/team';

const name=(m:Member)=>m.displayName||m.username;
type Node={key:string;member?:Member;area?:TeamArea};

/**
 * «فريق المكتب» as a tree of the office's people (the program's own owner account is left out): each head at the top
 * (Mr. Yousef, a section left at the top…) with the people and sections under him, and a tray of whoever is not placed
 * yet. Sections («الأقسام») are boxes for a kind of work or a workspace. Any box is dragged onto a person to report to
 * him (a lawyer over other lawyers or counsel, at any depth), onto a section to go into it, or onto the tray to leave the
 * tree, taking everything under it along. People with nobody under them sit side by side in one block under their head,
 * so a large team wraps instead of running off the page. A click on a box opens what can be changed for it.
 */
export default function OrgTree({members,chart,search,selected,onPick,onPickArea,onMove,canMove}:{members:Member[];chart:TeamChart;search:string;selected:string;
 onPick:(m:Member)=>void;onPickArea:(a:TeamArea)=>void;onMove:(node:string,target:string|null)=>void;canMove:(m:Member)=>boolean}){
 const [drag,setDrag]=useState(''),[over,setOver]=useState('');
 // The owner account is the program's own administrator, not a person in the office: it stays out of the tree.
 const staff=members.filter(m=>m.role!=='owner');
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
 // Dragging and dropping, shared by people's and sections' boxes and the «بلا مكان» tray (which stands for the top).
 const dnd=(key:string,target:string|null,movable:boolean)=>{const droppable=!!drag&&!blocked.has(key)&&(parent.get(drag)||null)!==target;
  return {draggable:movable,droppable,props:{draggable:movable,
   onDragStart:(e:React.DragEvent)=>{e.dataTransfer.setData('text/plain',key);e.dataTransfer.effectAllowed='move';setDrag(key)},onDragEnd:()=>{setDrag('');setOver('')},
   // A box inside the tray answers for itself: the tray around it does not take the drop too.
   onDragOver:(e:React.DragEvent)=>{e.stopPropagation();if(droppable){e.preventDefault();e.dataTransfer.dropEffect='move';if(over!==key)setOver(key)}else if(over)setOver('')},onDragLeave:()=>{if(over===key)setOver('')},
   onDrop:(e:React.DragEvent)=>{e.preventDefault();e.stopPropagation();const from=e.dataTransfer.getData('text/plain')||drag;setDrag('');setOver('');if(from&&droppable)onMove(from,target)}}}};
 const personBox=(m:Member)=>{const key='u:'+m.id,team=peopleBelow(parent,key).size,roles=m.permissions?inferRoles(m.permissions):[];
  const d=dnd(key,key,canMove(m));
  return <button type="button" key={m.id} data-person={m.username} aria-pressed={selected===m.id} {...d.props}
   className={'org-box'+(team?' lead':'')+(m.enabled?'':' off')+(selected===m.id?' on':'')+(q&&!hit(m)?' dim':'')+(over===key&&d.droppable?' drop':'')+(drag===key?' dragging':'')}
   title={d.draggable?'اضغط لعرض خياراته، أو اسحبه إلى مسؤوله أو إلى قسم؛ وأفلت عليه زملاءه ليصبح مسؤولهم':'اضغط لعرض خياراته'} onClick={()=>onPick(m)}>
   {d.draggable&&<GripVertical size={13} aria-hidden className="org-grip"/>}
   {team>0&&<UsersRound size={14} aria-hidden className="org-icon"/>}
   <b>{name(m)}</b><small dir="ltr">{m.username}</small>
   <span className="org-meta">{roles.length?rolesLabel(roles):'بلا دور'}{!m.enabled&&' · موقوف'}</span>
   {team>0&&<span className="org-team">مسؤول عن {peopleCount(team)}</span>}</button>};
 const areaBox=(a:TeamArea)=>{const key='a:'+a.id,count=peopleBelow(parent,key).size,d=dnd(key,key,true),Icon=a.role&&ROLE_ICONS[a.role as JobRole]||FolderTree;
  return <button type="button" key={a.id} data-area={a.name} aria-pressed={selected===key} {...d.props}
   className={'org-box org-area'+(selected===key?' on':'')+(over===key&&d.droppable?' drop':'')+(drag===key?' dragging':'')}
   title="قسم: اضغط لتسميته أو نقله أو حذفه، أو اسحبه إلى مكان آخر، أو أفلت فيه موظفين" onClick={()=>onPickArea(a)}>
   <GripVertical size={13} aria-hidden className="org-grip"/><Icon size={15} aria-hidden className="org-icon"/><b>{a.name}</b>
   <span className="org-meta">{count?peopleCount(count):'فارغ — أفلت فيه موظفين'}</span>{a.workspace&&<span className="org-team" title={`من فيه يفتح ${WORKSPACE_LABELS[a.workspace]} فقط`}>مساحة {WORKSPACE_LABELS[a.workspace].split(' (')[0]}</span>}</button>};
 // A head's branches (sections and people with their own team) each get a column; the rest sit together in one wrapping block.
 const branch=(n:Node):React.ReactNode=>{const under=kids.get(n.key)||[];
  const heads=under.filter(x=>x.area||kids.get(x.key)?.length),rest=under.filter(x=>!x.area&&!kids.get(x.key)?.length);
  const cols=[...heads.map(h=><li key={h.key}>{branch(h)}</li>),...(rest.length?[<li key="rest"><div className="org-leaves">{rest.map(x=>personBox(x.member!))}</div></li>]:[])];
  return <>{n.area?areaBox(n.area):personBox(n.member!)}{cols.length>0&&<ul>{cols.reverse()}</ul>}</>};
 // The top: each head of a tree (Mr. Yousef, a section left at the top…) side by side, and everyone not placed yet in a
 // tray above them to drag from. Dropping a box on the tray takes it out of the tree.
 const top=kids.get('')||[],heads=top.filter(x=>x.area||kids.get(x.key)?.length),loose=top.filter(x=>!x.area&&!kids.get(x.key)?.length);
 const tray=dnd('top',null,false);
 return <div className="org-tree" aria-label="الهيكل الوظيفي">
  <div onDragOver={tray.props.onDragOver} onDragLeave={tray.props.onDragLeave} onDrop={tray.props.onDrop} className={'org-tray'+(over==='top'&&tray.droppable?' drop':'')} aria-label="لم يوضعوا في الهيكل بعد">
   <b>لم يوضعوا في الهيكل بعد {loose.length>0&&<span className="tag">{peopleCount(loose.length)}</span>}</b>
   {loose.length?<div className="org-leaves">{loose.map(x=>personBox(x.member!))}</div>:<small>الجميع في أماكنهم. أفلت هنا أي صندوق لإخراجه من الهيكل.</small>}</div>
  {heads.length>0&&<ul className="org-root">{heads.map(h=><li key={h.key}>{branch(h)}</li>).reverse()}</ul>}
  {drag&&<p className="org-tip" role="status">أفلته على من سيتبع له أو على قسم، أو في «لم يوضعوا في الهيكل بعد» لإخراجه.</p>}
 </div>;
}
