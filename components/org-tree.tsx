'use client';
import {useMemo,useState} from 'react';
import {Crown,GripVertical,UsersRound} from 'lucide-react';
import type {Member} from '@/lib/office';
import {rolesLabel} from '@/lib/permissions';
import {inferRoles} from './permission-editor';
import {normalizeSearch} from '@/lib/case-browse';
import {peopleCount,teamBelow} from '@/lib/team';

const name=(m:Member)=>m.displayName||m.username;

/**
 * «فريق المكتب» as a tree, read from the top: the owner, then whoever reports to nobody, then each person's team under
 * them. A box is dragged onto another box to put that person (and their team with them) under it, or onto the owner to
 * put them back at the top. People with nobody under them sit side by side in one block under their head, so a large
 * team wraps instead of running off the page. A click on a box opens what can be changed for that person.
 */
export default function OrgTree({members,boss,search,selected,onPick,onMove,canMove}:{members:Member[];boss:Map<string,string>;search:string;selected:string;
 onPick:(m:Member)=>void;onMove:(userId:string,managerId:string|null)=>void;canMove:(m:Member)=>boolean}){
 const [drag,setDrag]=useState(''),[over,setOver]=useState('');
 const owners=members.filter(m=>m.role==='owner');
 const staff=members.filter(m=>m.role!=='owner');
 const kids=useMemo(()=>{const k=new Map<string,Member[]>();const known=new Set(staff.map(m=>m.id));
  for(const m of staff){const b=boss.get(m.id);const at=b&&known.has(b)?b:'';k.set(at,[...(k.get(at)||[]),m])}
  for(const list of k.values())list.sort((a,b)=>(k.get(b.id)?.length||0)-(k.get(a.id)?.length||0)||name(a).localeCompare(name(b),'ar'));return k},[staff,boss]);
 const blocked=useMemo(()=>drag?new Set([drag,...teamBelow(boss,drag)]):new Set<string>(),[drag,boss]);
 const q=normalizeSearch(search.trim());
 const hit=(m:Member)=>!q||normalizeSearch([m.username,m.displayName||''].join(' ')).includes(q);
 const target=(m:Member)=>m.role==='owner'?null:m.id;
 const box=(m:Member)=>{const team=m.role==='owner'?staff.length:teamBelow(boss,m.id).size,roles=m.permissions?inferRoles(m.permissions):[];
  const movable=m.role!=='owner'&&canMove(m),droppable=!!drag&&!blocked.has(m.id)&&(boss.get(drag)||null)!==target(m);
  return <button type="button" key={m.id} data-person={m.username} draggable={movable} aria-pressed={selected===m.id}
   className={'org-box'+(m.role==='owner'?' owner':'')+(team&&m.role!=='owner'?' lead':'')+(m.enabled?'':' off')+(selected===m.id?' on':'')+(q&&!hit(m)?' dim':'')+(over===m.id&&droppable?' drop':'')+(drag===m.id?' dragging':'')}
   title={movable?'اضغط لعرض خياراته، أو اسحبه إلى من يتبع له':'اضغط لعرض خياراته'} onClick={()=>onPick(m)}
   onDragStart={e=>{e.dataTransfer.setData('text/plain',m.id);e.dataTransfer.effectAllowed='move';setDrag(m.id)}} onDragEnd={()=>{setDrag('');setOver('')}}
   onDragOver={e=>{if(droppable){e.preventDefault();e.dataTransfer.dropEffect='move';if(over!==m.id)setOver(m.id)}}} onDragLeave={()=>{if(over===m.id)setOver('')}}
   onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain')||drag;setDrag('');setOver('');if(id&&droppable)onMove(id,target(m))}}>
   {movable&&<GripVertical size={13} aria-hidden className="org-grip"/>}
   {m.role==='owner'?<Crown size={15} aria-hidden className="org-icon"/>:team>0&&<UsersRound size={14} aria-hidden className="org-icon"/>}
   <b>{name(m)}</b><small dir="ltr">{m.username}</small>
   <span className="org-meta">{m.role==='owner'?'المالك':roles.length?rolesLabel(roles):'بلا دور'}{!m.enabled&&' · موقوف'}</span>{team>0&&m.role!=='owner'&&<span className="org-team">يشرف على {peopleCount(team)}</span>}</button>};
 // A head's branches (people with their own team) each get a column; the rest sit together in one wrapping block.
 const branch=(m:Member):React.ReactNode=>{const under=kids.get(m.role==='owner'?'':m.id)||[],heads=under.filter(x=>kids.get(x.id)?.length),rest=under.filter(x=>!kids.get(x.id)?.length);
  const cols=[...heads.map(h=><li key={h.id}>{branch(h)}</li>),...(rest.length?[<li key="rest"><div className="org-leaves">{rest.map(box)}</div></li>]:[])];
  return <>{box(m)}{cols.length>0&&<ul>{cols.reverse()}</ul>}</>};
 return <div className="org-tree" aria-label="الهيكل الوظيفي">
  <ul className="org-root">{(owners.length?owners:[]).map(o=><li key={o.id}>{branch(o)}</li>)}</ul>
  {drag&&<p className="org-tip" role="status">أفلته على من سيتبع له، أو على المالك ليعود إلى أعلى الهيكل.</p>}
 </div>;
}
