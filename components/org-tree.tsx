'use client';
import {useLayoutEffect,useMemo,useRef,useState} from 'react';
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
  const also=(chart.extras||[]).filter(x=>x.userId===m.id).map(x=>chart.areas.find(a=>a.id===x.areaId)?.name).filter(Boolean);
  return <button type="button" key={m.id} data-person={m.username} data-node={key} aria-pressed={selected===m.id} {...d.props}
   className={'org-box'+(team?' lead':'')+(m.enabled?'':' off')+(selected===m.id?' on':'')+(q&&!hit(m)?' dim':'')+(over===key&&d.droppable?' drop':'')+(drag===key?' dragging':'')}
   title={d.draggable?'اضغط لعرض خياراته، أو اسحبه إلى مسؤوله أو إلى قسم؛ وأفلت عليه زملاءه ليصبح مسؤولهم':'اضغط لعرض خياراته'} onClick={()=>onPick(m)}>
   {d.draggable&&<GripVertical size={13} aria-hidden className="org-grip"/>}
   {team>0&&<UsersRound size={14} aria-hidden className="org-icon"/>}
   <b>{name(m)}</b><small dir="ltr">{m.username}</small>
   <span className="org-meta">{roles.length?rolesLabel(roles):'بلا دور'}{!m.enabled&&' · موقوف'}</span>
   {team>0&&<span className="org-team">مسؤول عن {peopleCount(team)}</span>}{also.length>0&&<span className="org-also">أيضاً في: {also.join('، ')}</span>}</button>};
 const areaBox=(a:TeamArea)=>{const key='a:'+a.id,count=peopleBelow(parent,key).size,d=dnd(key,key,true),Icon=a.role&&ROLE_ICONS[a.role as JobRole]||FolderTree;
  return <button type="button" key={a.id} data-area={a.name} data-node={key} aria-pressed={selected===key} {...d.props}
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
 // Lines from each person to the other sections he is in as well, drawn over the tree; those of the selected person
 // (or section) stand out. They are measured from the boxes after every layout change.
 const canvas=useRef<HTMLDivElement>(null),[links,setLinks]=useState<{id:string;d:string;on:boolean}[]>([]),[size,setSize]=useState({w:0,h:0});
 useLayoutEffect(()=>{const el=canvas.current;if(!el)return;
  const draw=()=>{const box=el.getBoundingClientRect(),at=(k:string)=>el.querySelector<HTMLElement>(`[data-node="${k}"]`)?.getBoundingClientRect();
   // The boxes' own height (not the lines'), so the curves below them get room without the page growing each time.
   let content=0;for(const c of el.children)if(!(c instanceof SVGElement))content=Math.max(content,c.getBoundingClientRect().bottom-box.top);
   let deepest=0;
   const next=(chart.extras||[]).flatMap(x=>{const a=at('u:'+x.userId),b=at('a:'+x.areaId);if(!a||!b)return [];
    // From under the person, sweeping below the boxes, into the section from beneath (or from above, when it sits lower).
    const x1=a.left+a.width/2-box.left,y1=a.bottom-box.top,x2=b.left+b.width/2-box.left,below=b.top>a.bottom,y2=(below?b.top:b.bottom)-box.top,k=Math.max(44,Math.abs(x2-x1)*0.12);
    deepest=Math.max(deepest,below?y2:Math.max(y1,y2)+k*0.8);
    const d=below?`M${x1},${y1} C${x1},${y1+k} ${x2},${y2-k} ${x2},${y2}`:`M${x1},${y1} C${x1},${y1+k} ${x2},${Math.max(y1,y2)+k} ${x2},${y2}`;
    return [{id:x.userId+x.areaId,d,on:selected===x.userId||selected==='a:'+x.areaId}]});
   const h=Math.max(content,deepest+16);el.style.minHeight=h+'px';setSize({w:el.scrollWidth,h});setLinks(next)};
  draw();const ro=new ResizeObserver(draw);ro.observe(el);return()=>ro.disconnect()},[chart,members,search,selected]);
 return <div className="org-tree" aria-label="الهيكل الوظيفي"><div className="org-canvas" ref={canvas}>
  {links.length>0&&<svg className="org-links" width={size.w} height={size.h} aria-hidden>
   <defs><marker id="org-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>
   {[...links].sort((a,b)=>Number(a.on)-Number(b.on)).map(l=><path key={l.id} d={l.d} className={l.on?'on':''} markerEnd="url(#org-arrow)"/>)}</svg>}
  <div onDragOver={tray.props.onDragOver} onDragLeave={tray.props.onDragLeave} onDrop={tray.props.onDrop} className={'org-tray'+(over==='top'&&tray.droppable?' drop':'')} aria-label="لم يوضعوا في الهيكل بعد">
   <b>لم يوضعوا في الهيكل بعد {loose.length>0&&<span className="tag">{peopleCount(loose.length)}</span>}</b>
   {loose.length?<div className="org-leaves">{loose.map(x=>personBox(x.member!))}</div>:<small>الجميع في أماكنهم. أفلت هنا أي صندوق لإخراجه من الهيكل.</small>}</div>
  {heads.length>0&&<ul className="org-root">{heads.map(h=><li key={h.key}>{branch(h)}</li>).reverse()}</ul>}
  </div>{drag&&<p className="org-tip" role="status">أفلته على من سيتبع له أو على قسم، أو في «لم يوضعوا في الهيكل بعد» لإخراجه.</p>}
 </div>;
}
